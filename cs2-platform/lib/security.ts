import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { siteUrl } from '@/lib/env';

/**
 * Only trust origins belonging to this configured app, its actual Vercel
 * deployment, or localhost during development. Do not trust arbitrary Hosts.
 */
export function trustedSiteOrigin(request: NextRequest): string {
  const origin = request.nextUrl.origin;
  if (origin === siteUrl()) return origin;

  const current = new URL(origin);
  if (
    process.env.NODE_ENV !== 'production' &&
    current.protocol === 'http:' &&
    (current.hostname === 'localhost' || current.hostname === '127.0.0.1')
  ) return origin;

  if (
    process.env.VERCEL === '1' &&
    process.env.VERCEL_URL &&
    origin === 'https://' + process.env.VERCEL_URL
  ) return origin;

  throw new Error('Request origin is not an allowed website address');
}

/** Require a browser request's Origin to match the trusted request host. */
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === trustedSiteOrigin(request);
  } catch {
    return false;
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function safeReturnTo(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : '/dashboard';
}
