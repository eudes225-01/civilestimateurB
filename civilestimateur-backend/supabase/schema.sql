-- supabase/schema.sql
-- À exécuter une fois dans Supabase : SQL Editor → New query → Run.
-- Comptes (profils), projets enregistrés par utilisateur, crédits CST (soldes, achats, mouvements).
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


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- CRÉDITS CST (CivilEstimator) — remplacent l'abonnement. À exécuter une fois ; sans danger si déjà fait.
-- Les anciennes tables/fonctions « abonnements » ne sont plus utilisées : elles restent en place (historique)
-- et peuvent être supprimées plus tard. Toutes les écritures passent par le backend (clé service_role).
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ── Solde de crédits (une ligne par utilisateur ; jamais négatif) ───────────────────────────
create table if not exists public.credits_soldes (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  solde    integer not null default 0 check (solde >= 0),
  maj_le   timestamptz not null default now()
);
alter table public.credits_soldes enable row level security;
drop policy if exists "credits_soldes : lecture par le titulaire" on public.credits_soldes;
create policy "credits_soldes : lecture par le titulaire" on public.credits_soldes for select using (auth.uid() = user_id);

-- ── Achats de crédits (une ligne par transaction FedaPay) ───────────────────────────────────
-- « inactif » à la création du paiement, « paye » une fois confirmé par FedaPay et crédité.
create table if not exists public.achats_credits (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  statut                  text not null default 'inactif' check (statut in ('inactif', 'paye')),
  fedapay_transaction_id  text,
  montant                 integer not null,   -- FCFA payés
  credits                 integer not null,   -- CST crédités
  cree_le                 timestamptz not null default now(),
  paye_le                 timestamptz,
  echec_notifie_le        timestamptz         -- e-mail d'échec : un seul, même si webhook/navigateur se répètent
);
create unique index if not exists achats_credits_transaction_uidx on public.achats_credits (fedapay_transaction_id);
create index if not exists achats_credits_user_idx on public.achats_credits (user_id, statut, paye_le desc);
alter table public.achats_credits enable row level security;
drop policy if exists "achats_credits : lecture par le titulaire" on public.achats_credits;
create policy "achats_credits : lecture par le titulaire" on public.achats_credits for select using (auth.uid() = user_id);

-- ── Journal des mouvements (achats, réserves, règlements) : trace complète de chaque débit ────
--   achat          : +crédits d'un paiement confirmé (ref = n° de transaction FedaPay)
--   reservation    : −réserve bloquée avant un appel de lecture (ref = référence de l'appel)
--   regularisation : ±écart entre la réserve et le coût réel (tokens enregistrés) ; même ref
create table if not exists public.credits_mouvements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('achat', 'reservation', 'regularisation')),
  montant        integer not null,
  solde_apres    integer not null,
  ref            text,
  tokens_entree  integer,
  tokens_sortie  integer,
  cree_le        timestamptz not null default now()
);
create index if not exists credits_mouvements_user_idx on public.credits_mouvements (user_id, cree_le desc);
create index if not exists credits_mouvements_ref_idx on public.credits_mouvements (ref);
alter table public.credits_mouvements enable row level security;
drop policy if exists "credits_mouvements : lecture par le titulaire" on public.credits_mouvements;
create policy "credits_mouvements : lecture par le titulaire" on public.credits_mouvements for select using (auth.uid() = user_id);

-- ── Preuves de confirmation : colonnes des achats de crédits ────────────────────────────────
alter table public.preuves_confirmation add column if not exists credits integer;
alter table public.preuves_confirmation add column if not exists solde_apres integer;

