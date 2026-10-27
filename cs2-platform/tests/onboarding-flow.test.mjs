import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOnboardingStage, shouldShowFirstVisitSetup, validDraft } from '../lib/onboarding-flow.ts';

test('first-time visitors get the wizard and returning players can bypass it', () => {
  assert.equal(shouldShowFirstVisitSetup(false, false), true);
  assert.equal(shouldShowFirstVisitSetup(false, true), false);
  assert.equal(shouldShowFirstVisitSetup(true, false), false);
  assert.equal(shouldShowFirstVisitSetup(true, true), false);
});

test('setup stages depend on verified provider connections, never on local preferences', () => {
  assert.equal(nextOnboardingStage(false, false), 1);
  assert.equal(nextOnboardingStage(false, true), 1);
  assert.equal(nextOnboardingStage(true, false), 2);
  assert.equal(nextOnboardingStage(true, true), 3);
});

test('nickname and CS2 roles are validated before a draft can be saved', () => {
  assert.equal(validDraft({nickname:'test',primary_role:'AWPer',secondary_role:'Support'}),true);
  assert.equal(validDraft({nickname:'a',primary_role:'AWPer',secondary_role:'Support'}),false);
  assert.equal(validDraft({nickname:'x'.repeat(33),primary_role:'AWPer',secondary_role:'Support'}),false);
  assert.equal(validDraft({nickname:'test',primary_role:'AWPer',secondary_role:'AWPer'}),false);
  assert.equal(validDraft({nickname:'test',primary_role:'Fake',secondary_role:'Support'}),false);
  assert.equal(validDraft(null),false);
  assert.equal(validDraft([]),false);
});
