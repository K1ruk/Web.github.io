export const TEAM_ROLES = ['AWPer','IGL','Entry Fragger','Rifler','Support','Lurker'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export type RosterSlot = {registration_id:string;assigned_role:TeamRole};
export type RosterDraft = RosterSlot[][];

export function isRosterDraft(value:unknown):value is RosterDraft {
  const valid=Array.isArray(value) && value.length>0 && value.length<=40
    && value.every(team=>Array.isArray(team) && team.length===5
      && team.every(slot=>slot && typeof slot==='object'
        && typeof slot.registration_id==='string' && slot.registration_id.length>0
        && typeof slot.assigned_role==='string'
        && (TEAM_ROLES as readonly string[]).includes(slot.assigned_role)));
  if (!valid) return false;
  const ids=(value as RosterDraft).flat().map(slot=>slot.registration_id);
  return ids.length===new Set(ids).size;
}

/** Swap two roster occupants without adding/removing players. */
export function swapRosterPlayers(
  teams:RosterDraft, teamIndex:number,slotIndex:number,targetId:string,
):RosterDraft {
  const source=teams[teamIndex]?.[slotIndex];
  if(!source)throw new Error('Invalid source roster slot');
  if(source.registration_id===targetId)return teams;
  const updated=teams.map(team=>team.map(slot=>({...slot})));
  const oldId=source.registration_id;
  let found=false;
  for(let i=0;i<updated.length;i++){
    for(let j=0;j<updated[i].length;j++){
      if(updated[i][j].registration_id===targetId){
        updated[i][j].registration_id=oldId;
        found=true;
        break;
      }
    }
    if(found)break;
  }
  if(!found)throw new Error('Selected player is not in the registered roster');
  updated[teamIndex][slotIndex].registration_id=targetId;
  return updated;
}


/** UI preflight only: the database still verifies membership and payment. */
export function rosterIncludesExactly(
  rosters:unknown, confirmedIds:string[],
):boolean {
  if(!isRosterDraft(rosters))return false;
  const expected=new Set(confirmedIds);
  const rosterIds=rosters.flat().map(slot=>slot.registration_id);
  return expected.size===confirmedIds.length
    &&rosterIds.length===confirmedIds.length
    &&rosterIds.every(id=>expected.has(id));
}
