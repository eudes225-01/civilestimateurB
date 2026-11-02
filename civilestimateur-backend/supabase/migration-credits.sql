-- Migration « crédits CST » : à exécuter UNE FOIS dans Supabase → SQL Editor, sur la base existante (abonnements).
-- Additive et sans danger si déjà exécutée : les tables/fonctions « abonnements » ne sont pas touchées.
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
