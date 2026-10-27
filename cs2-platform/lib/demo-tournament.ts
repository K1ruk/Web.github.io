import { summarizeFirstTournamentBaseline, type BaselineMapStat } from './first-tournament-baseline.ts';

export const DEMO_COUNTS = [10,20,40] as const;
export const DEMO_MAX_PLAYERS = 40;
export const DEMO_ROLES = ['IGL','AWPer','Entry Fragger','Rifler','Support','Lurker'] as const;

export type ClubDemoPlayer = {
  /** An isolated fixture identifier. It is NEVER a registrations.id. */
  id: string;
  faceitPlayerId: string;
  nickname: string;
  primary_role: string;
  secondary_role: string;
  sample: ReturnType<typeof summarizeFirstTournamentBaseline>;
};
export type ClubDemoMap = BaselineMapStat & { faceit_player_id:string };
export type ClubDemoIdentity = {faceit_player_id:string;nickname:string};

/**
 * Convert archived FACEIT player *statistics* to an admin-only simulator.
 * Nothing here asserts that these people registered, connected Discord,
 * selected preferred roles, paid, or were approved for a real tournament.
 */
export function buildClubDemoCandidates(
  identities: ClubDemoIdentity[],
  maps: ClubDemoMap[],
): ClubDemoPlayer[] {
  const grouped = new Map<string, ClubDemoMap[]>();
  for (const map of maps) {
    if (!map.faceit_player_id) continue;
    const list=grouped.get(map.faceit_player_id)||[];
    list.push(map);
    grouped.set(map.faceit_player_id,list);
  }
  const used=new Set<string>();
  const rows=identities.filter(player => {
    if (!player.faceit_player_id || used.has(player.faceit_player_id)
      || !grouped.has(player.faceit_player_id)) return false;
    used.add(player.faceit_player_id);
    return true;
  }).map(p => ({
    faceitPlayerId:p.faceit_player_id,
    nickname:p.nickname.slice(0,80),
    sample:summarizeFirstTournamentBaseline(grouped.get(p.faceit_player_id)||[]),
  }));
  // Show likely participants with sufficient archived history first, but
  // never invent Elo, KAST, real registrations or approved tiers.
  rows.sort((a,b)=> b.sample.maps-a.sample.maps
    || a.nickname.localeCompare(b.nickname)
    || a.faceitPlayerId.localeCompare(b.faceitPlayerId));
  return rows.slice(0,DEMO_MAX_PLAYERS).map((p,i)=>({
    ...p,
    id:'demo-'+p.faceitPlayerId,
    // Preferences are simulated fixtures for previewing team roles.
    primary_role:DEMO_ROLES[i%DEMO_ROLES.length],
    secondary_role:DEMO_ROLES[(i+3)%DEMO_ROLES.length],
  }));
}

export type DemoApproval = {tier:number;score:number};
export function exampleDemoApprovals(
  players: ClubDemoPlayer[],
):Record<string,DemoApproval> {
  const result:Record<string,DemoApproval>={};
  players.forEach((player,i)=>{
    // Deliberately synthetic, rotating tiers, unrelated to FACEIT stats.
    // No one is assessed or labelled in any real NEXUS record.
    const tier=1+(i%5);
    result[player.id]={tier,score:Math.min(100,105-tier*15)};
  });
  return result;
}
