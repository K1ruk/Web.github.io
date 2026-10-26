import { NextRequest,NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { jsonError,sameOrigin } from '@/lib/security';
import { siteUrl } from '@/lib/env';
const schema=z.object({tournamentId:z.string().uuid(),acceptedRules:z.literal(true)});
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user)return jsonError('Sign in required',401);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('You must accept the rules and select an event');
 const secret=process.env.STRIPE_SECRET_KEY;if(!secret)return jsonError('Payments are not configured',503);
 if(secret.startsWith('sk_live_')&&(process.env.ALLOW_LIVE_PAYMENTS!=='true'||!process.env.NEXT_PUBLIC_TOURNAMENT_RULES_URL||!process.env.NEXT_PUBLIC_REFUND_POLICY_URL))return jsonError('Live checkout is disabled until approved terms and payment settings are published',503);
 const db=adminDb(),stripe=new Stripe(secret);const tournamentId=parsed.data.tournamentId;
 const {data:t,error:tErr}=await db.from('tournaments').select('id,name,fee_cents,currency,status').eq('id',tournamentId).single();
 if(tErr||!t||t.status!=='open'||t.fee_cents<=0)return jsonError('Tournament is not open for checkout',409);
 const {data:regId,error:reserveErr}=await db.rpc('reserve_tournament_slot',{p_tournament_id:tournamentId,p_user_id:user.id,p_accept_rules:parsed.data.acceptedRules});
 if(reserveErr||!regId)return jsonError(reserveErr?.message||'Unable to reserve tournament slot',409);
 const {data:prior}=await db.from('payments').select('checkout_session_id,id').eq('registration_id',regId).eq('status','pending').limit(1).maybeSingle();
 if(prior){
  try{const old=await stripe.checkout.sessions.retrieve(prior.checkout_session_id);
   if(old.status==='open'&&old.url)return NextResponse.json({url:old.url});
   if(old.status==='complete')return jsonError('Payment processing; refresh your dashboard shortly',409);
   if(old.status==='expired')await db.from('payments').update({status:'expired'}).eq('id',prior.id).eq('status','pending');
  }catch{return jsonError('Existing payment session could not be verified',503);}
 }
 let session:Stripe.Checkout.Session;
 try{session=await stripe.checkout.sessions.create({
  mode:'payment',client_reference_id:regId,customer_email:user.email||undefined,
  line_items:[{price_data:{currency:t.currency,unit_amount:t.fee_cents,product_data:{name:t.name+' — solo entry'}},quantity:1}],
  success_url:siteUrl()+'/dashboard?checkout=return',cancel_url:siteUrl()+'/register?checkout=cancel',
  expires_at:Math.floor(Date.now()/1000)+30*60,
  metadata:{registration_id:regId,tournament_id:tournamentId,user_id:user.id}
 });}catch{return jsonError('Checkout provider unavailable',503);}
 const {error:saving}=await db.from('payments').insert({registration_id:regId,checkout_session_id:session.id,amount_cents:t.fee_cents,currency:t.currency,status:'pending'});
 if(saving){try{await stripe.checkout.sessions.expire(session.id);}catch{}return jsonError('Checkout is already being created; please try again',409);}
 return NextResponse.json({url:session.url},{headers:{'Cache-Control':'no-store'}});
}
