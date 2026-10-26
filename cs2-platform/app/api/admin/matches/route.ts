import {NextRequest,NextResponse} from 'next/server';import {z} from 'zod';
import {requireUser,isAdmin} from '@/lib/auth';import {adminDb} from '@/lib/supabase/admin';import {jsonError,sameOrigin} from '@/lib/security';
const schema=z.object({tournamentId:z.string().uuid(),teamA:z.string().uuid(),teamB:z.string().uuid(),scheduledAt:z.string().datetime(),stage:z.enum(['groups','playoffs','final']),bestOf:z.union([z.literal(1),z.literal(3)])}).refine(v=>v.teamA!==v.teamB);
const scoreSchema=z.object({matchId:z.string().uuid(),scoreA:z.number().int().min(0).max(3),scoreB:z.number().int().min(0).max(3)}).refine(v=>v.scoreA!==v.scoreB);
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Invalid origin',403);const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Admin only',403);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('Invalid match details');
 const x=parsed.data,db=adminDb();if(new Date(x.scheduledAt)<=new Date())return jsonError('Schedule a future match');
 const {data:event}=await db.from('tournaments').select('status').eq('id',x.tournamentId).single();
 if(!event||event.status!=='published')return jsonError('Publish teams first',409);
 const {data:teams}=await db.from('teams').select('id').eq('tournament_id',x.tournamentId).in('id',[x.teamA,x.teamB]);
 if(teams?.length!==2)return jsonError('Teams must belong to this tournament',409);
 const {data,error}=await db.from('matches').insert({tournament_id:x.tournamentId,team_a:x.teamA,team_b:x.teamB,scheduled_at:x.scheduledAt,stage:x.stage,best_of:x.bestOf}).select('id').single();
 if(error)return jsonError('Unable to create match',500);
 await db.from('admin_audit').insert({actor_id:user.id,action:'schedule_match',details:{matchId:data.id,tournamentId:x.tournamentId}});
 return NextResponse.json({id:data.id},{status:201});
}
export async function PATCH(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Invalid origin',403);const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Admin only',403);
 const parsed=scoreSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('Invalid result');
 const {matchId,scoreA,scoreB}=parsed.data,db=adminDb();
 const {data:match}=await db.from('matches').select('status,best_of').eq('id',matchId).single();
 if(!match||match.status==='cancelled'||match.status==='completed')return jsonError('Match cannot be finalized',409);
 const wins=Math.floor(match.best_of/2)+1;
 if(Math.max(scoreA,scoreB)!==wins||Math.min(scoreA,scoreB)>=wins)return jsonError('Score incompatible with match format',409);
 const {error}=await db.from('matches').update({score_a:scoreA,score_b:scoreB,status:'completed'}).eq('id',matchId);
 if(error)return jsonError('Could not save result',500);
 await db.from('admin_audit').insert({actor_id:user.id,action:'complete_match',details:{matchId,scoreA,scoreB}});
 return NextResponse.json({ok:true});
}
