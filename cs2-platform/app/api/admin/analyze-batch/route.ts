import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { jsonError, sameOrigin } from '@/lib/security';
import { faceitConfigured, FaceitRequestError } from '@/lib/faceit';
import { assessPaidRegistration } from '@/lib/assessment';

export const runtime = 'nodejs';

const BATCH_SIZE = 3;
const CACHE_HOURS = 24;

/**
 * Operator-triggered, bounded, sequential scan of paid and unapproved entries.
 * Uses ONE private FACEIT key. Never fetches the same SteamID again within
 * 24 hours for this event unless the verified link changes.
 *
 * This deliberately does not run inside a Stripe webhook, which must stay fast
 * and should never fail when a third-party statistics API is unavailable.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed', 403);
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('Administrator required', 403);
  if (!faceitConfigured()) return jsonError('Configure FACEIT_API_KEY on the server first', 503);

  const parsed = z.object({ tournamentId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Invalid tournament ID');

  const db = adminDb();
  const { data: tournament, error: tournamentError } = await db.from('tournaments')
    .select('status').eq('id', parsed.data.tournamentId).maybeSingle();
  if (tournamentError || !tournament) return jsonError('Tournament unavailable', 404);
  if (!['draft', 'open', 'locked'].includes(tournament.status)) {
    return jsonError('Ratings cannot change after team publication', 409);
  }

  const { data: entries, error: entryError } = await db.from('registrations')
    .select('id,user_id')
    .eq('tournament_id', parsed.data.tournamentId)
    .eq('status', 'paid')
    .is('assigned_tier', null)
    .order('created_at', { ascending: true })
    .limit(201);

  if (entryError || !entries || entries.length > 200) {
    return jsonError('Could not load the unapproved tournament entries', 503);
  }
  if (!entries.length) {
    return NextResponse.json({ scanned: 0, found: 0, needsReview: 0, skipped: 0, remaining: 0, message: 'No unapproved paid players to analyze' },
      { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const since = new Date(Date.now() - CACHE_HOURS * 3600 * 1000).toISOString();
  const [samplesResult, linksResult] = await Promise.all([
    db.from('skill_assessments')
      .select('registration_id,evidence')
      .eq('source', 'faceit')
      .in('registration_id', entries.map(entry => entry.id))
      .gte('assessed_at', since)
      .limit(501),
    db.from('steam_links')
      .select('user_id,steam_id')
      .in('user_id', [...new Set(entries.map(entry => entry.user_id))]),
  ]);
  if (samplesResult.error || linksResult.error
    || !samplesResult.data || !linksResult.data
    || samplesResult.data.length > 500) {
    return jsonError('Could not verify recent player assessments', 503);
  }

  const steamByUser = new Map(linksResult.data.map(link => [link.user_id, link.steam_id]));
  const recentlyAssessed = new Set(
    samplesResult.data.filter(sample => {
      const entry = entries.find(item => item.id === sample.registration_id);
      const evidence = sample.evidence;
      return entry && evidence && typeof evidence === 'object' && !Array.isArray(evidence)
        && (evidence as Record<string, unknown>).steamId === steamByUser.get(entry.user_id);
    }).map(sample => sample.registration_id),
  );

  const pending = entries.filter(entry => !recentlyAssessed.has(entry.id));
  const batch = pending.slice(0, BATCH_SIZE);
  let scanned = 0;
  let found = 0;
  let needsReview = 0;
  let failed = 0;
  let rateLimited = false;

  for (const entry of batch) {
    try {
      const assessment = await assessPaidRegistration(entry.id, user.id);
      scanned++;
      if (assessment.found) {
        found++;
        if (assessment.reviewRequired) needsReview++;
      } else needsReview++;
    } catch (error) {
      failed++;
      if (error instanceof FaceitRequestError && error.code === 'rate_limited') {
        rateLimited = true;
        break;
      }
      // Continue to the next player, without exposing third-party diagnostics
      // or modifying any final skill approval.
    }
  }

  return NextResponse.json({
    scanned,
    found,
    needsReview,
    failed,
    rateLimited,
    skipped: recentlyAssessed.size,
    remaining: Math.max(0, pending.length - scanned),
    message: rateLimited
      ? 'FACEIT is rate limiting requests. Retry later.'
      : scanned === 0 && failed > 0
        ? 'No entries could be analyzed. Check Steam links, FACEIT API settings and server logs.'
        : 'Batch complete. Review proposed tiers and approve them individually.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
