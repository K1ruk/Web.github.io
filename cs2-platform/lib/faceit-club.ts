import { parseFaceitMetrics, type FaceitMetrics } from './faceit-metrics.ts';

export const NEXUS_FACEIT_CLUB_ID = 'a89ac9ff-8702-40df-b62d-8140719d481e';
export const NEXUS_FACEIT_CLUB_URL =
  'https://www.faceit.com/en/club/' + NEXUS_FACEIT_CLUB_ID + '/parties';

/** The ONE Club queue selected by the organizer (not the entire Club). */
export const NEXUS_FACEIT_QUEUE_ID = '26ca1fb5-eb37-4b3c-9005-402eca7a9008';
export const NEXUS_FACEIT_QUEUE_URL =
  'https://www.faceit.com/en/club/' + NEXUS_FACEIT_CLUB_ID
  + '/queue/' + NEXUS_FACEIT_QUEUE_ID;

export type FaceitQueueDetails = {
  id?: unknown;
  game?: unknown;
  queueName?: unknown;
  entityId?: unknown;
  entityType?: unknown;
  organizerId?: unknown;
  region?: unknown;
  state?: unknown;
  open?: unknown;
  paused?: unknown;
  calculateElo?: unknown;
  minSkill?: unknown;
  maxSkill?: unknown;
  lastModified?: unknown;
};

/**
 * FACEIT documents filtering by entity_type + entity_id, but does not
 * document what entity_type represents a new Club. These are exploratory
 * candidates scoped only to the user's single Club ID, NOT all queues.
 */
export const FACEIT_CLUB_ENTITY_TYPES = ['clan', 'club', 'hub'] as const;
export type FaceitClubEntityType = (typeof FACEIT_CLUB_ENTITY_TYPES)[number];

export type FaceitQueueListResponse = {
  items?: unknown;
  start?: unknown;
  end?: unknown;
};

export function selectedQueueFromList(
  listing: FaceitQueueListResponse | null,
): FaceitQueueDetails | null {
  if (!listing || !Array.isArray(listing.items)) return null;
  const matches = listing.items.filter((item): item is FaceitQueueDetails =>
    !!item && typeof item === 'object' && !Array.isArray(item)
    && (item as FaceitQueueDetails).id === NEXUS_FACEIT_QUEUE_ID
    && (item as FaceitQueueDetails).game === 'cs2'
    && (item as FaceitQueueDetails).entityId === NEXUS_FACEIT_CLUB_ID,
  );
  return matches[0] ?? null;
}

export type FaceitQueueSummary = {
  queueId: string;
  clubId: string;
  queueUrl: string;
  name: string | null;
  game: 'cs2';
  region: string | null;
  state: string | null;
  open: boolean | null;
  paused: boolean | null;
  calculateElo: boolean | null;
  entityId: string | null;
  entityType: string | null;
  organizerId: string | null;
  minSkill: number | null;
  maxSkill: number | null;
  lastModified: string | null;
  entityIdMatchesProvidedClub: boolean;
  matchHistoryAvailable: false;
  clubQueueOwnershipVerified: false;
};

/**
 * A successful organizer API response establishes key-level permission
 * to access this particular queue, not identity of the signed-in FACEIT owner
 * and not access to an undocumented queue-match-history endpoint.
 */
export function summarizeFaceitQueue(
  payload: FaceitQueueDetails,
): FaceitQueueSummary {
  if (!payload || payload.id !== NEXUS_FACEIT_QUEUE_ID || payload.game !== 'cs2') {
    throw new Error('FACEIT returned a mismatching queue or game.');
  }
  const stringValue = (value: unknown, max = 160) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
  const booleanValue = (value: unknown) => typeof value === 'boolean' ? value : null;
  const skillValue = (value: unknown) =>
    Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 && value <= 5000
      ? value : null;
  const entityId = stringValue(payload.entityId, 90);
  return {
    queueId: NEXUS_FACEIT_QUEUE_ID,
    clubId: NEXUS_FACEIT_CLUB_ID,
    queueUrl: NEXUS_FACEIT_QUEUE_URL,
    name: stringValue(payload.queueName),
    game: 'cs2',
    region: stringValue(payload.region, 32),
    state: stringValue(payload.state, 45),
    open: booleanValue(payload.open),
    paused: booleanValue(payload.paused),
    calculateElo: booleanValue(payload.calculateElo),
    entityId,
    entityType: stringValue(payload.entityType, 45),
    organizerId: stringValue(payload.organizerId, 90),
    minSkill: skillValue(payload.minSkill),
    maxSkill: skillValue(payload.maxSkill),
    lastModified: stringValue(payload.lastModified, 45),
    entityIdMatchesProvidedClub: entityId === NEXUS_FACEIT_CLUB_ID,
    matchHistoryAvailable: false,
    clubQueueOwnershipVerified: false,
  };
}

/** Matchroom provided by the Club organizer for diagnostics; provenance not yet confirmed. */
export const NEXUS_FACEIT_TEST_MATCH_ID = '1-1aaee7dd-bf23-44b6-b043-a96fc7586ce9';
export const NEXUS_FACEIT_TEST_MATCH_URL =
  'https://www.faceit.com/en/cs2/room/' + NEXUS_FACEIT_TEST_MATCH_ID;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MATCH_ID = new RegExp('^(?:1-)?' + UUID + '$', 'i');

