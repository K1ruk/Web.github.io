import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import { faceitGet, FaceitRequestError } from '@/lib/faceit';
import { summarizeFirstTournamentBaseline } from './first-tournament-baseline';

type FaceitPlayerResponse = {
  player_id?: unknown;
  nickname?: unknown;
  steam_id_64?: unknown;
};

export class BaselineReviewError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
  }
}

export async function getRegistrationClubBaseline(registrationId: string) {
  const db = adminDb();
  const { data: registration, error: regError } = await db.from('registrations')
    .select('id,user_id,status,tournament_id')
    .eq('id', registrationId).maybeSingle();
  if (regError || !registration || registration.status !== 'paid')
    throw new BaselineReviewError('Confirmed tournament registration not found', 404);

  const { data: steam, error: steamError } = await db.from('steam_links')
    .select('steam_id').eq('user_id', registration.user_id).maybeSingle();
  if (steamError) throw new BaselineReviewError('Could not verify the registered Steam identity');
  if (!steam || !/^[0-9]{17}$/.test(steam.steam_id))
    throw new BaselineReviewError('This registrant has no verified Steam ID', 409);

  const { data: stored, error: storedError } = await db.from('nexus_verified_faceit_links')
    .select('steam_id,faceit_player_id,nickname')
    .eq('user_id', registration.user_id).maybeSingle();
  if (storedError) throw new BaselineReviewError('Verified FACEIT identity store unavailable');

  let faceitId: string | null = null;
  let nickname: string | null = null;
  let identitySource: 'FACEIT Data API' | 'previously verified' | 'not found' = 'not found';

  if (stored && stored.steam_id === steam.steam_id) {
    faceitId = stored.faceit_player_id;
    nickname = stored.nickname;
    identitySource = 'previously verified';
  } else {
    let result: FaceitPlayerResponse | null;
    try {
      // Uses the player's VERIFIED Steam ID64; never an untrusted nickname.
      result = await faceitGet<FaceitPlayerResponse>(
        '/players?game=cs2&game_player_id=' + encodeURIComponent(steam.steam_id),
      );
    } catch (error) {
      if (error instanceof FaceitRequestError) throw error;
      throw new BaselineReviewError('FACEIT identity lookup unavailable');
    }
    if (result) {
      if (result.steam_id_64 !== undefined && result.steam_id_64 !== steam.steam_id)
        throw new BaselineReviewError('FACEIT returned a different Steam account');
      if (typeof result.player_id !== 'string'
        || !/^[0-9a-f-]{36}$/i.test(result.player_id)
        || typeof result.nickname !== 'string'
        || !result.nickname.trim() || result.nickname.length > 80)
        throw new BaselineReviewError('FACEIT identity response was incomplete');
      faceitId = result.player_id;
      nickname = result.nickname.trim();
      identitySource = 'FACEIT Data API';
      const { error: saveError } = await db.from('nexus_verified_faceit_links').upsert({
        user_id: registration.user_id,
        steam_id: steam.steam_id,
        faceit_player_id: faceitId,
        nickname,
        verified_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (saveError)
        throw new BaselineReviewError('Verified FACEIT identity could not be saved');
    }
  }

  if (!faceitId) return {
    registrationId,
    faceitPlayerId: null,
    faceitNickname: null,
    identitySource,
    baseline: null,
    reviewState: 'steam_verified_no_faceit' as const,
    note: 'Verified Steam identity exists, but no FACEIT CS2 player was found. Admin manual tier review is still possible.',
  };

  const { data: maps, error: mapsError } = await db.from('nexus_club_player_maps')
    .select('match_id,map_index,adr,kd,nexus_match_rating,raw_stats')
    .eq('faceit_player_id', faceitId)
    .limit(1001);
  if (mapsError || !maps) throw new BaselineReviewError('Club baseline archive unavailable');
  if (maps.length > 1000)
    throw new BaselineReviewError('This player has more than 1,000 saved maps; use a paged baseline review');

  const baseline = summarizeFirstTournamentBaseline(maps.map(map => ({
    match_id: map.match_id,
    map_index: map.map_index,
    adr: map.adr, kd: map.kd,
    nexus_match_rating: map.nexus_match_rating,
    raw_stats: map.raw_stats,
  })));

  return {
    registrationId,
    faceitPlayerId: faceitId,
    faceitNickname: nickname,
    identitySource,
    baseline,
    reviewState: baseline.maps > 0
      ? 'archive_available' as const : 'no_club_history' as const,
    note: baseline.maps > 0
      ? 'Verified FACEIT player ID matched a saved June 2026+ Club player. Evidence only; the administrator approves the actual tier.'
      : 'FACEIT account verified, but no maps found in the saved selected Club queue. Use other evidence and manual review.',
  };
}
