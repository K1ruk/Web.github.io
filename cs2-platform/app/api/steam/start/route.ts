import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { nonce,openIdRedirect } from '@/lib/steam';
export async function GET(){
 const user=await requireUser();if(!user)return NextResponse.redirect(new URL('/login',process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000'));
 const state=nonce(),response=NextResponse.redirect(openIdRedirect(state));
 response.cookies.set('nexus_steam_state',state+'|'+user.id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/steam',maxAge:600});
 return response;
}
