import type { FaceitMetrics } from './faceit-metrics.ts';

export const NEXUS_MATCH_RATING_MODEL = 'nexus-lobby-v1' as const;
export const NEXUS_MATCH_WEIGHTS = {
  adr: 0.38, kastPercent: 0.28,
  openingDuelWinPercent: 0.20, kd: 0.14,
} as const;
export type RatingMetric = keyof typeof NEXUS_MATCH_WEIGHTS;
export type RatedLobbyPlayer = {
  playerId: string;
  metrics: Partial<FaceitMetrics>;
  openingDuels?: number | null;
};
const keys = Object.keys(NEXUS_MATCH_WEIGHTS) as RatingMetric[];
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function valid(key: RatingMetric, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    && value <= (key === 'adr' ? 300 : key === 'kd' ? 15 : 100);
}
export function rateNexusLobby(players: RatedLobbyPlayer[]) {
  if (players.length > 20) throw new Error('Invalid CS2 lobby size');
  if (new Set(players.map(p => p.playerId)).size !== players.length
      || players.some(p => !p.playerId)) throw new Error('Duplicate or missing FACEIT player ID');
  const distributions = new Map<RatingMetric, {mean: number; std: number}>();
  for (const key of keys) {
    const values = players.filter(p => key !== 'openingDuelWinPercent'
      || p.openingDuels == null || p.openingDuels >= 3)
      .map(p => p.metrics[key]).filter((v): v is number => valid(key,v));
    if (values.length < 6) continue;
    const mean = values.reduce((a,b)=>a+b,0) / values.length;
    const variance = values.reduce((sum,v)=>sum+(v-mean)**2,0) / values.length;
    const floor = {adr:12,kastPercent:6,openingDuelWinPercent:10,kd:.18}[key];
    distributions.set(key,{mean,std:Math.max(Math.sqrt(variance),floor)});
  }
  return players.map(player => {
    const usedMetrics: RatingMetric[] = [];
    let weighted = 0, weightSum = 0;
    for (const key of keys) {
      const value = player.metrics[key], dist = distributions.get(key);
      if (!dist || !valid(key,value) || (key === 'openingDuelWinPercent'
        && player.openingDuels != null && player.openingDuels < 3)) continue;
      const weight = NEXUS_MATCH_WEIGHTS[key];
      weighted += weight * clamp((value-dist.mean)/dist.std,-2.5,2.5);
      weightSum += weight;
      usedMetrics.push(key);
    }
    const eligible = players.length >= 6 && usedMetrics.length >= 2 && weightSum >= .25;
    const rating = eligible ? round(clamp(1 + .24 * weighted / weightSum,.5,1.5)) : null;
    return {playerId:player.playerId,rating,usedMetrics,coverage:round(weightSum),
      referencePlayers:players.length,confidence:rating===null?'unavailable' as const:
      usedMetrics.length>=3&&weightSum>=.7?'provisional' as const:'limited' as const,
      model:NEXUS_MATCH_RATING_MODEL};
  });
}
export type NEXUSArchiveObservation={matchId:string;mapIndex:number;rating:number|null};
export function summarizeNexusArchivePlayer(observations:NEXUSArchiveObservation[]) {
  const seen=new Set<string>();
  const unique=observations.filter(o=>{const key=o.matchId+':'+o.mapIndex;
    if(seen.has(key))return false;seen.add(key);return true;});
  const values=unique.map(o=>o.rating).filter((v):v is number=>
    typeof v==='number'&&Number.isFinite(v)&&v>=.5&&v<=1.5);
  if(!values.length)return{rating:null,observedMaps:unique.length,ratedMaps:0,
    confidence:'unavailable' as const,model:NEXUS_MATCH_RATING_MODEL};
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const rating=round(1+(mean-1)*values.length/(values.length+8));
  return{rating,observedMaps:unique.length,ratedMaps:values.length,
    confidence:values.length>=15?'provisional' as const:'limited' as const,model:NEXUS_MATCH_RATING_MODEL};
}
