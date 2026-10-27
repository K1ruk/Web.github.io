import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFaceitMetrics, recentFaceitMetrics, lifetimeFaceitMetrics } from '../lib/faceit-metrics.ts';
import { provisionalSkill } from '../lib/skill.ts';

test('parses FACEIT real-world aggregate labels, preserving role-specific evidence', () => {
  const metrics = parseFaceitMetrics({
    'Average K/D Ratio': '1.15',
    'Average K/R Ratio': '0.78',
    ADR: '88.9',
    'Average Assists': '6.1',
    'Average Headshots %': '44',
    'Win Rate %': '57',
    'Entry Rate': '0.19',
    'Entry Success Rate': '0.58',
    'Utility Damage per Round': '8.2',
    'Enemies Flashed per Round': '0.47',
    '1v1 Win Rate': '0.53',
    '1v2 Win Rate': '0.24',
    'Sniper Kill Rate': '0.12',
  });
  assert.equal(metrics.adr, 88.9);
  assert.equal(metrics.assistsPerMatch, 6.1);
  assert.equal(metrics.utilityDamagePerRound, 8.2);
  assert.equal(metrics.enemiesFlashedPerRound, .47);
  assert.equal(metrics.entrySuccessRate, .58);
  assert.equal(metrics.clutch1v1Rate, .53);
  assert.equal(metrics.headshotPercent, 44);
  assert.equal(metrics.winRatePercent, 57);
  assert.equal(metrics.sniperKillRate, .12);
});

test('missing and invalid FACEIT advanced fields remain null, never zero or fabricated', () => {
  const result = parseFaceitMetrics({
    'K/D Ratio': '',
    ADR: 'not tracked',
    'Entry Success Rate': '1.7',
    '1v1 Win Rate': '-1',
    'Average K/R Ratio': '165.18', // often a different aggregate in other fields
    'Win Rate %': '54',
  });
  assert.equal(result.kd, null);
  assert.equal(result.adr, null);
  assert.equal(result.entrySuccessRate, null);
  assert.equal(result.clutch1v1Rate, null);
  assert.equal(result.killsPerRound, null);
  assert.equal(result.winRatePercent, 54);
});

test('recent average counts only matches exposing each exact statistic', () => {
  const recent = recentFaceitMetrics([
    { stats: { 'K/D Ratio': '1.40', ADR: '100', Assists: '6', 'Entry Success Rate': '65%' } },
    { stats: { 'K/D Ratio': '1.00', Assists: '8', 'Enemies Flashed per Round': '0.5' } },
    { stats: {} },
  ]);
  assert.equal(recent.metrics.kd, 1.2);
  assert.equal(recent.metrics.adr, 100);
  assert.equal(recent.metrics.assistsPerMatch, 7);
  assert.equal(recent.metrics.entrySuccessRate, .65);
  assert.equal(recent.counts.adr, 1);
  assert.equal(recent.counts.assistsPerMatch, 2);
  assert.equal(recent.counts.enemiesFlashedPerRound, 1);
  assert.equal(recent.matches, 2);
});

test('lifetime coverage is distinct from recent match samples', () => {
  const result = lifetimeFaceitMetrics({
    Matches: '151',
    'Average K/D Ratio': '1.24',
    ADR: '91.20',
    'Average Assists': '5.8',
  });
  assert.equal(result.matches, 151);
  assert.equal(result.metrics.adr, 91.2);
  assert.equal(result.metrics.assistsPerMatch, 5.8);
  assert.equal(lifetimeFaceitMetrics(null).matches, null);
});

test('a strong support player earns some positive evidence even without high K/D', () => {
  const standard = provisionalSkill(1850, .83, 30);
  const support = provisionalSkill(1850, .83, 30, {
    recentMetrics: {
      assistsPerMatch: 7.4,
      utilityDamagePerRound: 9,
      enemiesFlashedPerRound: .53,
      kd: .83,
      adr: 68,
    },
  });
  assert.ok(support.performanceAreas.teamplay > 1.5);
  assert.ok(support.score > standard.score);
  assert.ok(support.performanceBonus <= 7.5);
});

test('strong entry and clutch stats help without relying on headshots or sniper percentage', () => {
  const ordinary = provisionalSkill(2000, 1.0, 25);
  const entry = provisionalSkill(2000, 1.0, 25, {
    recentMetrics: { entryRate: .22, entrySuccessRate: .68, clutch1v1Rate: .60 },
  });
  assert.ok(entry.performanceAreas.opening > .2);
  assert.ok(entry.performanceAreas.clutch > 0);
  assert.ok(entry.score > ordinary.score);
});

test('low and missing secondary metrics cannot push an Elo suggestion downward', () => {
  const baseline = provisionalSkill(2400, null, 30);
  const cold = provisionalSkill(2400, .2, 30, {
    recentMetrics: {
      adr: 20, killsPerRound: .1, assistsPerMatch: 0,
      entrySuccessRate: .1, clutch1v1Rate: .05,
    },
  });
  assert.equal(cold.score, baseline.score);
  assert.equal(cold.performanceBonus, 0);
});

test('lifetime support performance protects against a short bad streak', () => {
  const base = provisionalSkill(1700, .2, 30, {
    lifetimeMatches: 150,
    lifetimeKd: 1,
    lifetimeMetrics: {
      assistsPerMatch: 7.9,
      enemiesFlashedPerRound: .58,
      utilityDamagePerRound: 10,
    },
  });
  assert.equal(base.performanceSource, 'lifetime');
  assert.ok(base.performanceAreas.teamplay > 0);
});

test('advanced metrics with fewer than ten usable match samples cannot inflate ratings', () => {
  const inflated = provisionalSkill(1600, 1.2, 30, {
    recentMetrics: { adr: 240, utilityDamagePerRound: 50, entrySuccessRate: .9 },
    recentMetricSamples: { kd: 30, adr: 2, utilityDamagePerRound: 2, entrySuccessRate: 1 },
  });
  const baseline = provisionalSkill(1600, 1.2, 30);
  assert.equal(inflated.score, baseline.score);
  assert.equal(inflated.performanceAreas.opening, 0);
});

test('headshot and AWP usage never penalize AWPers relative to riflers', () => {
  const awper = provisionalSkill(2000, 1.1, 25, {
    recentMetrics: { adr: 85, headshotPercent: 14, sniperKillRate: .65 },
  });
  const rifler = provisionalSkill(2000, 1.1, 25, {
    recentMetrics: { adr: 85, headshotPercent: 70, sniperKillRate: 0 },
  });
  assert.equal(awper.score, rifler.score);
});

test('high recent ADR but lower FACEIT Elo requests manual review, not a penalty', () => {
  const stats = provisionalSkill(1500, .92, 25, {
    recentMetrics: { adr: 103 },
    recentMetricSamples: { adr: 25, kd: 25 },
  });
  assert.ok(stats.reviewFlags.includes('damage_elo_mismatch'));
  assert.ok(stats.score >= provisionalSkill(1500, .92, 25).score);
});
