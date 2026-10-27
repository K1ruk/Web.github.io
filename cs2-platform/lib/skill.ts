import type { FaceitMetrics, MetricName } from './faceit-metrics';

/**
 * Provisional and deliberately conservative CS2 seeding model.
 * There is no calibrated claim here that our heuristics reflect objective
 * individual skill. Elo remains the dominant tournament balancing signal.
 */
export type SkillReviewFlag =
  | 'historical_elo_drop'
  | 'recent_performance_mismatch'
  | 'lifetime_performance_mismatch'
  | 'limited_faceit_history'
  | 'damage_elo_mismatch'
  | 'utility_elo_mismatch';

export type SkillContext = {
  historicalPeakElo?: number | null;
  lifetimeMatches?: number | null;
  lifetimeKd?: number | null;
  recentMetrics?: Partial<FaceitMetrics> | null;
  lifetimeMetrics?: Partial<FaceitMetrics> | null;
  /** Per-field number of recent matches exposing this stat. */
  recentMetricSamples?: Partial<Record<MetricName, number>> | null;
};

export type SkillArea = 'impact' | 'teamplay' | 'opening' | 'clutch';
type Group = Record<SkillArea, number>;
const ZERO: Group = { impact: 0, teamplay: 0, opening: 0, clutch: 0 };

function points(value: number | null | undefined, baseline: number, high: number, max: number) {
  if (value == null || !Number.isFinite(value) || value < baseline) return 0;
  return Math.max(0, Math.min(max, (value - baseline) / (high - baseline) * max));
}

/**
 * Group similar correlated metrics. Only positive, bounded evidence can add
 * points: an individual having poor stats NEVER loses points below Elo base.
 * We deliberately do NOT score HS%, sniper usage, raw win rate or MVPs:
 * those can strongly reflect role, weapons, teammates or opponent strength.
 */
function areaBonuses(metrics: Partial<FaceitMetrics>, recentSamples?: SkillContext['recentMetricSamples']) {
  const get = (key: MetricName): number | null => {
    if (recentSamples && (recentSamples[key] ?? 0) < 10) return null;
    const value = metrics[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const contributions: Group = {
    impact: Math.min(3,
      points(get('adr'), 78, 105, 2.25)
      + points(get('killsPerRound'), 0.68, 1.0, 1.3)
      + points(get('kd'), 1.0, 1.55, 0.8)),
    teamplay: Math.min(2.4,
      points(get('assistsPerMatch'), 4.5, 8, 1.1)
      + points(get('utilityDamagePerRound'), 4, 12, 1.0)
      + points(get('enemiesFlashedPerRound'), 0.25, 0.6, 1.2)),
    opening: Math.min(1.2,
      points(get('entrySuccessRate'), 0.5, 0.75, 1.1)
      + points(get('entryRate'), 0.11, 0.25, 0.4)),
    clutch: Math.min(0.9,
      points(get('clutch1v1Rate'), 0.42, 0.68, 0.7)
      + points(get('clutch1v2Rate'), 0.2, 0.43, 0.35)),
  };
  return contributions;
}

function round(value: number) { return Math.round(value * 100) / 100; }
function total(areas: Group) {
  return Math.min(7.5, areas.impact + areas.teamplay + areas.opening + areas.clutch);
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
    && rawLifetimeKd >= 0 && rawLifetimeKd < 15 ? rawLifetimeKd : null;

  // Use only Elo observations NEXUS genuinely made for this SteamID.
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

  const recentAreas = matches >= 10
    ? areaBonuses(recent, context.recentMetricSamples) : { ...ZERO };
  const lifetimeAreas = lifetimeMatches != null && lifetimeMatches >= 60
    ? areaBonuses(lifetime) : { ...ZERO };

  // Do not add the same stat twice across recent and lifetime samples.
  // A temporary bad streak does not erase previously observed positive
  // lifetime evidence, while new high performance can still be considered.
  const useLifetime = total(lifetimeAreas) > total(recentAreas);
  const performanceAreas = useLifetime ? lifetimeAreas : recentAreas;
  const performanceSource = total(performanceAreas) === 0
    ? 'elo-only' as const : useLifetime ? 'lifetime' as const : 'recent' as const;
  const performanceBonus = round(total(performanceAreas));
  const score = Math.max(0, Math.min(100, round(base + performanceBonus)));

  const reviewFlags: SkillReviewFlag[] = [];
  if (historicalPeakElo !== null && historicalPeakElo - elo >= 250)
    reviewFlags.push('historical_elo_drop');
  if (recentKd !== null && matches >= 15 && recentKd >= 1.5 && elo < 1750)
    reviewFlags.push('recent_performance_mismatch');
  if (lifetimeKd !== null && lifetimeMatches !== null
    && lifetimeMatches >= 80 && lifetimeKd >= 1.45 && elo < 1750)
    reviewFlags.push('lifetime_performance_mismatch');
  if (lifetimeMatches !== null && lifetimeMatches < 30)
    reviewFlags.push('limited_faceit_history');

  const recentAdr = recent.adr;
  if (recentAdr !== null && recentAdr !== undefined
    && (context.recentMetricSamples?.adr ?? matches) >= 15
    && recentAdr >= 96 && elo < 1750)
    reviewFlags.push('damage_elo_mismatch');

  const lifetimeFlashes = lifetime.enemiesFlashedPerRound;
  const lifetimeUtility = lifetime.utilityDamagePerRound;
  if (lifetimeMatches !== null && lifetimeMatches >= 80 && elo < 1750
    && ((lifetimeFlashes != null && lifetimeFlashes >= 0.65)
      || (lifetimeUtility != null && lifetimeUtility >= 12)))
    reviewFlags.push('utility_elo_mismatch');

  return {
    score,
    tier: tierFromScore(score),
    confidence: matches >= 20 ? 'recent-data' as const
      : matches >= 10 ? 'limited' as const : 'elo-only' as const,
    model: 'multi-signal-v3' as const,
    elo,
    protectedElo: Math.round(protectedElo),
    historicalPeakElo,
    recentKd,
    matches,
    lifetimeMatches,
    lifetimeKd,
    performanceBonus,
    performanceAreas: {
      impact: round(performanceAreas.impact),
      teamplay: round(performanceAreas.teamplay),
      opening: round(performanceAreas.opening),
      clutch: round(performanceAreas.clutch),
    },
    performanceSource,
    reviewFlags,
    reviewRequired: reviewFlags.length > 0,
  };
}
