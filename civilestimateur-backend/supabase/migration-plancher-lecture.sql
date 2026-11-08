-- Plancher de facturation des lectures CST, à exécuter après migration-expiration-credits.sql.
-- Le backend regroupe les coûts réels de tous les appels d'une lecture, puis facture au minimum 1 197 CST.
-- Appel idempotent : la même lecture ne peut recevoir le supplément qu'une seule fois.

create or replace function public.facturer_minimum_lecture(p_user_id uuid, p_lecture_id uuid, p_minimum integer)
returns table (credits_factures integer, solde_apres integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := 'lecture-minimum/' || p_lecture_id::text;
  v_solde integer;
  v_protege integer;
  v_cout_reel integer;
  v_delta integer;
  v_debit integer;
  v_protege_debite integer;
begin
  if p_minimum is null or p_minimum <= 0 then
    raise exception 'minimum_invalide' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if exists (select 1 from public.credits_mouvements m where m.user_id = p_user_id and m.ref = v_ref) then
    select coalesce(s.solde, 0) into v_solde from public.credits_soldes s where s.user_id = p_user_id;
    return query select 0, coalesce(v_solde, 0);
    return;
  end if;

  select greatest(0, -coalesce(sum(m.montant), 0))::integer into v_cout_reel
    from public.credits_mouvements m
   where m.user_id = p_user_id and m.ref like ('lecture/' || p_lecture_id::text || '/%')
     and m.type in ('reservation', 'regularisation');
  -- Un identifiant inventé ou une lecture entièrement échouée ne déclenche pas le plancher.
  if coalesce(v_cout_reel, 0) <= 0 then
    return query select 0, coalesce((select s.solde from public.credits_soldes s where s.user_id = p_user_id), 0);
    return;
  end if;
  v_delta := greatest(0, p_minimum - coalesce(v_cout_reel, 0));
  if v_delta = 0 then
    return query select 0, coalesce((select s.solde from public.credits_soldes s where s.user_id = p_user_id), 0);
    return;
  end if;

  select s.solde, s.solde_protege into v_solde, v_protege
    from public.credits_soldes s where s.user_id = p_user_id for update;
  if not found then raise exception 'solde_inconnu' using errcode = 'P0002'; end if;
  v_debit := least(v_solde, v_delta);
  v_protege_debite := greatest(0, v_debit - (v_solde - v_protege));
  v_solde := v_solde - v_debit;
  v_protege := v_protege - v_protege_debite;
  update public.credits_soldes set solde = v_solde, solde_protege = v_protege, maj_le = now()
   where user_id = p_user_id;
  insert into public.credits_mouvements (user_id, type, montant, solde_apres, ref, credits_proteges)
   values (p_user_id, 'regularisation', -v_debit, v_solde, v_ref, -v_protege_debite);
  return query select v_debit, v_solde;
end;
$$;

revoke all on function public.facturer_minimum_lecture(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.facturer_minimum_lecture(uuid, uuid, integer) to service_role;
