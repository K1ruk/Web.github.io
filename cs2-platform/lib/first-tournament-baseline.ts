import { summarizeNexusArchivePlayer } from './nexus-rating.ts';

/**
 * This is pre-tournament contextual evidence, not an automated Tier decision.
 * Only server-verified FACEIT player IDs may be used to fetch these rows.
 */
export type BaselineMapStat = {
  match_id: string;
  map_index: number;
  adr: number | string | null;
  kd: number | string | null;
  nexus_match_rating: number | string | null;
  raw_stats: unknown;
};

function safeNumber(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' || typeof value === 'string'
    ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= max ? numeric : null;
}
function whole(value: unknown, max: number): number | null {
  const n = safeNumber(value, max);
  return n !== null && Number.isSafeInteger(n) ? n : null;
}
function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length * 100) / 100;
}

export function summarizeFirstTournamentBaseline(rows: BaselineMapStat[]) {
  // Re-fetches, duplicates, multi-map games and zero-entry maps must not
  // inflate the sample size or invent a success percentage.
  const unique = new Set<string>();
  const maps = rows.filter(row => {
    if (!row.match_id || !Number.isSafeInteger(row.map_index) || row.map_index < 0)
      return false;
    const key = row.match_id + ':' + row.map_index;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });
  let entryAttempts = 0;
  let entryWins = 0;
  let entrySampleMaps = 0;
  for (const row of maps) {
    const stats = row.raw_stats && typeof row.raw_stats === 'object'
      && !Array.isArray(row.raw_stats)
      ? row.raw_stats as Record<string, unknown> : {};
    const attempts = whole(stats['Entry Count'], 200);
    const wins = whole(stats['Entry Wins'], 200);
    if (attempts === null || wins === null || wins > attempts) continue;
    entryAttempts += attempts;
    entryWins += wins;
    entrySampleMaps++;
  }

  const rating = summarizeNexusArchivePlayer(maps.map(row => ({
    matchId: row.match_id,
    mapIndex: row.map_index,
    rating: safeNumber(row.nexus_match_rating, 1.5),
  })));
  return {
    uniqueMatches: new Set(maps.map(map => map.match_id)).size,
    maps: maps.length,
    ratedMaps: rating.ratedMaps,
    nexusMatchRating: rating.rating,
    ratingConfidence: rating.confidence,
    adr: average(maps.map(row => safeNumber(row.adr, 300))),
    kd: average(maps.map(row => safeNumber(row.kd, 15))),
    entryWinPercent: entryAttempts > 0
      ? Math.round(entryWins / entryAttempts * 10000) / 100 : null,
    entryWins,
    entryAttempts,
    entrySampleMaps,
    kastPercent: null as null,
    demoVerified: false as const,
    source: 'nexus-june-2026-club-archive' as const,
    note: 'Only available Club map totals are used. KAST requires verified round events. This baseline does not establish cross-lobby skill or assign a tier.',
  };
}
