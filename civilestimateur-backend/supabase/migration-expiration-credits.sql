-- Migration « expiration des crédits CST » : à exécuter UNE FOIS dans Supabase → SQL Editor, APRÈS migration-credits.sql.
-- Additive et sans danger si déjà exécutée.
--
-- Règle : seuls les crédits issus d'achats à partir de CREDITS_EXPIRATION_DEPUIS expirent, un mois après
-- le DERNIER achat payé éligible du client. Les soldes existants à la migration et les achats antérieurs
-- restent protégés, y compris après une recharge. Les consommations utilisent d'abord les crédits expirables.
-- Un rappel est envoyé RAPPEL_JOURS jours avant ; l'expiration ne supprime que le solde expirant.

-- 1) Suivi par achat : le rappel et la remise à zéro ne partent qu'une fois (colonnes remplies par la tâche planifiée).
alter table public.achats_credits add column if not exists rappel_expiration_le timestamptz;
alter table public.achats_credits add column if not exists expiration_traitee_le timestamptz;
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'credits_soldes' and column_name = 'solde_protege'
  ) then
    alter table public.credits_soldes add column solde_protege integer not null default 0;
    -- À la première installation, tout le solde préexistant est protégé.
    update public.credits_soldes set solde_protege = solde;
  end if;
end;
$$;
alter table public.credits_soldes drop constraint if exists credits_soldes_protege_check;
alter table public.credits_soldes add constraint credits_soldes_protege_check
  check (solde_protege >= 0 and solde_protege <= solde);
alter table public.credits_mouvements add column if not exists credits_proteges integer not null default 0;
alter table public.credits_mouvements add column if not exists credits_expirables_expires integer not null default 0;
create index if not exists achats_credits_echeance_idx on public.achats_credits (statut, paye_le) where expiration_traitee_le is null;

-- 2) Le journal accepte désormais le mouvement « expiration ».
alter table public.credits_mouvements drop constraint if exists credits_mouvements_type_check;
alter table public.credits_mouvements add constraint credits_mouvements_type_check
  check (type in ('achat', 'reservation', 'regularisation', 'expiration'));

-- 3) Remise à zéro atomique : verrouille la ligne du solde, journalise le montant perdu, ne fait rien si solde ≤ 0.
create or replace function public.expirer_credits(p_user_id uuid, p_ref text, p_achat_id uuid)
returns table (credits_perdus integer, solde_apres integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proprietaire uuid;
  v_dernier_achat uuid;
  v_solde integer;
  v_protege integer;
  v_expirables integer;
begin
  select a.user_id into v_proprietaire
    from public.achats_credits a
   where a.id = p_achat_id and a.statut = 'paye';
  if v_proprietaire is distinct from p_user_id then
    raise exception 'achat_invalide' using errcode = '22023';
  end if;

  -- Même verrou que crediter_achat : un achat concurrent ne peut être effacé par cette échéance.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Revalider l'achat le plus récent sous verrou : un rechargement récent repousse tout le solde.
  select a.id into v_dernier_achat
    from public.achats_credits a
   where a.user_id = p_user_id and a.statut = 'paye'
   order by a.paye_le desc, a.id desc
   limit 1;
  if v_dernier_achat is distinct from p_achat_id then
    select coalesce(s.solde, 0) into v_solde from public.credits_soldes s where s.user_id = p_user_id;
    return query select 0, coalesce(v_solde, 0);
    return;
  end if;

  select s.solde, s.solde_protege into v_solde, v_protege
    from public.credits_soldes s where s.user_id = p_user_id for update;
  if v_solde is null or v_solde <= 0 then
    return query select 0, coalesce(v_solde, 0);
    return;
  end if;
  v_expirables := greatest(0, v_solde - coalesce(v_protege, 0));
  if v_expirables = 0 then
    return query select 0, v_solde;
    return;
  end if;
  -- Une réserve encore en cours ne doit pas recréer des crédits expirés si son appel se termine après l'échéance.
  update public.credits_mouvements m
     set credits_expirables_expires = greatest(0, abs(m.montant) - m.credits_proteges)
   where m.user_id = p_user_id and m.type = 'reservation' and m.credits_expirables_expires = 0
     and not exists (
       select 1 from public.credits_mouvements r
        where r.user_id = m.user_id and r.type = 'regularisation' and r.ref = m.ref
     );
  update public.credits_soldes set solde = solde - v_expirables, maj_le = now() where user_id = p_user_id;
  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref)
    values (p_user_id, 'expiration', -v_expirables, v_solde - v_expirables, p_ref);
  return query select v_expirables, v_solde - v_expirables;
end;
$$;

