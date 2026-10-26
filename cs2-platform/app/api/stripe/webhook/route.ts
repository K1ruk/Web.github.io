import { NextRequest,NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/supabase/admin';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 const secret=process.env.STRIPE_SECRET_KEY,signing=process.env.STRIPE_WEBHOOK_SECRET,signature=request.headers.get('stripe-signature');
 if(!secret||!signing||!signature)return new NextResponse('Missing Stripe configuration',{status:503});
 const stripe=new Stripe(secret);let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(await request.text(),signature,signing);}
 catch{return new NextResponse('Invalid webhook signature',{status:400});}
 try{
  if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
   const s=event.data.object as Stripe.Checkout.Session;
   if(s.payment_status!=='paid'||s.mode!=='payment')return NextResponse.json({ignored:true});
   const intent=typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id||'';
   if(!intent||typeof s.amount_total!=='number'||!s.currency)return new NextResponse('Invalid paid session',{status:400});
   const {data,error}=await adminDb().rpc('confirm_checkout',{p_event:event.id,p_session:s.id,p_intent:intent,p_amount:s.amount_total,p_currency:s.currency});
   if(error)throw error;
   return NextResponse.json({status:data});
  }
  if(event.type==='checkout.session.expired'){
   const s=event.data.object as Stripe.Checkout.Session;
   const {data,error}=await adminDb().rpc('expire_checkout',{p_event:event.id,p_session:s.id});
   if(error)throw error;return NextResponse.json({status:data});
  }
  return NextResponse.json({ignored:true});
 }catch(err){console.error('Stripe webhook processing failed',err);return new NextResponse('Retry later',{status:500});}
}
