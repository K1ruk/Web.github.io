import { NEXUS_FACEIT_QUEUE_ID, parseFaceitMatchId, type FaceitMatchDetail, type FaceitMatchStats } from './faceit-club.ts';
import { parseFaceitMetrics, type FaceitMetrics } from './faceit-metrics.ts';
import { rateNexusLobby, NEXUS_MATCH_RATING_MODEL } from './nexus-rating.ts';

export const CLUB_ARCHIVE_SINCE = '2026-06-01T00:00:00.000Z';
export const CLUB_ARCHIVE_SINCE_SECONDS = Date.parse(CLUB_ARCHIVE_SINCE) / 1000;
export const CLUB_ARCHIVE_VERSION = 'june-2026-nexus-v1';

export function juneOrLater(unixSeconds: number | null): boolean {
  return unixSeconds !== null && Number.isSafeInteger(unixSeconds)
    && unixSeconds >= CLUB_ARCHIVE_SINCE_SECONDS
    && unixSeconds <= Math.floor(Date.now()/1000)+3600;
}

type PlayerRow = {
  faceitPlayerId: string;
  nickname: string;
  teamName: string | null;
  mapIndex: number;
  mapName: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  headshots: number | null;
  roundsPlayed: number | null;
  metrics: FaceitMetrics;
  openingDuels: number | null;
  rawStats: Record<string,number>;
  nexusRating: number | null;
  ratingCoverage: number;
  ratingConfidence: string;
  ratingModel: string;
};

const record = (v: unknown):Record<string,unknown>|null =>
  v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : null;
const name = (v:unknown,max=80) =>
  typeof v==='string' && v.trim() ? v.trim().slice(0,max) : null;
function numeric(v:unknown,max=200000):number|null {
  if(typeof v!=='string' && typeof v!=='number')return null;
  const s=String(v).trim();
  if(!/^\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)&&n>=0&&n<=max?n:null;
}
function integer(v:unknown,max=100000) {
  const n=numeric(v,max);
  return n !== null&&Number.isSafeInteger(n)?n:null;
}
function getField(stats:Record<string,unknown>|null,...keys:string[]) {
  if(!stats)return null;
  const normalized = new Map(Object.keys(stats).map(k=>[k.toLowerCase().replace(/[^a-z0-9]/g,''),k]));
  for(const key of keys){const actual=normalized.get(key.toLowerCase().replace(/[^a-z0-9]/g,''));
    if(actual!==undefined)return stats[actual];}
  return null;
}
function extraNumericStats(stats:Record<string,unknown>|null) {
  const safe:Record<string,number>={};
  if(!stats)return safe;
  for(const [key,value] of Object.entries(stats).slice(0,100)){
    if(key.length>65||!/^[A-Za-z0-9 %/._()-]+$/.test(key))continue;
    const n=numeric(value,1000000);
    if(n!==null)safe[key]=n;
    if(Object.keys(safe).length>=50)break;
  }
  return safe;
}
function openingAttempts(stats:Record<string,unknown>|null): number|null {
  const wins=integer(getField(stats,'Opening Duels Won','Opening Kills','First Kills'));
  const losses=integer(getField(stats,'Opening Duels Lost','Opening Deaths','First Deaths'));
  return wins === null || losses === null ? null : wins+losses;
}
export type ArchiveMatchResult={
  match:{
    id:string;queue_id:string;competition_type:'hub';organizer_id:string|null;
    finished_at:string;status:string;map_count:number;
    team_a:string|null;team_b:string|null;score_a:number|null;score_b:number|null;
    stats_status:'available'|'unavailable';
    model_version:string;
  };
  players:PlayerRow[];
};

/** For persistence, only accept FACEIT's own exact match+queue association. */
export function normalizeJuneClubMatch(
  expectedId:string, details:FaceitMatchDetail, stats:FaceitMatchStats|null,
):ArchiveMatchResult {
  if(parseFaceitMatchId(expectedId)!==expectedId || details.match_id!==expectedId
    || details.game!=='cs2' || details.competition_type!=='hub'
    || details.competition_id!==NEXUS_FACEIT_QUEUE_ID){
    throw new Error('Match is not verified as belonging to this CS2 Club queue');
  }
  if(details.status!=='FINISHED')throw new Error('Only finished matches are archived');
  const t=integer(details.finished_at,1e10);
  if(!juneOrLater(t))throw new Error('Match was before June 1, 2026 or has an invalid date');

  const teamNames=Object.values(details.teams||{}).slice(0,2)
    .map(t=>name(t?.name)||null);
  const scoreMap=details.results?.score||{};
  const scoreValues=Object.keys(details.teams||{}).slice(0,2)
    .map(k=>integer(scoreMap[k],100));

  const rounds=Array.isArray(stats?.rounds)?stats.rounds.slice(0,5):[];
  const players:PlayerRow[]=[];
  for(const [index,round] of rounds.entries()){
    const mapName=name(round.round_stats?.['Map'],50)||'Map '+(index+1);
    const lobby:PlayerRow[]=[];
    for(const [teamIndex,team] of (Array.isArray(round.teams)?round.teams:[]).slice(0,2).entries()){
      const teamName=teamNames[teamIndex]||name(team.team_stats?.['Team']);
      for(const player of (Array.isArray(team.players)?team.players:[]).slice(0,10)){
        const faceitPlayerId=name(player.player_id,80);
        if(!faceitPlayerId||!name(player.nickname,80))continue;
        const raw=record(player.player_stats);
        lobby.push({
          faceitPlayerId,
          nickname:name(player.nickname,80)!,
          teamName,
          mapIndex:index,
          mapName,
          kills:integer(getField(raw,'Kills')),
          deaths:integer(getField(raw,'Deaths')),
          assists:integer(getField(raw,'Assists')),
          headshots:integer(getField(raw,'Headshots')),
          roundsPlayed:integer(getField(raw,'Rounds','Rounds Played')),
          metrics:parseFaceitMetrics(raw),
          openingDuels:openingAttempts(raw),
          rawStats:extraNumericStats(raw),
          nexusRating:null,ratingCoverage:0,ratingConfidence:'unavailable',
          ratingModel:NEXUS_MATCH_RATING_MODEL,
        });
      }
    }
    const ratings=rateNexusLobby(lobby.map(p=>({
      playerId:p.faceitPlayerId,metrics:p.metrics,openingDuels:p.openingDuels,
    })));
    for(const p of lobby){
      const r=ratings.find(r=>r.playerId===p.faceitPlayerId)!;
      players.push({...p,nexusRating:r.rating,ratingCoverage:r.coverage,
        ratingConfidence:r.confidence});
    }
  }

  return {
    match:{
      id:expectedId,queue_id:NEXUS_FACEIT_QUEUE_ID,
      competition_type:'hub',
      organizer_id:name(details.organizer_id,90),
      finished_at:new Date(t!*1000).toISOString(),
      status:'FINISHED',
      map_count:rounds.length,
      team_a:teamNames[0]||null,team_b:teamNames[1]||null,
      score_a:scoreValues[0]??null,score_b:scoreValues[1]??null,
      stats_status:rounds.length?'available':'unavailable',
      model_version:CLUB_ARCHIVE_VERSION,
    },players,
  };
}