-- ── Crédite un achat confirmé (atomique et idempotent) ─────────────────────────────────────
-- Un verrou par utilisateur sérialise les opérations ; une transaction déjà créditée ne crédite jamais deux fois
-- (webhook + retour navigateur). Renvoie le solde après crédit et le nombre de CST ajoutés par CET appel.
create or replace function public.crediter_achat(p_tx_id text)
returns table (solde_apres integer, credits_ajoutes integer, est_nouveau boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid;
  v_statut  text;
  v_credits integer;
  v_solde   integer;
begin
  select a.user_id into v_user from public.achats_credits a where a.fedapay_transaction_id = p_tx_id;
  if v_user is null then
    raise exception 'transaction_inconnue' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Relecture SOUS verrou : un crédit concurrent de la même transaction a pu aboutir entre-temps.
  select a.statut, a.credits into v_statut, v_credits
    from public.achats_credits a where a.fedapay_transaction_id = p_tx_id for update;
  if v_statut <> 'inactif' then
    select coalesce(max(s.solde), 0) into v_solde from public.credits_soldes s where s.user_id = v_user;
    return query select v_solde, 0, false;
    return;
  end if;

  update public.achats_credits a set statut = 'paye', paye_le = now() where a.fedapay_transaction_id = p_tx_id;

  insert into public.credits_soldes as s (user_id, solde, maj_le) values (v_user, v_credits, now())
  on conflict (user_id) do update set solde = s.solde + excluded.solde, maj_le = now()
  returning s.solde into v_solde;

  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref)
  values (v_user, 'achat', v_credits, v_solde, p_tx_id);

  return query select v_solde, v_credits, true;
end;
$$;

-- ── Bloque une réserve avant un appel de lecture ───────────────────────────────────────────
-- Débit atomique conditionnel : sans solde suffisant, rien n'est débité (ok = false). Deux appels simultanés ne
-- peuvent donc jamais dépasser le solde.
create or replace function public.reserver_credits(p_user_id uuid, p_montant integer, p_ref text)
returns table (ok boolean, solde_apres integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solde integer;
begin
  if p_montant is null or p_montant <= 0 then
    raise exception 'montant_invalide' using errcode = '22023';
  end if;

  update public.credits_soldes s set solde = s.solde - p_montant, maj_le = now()
   where s.user_id = p_user_id and s.solde >= p_montant
  returning s.solde into v_solde;

  if not found then
    select coalesce(max(s.solde), 0) into v_solde from public.credits_soldes s where s.user_id = p_user_id;
    return query select false, v_solde;
    return;
  end if;

  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref)
  values (p_user_id, 'reservation', -p_montant, v_solde, p_ref);

  return query select true, v_solde;
end;
$$;

-- ── Règle un appel : le coût réel (en CST, d'après les tokens) remplace la réserve ──────────
-- Coût < réserve : l'excédent est restitué. Coût > réserve : le supplément est prélevé dans la limite du solde
-- (jamais sous zéro). p_cout = 0 : appel échoué, toute la réserve est rendue. `facture` = CST réellement débités.
create or replace function public.regler_credits(
  p_user_id uuid, p_reserve integer, p_cout integer, p_ref text, p_tokens_entree integer, p_tokens_sortie integer
)
returns table (facture integer, solde_apres integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solde  integer;
  v_ajust  integer;  -- écart appliqué au solde (positif : restitution ; négatif : supplément prélevé)
begin
  if p_reserve is null or p_reserve < 0 or p_cout is null or p_cout < 0 then
    raise exception 'montant_invalide' using errcode = '22023';
  end if;

  select s.solde into v_solde from public.credits_soldes s where s.user_id = p_user_id for update;
  if not found then
    raise exception 'solde_inconnu' using errcode = 'P0002';
  end if;

  if p_reserve >= p_cout then
    v_ajust := p_reserve - p_cout;
  else
    v_ajust := -least(v_solde, p_cout - p_reserve);
  end if;
  v_solde := v_solde + v_ajust;

  update public.credits_soldes s set solde = v_solde, maj_le = now() where s.user_id = p_user_id;

  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref, tokens_entree, tokens_sortie)
  values (p_user_id, 'regularisation', v_ajust, v_solde, p_ref, p_tokens_entree, p_tokens_sortie);

  return query select p_reserve - v_ajust, v_solde;
end;
$$;

-- Réservées au backend (clé service_role) : jamais appelables depuis le navigateur.
revoke all on function public.crediter_achat(text) from public, anon, authenticated;
revoke all on function public.reserver_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.regler_credits(uuid, integer, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.crediter_achat(text) to service_role;
grant execute on function public.reserver_credits(uuid, integer, text) to service_role;
grant execute on function public.regler_credits(uuid, integer, integer, text, integer, integer) to service_role;
