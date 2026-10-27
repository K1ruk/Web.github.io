import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVerifiedDiscordProvider } from '../lib/discord-auth.ts';
import { summarizeFirstTournamentBaseline } from '../lib/first-tournament-baseline.ts';
import { isRosterDraft, swapRosterPlayers } from '../lib/roster-draft.ts';

test('only trusted Supabase app_metadata identifies verified Discord OAuth',()=>{
  assert.equal(hasVerifiedDiscordProvider({providers:['email','discord']}),true);
  assert.equal(hasVerifiedDiscordProvider({provider:'discord'}),true);
  assert.equal(hasVerifiedDiscordProvider({providers:['email']}),false);
  assert.equal(hasVerifiedDiscordProvider({discord:'true'}),false);
  assert.equal(hasVerifiedDiscordProvider(null),false);
});

test('June Club baseline aggregates real entries, weighted by attempts not maps',()=>{
  const result=summarizeFirstTournamentBaseline([
    {match_id:'a',map_index:0,adr:80,kd:1.2,nexus_match_rating:1.3,
      raw_stats:{'Entry Count':10,'Entry Wins':6}},
    {match_id:'b',map_index:0,adr:100,kd:1.4,nexus_match_rating:1.1,
      raw_stats:{'Entry Count':2,'Entry Wins':1}},
    {match_id:'a',map_index:0,adr:800,kd:15,nexus_match_rating:1.5,
      raw_stats:{'Entry Count':20,'Entry Wins':20}}, // duplicate
  ]);
  assert.equal(result.uniqueMatches,2);
  assert.equal(result.maps,2);
  assert.equal(result.adr,90);
  assert.equal(result.kd,1.3);
  assert.equal(result.entryWins,7);
  assert.equal(result.entryAttempts,12);
  assert.equal(result.entryWinPercent,58.33);
  assert.equal(result.kastPercent,null);
  assert.equal(result.demoVerified,false);
  assert.equal(result.ratedMaps,2);
  assert.ok(result.nexusMatchRating>1 && result.nexusMatchRating<1.2);
});

test('missing Club data is unavailable, never a synthetic 0 KAST',()=>{
  const result=summarizeFirstTournamentBaseline([]);
  assert.equal(result.maps,0);
  assert.equal(result.adr,null);
  assert.equal(result.kd,null);
  assert.equal(result.entryWinPercent,null);
  assert.equal(result.kastPercent,null);
  assert.equal(result.nexusMatchRating,null);
});

test('invalid entry totals are ignored instead of creating false percentage',()=>{
  const result=summarizeFirstTournamentBaseline([
    {match_id:'a',map_index:0,adr:75,kd:1,nexus_match_rating:1.1,
      raw_stats:{'Entry Count':3,'Entry Wins':4}},
    {match_id:'b',map_index:0,adr:80,kd:1,nexus_match_rating:1,
      raw_stats:{'Entry Count':-1,'Entry Wins':0}},
  ]);
  assert.equal(result.entryAttempts,0);
  assert.equal(result.entryWinPercent,null);
});

function draft(){
  return [
    [0,1,2,3,4].map(n=>({registration_id:'p'+n,assigned_role:'Rifler'})),
    [5,6,7,8,9].map(n=>({registration_id:'p'+n,assigned_role:'Support'})),
  ];
}
test('admin can manually swap players without duplicating roster members',()=>{
  const initial=draft();
  assert.equal(isRosterDraft(initial),true);
  const moved=swapRosterPlayers(initial,0,1,'p7');
  assert.equal(moved[0][1].registration_id,'p7');
  assert.equal(moved[1][2].registration_id,'p1');
  assert.equal(new Set(moved.flat().map(p=>p.registration_id)).size,10);
  assert.equal(initial[0][1].registration_id,'p1');
  assert.equal(moved[0][1].assigned_role,'Rifler');
  assert.throws(()=>swapRosterPlayers(initial,0,0,'not-registered'),/not in/);
  assert.throws(()=>swapRosterPlayers(initial,20,0,'p7'),/Invalid/);
});

test('a malformed roster cannot be presented as reviewed',()=>{
  assert.equal(isRosterDraft(null),false);
  assert.equal(isRosterDraft([[]]),false);
  assert.equal(isRosterDraft([[{registration_id:'p0',assigned_role:'CEO'}]]),false);
});
