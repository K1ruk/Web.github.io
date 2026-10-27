import { NextResponse } from 'next/server';
import { requireUser, isAdmin } from '@/lib/auth';
import { jsonError } from '@/lib/security';
import { inspectFaceitQueue, FaceitClubInspectionError } from '@/lib/faceit-club-server';
import { FaceitRequestError } from '@/lib/faceit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only and NEXUS-admin-only check for the ONE selected FACEIT Club queue.
 * A NEXUS admin session is not itself FACEIT organizer authentication.
 * The private FACEIT_API_KEY must be permitted by FACEIT to read queue metadata.
 */
export async function GET() {
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('NEXUS administrator required', 403);
  try {
    const result = await inspectFaceitQueue();
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof FaceitClubInspectionError) {
      return jsonError(error.message, error.status);
    }
    if (error instanceof FaceitRequestError) {
      const status = error.code === 'permission_denied' ? 403
        : error.code === 'invalid_key' ? 401
        : error.code === 'rate_limited' ? 429
        : error.code === 'timeout' ? 504 : 503;
      return jsonError(error.message, status);
    }
    return jsonError('FACEIT queue metadata check is temporarily unavailable', 503);
  }
}
