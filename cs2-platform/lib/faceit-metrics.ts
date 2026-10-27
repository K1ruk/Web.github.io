/**
 * Strict, dependency-free adapters for the public FACEIT Data API.
 * FACEIT's CS2 metrics are partially populated, and extended-stat fields
 * can differ from the simple match summaries. Missing != zero.
 *
 * Rates are normalized to fractions (0..1); percentages are 0..100.
 */
export type FaceitMetrics = {
  kd: number | null;
  killsPerRound: number | null;
  adr: number | null;
  assistsPerMatch: number | null;
  headshotPercent: number | null;
  winRatePercent: number | null;
  entryRate: number | null;
  entrySuccessRate: number | null;
  utilityDamagePerRound: number | null;
  enemiesFlashedPerRound: number | null;
  clutch1v1Rate: number | null;
  clutch1v2Rate: number | null;
  sniperKillRate: number | null;
  mvpPerMatch: number | null;
};

export type MetricName = keyof FaceitMetrics;
type MetricSpec = {
  aliases: readonly string[];
  max: number;
  fraction?: boolean;
  percent?: boolean;
};

const SPECS: Record<MetricName, MetricSpec> = {
  kd: { aliases: ['K/D Ratio', 'Average K/D Ratio'], max: 15 },
  killsPerRound: { aliases: ['K/R Ratio', 'Average K/R Ratio'], max: 3 },
  adr: { aliases: ['ADR', 'Average Damage per Round'], max: 300 },
  assistsPerMatch: { aliases: ['Assists', 'Average Assists'], max: 40 },
  headshotPercent: { aliases: ['Headshots %', 'Average Headshots %', 'Headshot Percentage'], max: 100, percent: true },
  winRatePercent: { aliases: ['Win Rate %', 'Win Rate'], max: 100, percent: true },
  entryRate: { aliases: ['Entry Rate'], max: 1, fraction: true },
  entrySuccessRate: { aliases: ['Entry Success Rate'], max: 1, fraction: true },
  utilityDamagePerRound: { aliases: ['Utility Damage per Round'], max: 100 },
  enemiesFlashedPerRound: { aliases: ['Enemies Flashed per Round'], max: 5 },
  clutch1v1Rate: { aliases: ['1v1 Win Rate'], max: 1, fraction: true },
  clutch1v2Rate: { aliases: ['1v2 Win Rate'], max: 1, fraction: true },
  sniperKillRate: { aliases: ['Sniper Kill Rate'], max: 1, fraction: true },
  mvpPerMatch: { aliases: ['MVPs', 'Average MVPs'], max: 15 },
};

/** Only parse known bounded numeric fields. No guessed defaults. */
function validNumber(raw: unknown, spec: MetricSpec): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && (!raw.trim() || !/^[+-]?\d+(?:\.\d+)?\s*%?$/.test(raw.trim()))) return null;
  const string = String(raw).trim();
  const n = Number(string.replace('%', '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  const normalized = spec.fraction && string.includes('%') ? n / 100 : n;
  // Do not interpret 1.7 as a 170% success rate: that is a malformed
  // rate, not a value to silently convert to 1.7%.
  if (spec.fraction && n > 1 && !string.includes('%')) return null;
  if (normalized > spec.max) return null;
  return normalized;
}

export function emptyMetrics(): FaceitMetrics {
  return {
    kd: null, killsPerRound: null, adr: null, assistsPerMatch: null,
    headshotPercent: null, winRatePercent: null, entryRate: null,
    entrySuccessRate: null, utilityDamagePerRound: null,
    enemiesFlashedPerRound: null, clutch1v1Rate: null,
    clutch1v2Rate: null, sniperKillRate: null, mvpPerMatch: null,
  };
}

const KEYS = Object.keys(SPECS) as MetricName[];

export function parseFaceitMetrics(fields: Record<string, unknown> | null | undefined): FaceitMetrics {
  const parsed = emptyMetrics();
  if (!fields || typeof fields !== 'object') return parsed;
  for (const key of KEYS) {
    const spec = SPECS[key];
    for (const alias of spec.aliases) {
      if (!Object.prototype.hasOwnProperty.call(fields, alias)) continue;
      const value = validNumber(fields[alias], spec);
      if (value !== null) {
        parsed[key] = value;
        break;
      }
    }
  }
  return parsed;
}

export function recentFaceitMetrics(items: ReadonlyArray<{ stats?: Record<string, unknown> }> = []) {
  const rows = items.slice(0, 30);
  const totals = emptyMetrics();
  const counts = Object.fromEntries(KEYS.map(key => [key, 0])) as Record<MetricName, number>;
  for (const row of rows) {
    const metrics = parseFaceitMetrics(row?.stats);
    for (const key of KEYS) {
      if (metrics[key] === null) continue;
      totals[key] = (totals[key] ?? 0) + metrics[key]!;
      counts[key]++;
    }
  }

  const average = emptyMetrics();
  for (const key of KEYS) {
    if (counts[key] > 0) average[key] = Math.round((totals[key]! / counts[key]) * 10000) / 10000;
  }
  return { metrics: average, counts, matches: Math.max(0, ...Object.values(counts)) };
}

/** Lifetime response is an aggregate, NOT a sample of recent games. */
export function lifetimeFaceitMetrics(lifetime: Record<string, unknown> | null | undefined) {
  const metrics = parseFaceitMetrics(lifetime);
  const raw = lifetime?.['Matches'] ?? lifetime?.['Total Matches'];
  const matches = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Number.NaN;
  return {
    metrics,
    matches: Number.isSafeInteger(matches) && matches >= 0 ? matches : null,
  };
}
