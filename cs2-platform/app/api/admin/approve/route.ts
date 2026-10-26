import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,isAdmin} from '@/lib/auth';
import {adminDb} from '@/lib/supabase/admin';
import {jsonError,sameOrigin} from '@/lib/security';
const schema=z.object({registrationId:z.string().uuid(),tier:z.number().int().min(1).max(5),score:z.number().min(0).max(100),note:z.string().trim().max(500).default('')});
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Administrator required',403);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('Invalid tier, score or registration');
 const {registrationId,tier,score,note}=parsed.data,db=adminDb();
 const {data:reg}=await db.from('registrations').select('status,tournament_id').eq('id',registrationId).maybeSingle();
 if(!reg||reg.status!=='paid')return jsonError('Only paid registrations can be approved',409);
 const {data:t}=await db.from('tournaments').select('status').eq('id',reg.tournament_id).single();
 if(!t||t.status==='published'||t.status==='finished')return jsonError('Teams have already been published',409);
 const {error}=await db.rpc('approve_player_skill',{p_registration:registrationId,p_actor:user.id,p_tier:tier,p_score:score,p_note:note});
 if(error)return jsonError(error.message,409);
 return NextResponse.json({ok:true});
}
