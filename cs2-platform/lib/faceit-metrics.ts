/**
 * The four FACEIT signals chosen for NEXUS: ADR, KAST, opening-duel win %
 * and K/D. FACEIT's public Data API does not guarantee all four fields.
 * Do not infer a missing KAST from K/D or assists.
 *
 * Percentages in this adapter are consistently 0..100 (not fractions).
 * Missing / invalid stats stay null; a lack of data is not a zero.
 */
export type FaceitMetrics = {
  adr: number | null;
  kastPercent: number | null;
  openingDuelWinPercent: number | null;
  kd: number | null;
};

export type MetricName = keyof FaceitMetrics;
type StatSpec = { aliases: string[]; max: number; percentage?: boolean };

const SPECS: Record<MetricName, StatSpec> = {
  adr: {
    aliases: ['ADR', 'Average ADR', 'Average Damage per Round', 'Damage Per Round'],
    max: 300,
  },
  kastPercent: {
    aliases: ['KAST', 'KAST %', 'KAST Percentage', 'Average KAST', 'Average KAST %', 'KAST Rate'],
    max: 100, percentage: true,
  },
  openingDuelWinPercent: {
    aliases: [
      'Opening Duel Win %', 'Opening Duel Win Rate', 'Opening Duels Won %',
      'Opening Duels Win %', 'Opening Duel Success Rate', 'Opening Duel Success %',
      'Entry Success Rate', 'Entry Win %',
    ],
    max: 100, percentage: true,
  },
  kd: {
    aliases: ['K/D Ratio', 'Average K/D Ratio'],
    max: 15,
  },
};
const KEYS = Object.keys(SPECS) as MetricName[];

function keyOf(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readField(fields: Record<string, unknown>, aliases: string[]): unknown {
  const keys = new Map(Object.keys(fields).map(key => [keyOf(key), key]));
  for (const alias of aliases) {
    const field = keys.get(keyOf(alias));
    if (field !== undefined) return fields[field];
  }
  return undefined;
}

function numeric(value: unknown, upper: number, percent = false): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?%?$/.test(raw)) return null;
  const n = Number(raw.replace('%', ''));
  if (!Number.isFinite(n)) return null;
  const converted = percent && !raw.endsWith('%') && n > 0 && n < 1 ? n * 100 : n;
  if (converted < 0 || converted > upper) return null;
  return Math.round(converted * 10000) / 10000;
}

function duelCounts(fields: Record<string, unknown>): { won: number; lost: number } | null {
  // These are first-encounter kills/deaths, not general kills/deaths.
  const won = readField(fields, ['Opening Duels Won', 'Opening Duels Wins', 'Opening Kills', 'First Kills']);
  const lost = readField(fields, ['Opening Duels Lost', 'Opening Duels Losses', 'Opening Deaths', 'First Deaths']);
  const w = numeric(won, 100000), l = numeric(lost, 100000);
  if (w == null || l == null || !Number.isSafeInteger(w) || !Number.isSafeInteger(l)) return null;
  return { won: w, lost: l };
}

export function emptyMetrics(): FaceitMetrics {
  return { adr: null, kastPercent: null, openingDuelWinPercent: null, kd: null };
}

export function parseFaceitMetrics(fields: Record<string, unknown> | null | undefined): FaceitMetrics {
  const values = emptyMetrics();
  if (!fields || typeof fields !== 'object') return values;
  for (const metric of KEYS) {
    const spec = SPECS[metric];
    values[metric] = numeric(readField(fields, spec.aliases), spec.max, spec.percentage);
  }
  if (values.openingDuelWinPercent == null) {
    const duels = duelCounts(fields);
    const attempted = duels ? duels.won + duels.lost : 0;
    if (duels && attempted > 0)
      values.openingDuelWinPercent = Math.round(duels.won / attempted * 10000) / 100;
  }
  return values;
}

export function recentFaceitMetrics(items: ReadonlyArray<{ stats?: Record<string, unknown> }> = []) {
  const rows = items.slice(0, 30);
  const totals = emptyMetrics();
  const counts = Object.fromEntries(KEYS.map(key => [key, 0])) as Record<MetricName, number>;

  // If individual opening-duel counts exist, ratio-of-sums is more accurate
  // than taking a mean of each match's opening percentages.
  let duelWins = 0;
  let duelAttempts = 0;
  let duelMatches = 0;

  for (const row of rows) {
    const fields = row?.stats || {};
    const metrics = parseFaceitMetrics(fields);
    for (const key of KEYS) {
      if (metrics[key] == null) continue;
      totals[key] = (totals[key] ?? 0) + metrics[key]!;
      counts[key]++;
    }
    const duels = duelCounts(fields);
    if (duels && duels.won + duels.lost > 0) {
      duelWins += duels.won;
      duelAttempts += duels.won + duels.lost;
      duelMatches++;
    }
  }

  const average = emptyMetrics();
  for (const key of KEYS) {
    if (counts[key]) average[key] = Math.round((totals[key]! / counts[key]) * 10000) / 10000;
  }

  if (duelAttempts > 0 && duelMatches === counts.openingDuelWinPercent) {
    average.openingDuelWinPercent = Math.round(duelWins / duelAttempts * 10000) / 100;
  }

  return {
    metrics: average,
    counts,
    matches: Math.max(0, ...Object.values(counts)),
    openingDuels: duelAttempts || null,
  };
}

export function lifetimeFaceitMetrics(lifetime: Record<string, unknown> | null | undefined) {
  const metrics = parseFaceitMetrics(lifetime);
  const raw = lifetime ? readField(lifetime, ['Matches', 'Total Matches']) : undefined;
  const matches = numeric(raw, 10000000);
  return {
    metrics,
    matches: matches != null && Number.isSafeInteger(matches) ? matches : null,
  };
}
