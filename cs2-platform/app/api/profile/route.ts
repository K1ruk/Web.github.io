import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { jsonError,sameOrigin } from '@/lib/security';
const role=z.enum(['AWPer','IGL','Entry Fragger','Rifler','Support','Lurker']);
const schema=z.object({nickname:z.string().trim().min(2).max(32),primary_role:role,secondary_role:role,preferred_language:z.enum(['en','mn'])}).refine(p=>p.primary_role!==p.secondary_role);
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user)return jsonError('Sign in required',401);
 const raw=await req.json().catch(()=>null),parsed=schema.safeParse(raw);if(!parsed.success)return jsonError('Invalid profile data');
 const db=adminDb();const {data:active}=await db.from('registrations').select('id').eq('user_id',user.id).in('status',['paid','pending_payment']).limit(1);
 if(active?.length)return jsonError('Role changes are locked during tournament registration',409);
 const {error}=await db.from('profiles').upsert({user_id:user.id,...parsed.data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error)return jsonError('Unable to save profile',500);
 return NextResponse.json({ok:true});
}
