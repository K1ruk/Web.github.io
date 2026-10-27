import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { jsonError, sameOrigin } from '@/lib/security';
import { FaceitRequestError } from '@/lib/faceit';
import { AssessmentError, assessPaidRegistration } from '@/lib/assessment';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed', 403);
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('Administrator required', 403);
  const parsed = z.object({ registrationId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Invalid registration ID');

  try {
    const result = await assessPaidRegistration(parsed.data.registrationId, user.id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AssessmentError) return jsonError(error.message, error.status);
    if (error instanceof FaceitRequestError) {
      return jsonError(error.message, error.code === 'rate_limited' ? 429 : 503);
    }
    return jsonError('FACEIT assessment temporarily unavailable', 503);
  }
}


/**
 * Read the latest stored FACEIT evidence without making another API request.
 * This prevents the admin review UI from exhausting NEXUS's shared API quota.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('Administrator required', 403);

  const parsed = z.string().uuid().safeParse(request.nextUrl.searchParams.get('registrationId'));
  if (!parsed.success) return jsonError('Invalid registration ID');

  const db = (await import('@/lib/supabase/admin')).adminDb();
  const { data: registration, error: registrationError } = await db.from('registrations')
    .select('user_id,status').eq('id', parsed.data).maybeSingle();
  if (registrationError || !registration || registration.status !== 'paid') {
    return jsonError('Registration unavailable', 404);
  }

  const [latestResult, linkedResult] = await Promise.all([
    db.from('skill_assessments')
      .select('faceit_elo,proposed_score,suggested_tier,matches_sampled,evidence,assessed_at')
      .eq('registration_id', parsed.data).eq('source', 'faceit')
      .order('assessed_at', { ascending: false })
      .limit(1).maybeSingle(),
    db.from('steam_links').select('steam_id')
      .eq('user_id', registration.user_id).maybeSingle(),
  ]);
  if (latestResult.error || linkedResult.error) return jsonError('Could not verify assessment provenance', 503);
  if (!latestResult.data) return jsonError('No saved FACEIT assessment for this entry', 404);
  const evidence = latestResult.data.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
    || (evidence as Record<string, unknown>).steamId !== linkedResult.data?.steam_id) {
    return jsonError('Saved assessment is for a different Steam verification; scan again', 409);
  }

  const meta = evidence as Record<string, unknown>;
  const sample = latestResult.data;
  const found = sample.faceit_elo !== null && sample.suggested_tier !== null
    && sample.proposed_score !== null;

  return NextResponse.json({
    found,
    saved: true,
    cached: true,
    approved: false,
    assessedAt: sample.assessed_at,
    elo: found ? sample.faceit_elo : null,
    score: found ? Number(sample.proposed_score) : null,
    tier: found ? sample.suggested_tier : null,
    protectedElo: typeof meta.protectedElo === 'number' ? meta.protectedElo : sample.faceit_elo,
    historicalPeakElo: typeof meta.historicalPeakElo === 'number' ? meta.historicalPeakElo : null,
    recentKd: typeof meta.recentKd === 'number' ? meta.recentKd : null,
    recentMetrics: meta.recentMetrics && typeof meta.recentMetrics === 'object' && !Array.isArray(meta.recentMetrics) ? meta.recentMetrics : null,
    recentMetricSamples: meta.recentMetricSamples && typeof meta.recentMetricSamples === 'object' && !Array.isArray(meta.recentMetricSamples) ? meta.recentMetricSamples : null,
    lifetimeMetrics: meta.lifetimeMetrics && typeof meta.lifetimeMetrics === 'object' && !Array.isArray(meta.lifetimeMetrics) ? meta.lifetimeMetrics : null,
    performanceAreas: meta.performanceAreas && typeof meta.performanceAreas === 'object' && !Array.isArray(meta.performanceAreas) ? meta.performanceAreas : null,
    performanceSource: typeof meta.performanceSource === 'string' ? meta.performanceSource : 'unknown',
    lifetimeKd: typeof meta.lifetimeKd === 'number' ? meta.lifetimeKd : null,
    lifetimeMatches: typeof meta.lifetimeMatches === 'number' ? meta.lifetimeMatches : null,
    faceitLevel: typeof meta.faceitLevel === 'number' ? meta.faceitLevel : null,
    matches: sample.matches_sampled,
    model: typeof meta.model === 'string' ? meta.model : 'unknown',
    confidence: typeof meta.confidence === 'string' ? meta.confidence : 'unavailable',
    reviewFlags: Array.isArray(meta.reviewFlags)
      ? meta.reviewFlags.filter((flag): flag is string => typeof flag === 'string').slice(0, 10) : [],
    reviewRequired: meta.reviewRequired === true,
    reason: typeof meta.reason === 'string' ? meta.reason : undefined,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
