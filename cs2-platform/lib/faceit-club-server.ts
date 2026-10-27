import 'server-only';
import { faceitGet, FaceitRequestError } from './faceit';
import { normalizeQueueHubMatches, type FaceitHubMatchesResponse } from './faceit-hub-history';
import {
  parseFaceitMatchId, summarizeFaceitMatch,
  type FaceitMatchDetail, type FaceitMatchStats,
  type FaceitQueueDetails, type FaceitQueueListResponse,
  FACEIT_CLUB_ENTITY_TYPES, selectedQueueFromList, summarizeFaceitQueue,
  NEXUS_FACEIT_QUEUE_ID, NEXUS_FACEIT_CLUB_ID, NEXUS_FACEIT_TEST_MATCH_ID,
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
 * Read-only diagnosis for exactly ONE selected FACEIT Club queue.
 *
 * A 404 on a documented queue detail endpoint is inconclusive, not evidence
 * that the human owner lacks access. Try documented, club-scoped queue-filter
 * listings for likely entity types, then inspect the ONE user-provided sample
 * match as independent context. No API keys are exposed and no records written.
 */
export async function inspectFaceitQueue() {
  const queue = await faceitGet<FaceitQueueDetails>(
    '/games/cs2/queues/' + NEXUS_FACEIT_QUEUE_ID,
    { organizerEndpoint: true },
  );
  if (queue) {
    try {
      return {
        status: 'details_accessible' as const,
        queue: summarizeFaceitQueue(queue),
        detailLookup: 'found' as const,
        listingChecks: [],
        sampleMatch: null,
        note: 'The private FACEIT key can read queue details. This does not verify the signed-in user as FACEIT owner or provide a match-history listing.',
        provider: 'FACEIT Data API' as const,
      };
    } catch {
      throw new FaceitClubInspectionError('FACEIT returned mismatched queue details', 502);
    }
  }

  type Check = {
    entityType: (typeof FACEIT_CLUB_ENTITY_TYPES)[number];
    outcome: 'matched' | 'not_listed' | 'not_found' | 'access_denied' | 'unsupported_filter' | 'temporarily_unavailable' | 'invalid_response';
  };
  const listingChecks: Check[] = [];
  let discovered: FaceitQueueDetails | null = null;
  for (const entityType of FACEIT_CLUB_ENTITY_TYPES) {
    try {
      // This is a documented API, not a FACEIT website's private endpoint.
      // Query is scoped to the exact Club ID the user supplied.
      const listing = await faceitGet<FaceitQueueListResponse>(
        '/games/cs2/queues?entity_type=' + encodeURIComponent(entityType)
        + '&entity_id=' + encodeURIComponent(NEXUS_FACEIT_CLUB_ID)
        + '&offset=0&limit=20',
        { organizerEndpoint: true },
      );
      if (!listing) {
        listingChecks.push({ entityType, outcome: 'not_found' });
        continue;
      }
      if (!Array.isArray(listing.items)) {
        listingChecks.push({ entityType, outcome: 'invalid_response' });
        continue;
      }
      const match = selectedQueueFromList(listing);
      if (match) {
        discovered = match;
        listingChecks.push({ entityType, outcome: 'matched' });
        break;
      }
      listingChecks.push({ entityType, outcome: 'not_listed' });
    } catch (error) {
      if (error instanceof FaceitRequestError) {
        if (error.code === 'invalid_key' || error.code === 'rate_limited') throw error;
        listingChecks.push({
          entityType,
          outcome: error.code === 'permission_denied' ? 'access_denied'
            : error.code === 'bad_request' ? 'unsupported_filter'
            : 'temporarily_unavailable',
        });
      } else {
        listingChecks.push({ entityType, outcome: 'temporarily_unavailable' });
      }
    }
  }

  if (discovered) {
    return {
      status: 'listed_only' as const,
      queue: summarizeFaceitQueue(discovered),
      detailLookup: 'not_found' as const,
      listingChecks,
      sampleMatch: null,
      note: 'The exact queue ID was returned in an entity-filtered FACEIT API listing, but the details endpoint returned 404. A match-history API and FACEIT owner login are still unverified.',
      provider: 'FACEIT Data API' as const,
    };
  }

  let sampleMatch: {
    id: string;
    competitionId: string | null;
    competitionType: string | null;
    organizerId: string | null;
    status: 'available' | 'not_found' | 'unavailable';
  } = {
    id: NEXUS_FACEIT_TEST_MATCH_ID,
    competitionId: null,
    competitionType: null,
    organizerId: null,
    status: 'not_found',
  };
  try {
    const match = await faceitGet<FaceitMatchDetail>(
      '/matches/' + NEXUS_FACEIT_TEST_MATCH_ID,
    );
    if (match && match.match_id === NEXUS_FACEIT_TEST_MATCH_ID && match.game === 'cs2') {
      sampleMatch = {
        ...sampleMatch,
        competitionId: typeof match.competition_id === 'string' ? match.competition_id : null,
        competitionType: typeof match.competition_type === 'string' ? match.competition_type : null,
        organizerId: typeof match.organizer_id === 'string' ? match.organizer_id : null,
        status: 'available',
      };
    }
  } catch (error) {
    if (error instanceof FaceitRequestError
      && ['invalid_key', 'rate_limited'].includes(error.code)) throw error;
    sampleMatch = { ...sampleMatch, status: 'unavailable' };
  }

  return {
    status: 'inconclusive' as const,
    queue: null,
    detailLookup: 'not_found' as const,
    listingChecks,
    sampleMatch,
    note: 'FACEIT returned 404 from the documented queue details endpoint, and a club-scoped filtered lookup did not identify the selected queue. This does NOT prove the queue is invalid or the owner lacks permissions. New Club queues may not be exposed through this Data API.',
    provider: 'FACEIT Data API' as const,
  };
}


/**
 * List a page of real CS2 matches through the documented Hub-match route.
 *
 * The sample FACEIT match reports competition_id equal to our selected queue
 * and competition_type='hub'. That is strong routing evidence, but it does
 * NOT prove /hubs/{queueId}/matches is available for new Club queues.
 *
 * All returned items must independently match queue ID, hub type and game.
 * No tournament results, ratings or match records are written here.
 */
export async function readSelectedQueueHubMatches(offset: number, limit: number) {
  let response: FaceitHubMatchesResponse | null;
  try {
    response = await faceitGet<FaceitHubMatchesResponse>(
      '/hubs/' + NEXUS_FACEIT_QUEUE_ID + '/matches?type=past'
      + '&offset=' + offset + '&limit=' + limit,
    );
  } catch (error) {
    // FACEIT has sometimes rejected a later page with HTTP 400 even after
    // returning all the matches the organizer expects. A rejected cursor
    // is NOT evidence of end-of-history. Surface it separately so the admin
    // can save only already-fetched, individually verified match IDs.
    if (error instanceof FaceitRequestError
      && error.code === 'bad_request' && offset > 0) {
      return {
        status: 'pagination_rejected' as const,
        message: 'FACEIT returned HTTP 400 for Hub match-history page offset='
          + offset + ', limit=' + limit
          + '. Previous pages remain usable, but the end of the feed is not confirmed. '
          + 'You can save fetched June matches with an incomplete-history warning.',
        offset,
        limit,
        queueId: NEXUS_FACEIT_QUEUE_ID,
        matches: [] as const,
        hasMore: false as const,
        nextOffset: null,
        savedToDatabase: false as const,
      };
    }
    throw error;
  }
  if (!response) {
    return {
      status: 'not_exposed' as const,
      message: 'FACEIT returned 404 for the Hub match-history endpoint. The match competition is labeled hub, but this Club queue may not be indexed as a public Hub resource. No history has been imported.',
      matches: [],
      queueId: NEXUS_FACEIT_QUEUE_ID,
      hasMore: false,
      nextOffset: null,
      savedToDatabase: false as const,
    };
  }

  try {
    return {
      status: 'available' as const,
      ...normalizeQueueHubMatches(response, offset, limit),
    };
  } catch {
    throw new FaceitClubInspectionError(
      'FACEIT returned an invalid Hub match-history response. No results were imported.',
      502,
    );
  }
}
