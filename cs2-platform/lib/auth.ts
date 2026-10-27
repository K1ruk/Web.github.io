import 'server-only';
import { serverDb } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
export async function requireUser(){const db=await serverDb();const {data,error}=await db.auth.getUser();if(error||!data.user) return null;return data.user;}
export async function isAdmin(userId:string){const {data,error}=await adminDb().from('admin_users').select('user_id').eq('user_id',userId).maybeSingle();return !error&&!!data;}
