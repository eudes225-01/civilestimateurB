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
