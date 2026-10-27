-- NEXUS v1. Run in Supabase SQL editor on a NEW project.
create extension if not exists pgcrypto;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null default 'Player' check(length(nickname) between 2 and 32),
 primary_role text check(primary_role in ('AWPer','IGL','Entry Fragger','Rifler','Support','Lurker')),
 secondary_role text check(secondary_role in ('AWPer','IGL','Entry Fragger','Rifler','Support','Lurker')),
 preferred_language text not null default 'en' check(preferred_language in ('en','mn')),
 updated_at timestamptz not null default now(),
 check(primary_role is null or secondary_role is null or primary_role<>secondary_role)
);
create table public.steam_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 steam_id text not null unique check(steam_id~'^[0-9]{17}$'),
 verified_at timestamptz not null default now()
);
create table public.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.tournaments (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug~'^[a-z0-9-]{3,60}$'),
 name text not null check(length(name) between 3 and 100),
 status text not null default 'draft' check(status in ('draft','open','locked','published','finished','cancelled')),
 fee_cents integer not null check(fee_cents between 0 and 1000000),
 currency text not null default 'eur' check(currency ~ '^[a-z]{3}$'),
 capacity integer not null check(capacity>=5 and capacity<=1000 and capacity%5=0),
 starts_at timestamptz,
 registration_closes_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.registrations (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending_payment' check(status in ('pending_payment','paid','cancelled','refunded','needs_refund')),
 hold_expires_at timestamptz,
 assigned_tier integer check(assigned_tier between 1 and 5),
 internal_score numeric(6,2) check(internal_score between 0 and 100),
 primary_role text not null check(primary_role in ('AWPer','IGL','Entry Fragger','Rifler','Support','Lurker')),
 secondary_role text not null check(secondary_role in ('AWPer','IGL','Entry Fragger','Rifler','Support','Lurker')),
 created_at timestamptz not null default now(),
 unique(tournament_id,user_id),
 check(primary_role<>secondary_role)
);
create index registrations_tournament_status on public.registrations(tournament_id,status);
create table public.payments (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null references public.registrations(id) on delete restrict,
 checkout_session_id text not null unique,
 payment_intent_id text,
 amount_cents integer not null check(amount_cents>=0),
 currency text not null,
 status text not null default 'pending' check(status in ('pending','paid','expired','needs_refund','refunded')),
 created_at timestamptz not null default now()
);
create index payments_registration_id on public.payments(registration_id);
create table public.payment_events (
 stripe_event_id text primary key,
 event_type text not null,
 received_at timestamptz not null default now()
);
create table public.skill_assessments (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null references public.registrations(id) on delete cascade,
 source text not null check(source in ('faceit','manual','mixed')),
 faceit_elo integer,
 matches_sampled integer,
 suggested_tier integer check(suggested_tier between 1 and 5),
 proposed_score numeric(6,2) check(proposed_score between 0 and 100),
 evidence jsonb not null default '{}'::jsonb,
 assessed_by uuid references auth.users(id),
 assessed_at timestamptz not null default now()
);
create table public.teams (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete restrict,
 name text not null check(length(name) between 1 and 50),
 created_at timestamptz not null default now(),
 unique(tournament_id,name)
);
create table public.team_members (
 team_id uuid not null references public.teams(id) on delete cascade,
 registration_id uuid not null unique references public.registrations(id) on delete restrict,
 assigned_role text not null check(assigned_role in ('AWPer','IGL','Entry Fragger','Rifler','Support','Lurker')),
 primary key(team_id,registration_id)
);
create table public.matches (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete restrict,
 team_a uuid references public.teams(id),
 team_b uuid references public.teams(id),
 scheduled_at timestamptz,
 stage text not null default 'groups',
 status text not null default 'scheduled' check(status in ('scheduled','live','completed','cancelled')),
 score_a integer check(score_a>=0),
 score_b integer check(score_b>=0),
 check(team_a is distinct from team_b)
);
create table public.admin_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create or replace function public.on_user_created() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(user_id,nickname) values(new.id,'Player-'||left(new.id::text,8));
 return new;
end;$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_user_created();

