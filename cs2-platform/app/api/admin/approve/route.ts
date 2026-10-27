import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { jsonError, sameOrigin } from '@/lib/security';

const schema = z.object({
  registrationId: z.string().uuid(),
  tier: z.number().int().min(1).max(5),
  score: z.number().min(0).max(100),
  note: z.string().trim().max(500).default(''),
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed', 403);
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('Administrator required', 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Invalid tier, score or registration');
  const { registrationId, tier, score, note } = parsed.data;
  const db = adminDb();

  const { data: registration, error: regError } = await db.from('registrations')
    .select('status,tournament_id').eq('id', registrationId).maybeSingle();
  if (regError || !registration || registration.status !== 'paid') {
    return jsonError('Only paid registrations can be approved', 409);
  }

  const { data: tournament, error: tournamentError } = await db.from('tournaments')
    .select('status').eq('id', registration.tournament_id).maybeSingle();
  if (tournamentError || !tournament || !['draft', 'open', 'locked'].includes(tournament.status)) {
    return jsonError('Skill approval is closed for this tournament', 409);
  }

  const { data: latest, error: evidenceError } = await db.from('skill_assessments')
    .select('source,suggested_tier,proposed_score,evidence')
    .eq('registration_id', registrationId)
    .order('assessed_at', { ascending: false })
    .limit(1).maybeSingle();
  if (evidenceError) return jsonError('Could not verify recent skill evidence', 503);

  const evidence = latest?.evidence;
  const flags = evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>).reviewFlags
    : null;
  const flagged = Array.isArray(flags) && flags.length > 0;

  const manualOverride = !latest || latest.source !== 'faceit'
    || latest.suggested_tier == null || latest.proposed_score == null
    || tier < latest.suggested_tier || score < Number(latest.proposed_score) - 5;
  if ((manualOverride || flagged) && note.length < 15) {
    return jsonError('Explain manual approvals, downward adjustments, or review flags in at least 15 characters', 400);
  }

  const { error: approvalError } = await db.rpc('approve_player_skill', {
    p_registration: registrationId,
    p_actor: user.id,
    p_tier: tier,
    p_score: score,
    p_note: note,
  });
  if (approvalError) return jsonError(approvalError.message, 409);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
