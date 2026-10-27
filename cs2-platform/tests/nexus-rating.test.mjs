import test from 'node:test';
import assert from 'node:assert/strict';
import {rateNexusLobby,summarizeNexusArchivePlayer,NEXUS_MATCH_WEIGHTS} from '../lib/nexus-rating.ts';

const sample=Array.from({length:10},(_,index)=>({
  playerId:'player-'+index,
  openingDuels:6,
  metrics:{
    adr:60+index*6,
    kastPercent:65+index*2.2,
    openingDuelWinPercent:40+index*4,
    kd:0.75+index*0.13,
  },
}));

test('NEXUS Match Rating compares players within the same lobby',()=>{
  const ratings=rateNexusLobby(sample);
  assert.equal(ratings.length,10);
  assert.ok(ratings[9].rating>1);
  assert.ok(ratings[0].rating<1);
  assert.ok(Math.abs(ratings.reduce((sum,p)=>sum+p.rating,0)/10-1)<.03);
  assert.equal(ratings[9].model,'nexus-lobby-v1');
  assert.equal(ratings[9].confidence,'provisional');
  assert.equal(ratings[9].coverage,1);
});

test('strong raw performance against a different lobby does not create a global skill ranking',()=>{
  const weakLobby=sample.map(p=>({
    ...p,metrics:{...p.metrics,adr:p.metrics.adr+30},
  }));
  const first=rateNexusLobby(sample);
  const boosted=rateNexusLobby(weakLobby);
  assert.equal(boosted[9].rating,first[9].rating);
});

test('unavailable KAST or opening duels never become zero',()=>{
  const without=sample.map((p,index)=>({
    ...p,metrics:{adr:p.metrics.adr, kd:p.metrics.kd,
      kastPercent:null,openingDuelWinPercent:null},
    openingDuels:index===0?1:null,
  }));
  const ratings=rateNexusLobby(without);
  assert.ok(ratings.every(r=>r.rating!==null));
  assert.ok(ratings.every(r=>r.usedMetrics.join(',')==='adr,kd'));
  assert.ok(ratings.every(r=>r.confidence==='limited'));
});

test('sparse and noisy stats produce unavailable or bounded ratings',()=>{
  const sparse=sample.map(p=>({...p,metrics:{adr:p.metrics.adr}}));
  assert.ok(rateNexusLobby(sparse).every(r=>r.rating===null));
  const few=rateNexusLobby(sample.slice(0,5));
  assert.ok(few.every(r=>r.rating===null));
  const noisy=sample.map((p,i)=>({
    ...p,metrics:{adr:i===0?280:80,
      kastPercent:i===0?99:70,openingDuelWinPercent:i===0?98:40,
      kd:i===0?12:1},
  }));
  assert.ok(rateNexusLobby(noisy).every(p=>p.rating===null||(p.rating>=.5&&p.rating<=1.5)));
});

test('opening duel percentage with only one attempt is excluded',()=>{
  const players=sample.map((p,i)=>({...p,openingDuels:i===0?1:5}));
  const r=rateNexusLobby(players);
  assert.equal(r[0].usedMetrics.includes('openingDuelWinPercent'),false);
  assert.equal(r[1].usedMetrics.includes('openingDuelWinPercent'),true);
});

test('small multi-map samples are shrunk toward lobby 1.00',()=>{
  const obs=[{matchId:'m1',mapIndex:0,rating:1.4}];
  const summary=summarizeNexusArchivePlayer(obs);
  assert.equal(summary.ratedMaps,1);
  assert.equal(summary.rating,1.04);
  assert.equal(summary.confidence,'limited');
  const many=Array.from({length:30},(_,i)=>({matchId:'m'+i,mapIndex:0,rating:1.4}));
  const aggregate=summarizeNexusArchivePlayer(many);
  assert.ok(aggregate.rating>summary.rating);
  assert.equal(aggregate.confidence,'provisional');
});

test('repeat saved match-map rows cannot inflate player sample size',()=>{
  const obs=[{matchId:'abc',mapIndex:0,rating:1.3},
    {matchId:'abc',mapIndex:0,rating:1.3}];
  const r=summarizeNexusArchivePlayer(obs);
  assert.equal(r.observedMaps,1);
  assert.equal(r.ratedMaps,1);
});

test('negative or missing stats are not valid and never cause a fake rating',()=>{
  const sparse=sample.map(p=>({...p,metrics:{adr:-5,kastPercent:null,openingDuelWinPercent:null,kd:NaN}}));
  const rated=rateNexusLobby(sparse);
  assert.ok(rated.every(p=>p.rating===null));
  assert.equal(Object.values(NEXUS_MATCH_WEIGHTS).reduce((a,b)=>a+b,0),1);
});

test('duplicate FACEIT IDs in the same map are rejected',()=>{
  assert.throws(()=>rateNexusLobby([...sample,sample[0]]),/Invalid|Duplicate/);
});
