import {NextRequest,NextResponse} from 'next/server';import {z} from 'zod';import {requireUser,isAdmin} from '@/lib/auth';import {jsonError,sameOrigin} from '@/lib/security';import {resolveSteamUrl} from '@/lib/steam-url';import {analyzeSteam} from '@/lib/faceit';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return jsonError('Origin not allowed',403);
 const user=await requireUser();if(!user||!await isAdmin(user.id))return jsonError('Admin only',403);
 const parsed=z.object({url:z.string().url().max(260)}).safeParse(await req.json().catch(()=>null));if(!parsed.success)return jsonError('Invalid URL');
 try{const steamId=await resolveSteamUrl(parsed.data.url);const result=await analyzeSteam(steamId);return NextResponse.json({steamId,...result,verifiedOwner:false},{headers:{'Cache-Control':'no-store'}});}
 catch(e){return jsonError(e instanceof Error?e.message:'Unable to analyze Steam account',422);}
}
