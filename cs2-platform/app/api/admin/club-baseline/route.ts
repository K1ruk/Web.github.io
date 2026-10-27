import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { jsonError } from '@/lib/security';
import { FaceitRequestError } from '@/lib/faceit';
import { BaselineReviewError, getRegistrationClubBaseline } from '@/lib/first-tournament-baseline-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only tournament baseline, scoped to an existing confirmed registration. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user || !await isAdmin(user.id))
    return jsonError('NEXUS administrator required', 403);
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('registrationId'));
  if (!id.success) return jsonError('Invalid registration ID', 400);

  try {
    const result = await getRegistrationClubBaseline(id.data);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof BaselineReviewError)
      return jsonError(error.message, error.status);
    if (error instanceof FaceitRequestError)
      return jsonError(error.message,
        error.code === 'invalid_key' ? 401
        : error.code === 'permission_denied' ? 403
        : error.code === 'rate_limited' ? 429
        : error.code === 'bad_request' ? 400 : 503);
    return jsonError('Club baseline review temporarily unavailable', 503);
  }
}