/**
 * Parse a FACEIT matchroom URL or ID. Never accept arbitrary URLs:
 * the server must always call the fixed FACEIT Data API host.
 */
export function parseFaceitMatchId(value: string): string | null {
  const input = value.trim();
  if (MATCH_ID.test(input)) return input;
  if (input.length > 400) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:'
      || !['faceit.com', 'www.faceit.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] && /^[a-z]{2}$/i.test(parts[0])) parts.shift();
    if (parts.length < 3 || !['cs2', 'csgo'].includes(parts[0])
      || parts[1] !== 'room' || !MATCH_ID.test(parts[2])) return null;
    return parts[2];
  } catch {
    return null;
  }
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n < 100000 ? n : null;
}
function label(value: unknown, max = 100): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max) : null;
}

export type FaceitMatchPlayer = {
  playerId: string | null;
  nickname: string;
  metrics: FaceitMetrics;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
};
export type FaceitMatchMap = {
  mapName: string;
  teams: Array<{ teamName: string; players: FaceitMatchPlayer[] }>;
};
export type FaceitMatchInspection = {
  matchId: string;
  faceitUrl: string;
  game: 'cs2';
  status: string;
  competitionName: string | null;
  competitionId: string | null;
  competitionType: string | null;
  organizerId: string | null;
  finishedAt: number | null;
  teams: Array<{ faction: string; name: string; score: number | null }>;
  maps: FaceitMatchMap[];
  hasPlayerStats: boolean;
  /** FACEIT match competition_id exactly equals the selected queue UUID. */
  queueAssociationVerified: boolean;
  /** A queue/competition match does not independently authenticate Club ownership. */
  clubAssociationVerified: false;
};

export type FaceitMatchDetail = {
  match_id?: unknown;
  game?: unknown;
  status?: unknown;
  competition_id?: unknown;
  competition_name?: unknown;
  competition_type?: unknown;
  organizer_id?: unknown;
  finished_at?: unknown;
  teams?: Record<string, {
    name?: unknown;
    faction_id?: unknown;
  }>;
  results?: { score?: Record<string, unknown> };
};

export type FaceitMatchStats = {
  rounds?: Array<{
    round_stats?: Record<string, unknown>;
    teams?: Array<{
      team_id?: unknown;
      team_stats?: Record<string, unknown>;
      players?: Array<{
        player_id?: unknown;
        nickname?: unknown;
        player_stats?: Record<string, unknown>;
      }>;
    }>;
  }>;
};

/** Whitelist an intentionally small match summary; never echo raw FACEIT JSON. */
export function summarizeFaceitMatch(
  id: string, details: FaceitMatchDetail, stats: FaceitMatchStats | null,
): FaceitMatchInspection {
  if (details.game !== 'cs2') {
    throw new Error('This is not a FACEIT CS2 match.');
  }
  if (details.match_id !== id) {
    throw new Error('FACEIT returned a different match from the requested ID.');
  }
  const factions = Object.entries(details.teams ?? {}).slice(0, 2);
  const namedTeams = new Map(factions.map(([faction, team]) =>
    [faction, label(team?.name) || faction]));
  const teams = factions.map(([faction, team]) => ({
    faction,
    name: label(team?.name) || faction,
    score: positiveInt(details.results?.score?.[faction]),
  }));
  const maps: FaceitMatchMap[] = (Array.isArray(stats?.rounds) ? stats.rounds : [])
    .slice(0, 5)
    .map((round, roundIndex) => ({
      mapName: label(round.round_stats?.['Map']) || 'Map ' + (roundIndex + 1),
      teams: (Array.isArray(round.teams) ? round.teams : []).slice(0, 2).map((team, index) => {
        const idValue = label(team.team_id);
        const teamName = (idValue && namedTeams.get(idValue))
          || label(team.team_stats?.['Team']) || teams[index]?.name || 'Team ' + (index + 1);
        return {
          teamName,
          players: (Array.isArray(team.players) ? team.players : [])
            .slice(0, 10)
            .map(player => ({
              playerId: label(player.player_id),
              nickname: label(player.nickname, 60) || 'Unknown player',
              metrics: parseFaceitMetrics(player.player_stats),
              kills: positiveInt(player.player_stats?.['Kills']),
              deaths: positiveInt(player.player_stats?.['Deaths']),
              assists: positiveInt(player.player_stats?.['Assists']),
            })),
        };
      }),
    }));

  return {
    matchId: id,
    faceitUrl: 'https://www.faceit.com/en/cs2/room/' + id,
    game: 'cs2',
    status: label(details.status, 40) || 'UNKNOWN',
    competitionName: label(details.competition_name),
    competitionId: label(details.competition_id),
    competitionType: label(details.competition_type, 45),
    organizerId: label(details.organizer_id),
    finishedAt: (() => {
      const value = typeof details.finished_at === 'number'
        || typeof details.finished_at === 'string' ? Number(details.finished_at) : NaN;
      return Number.isSafeInteger(value) && value > 0 && value < 10000000000 ? value : null;
    })(),
    teams,
    maps,
    hasPlayerStats: maps.some(map => map.teams.some(team => team.players.length > 0)),
    // FACEIT itself associates this match with the selected queue competition
    // iff both identifiers and competition type match. This is stronger than
    // a pasted URL but still not proof of human Club administrator identity.
    queueAssociationVerified:
      details.competition_id === NEXUS_FACEIT_QUEUE_ID && details.competition_type === 'hub',
    clubAssociationVerified: false,
  };
}
