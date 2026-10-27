import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { nonce, openIdRedirect, steamSiteOrigin } from '@/lib/steam';

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url));

  if (!process.env.SUPABASE_SECRET_KEY) {
    return NextResponse.redirect(new URL('/register?steam=failed&reason=setup', request.url));
  }

  let origin: string;
  try {
    origin = steamSiteOrigin(request);
  } catch {
    return NextResponse.redirect(new URL('/register?steam=failed&reason=origin', request.url));
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
