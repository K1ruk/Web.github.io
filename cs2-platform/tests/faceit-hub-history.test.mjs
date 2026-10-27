import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueueHubMatches, FACEIT_HISTORY_MAX_AUTO_PAGES } from '../lib/faceit-hub-history.ts';
import { NEXUS_FACEIT_QUEUE_ID, NEXUS_FACEIT_TEST_MATCH_ID } from '../lib/faceit-club.ts';

const base = {
  match_id: NEXUS_FACEIT_TEST_MATCH_ID,
  competition_id: NEXUS_FACEIT_QUEUE_ID,
  competition_type: 'hub',
  game: 'cs2',
  organizer_id: '3dc2f9c9-1f41-4e1d-bcca-37256ceb2786',
  status: 'FINISHED',
  finished_at: 1793070000,
  teams: {
    faction1: { name: 'Team Alpha' },
    faction2: { name: 'Team Beta' },
  },
  results: { score: { faction1: 13, faction2: 11 } },
};

test('normalizes an actual FACEIT response shaped for a single Hub competition', () => {
  const result = normalizeQueueHubMatches({ items: [base], start: 0, end: 1 }, 0, 50);
  assert.equal(result.queueId, NEXUS_FACEIT_QUEUE_ID);
  assert.equal(result.countReturned, 1);
  assert.equal(result.matches.length, 1);
  assert.equal(result.rejectedUnverified, 0);
  assert.equal(result.matches[0].matchId, NEXUS_FACEIT_TEST_MATCH_ID);
  assert.equal(result.matches[0].competitionType, 'hub');
  assert.equal(result.matches[0].organizerId, base.organizer_id);
  assert.deepEqual(result.matches[0].teams.map(t => t.score), [13, 11]);
  assert.equal(result.matches[0].hasScore, true);
  assert.equal(result.knownSampleOnThisPage, true);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextOffset, null);
  assert.equal(result.savedToDatabase, false);
});

test('rejects unrelated competitions even if the Hub endpoint accidentally includes them', () => {
  const result = normalizeQueueHubMatches({ items: [
    { ...base, competition_id: 'unrelated-competition' },
    { ...base, competition_type: 'queue' },
    { ...base, competition_type: 'tournament' },
    { ...base, game: 'csgo' },
    { ...base, match_id: 'bad-match-id' },
    { ...base, match_id: 1002 },
    null,
    base,
  ] }, 0, 30);
  assert.equal(result.matches.length, 1);
  assert.equal(result.rejectedUnverified, 7);
});

test('duplicate match IDs on one page are counted only once', () => {
  const result = normalizeQueueHubMatches({ items: [base, base, base] }, 0, 50);
  assert.equal(result.matches.length, 1);
  assert.equal(result.countReturned, 3);
  assert.equal(result.rejectedUnverified, 0);
});

test('full API pages indicate that older history may exist, not a made-up total', () => {
  const another = { ...base, match_id: '1-cccccccc-1111-4222-a111-bbbbbbbbbbbb' };
  const result = normalizeQueueHubMatches({ items: [base, another], start: 100, end: 102 }, 100, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextOffset, 102);
  assert.equal(result.matches.length, 2);
  assert.equal(result.providerEnd, 102);
  assert.equal(FACEIT_HISTORY_MAX_AUTO_PAGES, 100);
});

test('valid empty page is not proof that the source has never held matches', () => {
  const result = normalizeQueueHubMatches({ items: [], start: 0, end: 0 }, 0, 100);
  assert.deepEqual(result.matches, []);
  assert.equal(result.hasMore, false);
  assert.equal(result.countReturned, 0);
});

test('missing scores/dates are null and are never fabricated', () => {
  const result = normalizeQueueHubMatches({ items: [{
    ...base,
    results: undefined,
    finished_at: undefined,
    teams: { faction1: { name: '=SUM(1,1)' }, faction2: { name: 'Other team' } },
  }] }, 0, 50);
  assert.equal(result.matches[0].finishedAt, null);
  assert.equal(result.matches[0].hasScore, false);
  assert.equal(result.matches[0].teams[0].score, null);
  assert.equal(result.matches[0].teams[0].name, '=SUM(1,1)');
  assert.equal(result.matches[0].faceitUrl,
    'https://www.faceit.com/en/cs2/room/' + NEXUS_FACEIT_TEST_MATCH_ID);
});

test('incorrect or oversized provider responses are rejected rather than marked complete', () => {
  assert.throws(() => normalizeQueueHubMatches({}, 0, 100), /invalid/);
  assert.throws(() => normalizeQueueHubMatches({ items: {} }, 0, 100), /invalid/);
  assert.throws(() => normalizeQueueHubMatches({ items: [base,base] }, 0, 1), /invalid/);
  assert.throws(() => normalizeQueueHubMatches({ items: [] }, -1, 50), /invalid/);
  assert.throws(() => normalizeQueueHubMatches({ items: [] }, 0, 101), /invalid/);
});

test('missing provider competition metadata cannot be used to infer Club membership', () => {
  const result = normalizeQueueHubMatches({ items: [
    { ...base, competition_id: undefined },
    { ...base, competition_type: undefined },
    { ...base, game: undefined },
  ] }, 0, 50);
  assert.equal(result.matches.length, 0);
  assert.equal(result.rejectedUnverified, 3);
});
