import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,isAdmin} from '@/lib/auth';
import {adminDb} from '@/lib/supabase/admin';
import {jsonError,sameOrigin} from '@/lib/security';
import {analyzeSteam} from '@/lib/faceit';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Administrator required',403);
 const parsed=z.object({registrationId:z.string().uuid()}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('Invalid registration ID');
 const db=adminDb();const {data:reg}=await db.from('registrations').select('id,user_id,status').eq('id',parsed.data.registrationId).single();
 if(!reg||reg.status!=='paid')return jsonError('Only paid registrations can be analyzed',409);
 const {data:link}=await db.from('steam_links').select('steam_id').eq('user_id',reg.user_id).single();
 if(!link)return jsonError('Steam account is not verified',409);
 try{
  const result=await analyzeSteam(link.steam_id);
  if(result.found){
   const {error}=await db.from('skill_assessments').insert({registration_id:reg.id,source:'faceit',faceit_elo:result.elo,matches_sampled:result.matches,suggested_tier:result.tier,proposed_score:result.score,evidence:{model:result.model,confidence:result.confidence,recentKd:result.recentKd,faceitPlayerId:result.playerId},assessed_by:user.id});
   if(error)throw error;
  }
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch{return jsonError('FACEIT service unavailable or rate-limited',503);}
}
