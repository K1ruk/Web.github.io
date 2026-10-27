import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { jsonError, sameOrigin } from '@/lib/security';
import { inspectFaceitMatch, FaceitClubInspectionError } from '@/lib/faceit-club-server';
import { FaceitRequestError } from '@/lib/faceit';

export const runtime = 'nodejs';

const schema = z.object({ match: z.string().trim().min(3).max(400) }).strict();

/**
 * Administrator-only, read-only FACEIT matchroom inspector.
 * It cannot modify NEXUS matches, registrations, tiers, or payouts.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed', 403);
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('Administrator required', 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Provide a valid FACEIT matchroom URL or ID', 400);

  try {
    const result = await inspectFaceitMatch(parsed.data.match);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof FaceitClubInspectionError) return jsonError(error.message, error.status);
    if (error instanceof FaceitRequestError) {
      return jsonError(error.message,
        error.code === 'rate_limited' ? 429
          : error.code === 'invalid_response' ? 502 : 503);
    }
    return jsonError('FACEIT match inspection failed. Try again later.', 503);
  }
}
