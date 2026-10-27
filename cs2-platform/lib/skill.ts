import type { FaceitMetrics, MetricName } from './faceit-metrics';

/**
 * NEXUS provisional seeding v4: exact FACEIT Elo + the four signals the
 * tournament operator selected (ADR, KAST, opening-duel win %, K/D).
 * These uncalibrated thresholds are bounded and explainable, not a claim
 * of independently validated competitive skill.
 */
export type SkillReviewFlag =
  | 'historical_elo_drop'
  | 'recent_performance_mismatch'
  | 'lifetime_performance_mismatch'
  | 'limited_faceit_history'
  | 'damage_elo_mismatch'
  | 'kast_elo_mismatch'
  | 'opening_elo_mismatch';

export type SkillContext = {
  historicalPeakElo?: number | null;
  lifetimeMatches?: number | null;
  lifetimeKd?: number | null;
  recentMetrics?: Partial<FaceitMetrics> | null;
  lifetimeMetrics?: Partial<FaceitMetrics> | null;
  recentMetricSamples?: Partial<Record<MetricName, number>> | null;
};

export type SkillArea = 'adr' | 'kast' | 'opening' | 'kd';
export type SkillBonuses = Record<SkillArea, number>;

export const SKILL_BONUS_CAPS: SkillBonuses = {
  adr: 2.5,
  kast: 2,
  opening: 1.5,
  kd: 1.5,
};
const ZERO: SkillBonuses = { adr: 0, kast: 0, opening: 0, kd: 0 };
const round = (value: number) => Math.round(value * 100) / 100;

function points(value: unknown, low: number, high: number, cap: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= low) return 0;
  return Math.max(0, Math.min(cap, (value - low) / (high - low) * cap));
}

function bonuses(
  metrics: Partial<FaceitMetrics>,
  samples: SkillContext['recentMetricSamples'] = null,
): SkillBonuses {
  const get = (key: MetricName) => {
    if (samples && (samples[key] ?? 0) < 10) return null;
    return metrics[key] ?? null;
  };
  return {
    adr: points(get('adr'), 75, 110, SKILL_BONUS_CAPS.adr),
    kast: points(get('kastPercent'), 68, 83, SKILL_BONUS_CAPS.kast),
    opening: points(get('openingDuelWinPercent'), 48, 68, SKILL_BONUS_CAPS.opening),
    kd: points(get('kd'), 1.0, 1.55, SKILL_BONUS_CAPS.kd),
  };
}

function total(values: SkillBonuses) {
  return values.adr + values.kast + values.opening + values.kd;
}

export function tierFromScore(score: number): number {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Invalid NEXUS score');
  return score < 25 ? 1 : score < 40 ? 2 : score < 59 ? 3 : score < 78 ? 4 : 5;
}

