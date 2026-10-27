'use client';

import { useRef,useState } from 'react';
import type { QueueHistoryMatch } from '@/lib/faceit-hub-history';
import { CLUB_ARCHIVE_SINCE_SECONDS } from '@/lib/club-archive';
import { ClubPlayerDetails } from './ClubPlayerDetails';

type PlayerSummary={
  faceitPlayerId:string;nickname:string;rating:number|null;
  ratedMaps:number;observedMaps:number;confidence:string;
  adr:number|null;kastPercent:number|null;
  openingDuelWinPercent:number|null;kd:number|null;
};
type ArchiveOverview={
  since:string;queueId:string;matchesArchived:number;playersArchived:number;
  summariesTruncated:boolean;players:PlayerSummary[];
  ratingModel:string;skillTierAffected:false;
};
type ImportRecord={matchId:string;status:string;playerMaps:number};
const nice=(value:number|null,digits=2,suffix='')=>value===null?'—':value.toFixed(digits)+suffix;

export function ClubArchiveClient({
  matches,historyComplete,locale,apiConfigured,
}:{
  matches:QueueHistoryMatch[];historyComplete:boolean;
  locale:'mn'|'en';apiConfigured:boolean;
}){
  const mn=locale==='mn';
  const cancel=useRef(false);
  const [overview,setOverview]=useState<ArchiveOverview|null>(null);
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(0);
  const [processed,setProcessed]=useState(0);
  const [issues,setIssues]=useState<string[]>([]);
  const [error,setError]=useState('');
  const [finished,setFinished]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [activeTab,setActiveTab]=useState<'leaderboard'|'recent'>('leaderboard');
  const [selectedPlayer,setSelectedPlayer]=useState<{id:string;nickname:string}|null>(null);
  const filtered=matches.filter(match=>
    match.finishedAt!==null&&match.finishedAt>=CLUB_ARCHIVE_SINCE_SECONDS
    &&match.finishedAt<=Math.floor(Date.now()/1000)+3600);
  const countOld=matches.length-filtered.length;

  async function loadOverview(){
    setRefreshing(true);
    try{
      const response=await fetch('/api/admin/faceit-club/archive',{
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{Accept:'application/json'},
      });
      const data=await response.json().catch(()=>null) as (ArchiveOverview&{error?:string})|null;
      if(!response.ok||!data)throw new Error(data?.error||'Archive unavailable');
      setOverview(data);
    }catch(failure){
      setError(failure instanceof Error?failure.message:'Archive unavailable');
    }finally{setRefreshing(false);}
  }

  async function saveAllJune(){
    if(busy||!historyComplete||!filtered.length)return;
    cancel.current=false;
    setBusy(true);setSaved(0);setProcessed(0);setIssues([]);setError('');setFinished(false);
    const newIssues:string[]=[];
    let imported=0,done=0;
    try{
      for(let i=0;i<filtered.length;i+=3){
        if(cancel.current)break;
        const batch=filtered.slice(i,i+3);
        const response=await fetch('/api/admin/faceit-club/archive',{
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({matchIds:batch.map(m=>m.matchId)}),
        });
        const data=await response.json().catch(()=>null) as {entries?:ImportRecord[];error?:string}|null;
        if(!response.ok||!data?.entries){
          throw new Error(data?.error||'FACEIT archive import failed');
        }
        imported+=data.entries.filter(item=>item.status==='saved').length;
        done+=data.entries.length;
        for(const item of data.entries){
          if(item.status!=='saved'&&item.status!=='already_saved'){
            newIssues.push(item.matchId+': '+item.status);
          }
        }
        setProcessed(done);setSaved(imported);setIssues([...newIssues]);
        // Allow the user to stop between small, rate-limited server batches.
        // No background jobs are promised or started.
        await new Promise<void>(resolve=>setTimeout(resolve,300));
      }
      setFinished(!cancel.current);
      await loadOverview();
    }catch(failure){
      setError((failure instanceof Error?failure.message:'Import failed')
        +'. Already saved matches remain archived; re-run to resume.');
      await loadOverview();
    }finally{
      setBusy(false);
    }
  }

  return <section className="faceit-club-archive" aria-label="June FACEIT queue archive">
    <div className="lab-panel-heading">
      <span className="section-kicker">04 / {mn?'6-Р САРААС ХОЙШХ АРХИВ':'JUNE 2026+ / PERSISTENT PLAYER ARCHIVE'}</span>
      <span className="lab-status enabled">SINCE JUNE 1, 2026</span>
    </div>
    <h2>{mn?'NEXUS тоглолт ба тоглогчдын архив':'NEXUS match & player archive'}</h2>
    <p className="faceit-club-note">{mn
      ? 'Энэ queue-ийн 2026-06-01 UTC цагаас хойших тоглолтуудыг Supabase-д хадгална. Тоглогч бүрийг FACEIT ID-аар нь холбоно. Нэг тоглолтын ADR, KAST, opening win %, K/D зэрэг бодит статистик хадгалагдана.'
      : 'Save completed matches from June 1, 2026 (00:00 UTC) onward. Each real participant is identified by FACEIT player ID. Available per-map ADR, KAST, opening-duel win %, K/D and other supplied numeric stats are archived separately from NEXUS tournament records.'}</p>
    <div className="faceit-history-status">
      <div><small>JUNE+ MATCHES FOUND</small><strong>{filtered.length}</strong></div>
      <div><small>JAN–MAY / UNDATED EXCLUDED</small><strong>{countOld}</strong></div>
      <div><small>IMPORT PROGRESS</small><strong>{processed}/{filtered.length}</strong></div>
      <div><small>NEWLY SAVED THIS RUN</small><strong>{saved}</strong></div>
    </div>
    <div className="faceit-history-actions">
      <button className="lab-run-button faceit-history-run" type="button"
        disabled={!apiConfigured||!historyComplete||!filtered.length||busy} onClick={saveAllJune}>
        {busy?(mn?'ХАДГАЛЖ БАЙНА...':'SAVING VERIFIED MATCH STATS...')
          :(mn?'6-Р САРААС ХОЙШХ БҮХ ТОГЛОЛТЫГ ХАДГАЛАХ':'SAVE ALL JUNE+ MATCHES & PLAYER STATS')}
      </button>
      {busy&&<button className="outline-button" onClick={()=>{cancel.current=true;}} type="button">STOP AFTER BATCH</button>}
      <button className="outline-button" type="button" disabled={busy||refreshing} onClick={loadOverview}>
        {refreshing?'LOADING...':'VIEW SAVED ARCHIVE'}
      </button>
    </div>
    {!historyComplete&&<p className="faceit-history-message caution">
      {mn
        ? 'Эхлээд SCAN AVAILABLE QUEUE HISTORY дарж бүх боломжит хуудсыг татаж дуусгана уу. Зөвхөн эхний 50 тоглолтыг шалгасан бол архив бүрэн болохгүй.'
        : 'First run SCAN AVAILABLE QUEUE HISTORY to completion. Testing only the first 50 matches cannot establish the complete June archive.'}
    </p>}
    {historyComplete&&filtered.length===0&&<p className="faceit-history-message caution">
      No verified matches dated June 1, 2026 or later were found in this scan.
    </p>}
    {finished&&<p className="faceit-history-message">This import run completed. Already-saved matches were skipped; newly saved match and player-map records are available below.</p>}
    {issues.length>0&&<p className="faceit-history-message caution">
      {issues.length} match(es) could not be fully imported: {issues.slice(0,4).join('; ')}
    </p>}
    {error&&<p className="faceit-history-message caution" role="alert">{error}</p>}
    {overview&&<>
      <div className="faceit-history-status">
        <div><small>SAVED MATCHES</small><strong>{overview.matchesArchived}</strong></div>
        <div><small>UNIQUE PLAYERS</small><strong>{overview.playersArchived}</strong></div>
        <div><small>RATING SCALE</small><strong>1.00</strong></div>
        <div><small>MODEL</small><strong style={{fontSize:11}}>{overview.ratingModel}</strong></div>
      </div>
      <div className="faceit-history-actions">
        <button className="outline-button" type="button" disabled={activeTab==='leaderboard'}
          onClick={()=>setActiveTab('leaderboard')}>NEXUS CLUB RATINGS</button>
        <button className="outline-button" type="button" disabled={activeTab==='recent'}
          onClick={()=>setActiveTab('recent')}>PLAYER STATS</button>
      </div>
      {overview.summariesTruncated&&<p className="faceit-history-message caution">
        Only the latest 5,000 player-map records were used for this preview. Rankings are incomplete.
      </p>}
      <div className="faceit-club-table-wrap">
        <table className="faceit-club-stats-table faceit-archive-table">
          <thead><tr>
            <th>PLAYER</th><th>RATING</th><th>RATED MAPS</th><th>ADR</th>
            <th>KAST</th><th>OPENING WIN %</th><th>K/D</th><th>CONFIDENCE</th>
          </tr></thead>
          <tbody>
            {(activeTab==='leaderboard'
              ?overview.players
              :[...overview.players].sort((a,b)=>b.observedMaps-a.observedMaps)
            ).map(p=><tr key={p.faceitPlayerId}>
              <td><button className="faceit-player-select" type="button"
                onClick={()=>setSelectedPlayer({id:p.faceitPlayerId,nickname:p.nickname})}
                title="View this player's actual saved FACEIT match stats">{p.nickname} ↗</button></td>
              <td>{nice(p.rating,2)}</td>
              <td>{p.ratedMaps} / {p.observedMaps}</td>
              <td>{nice(p.adr,1)}</td>
              <td>{nice(p.kastPercent,1,'%')}</td>
              <td>{nice(p.openingDuelWinPercent,1,'%')}</td>
              <td>{nice(p.kd,2)}</td>
              <td>{p.confidence}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {selectedPlayer&&<ClubPlayerDetails key={selectedPlayer.id}
        playerId={selectedPlayer.id} nickname={selectedPlayer.nickname}
        onClose={()=>setSelectedPlayer(null)} locale={locale}/>} 
      <p className="faceit-breakdown-notice">{mn
        ? 'NEXUS Rating нь тухайн тоглолтын бусад тоглогчтой харьцуулсан түр performance үзүүлэлт. Энэ нь HLTV эсвэл FACEIT-ийн нууц томьёо БИШ, мөн Elo эсвэл тоглогчийн жинхэнэ ур чадварын tier-г орлохгүй.'
        : 'NEXUS Match Rating is an experimental, approximately 1.00-centered comparison of performance within the same CS2 lobby. It is NOT HLTV Rating, FACEIT Rating, round win probability, or your separate Elo-based tournament skill tier. Smaller samples are shrunk toward 1.00.'}</p>
    </>}
  </section>;
}
