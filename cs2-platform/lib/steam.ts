import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';
const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const OPENID_NAMESPACE = 'http://specs.openid.net/auth/2.0';

export { trustedSiteOrigin as steamSiteOrigin } from '@/lib/security';

export function nonce() {
  return randomBytes(32).toString('hex');
}

export function equalNonce(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function openIdRedirect(state: string, origin: string) {
  const callback = new URL('/api/steam/callback', origin);
  callback.searchParams.set('state', state);

  const parameters = new URLSearchParams({
    'openid.ns': OPENID_NAMESPACE,
    'openid.mode': 'checkid_setup',
    'openid.return_to': callback.toString(),
    'openid.realm': origin + '/',
    'openid.identity': OPENID_NAMESPACE + '/identifier_select',
    'openid.claimed_id': OPENID_NAMESPACE + '/identifier_select',
  });

  return STEAM_OPENID_URL + '?' + parameters.toString();
}

export async function verifyOpenId(callback: URL, origin: string, state: string) {
  const params = callback.searchParams;
  if (params.get('openid.mode') !== 'id_res') throw new Error('Steam verification cancelled');
  if (params.get('openid.ns') !== OPENID_NAMESPACE) throw new Error('Invalid OpenID namespace');
  if (params.get('openid.op_endpoint') !== STEAM_OPENID_URL) throw new Error('Untrusted OpenID provider');

  const expected = new URL('/api/steam/callback', origin);
  expected.searchParams.set('state', state);
  if (params.get('openid.return_to') !== expected.toString()) throw new Error('Return URL mismatch');

  const claimed = params.get('openid.claimed_id') || '';
  const identity = params.get('openid.identity') || '';
  const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/.exec(claimed);
  if (!match || identity !== claimed) throw new Error('Invalid Steam identity');

  const data = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('openid.')) data.set(key, value);
  }
  data.set('openid.mode', 'check_authentication');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      body: data,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Steam identity verification failed');

    const body = (await response.text()).replace(/\r/g, '');
    if (!/(^|\n)is_valid:true(\n|$)/.test(body)) throw new Error('Steam signature rejected');
    return match[1];
  } finally {
    clearTimeout(timeout);
  }
}