export function provisionalSkill(
  elo: number,
  recentKd: number | null,
  matches: number,
  context: SkillContext = {},
) {
  if (!Number.isFinite(elo) || elo < 0 || elo > 10000) throw new Error('Invalid Elo');
  if (!Number.isInteger(matches) || matches < 0 || matches > 100) throw new Error('Invalid match sample');

  const history = context.historicalPeakElo;
  const historicalPeakElo = history != null && Number.isFinite(history) && history >= 0 && history <= 10000
    ? history : null;

  const rawLifetimeMatches = context.lifetimeMatches;
  const lifetimeMatches = rawLifetimeMatches != null && Number.isSafeInteger(rawLifetimeMatches)
    && rawLifetimeMatches >= 0 ? rawLifetimeMatches : null;

  const rawLifetimeKd = context.lifetimeKd;
  const lifetimeKd = rawLifetimeKd != null && Number.isFinite(rawLifetimeKd)
    && rawLifetimeKd >= 0 && rawLifetimeKd <= 15 ? rawLifetimeKd : null;

  // NEXUS historical protection uses only Elo previously observed from this
  // SAME verified SteamID64, never a fabricated all-time FACEIT peak.
  const protectedElo = Math.max(elo, (historicalPeakElo ?? elo) - 150);
  const base = 100 / (1 + Math.exp(-(protectedElo - 1850) / 650));

  const recent: Partial<FaceitMetrics> = {
    ...(context.recentMetrics || {}),
    kd: recentKd != null ? recentKd : context.recentMetrics?.kd ?? null,
  };
  const lifetime: Partial<FaceitMetrics> = {
    ...(context.lifetimeMetrics || {}),
    kd: lifetimeKd ?? context.lifetimeMetrics?.kd ?? null,
  };

  // A short losing streak cannot erase previously verified good performance.
  // We do not add recent and lifetime evidence together (double counting).
  const recentBonuses = matches >= 10 ? bonuses(recent, context.recentMetricSamples) : { ...ZERO };
  const lifetimeBonuses = lifetimeMatches != null && lifetimeMatches >= 60
    ? bonuses(lifetime) : { ...ZERO };
  const useLifetime = total(lifetimeBonuses) > total(recentBonuses);
  const best = useLifetime ? lifetimeBonuses : recentBonuses;
  const performanceBonus = round(Math.min(7.5, total(best)));
  const score = Math.max(0, Math.min(100, round(base + performanceBonus)));
  const performanceSource = performanceBonus === 0
    ? 'elo-only' as const : useLifetime ? 'lifetime' as const : 'recent' as const;

  const hasRecent = (key: MetricName, sample = 15) =>
    (context.recentMetricSamples?.[key] ?? matches) >= sample;
  const recentCast = (key: MetricName) => recent[key];

  const reviewFlags: SkillReviewFlag[] = [];
  if (historicalPeakElo !== null && historicalPeakElo - elo >= 250)
    reviewFlags.push('historical_elo_drop');
  if (recentKd !== null && hasRecent('kd') && recentKd >= 1.5 && elo < 1750)
    reviewFlags.push('recent_performance_mismatch');
  if (lifetimeKd !== null && lifetimeMatches !== null
    && lifetimeMatches >= 80 && lifetimeKd >= 1.45 && elo < 1750)
    reviewFlags.push('lifetime_performance_mismatch');
  if (lifetimeMatches !== null && lifetimeMatches < 30)
    reviewFlags.push('limited_faceit_history');
  if (hasRecent('adr') && (recentCast('adr') ?? -1) >= 96 && elo < 1750)
    reviewFlags.push('damage_elo_mismatch');
  if (hasRecent('kastPercent') && (recentCast('kastPercent') ?? -1) >= 79 && elo < 1750)
    reviewFlags.push('kast_elo_mismatch');
  if (hasRecent('openingDuelWinPercent')
    && (recentCast('openingDuelWinPercent') ?? -1) >= 65 && elo < 1750)
    reviewFlags.push('opening_elo_mismatch');

  const availableRecent = (Object.keys(SKILL_BONUS_CAPS) as SkillArea[])
    .filter(area => hasRecent((area === 'kast' ? 'kastPercent'
      : area === 'opening' ? 'openingDuelWinPercent' : area)))
    .length;
  // Count meaningful samples, not just a returned HTTP 200. A single K/D
  // reading is insufficient evidence that advanced metrics exist.
  const confidence = matches >= 20 && availableRecent >= 3 ? 'recent-data' as const
    : matches >= 10 && availableRecent >= 1 ? 'limited' as const : 'elo-only' as const;

  return {
    score,
    tier: tierFromScore(score),
    confidence,
    model: 'core-four-v4' as const,
    elo,
    protectedElo: Math.round(protectedElo),
    historicalPeakElo,
    recentKd,
    matches,
    lifetimeMatches,
    lifetimeKd,
    performanceBonus,
    performanceAreas: {
      adr: round(best.adr),
      kast: round(best.kast),
      opening: round(best.opening),
      kd: round(best.kd),
    },
    performanceSource,
    reviewFlags,
    reviewRequired: reviewFlags.length > 0,
  };
}
