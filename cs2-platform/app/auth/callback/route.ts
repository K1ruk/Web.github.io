import { NextRequest,NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase/server';
import { safeReturnTo } from '@/lib/security';
export async function GET(req:NextRequest){
 const url=new URL(req.url);const code=url.searchParams.get('code');
 if(!code)return NextResponse.redirect(new URL('/login?error=missing_code',url.origin));
 const db=await serverDb();const {error}=await db.auth.exchangeCodeForSession(code);
 return NextResponse.redirect(new URL(error?'/login?error=auth_failed':safeReturnTo(url.searchParams.get('next')),url.origin));
}
