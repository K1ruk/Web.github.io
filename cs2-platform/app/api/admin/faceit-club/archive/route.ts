import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser,isAdmin } from '@/lib/auth';
import { jsonError,sameOrigin } from '@/lib/security';
import { FaceitRequestError } from '@/lib/faceit';
import { ClubArchiveError,importClubArchiveBatch,getClubArchiveOverview } from '@/lib/club-archive-server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({
  matchIds:z.array(z.string().trim().regex(/^1-[a-f0-9-]{36}$/i)).min(1).max(3),
}).strict();

async function adminAuthorized(){
  const user=await requireUser();
  return user!==null&&await isAdmin(user.id);
}
function respond(error:unknown) {
  if(error instanceof ClubArchiveError)return jsonError(error.message,error.status);
  if(error instanceof FaceitRequestError){
    const status=error.code==='rate_limited'?429:error.code==='invalid_key'?401:
      error.code==='permission_denied'?403:503;
    return jsonError(error.message,status);
  }
  return jsonError('Club archive temporarily unavailable',503);
}
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return jsonError('Origin not allowed',403);
  if(!await adminAuthorized())return jsonError('NEXUS admin required',403);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success||new Set(parsed.data?.matchIds).size!==parsed.data?.matchIds.length)
    return jsonError('Provide up to three unique FACEIT match IDs',400);
  try {
    const entries=await importClubArchiveBatch(parsed.data.matchIds);
    return NextResponse.json({entries,archived:entries.filter(x=>x.status==='saved').length,
      skipped:entries.filter(x=>x.status.startsWith('skipped')).length},
      {headers:{'Cache-Control':'private, no-store'}});
  } catch(error){return respond(error);}
}
export async function GET(){
  if(!await adminAuthorized())return jsonError('NEXUS admin required',403);
  try {
    const result=await getClubArchiveOverview();
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error){return respond(error);}
}
