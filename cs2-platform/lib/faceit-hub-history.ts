import { NEXUS_FACEIT_QUEUE_ID, NEXUS_FACEIT_TEST_MATCH_ID, parseFaceitMatchId } from './faceit-club.ts';

/**
 * Normalize and scope FACEIT Hub match history to the ONE selected queue.
 * FACEIT returned competition_type='hub' and competition_id equal to this
 * queue ID for the organizer-supplied matchroom.
 *
 * A 200 from /hubs/{id}/matches has NOT been confirmed for this new Club queue.
 * Only trust actual FACEIT responses. Never infer a match from a similar name.
 */

export const FACEIT_HISTORY_PAGE_SIZE = 50;
export const FACEIT_HISTORY_MAX_OFFSET = 100000;
export const FACEIT_HISTORY_FULL_SCAN_PAGE_SIZE = 100;
export const FACEIT_HISTORY_MAX_AUTO_PAGES = 100;

export type QueueHistoryMatch = {
  matchId: string;
  faceitUrl: string;
  status: string;
  competitionId: string;
  competitionType: 'hub';
  organizerId: string | null;
  finishedAt: number | null;
  teams: Array<{ faction: string; name: string; score: number | null }>;
  hasScore: boolean;
};

export type FaceitHubMatchesResponse = {
  items?: unknown;
  start?: unknown;
  end?: unknown;
};

function text(value: unknown, max = 90): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, max) : null;
}
function unix(value: unknown): number | null {
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 && n < 10000000000 ? n : null;
}
function score(value: unknown): number | null {
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= 100 ? n : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function normalizeQueueHubMatches(
  response: FaceitHubMatchesResponse,
  offset: number,
  limit: number,
) {
  if (!response || !Array.isArray(response.items)
    || !Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || response.items.length > limit) {
    throw new Error('FACEIT returned an invalid or oversized hub match page.');
  }

  const seen = new Set<string>();
  let rejected = 0;
  const matches: QueueHistoryMatch[] = [];
  for (const item of response.items) {
    const match = record(item);
    if (!match) { rejected++; continue; }

    // Exact competition ID, type, and CS2 game are mandatory. This prevents
    // accidentally importing another Hub / Club's matches.
    if (match.competition_id !== NEXUS_FACEIT_QUEUE_ID
      || match.competition_type !== 'hub'
      || match.game !== 'cs2') {
      rejected++;
      continue;
    }

    const id = text(match.match_id, 80);
    if (!id || parseFaceitMatchId(id) !== id) {
      rejected++;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const teamsData = record(match.teams) ?? {};
    const results = record(match.results);
    const scoreMap = record(results?.score);
    const teams = Object.entries(teamsData).slice(0, 2).map(([faction, value]) => {
      const team = record(value);
      return {
        faction: faction.slice(0, 30),
        name: text(team?.name) || faction.slice(0, 30),
        score: score(scoreMap?.[faction]),
      };
    });
    matches.push({
      matchId: id,
      faceitUrl: 'https://www.faceit.com/en/cs2/room/' + id,
      status: text(match.status, 45) || 'UNKNOWN',
      competitionId: NEXUS_FACEIT_QUEUE_ID,
      competitionType: 'hub',
      organizerId: text(match.organizer_id, 90),
      finishedAt: unix(match.finished_at),
      teams,
      hasScore: teams.length === 2 && teams.every(team => team.score !== null),
    });
  }

  const end = typeof response.end === 'number' && Number.isSafeInteger(response.end)
    && response.end >= offset + response.items.length ? response.end : null;
  // A short page is the only reliable negative pagination signal. A full
  // page might have another page (we do not invent a total count).
  const hasMore = response.items.length === limit;

  return {
    source: 'FACEIT Data API' as const,
    endpoint: 'GET /hubs/{hub_id}/matches' as const,
    queueId: NEXUS_FACEIT_QUEUE_ID,
    offset,
    limit,
    countReturned: response.items.length,
    matches,
    rejectedUnverified: rejected,
    nextOffset: hasMore ? offset + response.items.length : null,
    hasMore,
    providerEnd: end,
    knownSampleOnThisPage: matches.some(match => match.matchId === NEXUS_FACEIT_TEST_MATCH_ID),
    verifiedBy: 'exact FACEIT competition ID + hub type + CS2 game' as const,
    savedToDatabase: false as const,
  };
}