-- No browser role can modify authoritative competition, payment or Steam data.
alter table public.profiles enable row level security;
alter table public.steam_links enable row level security;
alter table public.admin_users enable row level security;
alter table public.tournaments enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.skill_assessments enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.matches enable row level security;
alter table public.admin_audit enable row level security;
revoke all on public.profiles,public.steam_links,public.admin_users,public.tournaments,public.registrations,public.payments,public.payment_events,public.skill_assessments,public.teams,public.team_members,public.matches,public.admin_audit from anon,authenticated;
grant select on public.tournaments,public.profiles,public.teams,public.team_members,public.matches to anon,authenticated;
grant select on public.steam_links,public.registrations,public.payments,public.skill_assessments to authenticated;
create policy "profiles public" on public.profiles for select to anon,authenticated using(true);
create policy "tournaments public published" on public.tournaments for select to anon,authenticated using(status<>'draft');
create policy "own steam link" on public.steam_links for select to authenticated using(user_id=(select auth.uid()));
create policy "own registration" on public.registrations for select to authenticated using(user_id=(select auth.uid()));
create policy "own payments" on public.payments for select to authenticated using(exists(select 1 from public.registrations r where r.id=registration_id and r.user_id=(select auth.uid())));
create policy "own skill assessments" on public.skill_assessments for select to authenticated using(exists(select 1 from public.registrations r where r.id=registration_id and r.user_id=(select auth.uid())));
create policy "published teams" on public.teams for select to anon,authenticated using(exists(select 1 from public.tournaments t where t.id=tournament_id and t.status in ('published','finished')));
create policy "published memberships" on public.team_members for select to anon,authenticated using(exists(select 1 from public.teams tm join public.tournaments t on t.id=tm.tournament_id where tm.id=team_id and t.status in ('published','finished')));
create policy "published matches" on public.matches for select to anon,authenticated using(exists(select 1 from public.tournaments t where t.id=tournament_id and t.status in ('published','finished')));
-- Reserve is serialized per tournament to prevent concurrent overbooking.
create or replace function public.reserve_tournament_slot(p_tournament_id uuid,p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_t public.tournaments%rowtype;v_p public.profiles%rowtype;v_r public.registrations%rowtype;v_occupied integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text, 80214));
 select * into v_t from public.tournaments where id=p_tournament_id for update;
 if not found or v_t.status<>'open' or (v_t.registration_closes_at is not null and v_t.registration_closes_at<=now()) then
  raise exception 'Registration is closed';
 end if;
 if not exists(select 1 from public.steam_links where user_id=p_user_id) then raise exception 'Verified Steam account required';end if;
 select * into v_p from public.profiles where user_id=p_user_id;
 if v_p.primary_role is null or v_p.secondary_role is null then raise exception 'Complete player roles first';end if;
 select * into v_r from public.registrations where tournament_id=p_tournament_id and user_id=p_user_id for update;
 if found and v_r.status='paid' then raise exception 'Already registered and paid';end if;
 if found and v_r.status='pending_payment' and v_r.hold_expires_at>now() then return v_r.id;end if;
 select count(*) into v_occupied from public.registrations where tournament_id=p_tournament_id and (status='paid' or (status='pending_payment' and hold_expires_at>now()));
 if v_occupied>=v_t.capacity then raise exception 'Tournament capacity reached';end if;
 if found then
  update public.registrations set status='pending_payment',hold_expires_at=now()+interval '2 hours',primary_role=v_p.primary_role,secondary_role=v_p.secondary_role where id=v_r.id returning * into v_r;
 else
  insert into public.registrations(tournament_id,user_id,status,hold_expires_at,primary_role,secondary_role) values(p_tournament_id,p_user_id,'pending_payment',now()+interval '2 hours',v_p.primary_role,v_p.secondary_role) returning * into v_r;
 end if;
 return v_r.id;
end;$$;
revoke all on function public.reserve_tournament_slot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_tournament_slot(uuid,uuid) to service_role;

