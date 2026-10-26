import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,isAdmin} from '@/lib/auth';
import {adminDb} from '@/lib/supabase/admin';
import {jsonError,sameOrigin} from '@/lib/security';
import {buildBalancedTeams} from '@/lib/teams';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Administrator required',403);
 const parsed=z.object({tournamentId:z.string().uuid(),publish:z.boolean().default(false)}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return jsonError('Invalid tournament');
 const db=adminDb();const {data:t}=await db.from('tournaments').select('status').eq('id',parsed.data.tournamentId).maybeSingle();
 if(!t||t.status!=='locked')return jsonError('Lock registration before generating teams',409);
 const {data:regs,error}=await db.from('registrations').select('id,internal_score,assigned_tier,primary_role,secondary_role').eq('tournament_id',parsed.data.tournamentId).eq('status','paid').order('created_at',{ascending:true}).limit(1001);
 if(error||!regs)return jsonError('Could not load registered players',500);
 if(regs.length>1000)return jsonError('Too many players for current generator',409);
 if(regs.some(r=>r.internal_score==null||r.assigned_tier==null))return jsonError('Every paid player needs admin-approved tier and score',409);
 try{
  const teams=buildBalancedTeams(regs.map(r=>({registration_id:r.id,score:Number(r.internal_score),primary_role:r.primary_role,secondary_role:r.secondary_role})));
  if(!parsed.data.publish)return NextResponse.json({preview:true,teams});
  const {data,error:publishing}=await db.rpc('publish_balanced_teams',{p_tournament:parsed.data.tournamentId,p_rosters:teams,p_actor:user.id});
  if(publishing)return jsonError(publishing.message,409);
  return NextResponse.json({published:true,count:data});
 }catch(e){return jsonError(e instanceof Error?e.message:'Unable to generate teams',409);}
}
