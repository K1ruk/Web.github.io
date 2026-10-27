'use client';
import {FormEvent,useState} from 'react';import {useRouter} from 'next/navigation';import Link from 'next/link';import {FaceitStatsPanel} from '@/components/FaceitStatsPanel';import type {FaceitMetrics,MetricName} from '@/lib/faceit-metrics';import type {SkillArea} from '@/lib/skill';import {useLocale} from '@/components/LocaleProvider';
type Tournament={id:string;name:string;status:string;capacity:number;fee_cents:number;currency:string};
type Team={id:string;name:string;tournament_id:string};
type Match={id:string;tournament_id:string;team_a:string;team_b:string;stage:string;status:string;best_of:number;scheduled_at:string|null;score_a:number|null;score_b:number|null};
type Registration={id:string;tournament_id:string;user_id:string;nickname:string;status:string;assigned_tier:number|null;internal_score:number|null;primary_role:string;secondary_role:string;assessmentStatus:'approved'|'unchecked'|'review'|'suggested';suggestedTier:number|null};
type RegistrationBaseline = {
  registrationId: string;
  faceitPlayerId: string | null;
  faceitNickname: string | null;
  identitySource: string;
  reviewState: 'archive_available' | 'no_club_history' | 'steam_verified_no_faceit';
  note: string;
  baseline: {
    uniqueMatches: number;
    maps: number;
    ratedMaps: number;
    nexusMatchRating: number | null;
    ratingConfidence: string;
    adr: number | null;
    kd: number | null;
    entryWinPercent: number | null;
    entryWins: number;
    entryAttempts: number;
    entrySampleMaps: number;
    kastPercent: null;
  } | null;
};
const baselineLabel = (value: number | null | undefined, decimals = 2, suffix = '') =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(decimals) + suffix : 'UNAVAILABLE';

