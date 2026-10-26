import { NextRequest,NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/env';
import { safeReturnTo } from '@/lib/security';
export async function GET(req:NextRequest){
 const url=new URL(req.url);const code=url.searchParams.get('code');
 if(!code)return NextResponse.redirect(siteUrl()+'/login?error=missing_code');
 const db=await serverDb();const {error}=await db.auth.exchangeCodeForSession(code);
 return NextResponse.redirect(siteUrl()+(error?'/login?error=auth_failed':safeReturnTo(url.searchParams.get('next'))));
}
