import 'server-only';
import { faceitGet, FaceitRequestError } from './faceit';
import {
  parseFaceitMatchId, summarizeFaceitMatch,
  type FaceitMatchDetail, type FaceitMatchStats,
  type FaceitQueueDetails, summarizeFaceitQueue, NEXUS_FACEIT_QUEUE_ID,
} from './faceit-club';

export class FaceitClubInspectionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'FaceitClubInspectionError';
  }
}

/**
 * Inspect a known FACEIT CS2 matchroom using the documented Data API.
 *
 * Does not assert Club membership/ownership or write to NEXUS tournament data.
 * There is no confirmed documented Data API endpoint to enumerate FACEIT
 * Club matches by the user-supplied Club ID.
 */
export async function inspectFaceitMatch(matchUrlOrId: string) {
  const matchId = parseFaceitMatchId(matchUrlOrId);
  if (!matchId) throw new FaceitClubInspectionError('Use a valid FACEIT CS2 matchroom URL or match ID', 400);

  const match = await faceitGet<FaceitMatchDetail>(
    '/matches/' + encodeURIComponent(matchId),
  );
  if (!match) throw new FaceitClubInspectionError('FACEIT could not find this matchroom', 404);

  if (match.game !== 'cs2') {
    throw new FaceitClubInspectionError('The match is not a CS2 match', 400);
  }
  if (match.match_id !== matchId) {
    throw new FaceitClubInspectionError('FACEIT returned an inconsistent match ID', 502);
  }

  let stats: FaceitMatchStats | null = null;
  let statsStatus: 'available' | 'not_found' | 'temporarily_unavailable' = 'not_found';
  try {
    stats = await faceitGet<FaceitMatchStats>(
      '/matches/' + encodeURIComponent(matchId) + '/stats',
    );
    statsStatus = stats ? 'available' : 'not_found';
  } catch (error) {
    if (error instanceof FaceitRequestError
      && ['invalid_key', 'rate_limited'].includes(error.code)) throw error;
    statsStatus = 'temporarily_unavailable';
  }

  const result = summarizeFaceitMatch(matchId, match, stats);
  return {
    ...result,
    statsStatus,
    source: 'FACEIT Data API' as const,
    dataImported: false as const,
    matchClubMembershipVerified: false as const,
  };
}


/**
 * Probe the documented owner/organizer-only queue details endpoint.
 * The successful HTTP response confirms permission of the server API key
 * for this queue; it does not verify the Club owner's FACEIT login.
 *
 * Deliberately does not enumerate unrelated Club queues or invent a
 * Club queue match-history API that FACEIT has not documented.
 */
export async function inspectFaceitQueue() {
  const queue = await faceitGet<FaceitQueueDetails>(
    '/games/cs2/queues/' + NEXUS_FACEIT_QUEUE_ID,
    { organizerEndpoint: true },
  );
  if (!queue) {
    throw new FaceitClubInspectionError(
      'FACEIT returned 404 for this queue. It may not be visible to the supplied API key or might not exist on the Data API.',
      404,
    );
  }
  try {
    return {
      ...summarizeFaceitQueue(queue),
      apiAccess: 'granted' as const,
      provider: 'FACEIT Data API' as const,
    };
  } catch {
    throw new FaceitClubInspectionError(
      'FACEIT returned an unexpected queue or game identifier.',
      502,
    );
  }
}
