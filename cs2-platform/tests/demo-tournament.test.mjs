import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClubDemoCandidates, exampleDemoApprovals, DEMO_ROLES } from '../lib/demo-tournament.ts';
import { isRosterDraft, rosterIncludesExactly, swapRosterPlayers } from '../lib/roster-draft.ts';

const uuid=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;

function sample(size=47){
  const identities=Array.from({length:size},(_,i)=>({
    faceit_player_id:uuid(i),
    nickname:'ArchivedPlayer-'+i,
  }));
  const maps=identities.flatMap((p,i)=>Array.from({length:i%6+1},(_,j)=>({
    faceit_player_id:p.faceit_player_id,
    match_id:'1-'+uuid((i+1)*20+j),
    map_index:0,
    adr:70+i/4,
    kd:0.9+i/80,
    nexus_match_rating:1,
    raw_stats:{'Entry Count':5,'Entry Wins':3},
  })));
  return {identities,maps};
}

test('demo uses archived nicknames and real map samples only, never real registration IDs',()=>{
  const {identities,maps}=sample();
  const candidates=buildClubDemoCandidates(identities,maps);
  assert.equal(candidates.length,40);
  assert.ok(candidates.every(p=>p.id==='demo-'+p.faceitPlayerId));
  assert.ok(candidates.every(p=>p.nickname.startsWith('ArchivedPlayer-')));
  assert.ok(candidates.every(p=>p.sample.maps>=1));
  assert.ok(candidates.every(p=>p.sample.kastPercent===null));
  assert.ok(candidates.every(p=>p.sample.entryWinPercent===60));
  assert.ok(candidates.every(p=>p.primary_role!==p.secondary_role));
  assert.ok(candidates.every(p=>DEMO_ROLES.includes(p.primary_role)));
  assert.equal(new Set(candidates.map(p=>p.id)).size,40);
});

test('simulate tiers with explicit synthetic values and never infer them from archive scores',()=>{
  const {identities,maps}=sample();
  const candidates=buildClubDemoCandidates(identities,maps).slice(0,20);
  const approvals=exampleDemoApprovals(candidates);
  assert.equal(Object.keys(approvals).length,20);
  const tiers=candidates.map(p=>approvals[p.id].tier);
  assert.deepEqual(tiers.slice(0,5),[1,2,3,4,5]);
  assert.deepEqual(tiers.slice(5,10),[1,2,3,4,5]);
  assert.ok(Object.values(approvals).every(a=>a.score>=0&&a.score<=100));
  assert.equal('assigned_tier' in candidates[0],false);
  assert.equal('status' in candidates[0],false);
});

test('demo players with no archived maps cannot become fake verified participants',()=>{
  const {identities,maps}=sample(9);
  const fewer=buildClubDemoCandidates(identities,maps.slice(0,-8));
  assert.ok(fewer.length<=9);
  assert.ok(fewer.every(p=>p.sample.maps>0));
});

test('a simulated squad swap preserves uniqueness, team size and a valid shape',()=>{
  const {identities,maps}=sample();
  const candidates=buildClubDemoCandidates(identities,maps).slice(0,10);
  const teams=[
    candidates.slice(0,5).map(p=>({registration_id:p.id,assigned_role:'Rifler'})),
    candidates.slice(5,10).map(p=>({registration_id:p.id,assigned_role:'Support'})),
  ];
  assert.equal(isRosterDraft(teams),true);
  assert.equal(rosterIncludesExactly(teams,candidates.map(p=>p.id)),true);
  const swapped=swapRosterPlayers(teams,0,2,candidates[9].id);
  assert.equal(rosterIncludesExactly(swapped,candidates.map(p=>p.id)),true);
  assert.equal(teams[0][2].registration_id,candidates[2].id);
  const duplicate=structuredClone(swapped);
  duplicate[0][0].registration_id=duplicate[0][1].registration_id;
  assert.equal(isRosterDraft(duplicate),false);
  assert.equal(rosterIncludesExactly(duplicate,candidates.map(p=>p.id)),false);
});
