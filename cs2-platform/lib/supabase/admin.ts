import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

type ApiError = { message?: string; code?: string } | null;

/** Turn 401s from Supabase's API gateway into an actionable setup status. */
export function adminRequestFailure(error: ApiError): 'credentials' | 'service' {
  if (!error) return 'service';
  const description = `${error.code || ''} ${error.message || ''}`;
  return /\b401\b|invalid.?api.?key|invalid.?jwt|jwt.?expired|not authorized|unauthorized|pgrst301/i.test(description)
    ? 'credentials'
    : 'service';
}

export function adminDb() {
  const { url } = publicEnv();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  // Do not accidentally attempt privileged queries with a publishable key
  // or the placeholders from the example env file.
  if (!key || key.startsWith('sb_publishable_') || /YOUR_(SERVER_)?SECRET_KEY|^your-/i.test(key)) {
    throw new Error('A valid server-side SUPABASE_SECRET_KEY is required');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { 'X-Client-Info': 'nexus-server' } },
  });
}
