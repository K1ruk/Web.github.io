import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser,isAdmin } from '@/lib/auth';
import { jsonError } from '@/lib/security';
import { adminDb } from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const query=z.object({
  faceitId:z.string().trim().min(1).max(80),
  offset:z.coerce.number().int().min(0).max(2000),
}).strict();

export async function GET(request:NextRequest){
  const user=await requireUser();
  if(!user||!await isAdmin(user.id))return jsonError('NEXUS admin required',403);
  const parsed=query.safeParse({
    faceitId:request.nextUrl.searchParams.get('faceitId'),
    offset:request.nextUrl.searchParams.get('offset')??'0',
  });
  if(!parsed.success)return jsonError('Invalid FACEIT player ID or pagination',400);
  try {
    const db=adminDb();
    const {data:rows,error,count}=await db.from('nexus_club_player_maps')
      .select('match_id,map_index,map_name,nickname_at_match,team_name,kills,deaths,assists,headshots,rounds_played,adr,kast_percent,opening_duel_win_percent,opening_duels,kd,nexus_match_rating,rating_confidence,raw_stats',
        {count:'exact'})
      .eq('faceit_player_id',parsed.data.faceitId)
      .order('imported_at',{ascending:false})
      .range(parsed.data.offset,parsed.data.offset+49);
    if(error||!rows)return jsonError('Player archive unavailable',503);
    const ids=[...new Set(rows.map(row=>row.match_id))];
    const matchResult=ids.length
      ? await db.from('nexus_club_matches')
        .select('id,finished_at,team_a,team_b,score_a,score_b')
        .in('id',ids)
      : {data:[],error:null};
    if(matchResult.error||!matchResult.data)return jsonError('Match archive unavailable',503);
    const byId=new Map(matchResult.data.map(match=>[match.id,match]));
    const results=rows.map(row=>({
      matchId:row.match_id,
      matchUrl:'https://www.faceit.com/en/cs2/room/'+row.match_id,
      finishedAt:byId.get(row.match_id)?.finished_at??null,
      mapIndex:row.map_index,
      mapName:row.map_name,
      nickname:row.nickname_at_match,
      teamName:row.team_name,
      teams:byId.has(row.match_id)?{
        a:byId.get(row.match_id)!.team_a,b:byId.get(row.match_id)!.team_b,
        scoreA:byId.get(row.match_id)!.score_a,scoreB:byId.get(row.match_id)!.score_b,
      }:null,
      kills:row.kills,deaths:row.deaths,assists:row.assists,
      headshots:row.headshots,roundsPlayed:row.rounds_played,
      adr:row.adr,kastPercent:row.kast_percent,
      openingDuelWinPercent:row.opening_duel_win_percent,
      openingDuels:row.opening_duels,kd:row.kd,
      nexusRating:row.nexus_match_rating,
      ratingConfidence:row.rating_confidence,
      rawStats:row.raw_stats,
    })).sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)));
    return NextResponse.json({
      faceitPlayerId:parsed.data.faceitId,
      totalMaps:count??0,offset:parsed.data.offset,
      hasMore:parsed.data.offset+50<(count??0),matches:results,
      since:'2026-06-01T00:00:00.000Z',
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    return jsonError('Player archive temporarily unavailable',503);
  }
}
