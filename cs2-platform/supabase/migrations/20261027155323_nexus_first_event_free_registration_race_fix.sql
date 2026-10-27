
-- First-event free registration uses the existing 'paid' status to mean a
-- CONFIRMED SLOT. It never creates payments or touches Stripe.
-- The API must enforce Discord OAuth from trusted Supabase app_metadata.
create or replace function public.confirm_free_tournament_entry(
  p_tournament_id uuid, p_user_id uuid, p_accept_rules boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_t public.tournaments%rowtype;
  v_p public.profiles%rowtype;
  v_r public.registrations%rowtype;
  v_occupied integer;
  v_has_registration boolean := false;
begin
  if p_accept_rules is distinct from true then
    raise exception 'Tournament rules must be accepted';
  end if;
  if p_user_id is null or not exists(
    select 1 from auth.users where id=p_user_id
  ) then raise exception 'Authenticated user required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text,80214));
  select * into v_t from public.tournaments where id=p_tournament_id for update;
  if not found or v_t.status <> 'open'
    or v_t.fee_cents <> 0
    or (v_t.registration_closes_at is not null and v_t.registration_closes_at<=now())
    or (v_t.starts_at is not null and v_t.starts_at<=now()) then
    raise exception 'Free registration is closed or this tournament requires payment';
  end if;

  if not exists(select 1 from public.steam_links where user_id=p_user_id)
    then raise exception 'Verified Steam account required';end if;
  select * into v_p from public.profiles where user_id=p_user_id;
  if not found or length(trim(v_p.nickname))<2
    or v_p.nickname ~* '^Player-[a-f0-9]{8}$'
    or v_p.primary_role is null or v_p.secondary_role is null
    or v_p.primary_role=v_p.secondary_role then
    raise exception 'Complete your nickname and distinct roles first';
  end if;

  select * into v_r from public.registrations
    where tournament_id=p_tournament_id and user_id=p_user_id for update;
  v_has_registration := found;
  if v_has_registration and v_r.status='paid' then return v_r.id;end if;
  if v_has_registration and v_r.status in ('pending_payment','needs_refund','refunded')
    then raise exception 'Existing payment record requires organizer review';end if;

  select count(*) into v_occupied from public.registrations
    where tournament_id=p_tournament_id and
      (status='paid' or (status='pending_payment' and hold_expires_at>now()));
  if v_occupied>=v_t.capacity then raise exception 'Tournament capacity reached';end if;

  if v_has_registration then
    update public.registrations
      set status='paid',hold_expires_at=null,
        primary_role=v_p.primary_role,secondary_role=v_p.secondary_role,
        assigned_tier=null,internal_score=null,
        rules_accepted_at=now(),rules_version='v1'
      where id=v_r.id returning * into v_r;
  else
    insert into public.registrations
      (tournament_id,user_id,status,hold_expires_at,primary_role,
       secondary_role,rules_accepted_at,rules_version)
    values(p_tournament_id,p_user_id,'paid',null,v_p.primary_role,
       v_p.secondary_role,now(),'v1') returning * into v_r;
  end if;
  insert into public.admin_audit(actor_id,action,details)
    values(p_user_id,'confirmed_free_entry',
      jsonb_build_object('tournament_id',p_tournament_id,'registration_id',v_r.id));
  return v_r.id;
end;$$;
revoke all on function public.confirm_free_tournament_entry(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.confirm_free_tournament_entry(uuid,uuid,boolean)
  to service_role;

