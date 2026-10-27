/**
 * A player sees a TEAM only after the tournament is officially published.
 * Never infer registration/tier/roster state from Club FACEIT statistics.
 */
export type TournamentStage='no-entry'|'unconfirmed'|'awaiting-tier'|'tier-approved'|'roster';
export type TournamentStageInput={
 registrationStatus:string;
 eventStatus:string;
 tier:number|null;
 teamName:string|null;
};
export function getTournamentStage(snapshot:TournamentStageInput|null):TournamentStage{
 if(!snapshot)return 'no-entry';
 if(snapshot.registrationStatus!=='paid')return 'unconfirmed';
 if(snapshot.teamName && ['published','finished'].includes(snapshot.eventStatus))
   return 'roster';
 if(snapshot.tier!==null)return 'tier-approved';
 return 'awaiting-tier';
}
export function rosterMayBeShown(snapshot:TournamentStageInput|null):boolean{
 return getTournamentStage(snapshot)==='roster';
}