-- Stripe webhook calls this RPC only after signature and paid-session verification.
create or replace function public.confirm_checkout(p_event text,p_session text,p_intent text,p_amount integer,p_currency text)
returns text language plpgsql security definer set search_path=public as $$
declare v_pay public.payments%rowtype;v_reg public.registrations%rowtype;v_fee integer;v_curr text;v_capacity integer;v_paid integer;
begin
 if exists(select 1 from public.payment_events where stripe_event_id=p_event) then return 'duplicate';end if;
 select * into v_pay from public.payments where checkout_session_id=p_session for update;
 if not found then raise exception 'Unknown checkout session';end if;
 select * into v_reg from public.registrations where id=v_pay.registration_id for update;
 select fee_cents,currency,capacity into v_fee,v_curr,v_capacity from public.tournaments where id=v_reg.tournament_id for update;
 if p_amount<>v_pay.amount_cents or p_amount<>v_fee or lower(p_currency)<>v_pay.currency or lower(p_currency)<>v_curr then raise exception 'Checkout amount mismatch';end if;
 insert into public.payment_events(stripe_event_id,event_type) values(p_event,'checkout.session.completed');
 if v_reg.status='paid' then update public.payments set status='paid',payment_intent_id=p_intent where id=v_pay.id;return 'already_paid';end if;
 select count(*) into v_paid from public.registrations where tournament_id=v_reg.tournament_id and status='paid';
 if v_paid>=v_capacity or v_reg.status<>'pending_payment' then
  update public.payments set status='needs_refund',payment_intent_id=p_intent where id=v_pay.id;
  update public.registrations set status='needs_refund' where id=v_reg.id;
  return 'needs_refund';
 end if;
 update public.payments set status='paid',payment_intent_id=p_intent where id=v_pay.id;
 update public.registrations set status='paid',hold_expires_at=null where id=v_reg.id;
 return 'paid';
end;$$;
revoke all on function public.confirm_checkout(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.confirm_checkout(text,text,text,integer,text) to service_role;

create or replace function public.expire_checkout(p_event text,p_session text)
returns text language plpgsql security definer set search_path=public as $$
declare v_pay public.payments%rowtype;
begin
 if exists(select 1 from public.payment_events where stripe_event_id=p_event) then return 'duplicate';end if;
 select * into v_pay from public.payments where checkout_session_id=p_session for update;
 if not found then return 'unknown';end if;
 insert into public.payment_events(stripe_event_id,event_type) values(p_event,'checkout.session.expired');
 if v_pay.status='pending' then
  update public.payments set status='expired' where id=v_pay.id;
  if not exists(select 1 from public.payments where registration_id=v_pay.registration_id and status in ('pending','paid')) then
   update public.registrations set status='cancelled',hold_expires_at=null where id=v_pay.registration_id and status='pending_payment';
  end if;
 end if;
 return 'expired';
end;$$;
revoke all on function public.expire_checkout(text,text) from public,anon,authenticated;
grant execute on function public.expire_checkout(text,text) to service_role;

-- Atomically publish validated five-player rosters, only for locked events.
create or replace function public.publish_balanced_teams(p_tournament uuid,p_rosters jsonb,p_actor uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_team jsonb;v_player jsonb;v_team_id uuid;v_id uuid;v_role text;v_count int;v_paid int;v_used int:=0;v_num int:=0;v_status text;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'Forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tournament::text, 80214));
 select status into v_status from public.tournaments where id=p_tournament for update;
 if v_status<>'locked' then raise exception 'Tournament must be locked';end if;
 if exists(select 1 from public.teams where tournament_id=p_tournament) then raise exception 'Teams already published';end if;
 select count(*) into v_paid from public.registrations where tournament_id=p_tournament and status='paid';
 if v_paid<5 or mod(v_paid,5)<>0 or jsonb_typeof(p_rosters)<>'array' or jsonb_array_length(p_rosters)<>v_paid/5 then raise exception 'Roster count invalid';end if;
 if exists(select 1 from public.registrations where tournament_id=p_tournament and status='paid' and (assigned_tier is null or internal_score is null)) then raise exception 'All players need approved tiers and scores';end if;
 create temporary table _team_ids(id uuid primary key) on commit drop;
 for v_team in select value from jsonb_array_elements(p_rosters) loop
  if jsonb_typeof(v_team)<>'array' or jsonb_array_length(v_team)<>5 then raise exception 'Team must have five players';end if;
  v_num:=v_num+1;
  insert into public.teams(tournament_id,name) values(p_tournament,'SQUAD '||lpad(v_num::text,2,'0')) returning id into v_team_id;
  for v_player in select value from jsonb_array_elements(v_team) loop
   v_id:=(v_player->>'registration_id')::uuid;
   v_role:=v_player->>'assigned_role';
   if not exists(select 1 from public.registrations where id=v_id and tournament_id=p_tournament and status='paid') then raise exception 'Invalid team member';end if;
   insert into _team_ids(id) values(v_id); -- unique constraint rejects duplicates.
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
