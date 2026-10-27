import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEXUS_FACEIT_CLUB_ID, NEXUS_FACEIT_CLUB_URL,
  NEXUS_FACEIT_TEST_MATCH_ID, NEXUS_FACEIT_TEST_MATCH_URL,
  parseFaceitMatchId, summarizeFaceitMatch,
} from '../lib/faceit-club.ts';

const uuid = '12345678-1234-4321-a123-123456789abc';
const id = '1-' + uuid;

test('Club reference is the supplied FACEIT Club URL, not an assumed Hub ID', () => {
  assert.equal(NEXUS_FACEIT_CLUB_ID, 'a89ac9ff-8702-40df-b62d-8140719d481e');
  assert.equal(NEXUS_FACEIT_CLUB_URL,
    'https://www.faceit.com/en/club/a89ac9ff-8702-40df-b62d-8140719d481e/parties');
});


test('the organizer-provided matchroom is a valid, well-formed CS2 FACEIT identifier', () => {
  assert.equal(NEXUS_FACEIT_TEST_MATCH_ID, '1-1aaee7dd-bf23-44b6-b043-a96fc7586ce9');
  assert.equal(NEXUS_FACEIT_TEST_MATCH_URL,
    'https://www.faceit.com/en/cs2/room/1-1aaee7dd-bf23-44b6-b043-a96fc7586ce9');
  assert.equal(parseFaceitMatchId(NEXUS_FACEIT_TEST_MATCH_URL), NEXUS_FACEIT_TEST_MATCH_ID);
  assert.equal(parseFaceitMatchId(NEXUS_FACEIT_TEST_MATCH_ID), NEXUS_FACEIT_TEST_MATCH_ID);
});

test('normalizes only valid FACEIT matchroom IDs and exact first-party HTTPS URLs', () => {
  assert.equal(parseFaceitMatchId(id), id);
  assert.equal(parseFaceitMatchId(uuid), uuid);
  assert.equal(parseFaceitMatchId(' https://www.faceit.com/en/cs2/room/'+id+'/scoreboard '), id);
  assert.equal(parseFaceitMatchId('https://faceit.com/cs2/room/'+id), id);
  assert.equal(parseFaceitMatchId('https://www.faceit.com/en/csgo/room/'+id), id);
  assert.equal(parseFaceitMatchId('https://faceit.com.evil.test/en/cs2/room/'+id), null);
  assert.equal(parseFaceitMatchId('https://evil.test/en/cs2/room/'+id), null);
  assert.equal(parseFaceitMatchId('http://faceit.com/en/cs2/room/'+id), null);
  assert.equal(parseFaceitMatchId('https://faceit.com/en/club/'+uuid+'/parties'), null);
  assert.equal(parseFaceitMatchId('https://faceit.com/en/cs2/room/1-not-a-uuid'), null);
  assert.equal(parseFaceitMatchId('not a match'), null);
});

test('maps FACEIT CS2 match detail and actual per-player stats without inventing Club provenance', () => {
  const match = {
    match_id: id,
    game: 'cs2',
    status: 'FINISHED',
    competition_id: 'actual-competition-id',
    competition_name: 'Real test match label',
    competition_type: 'hub',
    finished_at: 1793020000,
    teams: {
      faction1: { name: 'Team One' },
      faction2: { name: 'Team Two' },
    },
    results: { score: { faction1: 16, faction2: 13 } },
  };
  const stats = {
    rounds: [{
      round_stats: { Map: 'de_mirage' },
      teams: [{
        team_id: 'faction1',
        players: [{
          player_id: uuid,
          nickname: 'Player-A',
          player_stats: {
            Kills: '23', Deaths: '17', Assists: '4',
            ADR: '99.4', 'K/D Ratio': '1.35',
            'KAST %': '74', 'Opening Duels Won': '5', 'Opening Duels Lost': '3',
          },
        }],
      }, {
        team_id: 'faction2',
        players: [{
          player_id: 'other-id',
          nickname: 'Player-B',
          player_stats: {
            Kills: '25', Deaths: '18', ADR: '83.2', 'K/D Ratio': '1.39',
          },
        }],
      }],
    }],
  };

  const result = summarizeFaceitMatch(id, match, stats);
  assert.equal(result.matchId, id);
  assert.equal(result.game, 'cs2');
  assert.equal(result.status, 'FINISHED');
  assert.equal(result.competitionId, 'actual-competition-id');
  assert.equal(result.clubAssociationVerified, false);
  assert.equal(result.hasPlayerStats, true);
  assert.deepEqual(result.teams.map(team => team.score), [16,13]);
  assert.equal(result.maps[0].mapName, 'de_mirage');
  assert.equal(result.maps[0].teams[0].teamName, 'Team One');
  assert.equal(result.maps[0].teams[0].players[0].metrics.adr, 99.4);
  assert.equal(result.maps[0].teams[0].players[0].metrics.kastPercent, 74);
  assert.equal(result.maps[0].teams[0].players[0].metrics.openingDuelWinPercent, 62.5);
  assert.equal(result.maps[0].teams[0].players[0].kills, 23);
  assert.equal(result.maps[0].teams[1].players[0].metrics.kastPercent, null);
});

test('a CS:GO match or a mismatch cannot be presented as a verified CS2 match', () => {
  assert.throws(() => summarizeFaceitMatch(id,{match_id:id,game:'csgo'},null), /not a FACEIT CS2 match/);
  assert.throws(() => summarizeFaceitMatch(id,{match_id:uuid,game:'cs2'},null), /different match/);
});

test('a valid CS2 match with no detailed stats remains honestly unavailable', () => {
  const result = summarizeFaceitMatch(id,{
    match_id:id,game:'cs2',status:'FINISHED',teams:{faction1:{name:'Alpha'},faction2:{name:'Beta'}},
  },null);
  assert.equal(result.hasPlayerStats,false);
  assert.equal(result.maps.length,0);
  assert.equal(result.teams[0].score,null);
  assert.equal(result.clubAssociationVerified,false);
});

test('sanitizes user-facing strings from provider and does not pass raw player data', () => {
  const result = summarizeFaceitMatch(id,{
    match_id:id,game:'cs2',competition_name:'x'.repeat(150),
    teams:{faction1:{name:'Very long'.repeat(30)}},
  },{
    rounds:[{
      round_stats:{Map:'de_nuke'},
      teams:[{team_id:'faction1',players:[{
        player_id:'id',nickname:'p'.repeat(180),player_stats:{
          ADR:'not provided',Kills:'-100',Deaths:'invalid'
        }
      }]}],
    }],
  });
  assert.ok(result.competitionName.length<=100);
  assert.equal(result.maps[0].teams[0].players[0].nickname.length,60);
  assert.equal(result.maps[0].teams[0].players[0].metrics.adr,null);
  assert.equal(result.maps[0].teams[0].players[0].kills,null);
  assert.equal(result.maps[0].teams[0].players[0].deaths,null);
  assert.equal('raw' in result,false);
});
