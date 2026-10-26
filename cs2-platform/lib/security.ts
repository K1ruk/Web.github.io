import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { siteUrl } from '@/lib/env';
export function sameOrigin(request:NextRequest){const origin=request.headers.get('origin');if(!origin) return false;try {return new URL(origin).origin===siteUrl();}catch{return false;}}
export function jsonError(message:string,status=400){return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});}
export function safeReturnTo(value:string|null){return value&&value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/dashboard';}
