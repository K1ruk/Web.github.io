import {NextRequest,NextResponse} from 'next/server';import {serverDb} from '@/lib/supabase/server';import {jsonError,sameOrigin} from '@/lib/security';
export async function POST(request:NextRequest){if(!sameOrigin(request))return jsonError('Origin not allowed',403);
 const db=await serverDb();const {error}=await db.auth.signOut();
 if(error)return jsonError('Unable to sign out',500);
 return NextResponse.json({ok:true});
}
