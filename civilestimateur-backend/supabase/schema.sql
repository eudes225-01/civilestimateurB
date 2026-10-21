-- supabase/schema.sql
-- À exécuter une fois dans Supabase : SQL Editor → New query → Run.
-- Comptes (profils), projets enregistrés par utilisateur, abonnements.
-- Row Level Security activée partout : un utilisateur ne voit et ne modifie QUE ses lignes.

-- ── Profils (créés automatiquement à la première connexion Google) ──────────
create table if not exists public.profils (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text,
  nom       text,
  cree_le   timestamptz not null default now()
);
alter table public.profils enable row level security;
create policy "profils : lecture par le titulaire" on public.profils for select using (auth.uid() = id);
create policy "profils : mise à jour par le titulaire" on public.profils for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, email, nom)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists sur_nouvel_utilisateur on auth.users;
create trigger sur_nouvel_utilisateur after insert on auth.users for each row execute function public.creer_profil();

-- ── Projets (saisies, paramètres, niveaux, prix modifiés) ────────────────────
-- Les fichiers de plans ne sont PAS stockés : seuls leurs noms sont conservés dans `data`.
create table if not exists public.projets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titre       text not null default 'Projet sans titre',
  data        jsonb not null default '{}'::jsonb,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);
create index if not exists projets_user_modifie_idx on public.projets (user_id, modifie_le desc);
alter table public.projets enable row level security;
create policy "projets : lecture" on public.projets for select using (auth.uid() = user_id);
create policy "projets : création" on public.projets for insert with check (auth.uid() = user_id);
create policy "projets : modification" on public.projets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projets : suppression" on public.projets for delete using (auth.uid() = user_id);

create or replace function public.maj_modifie_le() returns trigger language plpgsql as $$
begin new.modifie_le = now(); return new; end $$;
drop trigger if exists projets_modifie_le on public.projets;
create trigger projets_modifie_le before update on public.projets for each row execute function public.maj_modifie_le();

-- ── Abonnements (renseignés par le webhook FedaPay, côté serveur uniquement) ──
-- Aucune policy d'écriture : seul le backend (clé service_role) peut écrire (webhook FedaPay).
create table if not exists public.abonnements (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  statut                  text not null default 'inactif' check (statut in ('inactif', 'actif', 'expire')),
  fedapay_transaction_id  text,
  debut                   timestamptz,
  fin                     timestamptz
);
alter table public.abonnements enable row level security;
create policy "abonnements : lecture par le titulaire" on public.abonnements for select using (auth.uid() = user_id);

