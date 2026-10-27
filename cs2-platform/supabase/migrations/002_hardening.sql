-- Supplemental hardening for the NEXUS v1 migration.
create unique index if not exists only_one_open_checkout_per_registration
on public.payments(registration_id) where status='pending';

-- Never publish rosters while an active Checkout hold may still complete.
create or replace function public.publish_balanced_teams(p_tournament uuid,p_rosters jsonb,p_actor uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_team jsonb;v_player jsonb;v_team_id uuid;v_id uuid;v_role text;v_paid int;v_used int:=0;v_num int:=0;v_status text;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'Forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tournament::text, 80214));
 select status into v_status from public.tournaments where id=p_tournament for update;
 if v_status<>'locked' then raise exception 'Tournament must be locked';end if;
 if exists(select 1 from public.registrations where tournament_id=p_tournament and status='pending_payment' and hold_expires_at>now()) then raise exception 'Pending payment sessions must expire or complete first';end if;
 if exists(select 1 from public.teams where tournament_id=p_tournament) then raise exception 'Teams already published';end if;
 select count(*) into v_paid from public.registrations where tournament_id=p_tournament and status='paid';
 if v_paid<5 or mod(v_paid,5)<>0 then raise exception 'Paid participant count must be a multiple of five';end if;
 if jsonb_typeof(p_rosters) is distinct from 'array' then raise exception 'Rosters must be an array';end if;
 if jsonb_array_length(p_rosters)<>v_paid/5 then raise exception 'Roster count invalid';end if;
 if exists(select 1 from public.registrations where tournament_id=p_tournament and status='paid' and (assigned_tier is null or internal_score is null)) then raise exception 'All players need approved tiers and scores';end if;
 create temporary table _nexus_assigned_ids(id uuid primary key) on commit drop;
 for v_team in select value from jsonb_array_elements(p_rosters) loop
  if jsonb_typeof(v_team) is distinct from 'array' then raise exception 'Team must be an array';end if;
  if jsonb_array_length(v_team)<>5 then raise exception 'Team must have five players';end if;
  v_num:=v_num+1;
  insert into public.teams(tournament_id,name) values(p_tournament,'SQUAD '||lpad(v_num::text,2,'0')) returning id into v_team_id;
  for v_player in select value from jsonb_array_elements(v_team) loop
   v_id:=(v_player->>'registration_id')::uuid;
   v_role:=v_player->>'assigned_role';
   if not exists(select 1 from public.registrations where id=v_id and tournament_id=p_tournament and status='paid') then raise exception 'Invalid team member';end if;
   insert into _nexus_assigned_ids(id) values(v_id);
   insert into public.team_members(team_id,registration_id,assigned_role) values(v_team_id,v_id,v_role);
   v_used:=v_used+1;
  end loop;
 end loop;
 if v_used<>v_paid then raise exception 'Some players missing';end if;
 update public.tournaments set status='published' where id=p_tournament;
 insert into public.admin_audit(actor_id,action,details) values(p_actor,'publish_teams',jsonb_build_object('tournament',p_tournament,'teams',v_num,'players',v_used));
 return v_num;
end;$$;
revoke all on function public.publish_balanced_teams(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.publish_balanced_teams(uuid,jsonb,uuid) to service_role;

-- Atomic tier approval with current tournament state validation.
create or replace function public.approve_player_skill(p_registration uuid,p_actor uuid,p_tier integer,p_score numeric,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare v_t uuid;v_status text;v_reg text;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'Forbidden';end if;
 if p_tier not between 1 and 5 or p_score not between 0 and 100 then raise exception 'Invalid skill rating';end if;
 select tournament_id,status into v_t,v_reg from public.registrations where id=p_registration for update;
 if v_reg is distinct from 'paid' then raise exception 'Player must be paid';end if;
 select status into v_status from public.tournaments where id=v_t for update;
 if v_status not in ('draft','open','locked') then raise exception 'Cannot change skill after team publication';end if;
 update public.registrations set assigned_tier=p_tier,internal_score=p_score where id=p_registration;
 insert into public.skill_assessments(registration_id,source,suggested_tier,proposed_score,evidence,assessed_by)
 values(p_registration,'manual',p_tier,p_score,jsonb_build_object('admin_note',left(coalesce(p_note,''),500)),p_actor);
 insert into public.admin_audit(actor_id,action,details) values(p_actor,'approve_skill',jsonb_build_object('registration',p_registration,'tier',p_tier,'score',p_score,'note',left(coalesce(p_note,''),500)));
end;$$;
revoke all on function public.approve_player_skill(uuid,uuid,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.approve_player_skill(uuid,uuid,integer,numeric,text) to service_role;

-- Public roster information has a deliberate narrow projection: never expose payment IDs.
create or replace function public.published_players()
returns table(nickname text,primary_role text,secondary_role text,tier integer,team_name text)
language sql stable security definer set search_path=public as $$
 select p.nickname,r.primary_role,r.secondary_role,r.assigned_tier,tm.name
 from public.registrations r
 join public.profiles p on p.user_id=r.user_id
 join public.tournaments t on t.id=r.tournament_id
 join public.team_members mem on mem.registration_id=r.id
 join public.teams tm on tm.id=mem.team_id
 where t.status in ('published','finished') and r.status='paid';
$$;
revoke all on function public.published_players() from public;
grant execute on function public.published_players() to anon,authenticated;
