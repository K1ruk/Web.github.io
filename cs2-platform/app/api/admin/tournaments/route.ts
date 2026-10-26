import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser,isAdmin} from '@/lib/auth';
import {adminDb} from '@/lib/supabase/admin';
import {jsonError,sameOrigin} from '@/lib/security';
const newTournament=z.object({name:z.string().trim().min(3).max(100),slug:z.string().regex(/^[a-z0-9-]{3,60}$/),feeCents:z.number().int().min(100).max(1000000),currency:z.enum(['eur','sek','usd']),capacity:z.number().int().min(5).max(200).refine(v=>v%5===0)});
const statusUpdate=z.object({tournamentId:z.string().uuid(),status:z.enum(['open','locked'])});
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Administrator required',403);
 const parsed=newTournament.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('Invalid tournament details');
 const {name,slug,feeCents,currency,capacity}=parsed.data;
 const db=adminDb();const {data,error}=await db.from('tournaments').insert({name,slug,fee_cents:feeCents,currency,capacity,status:'draft'}).select('id').single();
 if(error)return jsonError('Tournament could not be created',409);
 await db.from('admin_audit').insert({actor_id:user.id,action:'create_tournament',details:{id:data.id,name}});
 return NextResponse.json({id:data.id},{status:201});
}
export async function PATCH(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Administrator required',403);
 const parsed=statusUpdate.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('Invalid status request');
 const db=adminDb();const {tournamentId,status}=parsed.data;
 const from=status==='open'?'draft':'open';
 const {data,error}=await db.from('tournaments').update({status}).eq('id',tournamentId).eq('status',from).select('id').maybeSingle();
 if(error||!data)return jsonError('State transition not allowed',409);
 await db.from('admin_audit').insert({actor_id:user.id,action:'tournament_'+status,details:{tournamentId}});
 return NextResponse.json({ok:true});
}
