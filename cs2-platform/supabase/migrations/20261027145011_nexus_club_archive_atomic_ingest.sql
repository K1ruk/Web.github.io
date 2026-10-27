-- Atomic upsert of one provider-verified FACEIT match and all supplied player maps.
-- Called ONLY with the private service_role key by an authenticated NEXUS admin.
-- SECURITY INVOKER: no public privileged entry point.
CREATE OR REPLACE FUNCTION public.ingest_nexus_club_match(
  p_match jsonb, p_players jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id text;
  v_players integer := 0;
BEGIN
  IF jsonb_typeof(p_match) <> 'object' OR jsonb_typeof(p_players) <> 'array'
     OR jsonb_array_length(p_players) > 100 THEN
    RAISE EXCEPTION 'Invalid FACEIT archive payload';
  END IF;

  v_id := p_match ->> 'id';
  IF v_id IS NULL OR v_id !~ '^1-[0-9a-f-]{36}$'
      OR p_match->>'queue_id' <> '26ca1fb5-eb37-4b3c-9005-402eca7a9008'
      OR p_match->>'competition_type' <> 'hub'
      OR p_match->>'status' <> 'FINISHED'
      OR (p_match->>'finished_at')::timestamptz < '2026-06-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Match does not belong in selected June 2026 FACEIT queue archive';
  END IF;

  INSERT INTO public.nexus_club_matches
    (id,queue_id,competition_type,organizer_id,finished_at,status,
     team_a,team_b,score_a,score_b,map_count,stats_status,model_version)
  VALUES
    (v_id,(p_match->>'queue_id')::uuid,'hub',p_match->>'organizer_id',
     (p_match->>'finished_at')::timestamptz,'FINISHED',
     p_match->>'team_a',p_match->>'team_b',
     (p_match->>'score_a')::integer,(p_match->>'score_b')::integer,
     (p_match->>'map_count')::integer,p_match->>'stats_status',p_match->>'model_version')
  ON CONFLICT (id) DO UPDATE SET
    organizer_id=excluded.organizer_id,
    finished_at=excluded.finished_at,
    team_a=excluded.team_a,team_b=excluded.team_b,
    score_a=excluded.score_a,score_b=excluded.score_b,
    map_count=GREATEST(public.nexus_club_matches.map_count,excluded.map_count),
    stats_status=CASE WHEN excluded.stats_status='available'
      THEN 'available' ELSE public.nexus_club_matches.stats_status END,
    model_version=excluded.model_version,
    updated_at=now();

  INSERT INTO public.nexus_club_players (faceit_player_id,nickname)
  SELECT DISTINCT ON (faceit_player_id)
    faceit_player_id,nickname
  FROM jsonb_to_recordset(p_players) AS p("faceitPlayerId" text, "nickname" text)
  CROSS JOIN LATERAL (
    SELECT p."faceitPlayerId" AS faceit_player_id, p."nickname" AS nickname
  ) norm
  WHERE faceit_player_id IS NOT NULL AND nickname IS NOT NULL
  ORDER BY faceit_player_id
  ON CONFLICT (faceit_player_id) DO UPDATE SET
    nickname=excluded.nickname,last_seen_at=now();

  INSERT INTO public.nexus_club_player_maps
    (match_id,faceit_player_id,map_index,map_name,nickname_at_match,
     team_name,kills,deaths,assists,headshots,rounds_played,
     adr,kast_percent,opening_duel_win_percent,opening_duels,kd,
     raw_stats,nexus_match_rating,rating_coverage,rating_confidence,rating_model)
  SELECT v_id,p."faceitPlayerId",p."mapIndex",p."mapName",p."nickname",
    p."teamName",p."kills",p."deaths",p."assists",p."headshots",p."roundsPlayed",
    p."adr",p."kastPercent",p."openingDuelWinPercent",p."openingDuels",p."kd",
    COALESCE(p."rawStats",'{}'::jsonb),p."nexusRating",p."ratingCoverage",
    p."ratingConfidence",p."ratingModel"
  FROM jsonb_to_recordset(p_players) AS p (
    "faceitPlayerId" text,"nickname" text,"teamName" text,
    "mapIndex" integer,"mapName" text,
    "kills" integer,"deaths" integer,"assists" integer,
    "headshots" integer,"roundsPlayed" integer,
    "adr" numeric,"kastPercent" numeric,"openingDuelWinPercent" numeric,
    "openingDuels" integer,"kd" numeric,
    "rawStats" jsonb,"nexusRating" numeric,"ratingCoverage" numeric,
    "ratingConfidence" text,"ratingModel" text
  )
  ON CONFLICT (match_id,faceit_player_id,map_index) DO UPDATE SET
    map_name=excluded.map_name,nickname_at_match=excluded.nickname_at_match,
    team_name=excluded.team_name,kills=excluded.kills,deaths=excluded.deaths,
    assists=excluded.assists,headshots=excluded.headshots,rounds_played=excluded.rounds_played,
    adr=excluded.adr,kast_percent=excluded.kast_percent,
    opening_duel_win_percent=excluded.opening_duel_win_percent,
    opening_duels=excluded.opening_duels,kd=excluded.kd,
    raw_stats=excluded.raw_stats,nexus_match_rating=excluded.nexus_match_rating,
    rating_coverage=excluded.rating_coverage,rating_confidence=excluded.rating_confidence,
    rating_model=excluded.rating_model,imported_at=now();

  GET DIAGNOSTICS v_players = ROW_COUNT;
  RETURN jsonb_build_object('matchId',v_id,'playerMapRows',v_players,'persisted',true);
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_nexus_club_match(jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_nexus_club_match(jsonb,jsonb)
  TO service_role;