-- ── Migration FedaPay (à exécuter une fois ; sans danger si déjà faite) ──────────
-- Une ligne par transaction : « inactif » à la création du paiement, « actif » une fois
-- le paiement confirmé par FedaPay (fin = date de fin d'abonnement).
alter table public.abonnements add column if not exists montant integer;
alter table public.abonnements add column if not exists cree_le timestamptz not null default now();
-- Unicité de la transaction : rend l'activation idempotente (webhook + retour navigateur).
create unique index if not exists abonnements_transaction_uidx on public.abonnements (fedapay_transaction_id);
create index if not exists abonnements_user_idx on public.abonnements (user_id, statut, fin desc);

-- ── Migration e-mails Resend (à exécuter une fois ; sans danger si déjà faite) ───────
-- Suivi « déjà envoyé » : garantit un seul mail par événement, même si webhook, retour navigateur
-- ou tâche planifiée se répètent.
alter table public.profils     add column if not exists bienvenue_envoyee_le  timestamptz;
alter table public.abonnements add column if not exists rappel_envoye_le      timestamptz;
alter table public.abonnements add column if not exists expiration_envoyee_le timestamptz;
alter table public.abonnements add column if not exists echec_notifie_le      timestamptz;
create index if not exists abonnements_echeance_idx on public.abonnements (statut, fin);

-- OPTIONNEL — comptes déjà existants : décommentez pour NE PAS leur envoyer de mail de bienvenue
-- à leur prochaine connexion (sinon tous en recevront un, une fois).
-- update public.profils set bienvenue_envoyee_le = now() where bienvenue_envoyee_le is null;

-- ── Migration preuves de confirmation (à exécuter une fois ; sans danger si déjà faite) ────────
-- Journal probatoire, écrit UNIQUEMENT par le backend (clé service_role) :
--   • « acceptation_conditions » : l'utilisateur a accepté les conditions (version, date, texte exact, empreinte SHA-256) ;
--   • « confirmation_paiement »  : un paiement a été confirmé (n° de transaction, montant, période) et l'e-mail
--                                  de confirmation avec le PDF a été envoyé (email_envoye_le), éventuellement renvoyé.
-- `conditions` garde le texte complet de la version concernée : on peut redémontrer ce qui a été accepté,
-- et regénérer à l'identique le PDF d'une ancienne confirmation. Supprimé avec le compte (on delete cascade).
create table if not exists public.preuves_confirmation (
  id                      uuid primary key default gen_random_uuid(),
  cle                     text not null unique,   -- idempotence : une preuve par événement
  user_id                 uuid not null references auth.users(id) on delete cascade,
  type                    text not null check (type in ('acceptation_conditions', 'confirmation_paiement')),
  contexte                text,                   -- acceptation : 'accueil' | 'paiement'
  version_conditions      text not null,
  hash_conditions         text not null,
  conditions              jsonb not null,
  version_client          text,                   -- version affichée par l'interface au moment du clic
  fedapay_transaction_id  text,
  montant                 integer,
  debut                   timestamptz,
  fin                     timestamptz,
  renouvellement          boolean,
  email                   text,
  nom                     text,
  cree_le                 timestamptz not null default now(),
  email_envoye_le         timestamptz,
  pdf_joint               boolean,
  renvoyee_le             timestamptz,
  renvois                 integer not null default 0
);
create index if not exists preuves_user_idx on public.preuves_confirmation (user_id, type, cree_le desc);
alter table public.preuves_confirmation enable row level security;
create policy "preuves : lecture par le titulaire" on public.preuves_confirmation for select using (auth.uid() = user_id);
-- Aucune policy d'écriture : seul le backend écrit.

-- ── Activation atomique d'un abonnement (à exécuter une fois ; sans danger si déjà faite) ────────
-- Le renouvellement lit la fin de l'abonnement en cours PUIS écrit la nouvelle échéance : sans verrou,
-- deux paiements approuvés au même instant lisent la même date et ne créditent qu'une période.
-- Cette fonction sérialise toutes les activations d'un même utilisateur (verrou consultatif de
-- transaction) : la 2ᵉ attend la fin de la 1ʳᵉ, puis repart de l'échéance déjà prolongée.
-- Idempotente : une transaction déjà activée (ou déjà expirée) ne crédite jamais une 2ᵉ fois.
create or replace function public.activer_abonnement(p_tx_id text, p_duree_jours integer)
returns table (fin_abo timestamptz, est_nouveau boolean, est_renouvellement boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_statut text;
  v_fin    timestamptz;
  v_enc    timestamptz;
  v_now    timestamptz := now();
begin
  if p_duree_jours is null or p_duree_jours <= 0 then
    raise exception 'duree_invalide' using errcode = '22023';
  end if;

  select a.user_id into v_user from public.abonnements a where a.fedapay_transaction_id = p_tx_id;
  if v_user is null then
    raise exception 'transaction_inconnue' using errcode = 'P0002';
  end if;

  -- Un seul renouvellement à la fois par utilisateur.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Relecture SOUS verrou : une activation concurrente de la même transaction a pu aboutir entre-temps.
  select a.statut, a.fin into v_statut, v_fin
    from public.abonnements a where a.fedapay_transaction_id = p_tx_id for update;
  if v_statut <> 'inactif' then
    return query select v_fin, false, false;   -- déjà actif ou expiré : rien à créditer
    return;
  end if;

  select max(a.fin) into v_enc
    from public.abonnements a
   where a.user_id = v_user and a.statut = 'actif' and a.fin > v_now;

  v_fin := coalesce(v_enc, v_now) + make_interval(days => p_duree_jours);

  update public.abonnements a
     set statut = 'actif', debut = v_now, fin = v_fin
   where a.fedapay_transaction_id = p_tx_id;

  return query select v_fin, true, v_enc is not null;
end;
$$;

-- Réservée au backend (clé service_role) : jamais appelable depuis le navigateur.
revoke all on function public.activer_abonnement(text, integer) from public, anon, authenticated;
grant execute on function public.activer_abonnement(text, integer) to service_role;
