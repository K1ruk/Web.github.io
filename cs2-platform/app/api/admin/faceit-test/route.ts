import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { jsonError, sameOrigin } from '@/lib/security';
import { analyzeSteam, FaceitRequestError } from '@/lib/faceit';

export const runtime = 'nodejs';

/**
 * Diagnostic-only admin endpoint.
 * It analyzes the signed-in admin's *verified* SteamID64.
 * It never writes tiers, skill assessments, registrations or payment rows.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed', 403);
  const user = await requireUser();
  if (!user) return jsonError('Sign in required', 401);
  if (!await isAdmin(user.id)) return jsonError('Administrator required', 403);

  const { data: link, error } = await adminDb()
    .from('steam_links').select('steam_id').eq('user_id', user.id).maybeSingle();
  if (error) return jsonError('Could not read your verified Steam account', 503);
  if (!link) return jsonError('Connect and verify Steam in My Account first', 409);

  try {
    const result = await analyzeSteam(link.steam_id);
    return NextResponse.json({
      steamId: link.steam_id,
      verifiedOwner: true,
      persisted: false,
      ...result,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof FaceitRequestError) {
      const status = error.code === 'not_configured' ? 503
        : error.code === 'invalid_key' ? 503
        : error.code === 'rate_limited' ? 429
        : error.code === 'invalid_response' ? 502 : 503;
      return NextResponse.json({
        error: error.message,
        code: error.code,
      }, { status, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return jsonError('FACEIT analysis failed. Please try again.', 503);
  }
}
