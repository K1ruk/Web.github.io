import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import { faceitGet, FaceitRequestError } from '@/lib/faceit';
import { parseFaceitMatchId, type FaceitMatchDetail, type FaceitMatchStats } from './faceit-club';
import { normalizeJuneClubMatch, CLUB_ARCHIVE_SINCE } from './club-archive';
import { summarizeNexusArchivePlayer } from './nexus-rating';

type ImportStatus = 'saved'|'already_saved'|'skipped_before_june'|'skipped_unverified'|'stats_unavailable';
export type ImportReport={matchId:string;status:ImportStatus;playerMaps:number};

export class ClubArchiveError extends Error {
  constructor(message:string,public readonly status:number=503){super(message);}
}
export async function importClubArchiveBatch(ids:string[]):Promise<ImportReport[]> {
  if(ids.length>3||ids.length<1||new Set(ids).size!==ids.length||
    ids.some(id=>parseFaceitMatchId(id)!==id))
    throw new ClubArchiveError('Provide 1–3 unique valid FACEIT match IDs',400);

  const db=adminDb();
  const {data:existing,error:lookupError}=await db.from('nexus_club_matches')
    .select('id,stats_status').in('id',ids);
  if(lookupError)throw new ClubArchiveError('Archive tables unavailable. Apply the migration and configure the server secret.');

  const exists=new Map((existing||[]).map(m=>[m.id,m.stats_status]));
  const results:ImportReport[]=[];
  for(const id of ids) {
    if(exists.get(id)==='available') {
      results.push({matchId:id,status:'already_saved',playerMaps:0});
      continue;
    }
    const details=await faceitGet<FaceitMatchDetail>('/matches/'+encodeURIComponent(id));
    if(!details||details.match_id!==id||details.game!=='cs2'
      || details.competition_type!=='hub'
      || details.competition_id!=='26ca1fb5-eb37-4b3c-9005-402eca7a9008'
      || details.status!=='FINISHED') {
      results.push({matchId:id,status:'skipped_unverified',playerMaps:0});
      continue;
    }
    const seconds=typeof details.finished_at==='number' ? details.finished_at
      : typeof details.finished_at==='string' ? Number(details.finished_at):NaN;
    if(!Number.isSafeInteger(seconds)||seconds<Date.parse(CLUB_ARCHIVE_SINCE)/1000
      || seconds>Math.floor(Date.now()/1000)+3600) {
      results.push({matchId:id,status:'skipped_before_june',playerMaps:0});
      continue;
    }

    let stats:FaceitMatchStats|null=null;
    try {
      stats=await faceitGet<FaceitMatchStats>(
        '/matches/'+encodeURIComponent(id)+'/stats');
    } catch(error){
      // A failed provider request must not overwrite existing player-map
      // evidence or silently record missing stats as complete.
      if(error instanceof FaceitRequestError)throw error;
      throw new ClubArchiveError('FACEIT stats could not be verified');
    }
    const archive=normalizeJuneClubMatch(id,details,stats);
    const players=archive.players.map(p=>({
      faceitPlayerId:p.faceitPlayerId,nickname:p.nickname,
      teamName:p.teamName,mapIndex:p.mapIndex,mapName:p.mapName,
      kills:p.kills,deaths:p.deaths,assists:p.assists,
      headshots:p.headshots,roundsPlayed:p.roundsPlayed,
      adr:p.metrics.adr,kastPercent:p.metrics.kastPercent,
      openingDuelWinPercent:p.metrics.openingDuelWinPercent,
      openingDuels:p.openingDuels,kd:p.metrics.kd,
      rawStats:p.rawStats,nexusRating:p.nexusRating,
      ratingCoverage:p.ratingCoverage,ratingConfidence:p.ratingConfidence,
      ratingModel:p.ratingModel,
    }));
    const {data,error}=await db.rpc('ingest_nexus_club_match',{
      p_match:archive.match,p_players:players,
    });
    if(error||!data)throw new ClubArchiveError(
      'Verified FACEIT data could not be saved atomically to the Club archive');
    results.push({
      matchId:id,
      status:archive.match.stats_status==='available'?'saved':'stats_unavailable',
      playerMaps:players.length,
    });
  }
  return results;
}

export async function getClubArchiveOverview() {
  const db=adminDb();
  const [matchesResult,playerRowsResult,matchCountResult]=await Promise.all([
    db.from('nexus_club_matches')
      .select('id,finished_at,team_a,team_b,score_a,score_b,stats_status,map_count')
      .order('finished_at',{ascending:false}).limit(100),
    db.from('nexus_club_player_maps')
      .select('faceit_player_id,nickname_at_match,match_id,map_index,nexus_match_rating,adr,kast_percent,opening_duel_win_percent,kd')
      .order('imported_at',{ascending:false}).limit(5001),
    db.from('nexus_club_matches').select('id',{count:'exact',head:true}),
  ]);
  if(matchesResult.error||playerRowsResult.error||matchCountResult.error
    ||!matchesResult.data||!playerRowsResult.data)
    throw new ClubArchiveError('The Club archive could not be loaded');

  const truncated=playerRowsResult.data.length>5000;
  const grouped=new Map<string,typeof playerRowsResult.data>();
  for(const row of playerRowsResult.data.slice(0,5000)){
    const values=grouped.get(row.faceit_player_id)||[];
    values.push(row);
    grouped.set(row.faceit_player_id,values);
  }
  const leaders=[...grouped.entries()].map(([faceitPlayerId,rows])=>{
    const summary=summarizeNexusArchivePlayer(rows.map(row=>({
      matchId:row.match_id,mapIndex:row.map_index,
      rating:row.nexus_match_rating==null?null:Number(row.nexus_match_rating),
    })));
    const average=(key:'adr'|'kast_percent'|'opening_duel_win_percent'|'kd')=>{
      const v=rows.map(row=>row[key]==null?null:Number(row[key]))
        .filter((n):n is number=>n!==null&&Number.isFinite(n));
      return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null;
    };
    return {
      faceitPlayerId,
      nickname:rows[0]?.nickname_at_match||'Unknown',
      ...summary,
      adr:average('adr'),
      kastPercent:average('kast_percent'),
      openingDuelWinPercent:average('opening_duel_win_percent'),
      kd:average('kd'),
    };
  }).sort((a,b)=>(b.rating??-1)-(a.rating??-1));
  return {
    since:CLUB_ARCHIVE_SINCE,
    queueId:'26ca1fb5-eb37-4b3c-9005-402eca7a9008',
    matchesArchived:matchCountResult.count??0,
    playersArchived:grouped.size,
    summariesTruncated:truncated,
    matches:(matchesResult.data||[]),
    players:leaders.slice(0,100),
    ratingModel:'nexus-lobby-v1',
    skillTierAffected:false,
  };
}
