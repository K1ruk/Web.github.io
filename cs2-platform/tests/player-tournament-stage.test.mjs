import test from 'node:test';
import assert from 'node:assert/strict';
import {getTournamentStage,rosterMayBeShown} from '../lib/player-tournament-stage.ts';

const initial={registrationStatus:'paid',eventStatus:'open',tier:null,teamName:null};

test('real player stages mirror confirmed registration, manual tier, and published team',()=>{
 assert.equal(getTournamentStage(null),'no-entry');
 assert.equal(getTournamentStage({...initial,registrationStatus:'pending_payment'}),'unconfirmed');
 assert.equal(getTournamentStage(initial),'awaiting-tier');
 assert.equal(getTournamentStage({...initial,tier:3}),'tier-approved');
 assert.equal(getTournamentStage({...initial,tier:3,teamName:'SQUAD 01'}),'tier-approved');
 assert.equal(getTournamentStage({...initial,tier:3,teamName:'SQUAD 01',eventStatus:'locked'}),'tier-approved');
 assert.equal(getTournamentStage({...initial,tier:3,teamName:'SQUAD 01',eventStatus:'published'}),'roster');
 assert.equal(getTournamentStage({...initial,tier:3,teamName:'SQUAD 01',eventStatus:'finished'}),'roster');
});

test('a private, unpaid, or unconfirmed roster never appears to players',()=>{
 for (const status of ['draft','open','locked']) {
  assert.equal(rosterMayBeShown({...initial,tier:1,teamName:'SQUAD 99',eventStatus:status}),false);
 }
 assert.equal(rosterMayBeShown({...initial,teamName:'SQUAD 01',eventStatus:'published',registrationStatus:'cancelled'}),false);
 assert.equal(rosterMayBeShown({...initial,teamName:null,eventStatus:'published'}),false);
 assert.equal(rosterMayBeShown({...initial,teamName:'SQUAD 01',eventStatus:'published'}),true);
});
