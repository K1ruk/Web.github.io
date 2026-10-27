import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { adminDb, adminRequestFailure } from '@/lib/supabase/admin';
import { nonce, openIdRedirect, steamSiteOrigin } from '@/lib/steam';

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  let origin: string;
  try {
    origin = steamSiteOrigin(request);
  } catch {
    return NextResponse.redirect(new URL('/register?steam=failed&reason=origin', request.url));
  }

  // Check the privileged API connection before asking the player to authorize
  // Steam. This avoids an unnecessary external login when the key is invalid.
  let failure: 'credentials' | 'service' | null = null;
  try {
    const { error } = await adminDb().from('registrations')
      .select('id', { head: true }).limit(1);
    if (error) failure = adminRequestFailure(error);
  } catch {
    failure = 'credentials';
  }

  if (failure) {
    const response = NextResponse.redirect(new URL('/register?steam=failed&reason=' + failure, origin));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const state = nonce();
  const response = NextResponse.redirect(openIdRedirect(state, origin));
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set('nexus_steam_state', state + '|' + user.id, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/steam',
    maxAge: 600,
  });
  return response;
}
