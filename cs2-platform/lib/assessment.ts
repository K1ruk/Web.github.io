import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import { analyzeSteam } from '@/lib/faceit';

export class AssessmentError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = 'AssessmentError';
  }
}

/**
 * Get a player's previously observed Elo for the SAME verified SteamID64.
 * This is NEXUS history (last 180 days), not an invented FACEIT all-time peak.
 */
export async function historicalFaceitPeak(userId: string, steamId: string) {
  const db = adminDb();
  const { data: registrations, error: registrationError } = await db.from('registrations')
    .select('id').eq('user_id', userId).limit(1001);
  if (registrationError || !registrations || registrations.length > 1000) {
    throw new AssessmentError('Unable to verify historical player registrations', 503);
  }
  if (!registrations.length) return null;

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const { data: observations, error } = await db.from('skill_assessments')
    .select('faceit_elo,evidence')
    .in('registration_id', registrations.map(registration => registration.id))
    .eq('source', 'faceit')
    .gte('assessed_at', since)
    .order('assessed_at', { ascending: false })
    .limit(501);
  if (error || !observations || observations.length > 500) {
    throw new AssessmentError('Unable to verify recent FACEIT rating history', 503);
  }

  let peak: number | null = null;
  for (const observation of observations) {
    const evidence = observation.evidence;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) continue;
    if ((evidence as Record<string, unknown>).steamId !== steamId) continue;
    const elo = observation.faceit_elo;
    if (typeof elo !== 'number' || !Number.isFinite(elo) || elo < 0 || elo > 10000) continue;
    peak = Math.max(peak ?? elo, elo);
  }
  return peak;
}

/**
 * Collect an assessment for an actual paid tournament entry.
 * This NEVER approves a tier or exposes any FACEIT secret to the browser.
 */
export async function assessPaidRegistration(registrationId: string, actorId: string) {
  const db = adminDb();
  const { data: registration, error: registrationError } = await db.from('registrations')
    .select('id,user_id,status,tournament_id').eq('id', registrationId).maybeSingle();
  if (registrationError) throw new AssessmentError('Could not verify tournament registration', 503);
  if (!registration || registration.status !== 'paid') {
    throw new AssessmentError('Only paid tournament registrations can be analyzed');
  }
  const { data: tournament, error: tournamentError } = await db.from('tournaments')
    .select('status').eq('id', registration.tournament_id).maybeSingle();
  if (tournamentError || !tournament) throw new AssessmentError('Tournament status unavailable', 503);
  if (!['draft', 'open', 'locked'].includes(tournament.status)) {
    throw new AssessmentError('Skill assessments are closed after team publication');
  }

  const { data: link, error: linkError } = await db.from('steam_links')
    .select('steam_id').eq('user_id', registration.user_id).maybeSingle();
  if (linkError) throw new AssessmentError('Steam verification could not be loaded', 503);
  if (!link) throw new AssessmentError('Verified Steam account is required');

  const peak = await historicalFaceitPeak(registration.user_id, link.steam_id);
  const result = await analyzeSteam(link.steam_id, { historicalPeakElo: peak });

  // Store snapshots with SteamID provenance. We must not compare a different
  // Steam account's old rating if a player later changes their verified link.
  const evidence = result.found
    ? {
      found: true,
      steamId: link.steam_id,
      faceitPlayerId: result.playerId,
      model: result.model,
      confidence: result.confidence,
      faceitLevel: result.faceitLevel,
      recentKd: result.recentKd,
      lifetimeKd: result.lifetimeKd,
      lifetimeMatches: result.lifetimeMatches,
      protectedElo: result.protectedElo,
      historicalPeakElo: result.historicalPeakElo,
      performanceBonus: result.performanceBonus,
      reviewFlags: result.reviewFlags,
      reviewRequired: result.reviewRequired,
      statsAvailable: result.statsAvailable,
    }
    : {
      found: false,
      steamId: link.steam_id,
      reason: result.reason,
    };

  const { error: saveError } = await db.from('skill_assessments').insert({
    registration_id: registration.id,
    source: 'faceit',
    faceit_elo: result.found ? result.elo : null,
    matches_sampled: result.found ? result.matches : null,
    suggested_tier: result.found ? result.tier : null,
    proposed_score: result.found ? result.score : null,
    evidence,
    assessed_by: actorId,
  });
  if (saveError) throw new AssessmentError('FACEIT analysis completed but could not be saved. Please retry.', 503);

  return { ...result, saved: true, approved: false };
}
