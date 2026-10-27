import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { adminDb, adminRequestFailure } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/env';
import { equalNonce, steamSiteOrigin, verifyOpenId } from '@/lib/steam';

type LinkResult = 'session' | 'state' | 'locked' | 'duplicate' | 'verification' | 'credentials' | 'setup' | 'origin' | 'service';

export async function GET(request: NextRequest) {
  let origin: string;
  try {
    origin = steamSiteOrigin(request);
  } catch {
    const target = new URL('/register?steam=failed&reason=origin', siteUrl());
    return NextResponse.redirect(target);
  }

  const returnTo = request.cookies.get('nexus_steam_after')?.value === 'onboarding' ? '/onboarding' : '/register';
  const target = new URL(returnTo, origin);
  const params = new URL(request.url).searchParams;
  const stateCookie = request.cookies.get('nexus_steam_state')?.value || '';
  let problem: LinkResult | null = null;

  try {
    const user = await requireUser();
    if (!user) {
      problem = 'session';
      throw new Error('No active NEXUS session');
    }

    const separator = stateCookie.indexOf('|');
    const cookieState = separator < 0 ? '' : stateCookie.slice(0, separator);
    const cookieUser = separator < 0 ? '' : stateCookie.slice(separator + 1);
    const returnedState = params.get('state') || '';

    if (!cookieState || cookieUser !== user.id || !equalNonce(cookieState, returnedState)) {
      problem = 'state';
      throw new Error('Steam state cookie did not match');
    }

    if (!process.env.SUPABASE_SECRET_KEY) {
      problem = 'setup';
      throw new Error('Steam linking server is not configured');
    }

    let db: ReturnType<typeof adminDb>;
    try {
      db = adminDb();
    } catch {
      problem = 'credentials';
      throw new Error('Privileged Supabase client is unavailable');
    }
    const { data: ongoing, error: lookupError } = await db.from('registrations')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['paid', 'pending_payment'])
      .limit(1);
    if (lookupError) {
      problem = adminRequestFailure(lookupError);
      throw new Error('Could not check Steam account lock');
    }
    if (ongoing?.length) {
      problem = 'locked';
      throw new Error('Steam cannot be changed during an active registration');
    }

    let steamId: string;
    try {
      steamId = await verifyOpenId(new URL(request.url), origin, returnedState);
    } catch {
      problem = 'verification';
      throw new Error('Steam identity verification was not accepted');
    }

    const { error } = await db.from('steam_links').upsert({
      user_id: user.id,
      steam_id: steamId,
      verified_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) {
      // A Steam account may be linked to only one NEXUS account.
      problem = error.code === '23505' ? 'duplicate' : adminRequestFailure(error);
      throw new Error('Could not store verified Steam account');
    }

    target.searchParams.set('steam', 'linked');
  } catch {
    target.searchParams.set('steam', 'failed');
    target.searchParams.set('reason', problem || 'service');
  }

  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'no-store');
  // Delete using the SAME path used when the cookie was created.
  response.cookies.set('nexus_steam_after', '', {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/steam',
    maxAge: 0,
  });
  response.cookies.set('nexus_steam_state', '', {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/steam',
    maxAge: 0,
  });
  return response;
}
