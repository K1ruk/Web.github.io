'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
import {
  DEMO_COUNTS, exampleDemoApprovals,
  type ClubDemoPlayer, type DemoApproval,
} from '@/lib/demo-tournament';
import { isRosterDraft, rosterIncludesExactly, type RosterDraft } from '@/lib/roster-draft';
import { TeamRosterEditor } from '../TeamRosterEditor';

type Props={
  candidates:ClubDemoPlayer[];
  archivePlayers:number;
  archiveMaps:number;
};
const shown=(n:number|null|undefined,d=2,suffix='')=>
  typeof n==='number'&&Number.isFinite(n)?n.toFixed(d)+suffix:'—';

export function DemoTournamentClient({candidates,archivePlayers,archiveMaps}:Props) {
  const {locale}=useLocale();
  const mn=locale==='mn';
  const initialCount = candidates.length>=20?20:candidates.length>=10?10:0;
  const [count,setCount]=useState(initialCount);
  const [approvals,setApprovals]=useState<Record<string,DemoApproval>>({});
  const [selectedId,setSelectedId]=useState(candidates[0]?.id||'');
  const [manualTier,setManualTier]=useState('3');
  const [manualScore,setManualScore]=useState('60');
  const [rosters,setRosters]=useState<RosterDraft|null>(null);
  const [published,setPublished]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [error,setError]=useState('');

  const players=useMemo(()=>candidates.slice(0,count),[candidates,count]);
  const approved=players.filter(p=>approvals[p.id]!==undefined).length;
  const selected=players.find(p=>p.id===selectedId)||players[0]||null;
  const ready=players.length>=10 && players.length%5===0
    &&approved===players.length;
  const previewReady=rosters!==null
    &&rosterIncludesExactly(rosters,players.map(p=>p.id));
  const rosterPlayers=players.map(p=>({
    id:p.id,nickname:p.nickname,
    status:'paid', // TeamRosterEditor expects confirmed participant status.
    primary_role:p.primary_role,
    secondary_role:p.secondary_role,
    assigned_tier:approvals[p.id]?.tier??null,
    internal_score:approvals[p.id]?.score??null,
  }));

  function pickPlayer(p:ClubDemoPlayer) {
    setSelectedId(p.id);
    setManualTier(String(approvals[p.id]?.tier??3));
    setManualScore(String(approvals[p.id]?.score??60));
    setError('');
  }
  function invalidateRosters() {
    setRosters(null);setPublished(false);setFeedback('');
  }
  function changeCount(next:number){
    if(!DEMO_COUNTS.includes(next as typeof DEMO_COUNTS[number])||next>candidates.length)return;
    setCount(next);
    setApprovals({});
    setSelectedId(candidates[0]?.id||'');
    setManualTier('3');setManualScore('60');
    invalidateRosters();setError('');
  }
  function saveManual(){
    if(!selected)return;
    const tier=Number(manualTier),score=Number(manualScore);
    if(!Number.isSafeInteger(tier)||tier<1||tier>5||!Number.isFinite(score)
      ||score<0||score>100){
      setError('Choose a mock tier from 1 to 5 and a balancing score from 0 to 100.');
      return;
    }
    setApprovals(current=>({...current,[selected.id]:{tier,score}}));
    invalidateRosters();
    setError('');
    setFeedback('Example Tier '+tier+' assigned to '+selected.nickname+' in the browser-only simulation.');
  }
  function fillExamples(){
    setApprovals(exampleDemoApprovals(players));
    invalidateRosters();
    setError('');
    setFeedback('Example tiers and scores filled for preview. These are invented values, NOT assessments of the real FACEIT players.');
    if(selected){
      const idx=players.findIndex(p=>p.id===selected.id);
      const tier=1+idx%5;
      setManualTier(String(tier));
      setManualScore(String(Math.min(100,105-tier*15)));
    }
  }
  function clearExamples(){
    setApprovals({});
    invalidateRosters();
    setManualTier('3');setManualScore('60');
    setFeedback('Example tier approvals cleared.');
    setError('');
  }

  async function generateTeams() {
    if(!ready||busy)return;
    setBusy(true);setError('');setFeedback('');
    try{
      const response=await fetch('/api/admin/demo-tournament/teams',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        cache:'no-store',
        body:JSON.stringify({players:players.map(p=>({
          id:p.id,
          score:approvals[p.id].score,
          primaryRole:p.primary_role,
          secondaryRole:p.secondary_role,
        }))}),
      });
      const data=await response.json().catch(()=>null) as
        {teams?:unknown;demo?:boolean;preview?:boolean;persisted?:boolean;error?:string}|null;
      if(!response.ok||!data||data.demo!==true||data.preview!==true
        ||data.persisted!==false ||!isRosterDraft(data.teams)
        ||!rosterIncludesExactly(data.teams,players.map(p=>p.id))){
        throw new Error(data?.error||'Simulator returned an invalid roster. No teams were stored.');
      }
      setRosters(data.teams);
      setPublished(false);
      setFeedback('Four-step tournament simulation: example entrants, example tier approvals, proposed teams, and optional public-style roster preview. Nothing was saved.');
    }catch(e){
      setError(e instanceof Error?e.message:'Demo team generation failed');
    }finally{setBusy(false);}
  }

  return <main className="content-page nx-demo-page">
    <div className="row-space nx-demo-top">
      <div>
        <div className="section-kicker">NEXUS / ADMIN / FIRST TOURNAMENT SANDBOX</div>
        <h1 className="page-heading">TOURNAMENT<span className="nx-demo-accent"> SIMULATOR.</span></h1>
      </div>
      <Link className="outline-button" href="/admin">BACK TO REAL ADMIN</Link>
    </div>
    <div className="nx-demo-warning" role="note">
      <strong>PREVIEW ONLY — NO REAL PARTICIPANTS</strong>
      <p>Nicknames and Club statistics come from your saved FACEIT archive. Registration status, preferred roles, Tier 1–5 and balancing scores here are <b>simulated</b>. No Discord/Steam connections, payment, verified registration, tier approval, team assignment or official result is created or changed.</p>
    </div>

    <div className="nx-demo-metrics" aria-label="Tournament simulation statistics">
      <div><span>FAKE ENTRIES</span><strong>{players.length}</strong><small>from {archivePlayers} saved Club players</small></div>
      <div><span>SIMULATED TIER APPROVALS</span><strong>{approved}<em> / {players.length}</em></strong><small>Nothing approved in the database</small></div>
      <div><span>TEAMS</span><strong>{rosters?rosters.length:0}</strong><small>{rosters?'Editable demo rosters':'Awaiting mock tiers'}</small></div>
      <div><span>REAL CLUB MAP STAT ROWS</span><strong>{archiveMaps.toLocaleString()}</strong><small>Evidence only, not tournament games</small></div>
    </div>

    <section className="panel nx-demo-panel">
      <div className="row-space">
        <div>
          <div className="section-kicker">01 / SIMULATED REGISTRATION</div>
          <h2>{mn?'Демо тоглогчид':'Club players as demo entrants'}</h2>
          <p className="small-text">Choose the number of imaginary entrants. The nicknames and individual Club stats are genuine archive records; nobody has registered for this mock event.</p>
        </div>
        <div className="row-wrap">
          {DEMO_COUNTS.map(n=><button key={n} className={'outline-button small'+(count===n?' nx-demo-active':'')}
            type="button" disabled={busy||candidates.length<n}
            aria-pressed={count===n} onClick={()=>changeCount(n)}>{n} PLAYERS</button>)}
        </div>
      </div>
      {players.length===0?<div className="nx-demo-empty">
        No Club sample is large enough for a ten-player tournament. Import verified matches before creating a demo.
      </div>:<div className="table-wrap nx-demo-entries">
        <table className="data-table">
          <thead><tr>
            <th>PLAYER / FACEIT</th><th>ENTRY</th><th>ROLE (FAKE)</th>
            <th>REAL MAPS</th><th>REAL ADR</th><th>REAL K/D</th>
            <th>NEXUS</th><th>TIER (FAKE)</th><th>REVIEW</th>
          </tr></thead>
          <tbody>{players.map(p=><tr key={p.id} className={selected?.id===p.id?'nx-demo-selected':''}>
            <td><strong>{p.nickname}</strong><small>Club archive player</small></td>
            <td><span className="nx-demo-pending">DEMO ENTRY</span></td>
            <td>{p.primary_role}</td>
            <td>{p.sample.maps}</td><td>{shown(p.sample.adr,1)}</td>
            <td>{shown(p.sample.kd)}</td><td>{shown(p.sample.nexusMatchRating)}</td>
            <td>{approvals[p.id]? 'TIER '+approvals[p.id].tier : 'PENDING'}</td>
            <td><button type="button" className="outline-button small"
              onClick={()=>pickPlayer(p)}>REVIEW</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {selected&&<section className="panel nx-demo-panel">
      <div className="section-kicker">02 / BASELINE + MANUAL TIER</div>
      <h2>{selected.nickname}</h2>
      <p className="small-text">Real historical match values from the archived Club queue. Sample role preferences are invented. Tier and internal balancing score are chosen only for this example.</p>
      <div className="nx-demo-review">
        <div className="nx-demo-stat-grid">
          <div><small>CLUB MATCHES</small><strong>{selected.sample.uniqueMatches}</strong></div>
          <div><small>MAPS SAMPLED</small><strong>{selected.sample.maps}</strong></div>
          <div><small>ADR</small><strong>{shown(selected.sample.adr,1)}</strong></div>
          <div><small>K/D</small><strong>{shown(selected.sample.kd)}</strong></div>
          <div><small>ENTRY SUCCESS</small><strong>{shown(selected.sample.entryWinPercent,1,'%')}</strong>
            <small>{selected.sample.entryWins} / {selected.sample.entryAttempts} attempts</small></div>
          <div><small>NEXUS LOBBY RATING</small><strong>{shown(selected.sample.nexusMatchRating)}</strong>
            <small>{selected.sample.ratedMaps} rated maps</small></div>
          <div><small>KAST</small><strong>—</strong><small>No verified demo data</small></div>
          <div><small>CONFIDENCE</small><strong>{selected.sample.ratingConfidence.toUpperCase()}</strong></div>
        </div>
        <div className="nx-demo-tier-controls">
          <div className="section-kicker">YOUR SIMULATED ADMIN DECISION</div>
          <div className="form-row">
            <label className="field-label" htmlFor="demo-tier">TIER (1–5)</label>
            <select className="field" id="demo-tier" value={manualTier}
              onChange={e=>setManualTier(e.target.value)}>
              {[1,2,3,4,5].map(t=><option key={t} value={t}>TIER {t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="field-label" htmlFor="demo-score">BALANCING SCORE (0–100)</label>
            <input className="field" id="demo-score" type="number" value={manualScore}
              min={0} max={100} step="0.5" onChange={e=>setManualScore(e.target.value)}/>
          </div>
          <button type="button" className="outline-button"
            onClick={saveManual}>APPROVE TIER — DEMO ONLY</button>
          <p className="small-text">No real tier assignment or FACEIT account permission is changed.</p>
        </div>
      </div>
      <div className="nx-demo-quickfill">
        <button type="button" className="outline-button" onClick={fillExamples}>
          AUTO-FILL EXAMPLE TIERS FOR EVERY DEMO PLAYER
        </button>
        <button type="button" className="outline-button" onClick={clearExamples}>
          CLEAR FAKE APPROVALS
        </button>
        <p className="small-text">Auto-fill assigns arbitrary rotating example tiers, not data-driven player rankings. Use it to preview teams without manually reviewing all {players.length} names.</p>
      </div>
    </section>}

    <section className="panel nx-demo-panel">
      <div className="row-space">
        <div>
          <div className="section-kicker">03 / TEAM BALANCER — SIMULATION</div>
          <h2>Five-player rosters</h2>
          <p className="small-text">Uses the actual NEXUS role-aware team balancing algorithm. The only scores used here are your temporary mock approvals.</p>
        </div>
        <button className="outline-button" type="button"
          disabled={!ready||busy} onClick={()=>void generateTeams()}>
          {busy?'BALANCING...':'GENERATE DEMO TEAMS'}
        </button>
      </div>
      {!ready&&<p className="nx-demo-hint">Approve {players.length-approved} more fake tiers, or use AUTO-FILL EXAMPLE TIERS, before generating teams.</p>}
      {rosters&&<TeamRosterEditor
        rosters={rosters}
        players={rosterPlayers}
        onChange={draft=>{setRosters(draft);setPublished(false);}}
      />}
      {rosters&&<div className="nx-demo-quickfill">
        <button type="button" className="outline-button" disabled={!previewReady}
          onClick={()=>setPublished(true)}>SHOW PUBLIC-STYLE TEAM PREVIEW (NO SAVE)</button>
        <button type="button" className="outline-button"
          onClick={()=>{setRosters(null);setPublished(false);}}>RESET TEAM DRAFT</button>
      </div>}
    </section>

    {published&&rosters&&previewReady&&<section className="panel nx-demo-panel" aria-label="Simulated published squads">
      <div className="section-kicker">04 / WHAT PLAYERS WOULD SEE — DEMO ONLY</div>
      <h2>Squads revealed</h2>
      <p className="small-text">This is a visual example of published teams. It is not visible to real registrants and no team was published.</p>
      <div className="nx-demo-public-grid">
        {rosters.map((team,i)=><article key={i} className="nx-demo-public-team">
          <small>NEXUS / SIMULATED SQUAD</small>
          <h3>SQUAD {String(i+1).padStart(2,'0')}</h3>
          {team.map(slot=>{
            const person=players.find(p=>p.id===slot.registration_id);
            return <div key={slot.registration_id} className="nx-demo-public-slot">
              <strong>{person?.nickname||'Unknown'}</strong>
              <span>{slot.assigned_role}</span>
              <small>T{approvals[slot.registration_id]?.tier??'?'}</small>
            </div>;
          })}
        </article>)}
      </div>
    </section>}

    {(feedback||error)&&<p className={'nx-demo-feedback'+(error?' has-error':'')}
      role={error?'alert':'status'}>{error||feedback}</p>}
    <p className="nx-demo-footer">ALL ACTIONS ON THIS PAGE ARE ISOLATED SIMULATION. NO TOURNAMENTS, REGISTRATIONS, PLAYER TIER DECISIONS, STEAM LINKS, PAYMENTS OR TEAM RECORDS ARE SAVED.</p>
  </main>;
}
