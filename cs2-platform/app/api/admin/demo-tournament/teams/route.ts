import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { jsonError, sameOrigin } from '@/lib/security';
import { buildBalancedTeams } from '@/lib/teams';
import { TEAM_ROLES } from '@/lib/roster-draft';

/**
 * Admin-only, READ-ONLY team simulator. Never calls a roster publication
 * function; fake entries cannot be inserted into real tournament tables.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const playerSchema=z.object({
  id:z.string().regex(/^demo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  score:z.number().finite().min(0).max(100),
  primaryRole:z.enum(TEAM_ROLES),
  secondaryRole:z.enum(TEAM_ROLES),
}).strict().refine(player=>player.primaryRole!==player.secondaryRole);

const schema=z.object({
  players:z.array(playerSchema).min(10).max(40)
    .refine(players=>players.length%5===0,'Exactly five players per squad'),
}).strict();

export async function POST(request:NextRequest) {
  if (!sameOrigin(request)) return jsonError('Origin not allowed',403);
  const user=await requireUser();
  if (!user || !await isAdmin(user.id)) return jsonError('Administrator required',403);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return jsonError('Invalid simulated player list, roles or scores',400);

  const players=parsed.data.players;
  const ids=players.map(p=>p.id);
  const uniqueIds=new Set(ids);
  if(uniqueIds.size!==ids.length) return jsonError('Duplicate simulated participant IDs',400);

  const clubIds=players.map(p=>p.id.slice(5));
  const {data,error}=await adminDb().from('nexus_club_players')
    .select('faceit_player_id').in('faceit_player_id',clubIds).limit(41);
  if(error||!data) return jsonError('Unable to verify archive participants',503);
  if(data.length!==players.length
    ||new Set(data.map(r=>r.faceit_player_id)).size!==players.length)
    return jsonError('Simulated players must originate from the saved Club archive',400);

  try {
    const teams=buildBalancedTeams(players.map(p=>({
      registration_id:p.id,score:p.score,
      primary_role:p.primaryRole,secondary_role:p.secondaryRole,
    })));
    return NextResponse.json({
      demo:true,preview:true,persisted:false,
      players:players.length,
      teams,
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    return jsonError('Unable to balance this simulated roster',400);
  }
}
