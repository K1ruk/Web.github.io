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
