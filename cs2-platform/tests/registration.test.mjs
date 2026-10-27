import test from 'node:test';
import assert from 'node:assert/strict';
import { profileIsReady, entryAvailability, activePayment, confirmedEntry, displayFee } from '../lib/registration.ts';

const now = Date.parse('2026-10-27T12:00:00Z');
const tournament = {
  id:'11111111-1111-4111-8111-111111111111', name:'Nexus Cup', slug:'nexus-cup',
  status:'open', currency:'eur', fee_cents:1500, capacity:50,
  confirmed:12, starts_at:'2026-11-07T12:00:00Z',
  registration_closes_at:'2026-11-06T12:00:00Z',
};

test('entry availability follows the real event status, capacity and dates',()=>{
  assert.equal(entryAvailability(tournament,now),'open');
  assert.equal(entryAvailability({...tournament,status:'locked'},now),'closed');
  assert.equal(entryAvailability({...tournament,confirmed:50},now),'full');
  assert.equal(entryAvailability({...tournament,starts_at:'2026-10-26T12:00:00Z'},now),'closed');
  assert.equal(entryAvailability({...tournament,registration_closes_at:'2026-10-26T12:00:00Z'},now),'closed');
});

test('profiles need distinct roles and a player-selected nickname',()=>{
 const valid={nickname:'ProAce',primary_role:'Rifler',secondary_role:'Support',preferred_language:'en'};
 assert.equal(profileIsReady(valid),true);
 assert.equal(profileIsReady({...valid,nickname:'Player-deadbeef'}),false);
 assert.equal(profileIsReady({...valid,secondary_role:'Rifler'}),false);
 assert.equal(profileIsReady({...valid,primary_role:null}),false);
});

test('expired payment holds are not treated as active registrations',()=>{
 assert.equal(activePayment({tournament_id:'t',status:'pending_payment',hold_expires_at:'2026-10-27T13:00:00Z'},now),true);
 assert.equal(activePayment({tournament_id:'t',status:'pending_payment',hold_expires_at:'2026-10-26T13:00:00Z'},now),false);
 assert.equal(confirmedEntry({tournament_id:'t',status:'paid',hold_expires_at:null}),true);
 assert.equal(confirmedEntry({tournament_id:'t',status:'pending_payment',hold_expires_at:null}),false);
});

test('entry fee formatting uses stored cents and currency',()=>{
 assert.match(displayFee(1500,'eur','en'),/15/);
});
