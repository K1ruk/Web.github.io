import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
export function adminDb(){ const {url}=publicEnv(); const key=process.env.SUPABASE_SECRET_KEY; if(!key) throw new Error('SUPABASE_SECRET_KEY is missing'); return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'X-Client-Info':'nexus-server'}}}); }