revoke all on function public.expirer_credits(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.expirer_credits(uuid, text, uuid) to service_role;

-- Les consommations utilisent d'abord le solde expirant, puis les crédits protégés.
create or replace function public.reserver_credits(p_user_id uuid, p_montant integer, p_ref text)
returns table (ok boolean, solde_apres integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solde integer;
  v_protege integer;
  v_protege_debite integer;
begin
  if p_montant is null or p_montant <= 0 then
    raise exception 'montant_invalide' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select s.solde, s.solde_protege into v_solde, v_protege
    from public.credits_soldes s where s.user_id = p_user_id for update;
  if not found or v_solde < p_montant then
    return query select false, coalesce(v_solde, 0);
    return;
  end if;
  v_protege_debite := greatest(0, p_montant - (v_solde - v_protege));
  v_solde := v_solde - p_montant;
  v_protege := v_protege - v_protege_debite;
  update public.credits_soldes set solde = v_solde, solde_protege = v_protege, maj_le = now()
   where user_id = p_user_id;
  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref, credits_proteges)
  values (p_user_id, 'reservation', -p_montant, v_solde, p_ref, v_protege_debite);
  return query select true, v_solde;
end;
$$;

create or replace function public.regler_credits(
  p_user_id uuid, p_reserve integer, p_cout integer, p_ref text, p_tokens_entree integer, p_tokens_sortie integer
)
returns table (facture integer, solde_apres integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solde integer;
  v_protege integer;
  v_ajust integer;
  v_protege_reserve integer;
  v_expirables_expires integer;
  v_expirables_restants integer;
  v_protege_restitue integer := 0;
  v_protege_supplement integer := 0;
  v_restitue integer;
  v_supplement integer;
begin
  if p_reserve is null or p_reserve < 0 or p_cout is null or p_cout < 0 then
    raise exception 'montant_invalide' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select s.solde, s.solde_protege into v_solde, v_protege
    from public.credits_soldes s where s.user_id = p_user_id for update;
  if not found then raise exception 'solde_inconnu' using errcode = 'P0002'; end if;
  select coalesce(m.credits_proteges, 0), coalesce(m.credits_expirables_expires, 0)
    into v_protege_reserve, v_expirables_expires
    from public.credits_mouvements m
   where m.user_id = p_user_id and m.type = 'reservation' and m.ref = p_ref and m.montant = -p_reserve
   order by m.cree_le desc limit 1;
  v_protege_reserve := least(coalesce(v_protege_reserve, 0), p_reserve);
  v_expirables_expires := least(coalesce(v_expirables_expires, 0), greatest(0, p_reserve - v_protege_reserve));
  if p_reserve >= p_cout then
    v_ajust := p_reserve - p_cout;
    v_restitue := v_ajust;
    v_expirables_restants := greatest(0, p_reserve - v_protege_reserve - v_expirables_expires);
    v_protege_restitue := greatest(0, v_restitue - v_expirables_restants);
  else
    v_supplement := least(v_solde, p_cout - p_reserve);
    v_ajust := -v_supplement;
    v_protege_supplement := greatest(0, v_supplement - (v_solde - v_protege));
  end if;
  v_solde := v_solde + v_ajust;
  v_protege := v_protege + v_protege_restitue - v_protege_supplement;
  update public.credits_soldes set solde = v_solde, solde_protege = v_protege, maj_le = now()
   where user_id = p_user_id;
  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref, tokens_entree, tokens_sortie, credits_proteges)
  values (p_user_id, 'regularisation', v_ajust, v_solde, p_ref, p_tokens_entree, p_tokens_sortie,
    v_protege_restitue - v_protege_supplement);
  return query select p_reserve - v_ajust, v_solde;
end;
$$;
revoke all on function public.reserver_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.regler_credits(uuid, integer, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserver_credits(uuid, integer, text) to service_role;
grant execute on function public.regler_credits(uuid, integer, integer, text, integer, integer) to service_role;

-- Classer les nouveaux achats selon la date d'entrée en vigueur fournie par le backend.
-- La signature à deux paramètres remplace l'ancienne fonction sans changer son idempotence.
drop function if exists public.crediter_achat(text);
create or replace function public.crediter_achat(p_tx_id text, p_expiration_depuis date)
returns table (solde_apres integer, credits_ajoutes integer, est_nouveau boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_statut text;
  v_credits integer;
  v_solde integer;
begin
  select a.user_id into v_user from public.achats_credits a where a.fedapay_transaction_id = p_tx_id;
  if v_user is null then raise exception 'transaction_inconnue' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select a.statut, a.credits into v_statut, v_credits
    from public.achats_credits a where a.fedapay_transaction_id = p_tx_id for update;
  if v_statut <> 'inactif' then
    select coalesce(max(s.solde), 0) into v_solde from public.credits_soldes s where s.user_id = v_user;
    return query select v_solde, 0, false;
    return;
  end if;
  update public.achats_credits a set statut = 'paye', paye_le = now() where a.fedapay_transaction_id = p_tx_id;
  if p_expiration_depuis is null or current_date < p_expiration_depuis then
    insert into public.credits_soldes as s (user_id, solde, solde_protege, maj_le)
    values (v_user, v_credits, v_credits, now())
    on conflict (user_id) do update set solde = s.solde + excluded.solde,
      solde_protege = s.solde_protege + excluded.solde_protege, maj_le = now()
    returning s.solde into v_solde;
  else
    insert into public.credits_soldes as s (user_id, solde, solde_protege, maj_le)
    values (v_user, v_credits, 0, now())
    on conflict (user_id) do update set solde = s.solde + excluded.solde, maj_le = now()
    returning s.solde into v_solde;
  end if;
  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref)
    values (v_user, 'achat', v_credits, v_solde, p_tx_id);
  return query select v_solde, v_credits, true;
end;
$$;
revoke all on function public.crediter_achat(text, date) from public, anon, authenticated;
grant execute on function public.crediter_achat(text, date) to service_role;

-- Compatibilité : tant que l'expiration n'est pas activée, l'API peut conserver l'appel historique à un paramètre.
create or replace function public.crediter_achat(p_tx_id text)
returns table (solde_apres integer, credits_ajoutes integer, est_nouveau boolean)
language sql
security definer
set search_path = public
as $$
  select * from public.crediter_achat(p_tx_id, null::date);
$$;
revoke all on function public.crediter_achat(text) from public, anon, authenticated;
grant execute on function public.crediter_achat(text) to service_role;
