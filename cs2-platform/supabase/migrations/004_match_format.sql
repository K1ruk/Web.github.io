alter table public.matches add column if not exists best_of integer not null default 3 check(best_of in (1,3));
create index if not exists matches_tournament_date on public.matches(tournament_id,scheduled_at);
