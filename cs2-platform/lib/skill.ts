/**
 * NEXUS provisional CS2 seeding model (v2).
 *
 * Elo is the strongest available FACEIT signal. A player cannot obtain a lower
 * suggested rating simply by performing badly in their last few matches.
 *
 * Evidence of intentional throwing cannot be inferred from statistics alone.
 * Review flags represent uncertainty or unusual differences, NOT cheating.
 * Actual tiers are approved by a tournament administrator.
 */
export type SkillReviewFlag =
  | 'historical_elo_drop'
  | 'recent_performance_mismatch'
  | 'lifetime_performance_mismatch'
  | 'limited_faceit_history';

export type SkillContext = {
  /** Highest verified observation from NEXUS in the last 180 days. */
  historicalPeakElo?: number | null;
  /** FACEIT aggregate lifetime matches (if supplied by the API). */
  lifetimeMatches?: number | null;
  /** FACEIT aggregate lifetime K/D (if supplied by the API). */
  lifetimeKd?: number | null;
};

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

  const previousPeak = context.historicalPeakElo;
  const historicalPeakElo = previousPeak != null
    && Number.isFinite(previousPeak) && previousPeak >= 0 && previousPeak <= 10000
    ? previousPeak : null;
  const lifetimeMatches = context.lifetimeMatches != null
    && Number.isSafeInteger(context.lifetimeMatches) && context.lifetimeMatches >= 0
    ? context.lifetimeMatches : null;
  const lifetimeKd = context.lifetimeKd != null
    && Number.isFinite(context.lifetimeKd) && context.lifetimeKd >= 0 && context.lifetimeKd < 15
    ? context.lifetimeKd : null;

  // A player's observed Elo cannot instantly fall below a previously verified
  // rating minus a modest 150 Elo allowance. This guard only applies when
  // NEXUS actually holds historical evidence; it never fabricates a peak.
  const protectedElo = Math.max(elo, (historicalPeakElo ?? elo) - 150);
  const base = 100 / (1 + Math.exp(-(protectedElo - 1850) / 650));

  // Good recent performance may raise the recommendation slightly.
  // Poor recent K/D *never* lowers it. A deliberate cold streak is not rewarded.
  const performanceBonus = recentKd !== null && Number.isFinite(recentKd) && matches >= 10
    ? Math.max(0, Math.min(4, (recentKd - 1) * 12))
    : 0;

  const score = Math.max(0, Math.min(100, Math.round((base + performanceBonus) * 100) / 100));
  const reviewFlags: SkillReviewFlag[] = [];

  if (historicalPeakElo !== null && historicalPeakElo - elo >= 250) {
    reviewFlags.push('historical_elo_drop');
  }
  if (recentKd !== null && matches >= 15 && recentKd >= 1.5 && elo < 1750) {
    reviewFlags.push('recent_performance_mismatch');
  }
  if (lifetimeKd !== null && lifetimeMatches !== null
    && lifetimeMatches >= 80 && lifetimeKd >= 1.45 && elo < 1750) {
    reviewFlags.push('lifetime_performance_mismatch');
  }
  if (lifetimeMatches !== null && lifetimeMatches < 30) {
    reviewFlags.push('limited_faceit_history');
  }

  return {
    score,
    tier: tierFromScore(score),
    confidence: matches >= 20 ? 'recent-data' as const
      : matches >= 10 ? 'limited' as const : 'elo-only' as const,
    model: 'protected-v2' as const,
    elo,
    protectedElo: Math.round(protectedElo),
    historicalPeakElo,
    recentKd,
    matches,
    lifetimeMatches,
    lifetimeKd,
    performanceBonus: Math.round(performanceBonus * 100) / 100,
    reviewFlags,
    reviewRequired: reviewFlags.length > 0,
  };
}
