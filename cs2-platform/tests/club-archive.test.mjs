import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeJuneClubMatch,juneOrLater,CLUB_ARCHIVE_SINCE_SECONDS} from '../lib/club-archive.ts';
import {NEXUS_FACEIT_QUEUE_ID,NEXUS_FACEIT_TEST_MATCH_ID} from '../lib/faceit-club.ts';

const matchId=NEXUS_FACEIT_TEST_MATCH_ID;
const juneDate=Math.floor(Date.parse('2026-06-15T12:00:00Z')/1000);
const januaryDate=Math.floor(Date.parse('2026-01-15T12:00:00Z')/1000);
const details={
  match_id:matchId,competition_id:NEXUS_FACEIT_QUEUE_ID,
  game:'cs2',competition_type:'hub',status:'FINISHED',
  finished_at:juneDate,
  teams:{faction1:{name:'Alpha'},faction2:{name:'Beta'}},
  results:{score:{faction1:13,faction2:11}},
};
function stats(){
  return{rounds:[{
    round_stats:{Map:'de_mirage'},
    teams:[0,1].map(t=>({
      team_id:'faction'+(t+1),
      players:Array.from({length:5},(_,i)=>{
        const id=t*5+i;
        return{player_id:'faceit-'+id,nickname:'RealName-'+id,
          player_stats:{
            ADR:String(60+id*6),
            'KAST %':String(65+id*2),
            'Opening Duel Win %':String(40+id*4),
            'K/D Ratio':String(.7+id*.14),
            Kills:String(15+id),
            Deaths:'18',Assists:'5',
            'Trade Kills':'3',
            'Private nested payload':{bad:true},
          }};
      }),
    })),
  }]};
}

test('June 1 UTC is inclusive; January and undated matches are excluded',()=>{
  assert.equal(juneOrLater(CLUB_ARCHIVE_SINCE_SECONDS),true);
  assert.equal(juneOrLater(CLUB_ARCHIVE_SINCE_SECONDS-1),false);
  assert.equal(juneOrLater(januaryDate),false);
  assert.equal(juneOrLater(null),false);
});

test('stores actual players and numeric stats from a verified June match',()=>{
  const result=normalizeJuneClubMatch(matchId,details,stats());
  assert.equal(result.match.queue_id,NEXUS_FACEIT_QUEUE_ID);
  assert.equal(result.match.finished_at,new Date(juneDate*1000).toISOString());
  assert.equal(result.match.stats_status,'available');
  assert.equal(result.match.team_a,'Alpha');
  assert.equal(result.match.score_a,13);
  assert.equal(result.players.length,10);
  assert.equal(result.players[0].faceitPlayerId,'faceit-0');
  assert.equal(result.players[0].nickname,'RealName-0');
  assert.equal(result.players[0].metrics.adr,60);
  assert.equal(result.players[0].metrics.kastPercent,65);
  assert.equal(result.players[0].kills,15);
  assert.equal(result.players[0].rawStats['Trade Kills'],3);
  assert.equal(Object.hasOwn(result.players[0].rawStats,'Private nested payload'),false);
  assert.ok(result.players.every(p=>p.nexusRating!==null));
  assert.ok(result.players[9].nexusRating>result.players[0].nexusRating);
});

test('out of scope competitions cannot enter the persistent archive',()=>{
  for(const alter of [
    {competition_id:'another-queue'},
    {competition_type:'tournament'},
    {game:'csgo'},
    {match_id:'different-id'},
  ]){
    assert.throws(()=>normalizeJuneClubMatch(matchId,{...details,...alter},stats()),/not verified/);
  }
});

test('January matches are always rejected even when ID and competition match',()=>{
  assert.throws(()=>normalizeJuneClubMatch(matchId,{...details,finished_at:januaryDate},stats()),/before June/);
});

test('unfinished and undated matchrooms never enter archive',()=>{
  assert.throws(()=>normalizeJuneClubMatch(matchId,{...details,status:'ONGOING'},stats()),/finished/);
  assert.throws(()=>normalizeJuneClubMatch(matchId,{...details,finished_at:null},stats()),/before June/);
});

test('FACEIT stats missing: no fabricated players, metrics or ratings',()=>{
  const result=normalizeJuneClubMatch(matchId,details,null);
  assert.equal(result.match.stats_status,'unavailable');
  assert.equal(result.players.length,0);
  assert.equal(result.match.map_count,0);
});
