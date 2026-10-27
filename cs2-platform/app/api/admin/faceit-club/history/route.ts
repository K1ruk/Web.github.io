import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { jsonError } from '@/lib/security';
import { readSelectedQueueHubMatches, FaceitClubInspectionError } from '@/lib/faceit-club-server';
import { FACEIT_HISTORY_MAX_OFFSET } from '@/lib/faceit-hub-history';
import { FaceitRequestError } from '@/lib/faceit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const query = z.object({
  offset: z.coerce.number().int().min(0).max(FACEIT_HISTORY_MAX_OFFSET),
  limit: z.coerce.number().int().min(1).max(100),
});

/**
 * Restrict history to our ONE configured queue; accepts ONLY paging values,
 * not arbitrary FACEIT Hub IDs or URLs. Read-only admin-only API.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('NEXUS administrator required', 403);

  const params = request.nextUrl.searchParams;
  const parsed = query.safeParse({
    offset: params.get('offset') ?? 0,
    limit: params.get('limit') ?? 50,
  });
  if (!parsed.success) return jsonError('Invalid match history pagination', 400);

  try {
    const data = await readSelectedQueueHubMatches(parsed.data.offset, parsed.data.limit);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof FaceitClubInspectionError)
      return jsonError(error.message, error.status);
    if (error instanceof FaceitRequestError)
      return jsonError(error.message,
        error.code === 'invalid_key' ? 401
        : error.code === 'permission_denied' ? 403
        : error.code === 'rate_limited' ? 429
        : error.code === 'timeout' ? 504
        : error.code === 'bad_request' ? 400 : 503);
    return jsonError('FACEIT Hub match-history lookup failed. Try again later.', 503);
  }
}
