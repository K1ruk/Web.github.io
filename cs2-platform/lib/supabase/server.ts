import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
export async function serverDb() {
 const cookieStore=await cookies(); const {url,key}=publicEnv();
 return createServerClient(url,key,{cookies:{getAll(){return cookieStore.getAll();},setAll(toSet){try {for(const {name,value,options} of toSet)cookieStore.set(name,value,options);} catch { /* Server Components cannot set cookies; proxy refreshes them. */ }}}});
}
