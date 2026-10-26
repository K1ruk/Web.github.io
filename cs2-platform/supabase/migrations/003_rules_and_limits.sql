-- Run third, after 001_init.sql and 002_hardening.sql.
alter table public.registrations add column if not exists rules_accepted_at timestamptz;
alter table public.registrations add column if not exists rules_version text;

-- Limit v1 events to 200 participants until the generator is load-tested.
alter table public.tournaments add constraint nexus_v1_capacity_limit check(capacity<=200);

create or replace function public.reserve_tournament_slot(p_tournament_id uuid,p_user_id uuid,p_accept_rules boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_t public.tournaments%rowtype;v_p public.profiles%rowtype;v_r public.registrations%rowtype;v_occupied integer;
begin
 if p_accept_rules is distinct from true then raise exception 'Rules acceptance required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text,80214));
 select * into v_t from public.tournaments where id=p_tournament_id for update;
 if not found or v_t.status<>'open'
 or (v_t.registration_closes_at is not null and v_t.registration_closes_at<=now())
 or (v_t.starts_at is not null and v_t.starts_at<=now()) then
  raise exception 'Registration is closed';end if;
 if not exists(select 1 from public.steam_links where user_id=p_user_id) then raise exception 'Verified Steam account required';end if;
 select * into v_p from public.profiles where user_id=p_user_id;
 if v_p.primary_role is null or v_p.secondary_role is null then raise exception 'Complete player roles first';end if;
 select * into v_r from public.registrations where tournament_id=p_tournament_id and user_id=p_user_id for update;
 if found and v_r.status='paid' then raise exception 'Already registered and paid';end if;
 if found and v_r.status='pending_payment' and v_r.hold_expires_at>now() then return v_r.id;end if;
 select count(*) into v_occupied from public.registrations where tournament_id=p_tournament_id and (status='paid' or(status='pending_payment' and hold_expires_at>now()));
 if v_occupied>=v_t.capacity then raise exception 'Tournament capacity reached';end if;
 if found then
  update public.registrations set status='pending_payment',hold_expires_at=now()+interval '2 hours',
  primary_role=v_p.primary_role,secondary_role=v_p.secondary_role,
  rules_accepted_at=now(),rules_version='v1' where id=v_r.id returning * into v_r;
 else
  insert into public.registrations(tournament_id,user_id,status,hold_expires_at,primary_role,secondary_role,rules_accepted_at,rules_version)
  values(p_tournament_id,p_user_id,'pending_payment',now()+interval '2 hours',v_p.primary_role,v_p.secondary_role,now(),'v1') returning * into v_r;
 end if;
 return v_r.id;
end;$$;
revoke all on function public.reserve_tournament_slot(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_tournament_slot(uuid,uuid,boolean) to service_role;
drop function public.reserve_tournament_slot(uuid,uuid);
