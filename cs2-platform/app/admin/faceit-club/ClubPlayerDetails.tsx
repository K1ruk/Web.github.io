'use client';

import { useEffect,useState } from 'react';

type PlayerMap={
  matchId:string;matchUrl:string;finishedAt:string|null;mapIndex:number;
  mapName:string;nickname:string;teamName:string|null;
  teams:{a:string|null;b:string|null;scoreA:number|null;scoreB:number|null}|null;
  kills:number|null;deaths:number|null;assists:number|null;
  headshots:number|null;roundsPlayed:number|null;
  adr:number|null;kastPercent:number|null;openingDuelWinPercent:number|null;
  openingDuels:number|null;kd:number|null;nexusRating:number|null;
  ratingConfidence:string;rawStats:Record<string,number>;
};
type Page={totalMaps:number;offset:number;hasMore:boolean;matches:PlayerMap[]};
const format=(v:number|null,d=2,suffix='')=>v==null?'—':Number(v).toFixed(d)+suffix;

export function ClubPlayerDetails({
  playerId,nickname,onClose,locale,
}:{
  playerId:string;nickname:string;onClose:()=>void;locale:'mn'|'en';
}){
  const mn=locale==='mn';
  const [rows,setRows]=useState<PlayerMap[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [total,setTotal]=useState(0);
  const [more,setMore]=useState(false);
  const [offset,setOffset]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      setLoading(true);setError('');
      try{
        const response=await fetch('/api/admin/faceit-club/archive/player?faceitId='
          +encodeURIComponent(playerId)+'&offset='+offset,{
            credentials:'same-origin',cache:'no-store',
            headers:{Accept:'application/json'},
          });
        const data=await response.json().catch(()=>null) as (Page&{error?:string})|null;
        if(!response.ok||!data)throw new Error(data?.error||'Player history unavailable');
        if(cancelled)return;
        setRows(data.matches);setTotal(data.totalMaps);setMore(data.hasMore);
      }catch(failure){
        if(!cancelled)setError(failure instanceof Error?failure.message:'Player history error');
      }finally{if(!cancelled)setLoading(false);}
    }
    load();
    return()=>{cancelled=true;};
  },[playerId,offset]);

  return <section className="faceit-player-history" aria-label="Player archived match stats">
    <div className="faceit-history-list-title">
      <div><span className="section-kicker">PLAYER / FACEIT MAP HISTORY</span>
        <h3>{nickname}</h3>
        <p>{total} {mn?'хадгалсан map':'archived maps'} · {playerId}</p>
      </div>
      <button className="outline-button" type="button" onClick={onClose}>CLOSE</button>
    </div>
    {loading&&<p className="faceit-club-note">Loading saved map statistics…</p>}
    {error&&<p className="faceit-history-message caution" role="alert">{error}</p>}
    {!loading&&rows.length===0&&!error&&<p className="faceit-club-note">
      No saved map statistics exist for this FACEIT ID.
    </p>}
    {rows.length>0&&<div className="faceit-club-table-wrap">
      <table className="faceit-club-stats-table faceit-player-history-table">
        <thead><tr>
          <th>DATE / MAP</th><th>TEAM</th><th>K</th><th>D</th><th>A</th>
          <th>ADR</th><th>KAST</th><th>OPENING %</th><th>K/D</th>
          <th>NEXUS</th><th>SOURCE</th>
        </tr></thead>
        <tbody>
          {rows.map(row=><tr key={row.matchId+':'+row.mapIndex}>
            <td><strong>{row.mapName}</strong>
              <small>{row.finishedAt?new Date(row.finishedAt).toLocaleDateString():'—'}</small>
            </td>
            <td>{row.teamName||'—'}</td>
            <td>{row.kills??'—'}</td><td>{row.deaths??'—'}</td>
            <td>{row.assists??'—'}</td>
            <td>{format(row.adr,1)}</td>
            <td>{format(row.kastPercent,1,'%')}</td>
            <td>{format(row.openingDuelWinPercent,1,'%')}</td>
            <td>{format(row.kd)}</td>
            <td>{format(row.nexusRating)}</td>
            <td><a href={row.matchUrl} target="_blank" rel="noopener noreferrer">
              MATCH ↗
            </a></td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {rows.length>0&&<div className="faceit-player-raw">
      <strong>ADDITIONAL FACEIT NUMERIC STATS</strong>
      <p className="faceit-club-note">These fields are exactly what the FACEIT API returned. Missing trade, accuracy, and other stats are not reconstructed.</p>
      {rows.map(row=><details key={'raw-'+row.matchId+'-'+row.mapIndex}>
        <summary>{row.mapName} · {row.finishedAt?new Date(row.finishedAt).toLocaleDateString():'—'} · {row.matchId}</summary>
        <pre>{JSON.stringify(row.rawStats||{},null,2)}</pre>
      </details>)}
    </div>}
    {total>50&&<div className="faceit-history-actions">
      <button className="outline-button" type="button" disabled={loading||offset===0}
        onClick={()=>setOffset(x=>Math.max(0,x-50))}>PREVIOUS 50</button>
      <span className="faceit-history-pages">MAPS {offset+1}–{Math.min(offset+50,total)} / {total}</span>
      <button className="outline-button" type="button" disabled={loading||!more}
        onClick={()=>setOffset(x=>x+50)}>NEXT 50</button>
    </div>}
  </section>;
}
