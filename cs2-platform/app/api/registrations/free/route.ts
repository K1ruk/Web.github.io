import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { hasVerifiedDiscordProvider } from '@/lib/discord-auth';
import { jsonError, sameOrigin } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  tournamentId: z.string().uuid(),
  acceptedRules: z.literal(true),
}).strict();

/**
 * Server-only FREE registration, never a payment bypass: the database RPC
 * requires fee_cents=0 and checks capacity under an advisory transaction lock.
 * The browser never chooses the entry status.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed', 403);
  const user = await requireUser();
  if (!user) return jsonError('Sign in with Discord first', 401);
  if (!hasVerifiedDiscordProvider(user.app_metadata))
    return jsonError('Connect and sign in with Discord before joining a tournament', 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Choose an event and accept the tournament rules', 400);

  try {
    const { data, error } = await adminDb().rpc('confirm_free_tournament_entry', {
      p_tournament_id: parsed.data.tournamentId,
      p_user_id: user.id,
      p_accept_rules: true,
    });
    if (error || typeof data !== 'string')
      return jsonError(error?.message || 'Free registration failed', 409);
    return NextResponse.json({ registered: true, registrationId: data, paymentRequired: false },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return jsonError('Registration service unavailable', 503);
  }
}
