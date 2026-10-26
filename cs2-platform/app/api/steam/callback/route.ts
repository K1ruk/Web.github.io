import { NextRequest,NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { equalNonce,verifyOpenId } from '@/lib/steam';
import { siteUrl } from '@/lib/env';
export async function GET(request:NextRequest){
 const target=new URL('/register',siteUrl());const cookie=request.cookies.get('nexus_steam_state')?.value||'';
 const user=await requireUser();
 try{
  if(!user)throw new Error('Not signed in');
  const index=cookie.indexOf('|');if(index<0||cookie.slice(index+1)!==user.id||!equalNonce(cookie.slice(0,index),new URL(request.url).searchParams.get('state')||''))throw new Error('Invalid Steam link state');
  const existing=await adminDb().from('registrations').select('id').eq('user_id',user.id).in('status',['paid','pending_payment']).limit(1);\n  if(existing.data?.length)throw new Error('Steam link is locked during registration');\n  const steamId=await verifyOpenId(new URL(request.url));
  const {error}=await adminDb().from('steam_links').upsert({user_id:user.id,steam_id:steamId,verified_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw new Error('Steam ID already linked or unavailable');
  target.searchParams.set('steam','linked');
 }catch(err){target.searchParams.set('steam','failed');}
 const response=NextResponse.redirect(target);
 response.cookies.delete('nexus_steam_state');
 return response;
}