async function api(method:'POST'|'PATCH',path:string,body:unknown){const res=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed');return data;}
export function AdminClient({tournaments,registrations,teams,matches}:{tournaments:Tournament[];registrations:Registration[];teams:Team[];matches:Match[]}){
 const {locale}=useLocale(),mn=locale==='mn',router=useRouter();
 const [lookupUrl,setLookupUrl]=useState('');const [lookupResult,setLookupResult]=useState<unknown>(null);const [selected,setSelected]=useState(tournaments[0]?.id||''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[analysis,setAnalysis]=useState<{found?:boolean;elo?:number;protectedElo?:number;historicalPeakElo?:number|null;score?:number;tier?:number;confidence?:string;reason?:string;recentKd?:number|null;lifetimeKd?:number|null;lifetimeMatches?:number|null;reviewFlags?:string[];reviewRequired?:boolean;model?:string;recentMetrics?:Partial<FaceitMetrics>|null;lifetimeMetrics?:Partial<FaceitMetrics>|null;recentMetricSamples?:Partial<Record<MetricName,number>>|null;performanceAreas?:Partial<Record<SkillArea,number>>|null;performanceSource?:string}|null>(null),[activeReg,setActiveReg]=useState(''),[tier,setTier]=useState('3'),[score,setScore]=useState('50'),[note,setNote]=useState(''),[preview,setPreview]=useState<unknown>(null);
 const [clubBaseline,setClubBaseline]=useState<RegistrationBaseline|null>(null);
 const [baselineLoading,setBaselineLoading]=useState(false);
 const [baselineError,setBaselineError]=useState('');
 const event=tournaments.find(t=>t.id===selected),players=registrations.filter(r=>r.tournament_id===selected);const eventTeams=teams.filter(t=>t.tournament_id===selected),eventMatches=matches.filter(m=>m.tournament_id===selected);
 async function run(task:()=>Promise<unknown>){setBusy(true);setMessage('');try{const result=await task();setMessage(typeof result==='string'?result:(mn?'Амжилттай.':'Action completed.'));router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function createEvent(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);const capacity=Number(fd.get('capacity')),feeCents=Math.round(Number(fd.get('fee'))*100);await run(async()=>{await api('POST','/api/admin/tournaments',{name:fd.get('name'),slug:fd.get('slug'),capacity,feeCents,currency:fd.get('currency')});return 'Tournament created. Refresh to select it.';});}
 async function lookup(){await run(async()=>{const result=await api('POST','/api/admin/lookup',{url:lookupUrl});setLookupResult(result);return 'Steam URL analyzed. Identity ownership is NOT verified by URL lookup.';});}
 async function analyze(id:string){setActiveReg(id);setAnalysis(null);setNote('');await run(async()=>{const r=await api('POST','/api/admin/analyze',{registrationId:id});setAnalysis(r);if(r.found){setTier(String(r.tier));setScore(String(r.score));}return r.found?'FACEIT analysis loaded. Verify evidence before approval.':r.reason;});}
 async function reviewStored(id:string){
  setActiveReg(id);setAnalysis(null);setNote('');
  await run(async()=>{
    const response=await fetch('/api/admin/analyze?registrationId='+encodeURIComponent(id),{
      method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},
    });
    const saved=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(saved?.error||'Could not load saved FACEIT assessment');
    setAnalysis(saved);
    if(saved.found && saved.tier!=null && saved.score!=null){
      setTier(String(saved.tier));
      setScore(String(saved.score));
    }
    return saved.found
      ? 'Saved FACEIT evidence loaded without another API call. Review and approve the proposed rating.'
      : 'No FACEIT ranking was available. Review this player manually and document your decision.';
  });
}
 async function analyzeBatch(){
  if(!selected)return;
  await run(async()=>{
    const batch=await api('POST','/api/admin/analyze-batch',{tournamentId:selected}) as {
      scanned:number;found:number;needsReview:number;remaining:number;skipped:number;failed:number;rateLimited:boolean;message:string;
    };
    return (mn?'FACEIT шалгасан':'FACEIT checked')+': '+batch.scanned+
      ' · '+(mn?'Хянах':'Review')+': '+batch.needsReview+
      ' · '+(mn?'Үлдсэн':'Remaining')+': '+batch.remaining+
      (batch.failed?' · Failed: '+batch.failed:'')+
      (batch.rateLimited?' · FACEIT rate limit reached':'');
  });
}
 async function reviewClubBaseline(id:string){
  setActiveReg(id);
  setClubBaseline(null);
  setBaselineError('');
  setBaselineLoading(true);
  try {
    const response=await fetch('/api/admin/club-baseline?registrationId='+encodeURIComponent(id),{
      credentials:'same-origin',
      headers:{Accept:'application/json'},
      cache:'no-store',
    });
    const data=await response.json().catch(()=>null) as (RegistrationBaseline&{error?:string})|null;
    if(!response.ok||!data)throw new Error(data?.error||'Unable to load Club baseline');
    setClubBaseline(data);
  } catch(error){
    setBaselineError(error instanceof Error?error.message:'Club baseline unavailable');
  } finally {setBaselineLoading(false);}
 }
 async function approval(){setPreview(null);await run(async()=>{await api('POST','/api/admin/approve',{registrationId:activeReg,tier:Number(tier),score:Number(score),note});return 'Player tier approved';});}
 async function generate(publish:boolean){if(publish&&!confirm('Publish teams permanently? This cannot be automatically undone.'))return;await run(async()=>{const exact=preview&&typeof preview==='object'&&'teams' in preview?(preview as {teams:unknown}).teams:null;if(publish&&!exact)throw new Error('Preview rosters before publishing');const r=await api('POST','/api/admin/generate',{tournamentId:selected,publish,rosters:publish?exact:undefined});setPreview(r);return publish?'Teams published':'Balanced draft generated. Review before publishing.';});}
 async function scheduleMatch(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);await run(async()=>{await api('POST','/api/admin/matches',{tournamentId:selected,teamA:fd.get('teamA'),teamB:fd.get('teamB'),scheduledAt:new Date(String(fd.get('scheduledAt'))).toISOString(),stage:fd.get('stage'),bestOf:Number(fd.get('bestOf'))});return 'Match scheduled';});}
async function saveResult(matchId:string,e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);await run(async()=>{await api('PATCH','/api/admin/matches',{matchId,scoreA:Number(fd.get('scoreA')),scoreB:Number(fd.get('scoreB'))});return 'Match result saved';});}
 return <main className="content-page"><div className="section-kicker">ADMIN / ACCESS VERIFIED</div><h1 className="page-heading">{mn?'УДИРДЛАГА':'CONTROL'}</h1><p className="lead">{mn?'Тэмцээн, тоглогчдын зэрэглэл болон баг бүрдүүлэлтийг удирдах хэсэг.':'Tournament operations. Rankings, paid entries and team generation.'}</p><div className="row-wrap">
  <Link className="lab-admin-shortcut" href="/admin/skill-lab">{mn?'FACEIT ШИНЖИЛГЭЭНИЙ ЛАБ':'OPEN FACEIT SKILL LAB'} <span aria-hidden="true">↗</span></Link>
  <Link className="lab-admin-shortcut" href="/admin/faceit-club">{mn?'МИНИЙ FACEIT КЛУБ':'FACEIT CLUB / MATCH STATS'} <span aria-hidden="true">↗</span></Link>
</div><div className="admin-area margin-top">
 <section className="panel"><div className="section-kicker">01 / TOURNAMENTS</div><div className="form-row margin-top"><label className="field-label">SELECT EVENT</label><select className="field" value={selected} onChange={e=>{setSelected(e.target.value);setPreview(null)}}><option value="">SELECT</option>{tournaments.map(t=><option key={t.id} value={t.id}>{t.name} / {t.status}</option>)}</select></div>{event&&<><p className="small-text">STATUS: <b>{event.status.toUpperCase()}</b> · CAPACITY: {event.capacity} · ENTRY: {(event.fee_cents/100).toFixed(2)} {event.currency.toUpperCase()}</p><div className="row-wrap">{event.status==='draft'&&<button className="outline-button" disabled={busy} onClick={()=>run(()=>api('PATCH','/api/admin/tournaments',{tournamentId:selected,status:'open'}))}>OPEN REGISTRATION</button>}{event.status==='open'&&<button className="outline-button" disabled={busy} onClick={()=>run(()=>api('PATCH','/api/admin/tournaments',{tournamentId:selected,status:'locked'}))}>LOCK REGISTRATION</button>}</div></>}</section>
 <section className="panel"><div className="section-kicker">02 / CREATE EVENT</div><form className="margin-top" onSubmit={createEvent}><div className="two-col"><div className="form-row"><label className="field-label">NAME</label><input className="field" name="name" required minLength={3} maxLength={100}/></div><div className="form-row"><label className="field-label">SLUG</label><input className="field" name="slug" required pattern="[a-z0-9-]{3,60}" placeholder="solo-circuit-01"/></div><div className="form-row"><label className="field-label">ENTRY FEE</label><input className="field" name="fee" type="number" min="0" max="10000" step=".01" defaultValue="0" required/><small className="small-text">0 = free event (no Stripe). Paid tournaments continue through Stripe.</small></div><div className="form-row"><label className="field-label">CAPACITY (MULTIPLE OF 5)</label><input className="field" name="capacity" type="number" min="5" max="1000" step="5" defaultValue="50" required/></div></div><div className="form-row"><label className="field-label">CURRENCY</label><select className="field" name="currency"><option value="eur">EUR</option><option value="sek">SEK</option><option value="usd">USD</option></select></div><button type="submit" className="outline-button" disabled={busy}>CREATE DRAFT EVENT</button></form></section>
 <section className="panel admin-wide"><div className="section-kicker">03 / STEAM URL ANALYZER</div><p className="small-text">Enter a Steam profile URL to retrieve available FACEIT data. URL lookup does not verify ownership; only Steam OpenID linking does.</p><div className="row-wrap"><input className="field" style={{flex:'1 1 350px'}} type="url" placeholder="https://steamcommunity.com/id/player" value={lookupUrl} onChange={e=>setLookupUrl(e.target.value)}/><button className="outline-button" disabled={busy||!lookupUrl} onClick={lookup}>ANALYZE URL</button></div>{lookupResult!==null&&<pre className="small-text table-wrap margin-top">{JSON.stringify(lookupResult,null,2)}</pre>}</section><section className="panel admin-wide"><div className="row-space admin-skill-actions">
  <div>
    <div className="section-kicker">04 / PLAYERS</div>
    <h2>ENTRIES / {players.length}</h2>
    <p className="small-text">{mn?'Нэг серверийн FACEIT түлхүүрээр төлбөр баталгаажсан тоглогчдыг гурваар нь шинжилнэ.':'Optionally scan up to three confirmed, unapproved players at a time using the single private NEXUS FACEIT key. Ratings remain pending admin approval.'}</p>
  </div>
  <div className="admin-batch-buttons">
    <span className="pill">CONFIRMED / {players.filter(p=>p.status==='paid').length}</span>
    <button type="button" className="outline-button small" disabled={busy || !event || !['draft','open','locked'].includes(event.status) || !players.some(p=>p.status==='paid' && p.assigned_tier===null)} onClick={analyzeBatch}>
      {mn?'ДАРААГИЙН 3 ТОГЛОГЧИЙГ ШАЛГАХ':'SCAN NEXT 3'}
    </button>
  </div>
</div><div className="table-wrap"><table className="data-table"><thead><tr><th>PLAYER</th><th>STATUS</th><th>ROLE</th><th>TIER</th><th>SCORE</th><th>FACEIT REVIEW</th><th>ACTION</th></tr></thead><tbody>{players.map(p=><tr key={p.id}><td>{p.nickname}</td><td>{p.status}</td><td>{p.primary_role}</td><td>{p.assigned_tier??'—'}</td><td>{p.internal_score??'—'}</td><td>
  <span className={'admin-assessment-label '+p.assessmentStatus}>
    {p.assessmentStatus==='approved'?'APPROVED':p.assessmentStatus==='review'?'NEEDS REVIEW':p.assessmentStatus==='suggested'?'SUGGESTED':'NOT SCANNED'}
  </span>
  {p.assigned_tier===null&&p.suggestedTier!==null&&<span className="admin-assessment-tier">TIER {p.suggestedTier}</span>}
</td><td><button className="outline-button small" disabled={busy||p.status!=='paid'} onClick={()=>p.assessmentStatus==='unchecked'?analyze(p.id):reviewStored(p.id)}>{p.assessmentStatus==='unchecked'?'FACEIT SCAN':'REVIEW SAVED'}</button><button className="outline-button small" style={{marginLeft:8}} disabled={busy||p.status!=='paid'} onClick={()=>{setActiveReg(p.id);setAnalysis(null);setNote('');setTier(String(p.assigned_tier||3));setScore(String(p.internal_score||50));void reviewClubBaseline(p.id);}}>REVIEW / TIER</button></td></tr>)}</tbody></table></div>{players.length===0&&<p className="small-text">No registered entries for this tournament.</p>}</section>

 {activeReg && <section className="panel admin-wide">
  <div className="section-kicker">04 / TIER REVIEW</div>
  <p className="small-text">REGISTRATION: {activeReg}</p>
  <section className="admin-club-baseline" aria-label="Pre-tournament Club performance baseline">
    <div className="row-space">
      <div><div className="section-kicker">PRE-TOURNAMENT / REAL CLUB MATCH DATA</div>
        <p className="small-text">Verified Steam → FACEIT ID → archived June 2026+ Club maps. No automated tier approval.</p>
      </div>
      <button type="button" className="outline-button small" disabled={busy||baselineLoading} onClick={()=>void reviewClubBaseline(activeReg)}>
        {baselineLoading?'LOOKING UP...':'LOAD CLUB BASELINE'}
      </button>
    </div>
    {baselineError&&<p className="admin-skill-warning" role="alert">{baselineError}. You may still assign a tier manually, documenting the reason.</p>}
    {clubBaseline&&clubBaseline.registrationId===activeReg&&<>
      <p className="small-text">{clubBaseline.note}</p>
      <div className="admin-baseline-identity">
        <strong>{clubBaseline.faceitNickname||'NO FACEIT CS2 ACCOUNT FOUND'}</strong>
        <small>{clubBaseline.faceitPlayerId||'Not linked to the Club archive'} · {clubBaseline.identitySource}</small>
      </div>
      {clubBaseline.baseline&&<div className="details-grid">
        <div className="details-cell"><small>CLUB MATCHES</small><strong>{clubBaseline.baseline.uniqueMatches}</strong></div>
        <div className="details-cell"><small>MAP SAMPLES</small><strong>{clubBaseline.baseline.maps}</strong></div>
        <div className="details-cell"><small>ADR</small><strong>{baselineLabel(clubBaseline.baseline.adr,1)}</strong></div>
        <div className="details-cell"><small>K/D</small><strong>{baselineLabel(clubBaseline.baseline.kd)}</strong></div>
        <div className="details-cell"><small>ENTRY SUCCESS</small><strong>{baselineLabel(clubBaseline.baseline.entryWinPercent,1,'%')}</strong>
          <small>{clubBaseline.baseline.entryWins} / {clubBaseline.baseline.entryAttempts} attempts</small></div>
        <div className="details-cell"><small>NEXUS LOBBY RATING</small><strong>{baselineLabel(clubBaseline.baseline.nexusMatchRating)}</strong></div>
        <div className="details-cell"><small>RATED MAPS</small><strong>{clubBaseline.baseline.ratedMaps}</strong></div>
        <div className="details-cell"><small>KAST</small><strong>NOT AVAILABLE</strong></div>
      </div>}
      <p className="small-text">These are past Club performances against that match's lobby, not verified opponent-adjusted skill estimates. The admin must assign Tier 1–5 and an internal balancing score after reviewing evidence.</p>
    </>}
  </section>
  {analysis && <div className="admin-evidence">
    <div className="details-grid">
      <div className="details-cell"><small>FACEIT CURRENT ELO</small><strong>{analysis.elo ?? 'UNAVAILABLE'}</strong></div>
      <div className="details-cell"><small>NEXUS SEEDING ELO</small><strong>{analysis.protectedElo ?? analysis.elo ?? '—'}</strong></div>
      <div className="details-cell"><small>HISTORICAL PEAK / 180D</small><strong>{analysis.historicalPeakElo ?? 'NO RECORD'}</strong></div>
      <div className="details-cell"><small>NEXUS SUGGESTED SCORE</small><strong>{analysis.score ?? 'MANUAL REVIEW'}</strong></div>
      <div className="details-cell"><small>RECENT K/D</small><strong>{analysis.recentKd?.toFixed(2) ?? '—'}</strong></div>
      <div className="details-cell"><small>LIFETIME K/D</small><strong>{analysis.lifetimeKd?.toFixed(2) ?? '—'}</strong></div>
      <div className="details-cell"><small>LIFETIME MATCHES</small><strong>{analysis.lifetimeMatches ?? '—'}</strong></div>
      <div className="details-cell"><small>CONFIDENCE</small><strong style={{fontSize:16}}>{analysis.confidence || 'MANUAL'}</strong></div>
    </div>
    <FaceitStatsPanel
      locale={mn?'mn':'en'}
      recent={analysis.recentMetrics}
      lifetime={analysis.lifetimeMetrics}
      recentCounts={analysis.recentMetricSamples}
      areas={analysis.performanceAreas}
      source={analysis.performanceSource}
    />
    {analysis.found === false && <p className="admin-skill-warning" role="status">{analysis.reason || 'No FACEIT data. Manual evaluation required.'}</p>}
    {analysis.reviewFlags && analysis.reviewFlags.length>0 && <div className="admin-skill-warning" role="status">
      <strong>{mn?'АДМИН ХЯНАХ ШААРДЛАГАТАЙ':'ADMIN REVIEW REQUIRED — NOT PROOF OF THROWING'}</strong>
      <div className="admin-review-flags">{analysis.reviewFlags.map(flag => <span key={flag}>{({
        historical_elo_drop: mn?'Өмнөх Elo-оос их буурсан':'Large change from earlier verified Elo',
        recent_performance_mismatch: mn?'Сүүлийн үзүүлэлт Elo-оос өндөр':'Recent performance higher than Elo suggests',
        lifetime_performance_mismatch: mn?'Нийт үзүүлэлт Elo-оос өндөр':'Lifetime performance higher than Elo suggests',
        limited_faceit_history: mn?'Тоглолтын түүх бага':'Limited lifetime match history',
        damage_elo_mismatch: mn?'ADR үзүүлэлт Elo-оос өндөр':'ADR unusually high relative to FACEIT Elo',
        kast_elo_mismatch: mn?'KAST үзүүлэлт Elo-оос өндөр':'KAST unusually high relative to FACEIT Elo',
        opening_elo_mismatch: mn?'Opening duel win % Elo-оос өндөр':'Opening duel win % unusually high relative to Elo',
      } as Record<string,string>)[flag] || flag}</span>)}</div>
    </div>}
  </div>}
  <div className="two-col margin-top">
    <div className="form-row"><label className="field-label">APPROVED TIER (1–5)</label>
      <select className="field" value={tier} onChange={e=>setTier(e.target.value)}>
        {[1,2,3,4,5].map(n=><option key={n} value={n}>TIER {n}</option>)}
      </select>
    </div>
    <div className="form-row"><label className="field-label">INTERNAL SCORE (0–100)</label>
      <input className="field" type="number" min="0" max="100" step=".01" value={score} onChange={e=>setScore(e.target.value)}/>
    </div>
  </div>
  <div className="form-row"><label className="field-label">ADMIN REVIEW REASON / NOTES</label>
    <input className="field" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Explain manual rating, flags or a reduction from FACEIT suggestion"/>
    <p className="small-text">A reason of at least 15 characters is required for manual assessments, review flags, or lowered recommendations.</p>
  </div>
  <button className="outline-button" disabled={busy || !Number.isFinite(Number(score)) || Number(score)<0 || Number(score)>100} onClick={approval}>APPROVE TIER</button>
  <p className="small-text margin-top">Review flags indicate uncertainty, not misconduct. NEXUS never assigns or punishes a player automatically.</p>
 </section>}
 <section className="panel admin-wide"><div className="section-kicker">05 / TEAM GENERATOR</div><h2>FIVE-PLAYER ROSTERS</h2><p className="small-text">Event must be locked, all confirmed players approved, player count divisible by five, and payment holds cleared. A preview never writes rosters to the database.</p><div className="row-wrap"><button className="outline-button" disabled={busy||event?.status!=='locked'} onClick={()=>generate(false)}>PREVIEW TEAMS</button><button className="outline-button" disabled={busy||event?.status!=='locked'||!preview} onClick={()=>generate(true)}>PUBLISH TEAMS</button></div>{preview!==null&&<pre className="small-text table-wrap margin-top">{JSON.stringify(preview,null,2)}</pre>}</section>
 <section className="panel admin-wide"><div className="section-kicker">06 / MATCH OPERATIONS</div><h2>SCHEDULE / RESULTS</h2>{event?.status==='published'&&eventTeams.length>=2&&<form className="margin-top" onSubmit={scheduleMatch}><div className="two-col"><div className="form-row"><label className="field-label">TEAM A</label><select className="field" required name="teamA">{eventTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="form-row"><label className="field-label">TEAM B</label><select className="field" required name="teamB">{eventTeams.slice().reverse().map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="form-row"><label className="field-label">DATE AND TIME (LOCAL)</label><input className="field" type="datetime-local" required name="scheduledAt"/></div><div className="form-row"><label className="field-label">STAGE</label><select className="field" name="stage"><option value="groups">GROUPS</option><option value="playoffs">PLAYOFFS</option><option value="final">FINAL</option></select></div><div className="form-row"><label className="field-label">FORMAT</label><select className="field" name="bestOf"><option value="3">BO3</option><option value="1">BO1</option></select></div></div><button className="outline-button" disabled={busy} type="submit">ADD MATCH</button></form>}<div className="stack margin-top">{eventMatches.map(m=><div key={m.id} className="result-card"><div className="row-space"><strong>{teams.find(t=>t.id===m.team_a)?.name||'TEAM A'} / {teams.find(t=>t.id===m.team_b)?.name||'TEAM B'}</strong><span className="pill">{m.status.toUpperCase()}</span></div><p className="small-text">{m.stage} · BO{m.best_of} · {m.scheduled_at?new Date(m.scheduled_at).toLocaleString():'TBA'}</p>{m.status==='completed'?<p className="small-text">FINAL: {m.score_a} – {m.score_b}</p>:<form onSubmit={e=>saveResult(m.id,e)} className="row-wrap"><label className="small-text">TEAM A <input className="field" style={{width:85}} type="number" name="scoreA" min="0" max="3" required/></label><label className="small-text">TEAM B <input className="field" style={{width:85}} type="number" name="scoreB" min="0" max="3" required/></label><button className="outline-button small" disabled={busy}>SAVE RESULT</button></form>}</div>)}</div></section></div>{message&&<p className="form-message margin-top" role="status">{message}</p>}</main>;
}
