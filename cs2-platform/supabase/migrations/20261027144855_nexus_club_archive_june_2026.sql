-- Only the user-selected FACEIT Club queue; completed matches June 1, 2026 onward.
-- This migration is also applied to Supabase project soyvzdmzfbfqwydtkrlc.
CREATE TABLE IF NOT EXISTS public.nexus_club_matches (
  id text PRIMARY KEY,
  queue_id uuid NOT NULL DEFAULT '26ca1fb5-eb37-4b3c-9005-402eca7a9008'::uuid
    CHECK (queue_id = '26ca1fb5-eb37-4b3c-9005-402eca7a9008'::uuid),
  competition_type text NOT NULL DEFAULT 'hub' CHECK (competition_type='hub'),
  organizer_id text,
  finished_at timestamptz NOT NULL CHECK (finished_at >= '2026-06-01T00:00:00Z'::timestamptz),
  status text NOT NULL DEFAULT 'FINISHED' CHECK (status='FINISHED'),
  team_a text, team_b text, score_a integer, score_b integer,
  map_count integer NOT NULL DEFAULT 0 CHECK (map_count BETWEEN 0 AND 5),
  stats_status text NOT NULL CHECK (stats_status IN ('available','unavailable')),
  model_version text NOT NULL DEFAULT 'june-2026-nexus-v1',
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nexus_club_players (
  faceit_player_id text PRIMARY KEY CHECK (length(faceit_player_id) BETWEEN 1 AND 80),
  nickname text NOT NULL CHECK (length(nickname) BETWEEN 1 AND 80),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nexus_club_player_maps (
  match_id text NOT NULL REFERENCES public.nexus_club_matches(id) ON DELETE CASCADE,
  faceit_player_id text NOT NULL REFERENCES public.nexus_club_players(faceit_player_id),
  map_index integer NOT NULL CHECK (map_index BETWEEN 0 AND 4),
  map_name text NOT NULL,
  nickname_at_match text NOT NULL,
  team_name text,
  kills integer CHECK (kills BETWEEN 0 AND 200),
  deaths integer CHECK (deaths BETWEEN 0 AND 200),
  assists integer CHECK (assists BETWEEN 0 AND 200),
  headshots integer CHECK (headshots BETWEEN 0 AND 200),
  rounds_played integer CHECK (rounds_played BETWEEN 0 AND 300),
  adr numeric(7,2) CHECK (adr BETWEEN 0 AND 300),
  kast_percent numeric(6,2) CHECK (kast_percent BETWEEN 0 AND 100),
  opening_duel_win_percent numeric(6,2) CHECK (opening_duel_win_percent BETWEEN 0 AND 100),
  opening_duels integer CHECK (opening_duels BETWEEN 0 AND 200),
  kd numeric(6,3) CHECK (kd BETWEEN 0 AND 15),
  raw_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  nexus_match_rating numeric(4,2) CHECK (nexus_match_rating BETWEEN 0.5 AND 1.5),
  rating_coverage numeric(4,2) NOT NULL DEFAULT 0 CHECK (rating_coverage BETWEEN 0 AND 1),
  rating_confidence text NOT NULL DEFAULT 'unavailable'
    CHECK (rating_confidence IN ('unavailable','limited','provisional')),
  rating_model text NOT NULL DEFAULT 'nexus-lobby-v1',
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id,faceit_player_id,map_index)
);

CREATE INDEX IF NOT EXISTS idx_nexus_club_matches_finished
  ON public.nexus_club_matches (finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_club_player_maps_player
  ON public.nexus_club_player_maps (faceit_player_id,match_id);

ALTER TABLE public.nexus_club_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_club_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_club_player_maps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nexus_club_matches, public.nexus_club_players,
  public.nexus_club_player_maps FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nexus_club_matches,
  public.nexus_club_players, public.nexus_club_player_maps TO service_role;
