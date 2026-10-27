'use client';

import { TEAM_ROLES, swapRosterPlayers, type TeamRole, type RosterDraft, type RosterSlot } from '@/lib/roster-draft';
export { isRosterDraft } from '@/lib/roster-draft';
export type { RosterDraft } from '@/lib/roster-draft';

type RosterPlayer={
  id:string;
  nickname:string;
  status:string;
  primary_role:string;
  secondary_role:string;
  assigned_tier:number|null;
  internal_score:number|null;
};

export function TeamRosterEditor({
  rosters,players,onChange,
}:{
  rosters:RosterDraft;
  players:RosterPlayer[];
  onChange:(rosters:RosterDraft)=>void;
}){
  const pool=players.filter(p=>p.status==='paid');
  const byId=new Map(pool.map(p=>[p.id,p]));
  const used=rosters.flat().map(slot=>slot.registration_id);
  const unique=new Set(used);
  const valid=unique.size===used.length
    &&pool.length===used.length
    &&pool.every(p=>unique.has(p.id))
    &&used.every(id=>byId.has(id));
  const score=(slot:RosterSlot)=>Number(byId.get(slot.registration_id)?.internal_score??0);
  function movePlayer(teamIndex:number,slotIndex:number,targetId:string) {
    try{onChange(swapRosterPlayers(rosters,teamIndex,slotIndex,targetId));}
    catch{/* The admin can regenerate from the server if the roster changed. */}
  }
  function updateRole(teamIndex:number,slotIndex:number,role:TeamRole) {
    onChange(rosters.map((team,i)=>team.map((slot,j)=>
      i===teamIndex&&j===slotIndex?{...slot,assigned_role:role}:slot)));
  }

  return <section className="admin-roster-preview" aria-label="Admin team roster editor">
    <div className="row-space">
      <div>
        <div className="section-kicker">ADMIN / REVIEW EACH FIVE-PLAYER TEAM</div>
        <p className="small-text">
          The generator proposes balanced teams. Swap participants or change their
          assigned roles before publishing. Each confirmed player must appear exactly once.
        </p>
      </div>
      <span className={'pill'+(valid?' orange':'')}>
        {valid?'VALID ROSTER':'ROSTER REQUIRES REVIEW'}
      </span>
    </div>
    <div className="admin-roster-grid">
      {rosters.map((team,index)=>{
        const sum=team.reduce((total,slot)=>total+score(slot),0);
        return <article className="admin-roster-card" key={index}>
          <div className="row-space">
            <strong>SQUAD {String(index+1).padStart(2,'0')}</strong>
            <span className="pill">AVERAGE {Math.round(sum/5*10)/10}</span>
          </div>
          {team.map((slot,j)=>{
            const current=byId.get(slot.registration_id);
            return <div className="admin-roster-slot" key={j}>
              <label className="field-label" htmlFor={'roster-player-'+index+'-'+j}>PLAYER {j+1}</label>
              <select className="field" id={'roster-player-'+index+'-'+j}
                value={slot.registration_id}
                onChange={event=>movePlayer(index,j,event.target.value)}>
                {pool.map(p=><option value={p.id} key={p.id}>
                  {p.nickname} · T{p.assigned_tier??'?'} · {Number(p.internal_score??0).toFixed(1)}
                </option>)}
              </select>
              <label className="field-label" htmlFor={'roster-role-'+index+'-'+j}>ROLE</label>
              <select className="field" id={'roster-role-'+index+'-'+j}
                value={slot.assigned_role}
                onChange={event=>updateRole(index,j,event.target.value as TeamRole)}>
                {TEAM_ROLES.map(role=><option key={role} value={role}>
                  {role}{role===current?.primary_role?' · PRIMARY':role===current?.secondary_role?' · SECONDARY':''}
                </option>)}
              </select>
            </div>;
          })}
        </article>;
      })}
    </div>
    {!valid&&<p className="admin-skill-warning" role="alert">
      Regenerate the draft: its members no longer match the set of confirmed tournament registrations.
    </p>}
  </section>;
}
