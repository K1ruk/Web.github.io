import test from 'node:test';import assert from 'node:assert/strict';import {provisionalSkill} from '../lib/skill.ts';
test('exact Elo distinguishes FACEIT level 10 players',()=>{
 const low=provisionalSkill(2050,1.1,25),high=provisionalSkill(3500,1.1,25);
 assert.ok(high.score>low.score+15);assert.ok(high.tier>=low.tier);
});
test('missing statistics return elo-only confidence and valid score',()=>{
 const result=provisionalSkill(1800,null,0);
 assert.equal(result.confidence,'elo-only');assert.ok(result.score>=0&&result.score<=100);
});
test('rejects impossible Elo',()=>assert.throws(()=>provisionalSkill(-1,null,0)));


test('recent K/D impact stays small relative to Elo',()=>{
  const base=provisionalSkill(2000,null,0);
  const high=provisionalSkill(2000,5,30);
  const low=provisionalSkill(2000,0.2,30);
  assert.ok(high.score-base.score<=4.01);
  assert.ok(base.score-low.score<=4.01);
});

test('small samples never change the Elo-only score',()=>{
 const base=provisionalSkill(1750,null,0);
 const insufficient=provisionalSkill(1750,3.2,9);
 assert.equal(insufficient.score,base.score);
 assert.equal(insufficient.confidence,'elo-only');
});

test('confidence distinguishes match volume from actual advanced-stat coverage',()=>{
 assert.equal(provisionalSkill(2400,1.15,10).confidence,'limited');
 assert.equal(provisionalSkill(2400,1.15,20).confidence,'limited');
 assert.equal(provisionalSkill(2400,null,30).confidence,'elo-only');
 assert.equal(provisionalSkill(2400,1.15,25,{
   recentMetrics:{adr:90,kastPercent:76,openingDuelWinPercent:57,kd:1.15},
   recentMetricSamples:{adr:25,kastPercent:25,openingDuelWinPercent:25,kd:25},
 }).confidence,'recent-data');
});

test('monotonic Elo comparisons preserve increasing tier strength',()=>{
 const elos=[800,1200,1600,2000,2300,2700,3100,3600];
 const ratings=elos.map(elo=>provisionalSkill(elo,null,0));
 ratings.forEach((r,i)=>{
   assert.ok(r.score>=0&&r.score<=100);
   assert.ok(r.tier>=1&&r.tier<=5);
   if(i>0){assert.ok(r.score>ratings[i-1].score);assert.ok(r.tier>=ratings[i-1].tier);}
 });
});


test('deliberately bad recent K/D never earns an easier tier', () => {
  const baseline=provisionalSkill(2200,null,0);
  const badStreak=provisionalSkill(2200,0.18,30);
  assert.equal(badStreak.score,baseline.score);
  assert.equal(badStreak.tier,baseline.tier);
  assert.equal(badStreak.performanceBonus,0);
});

test('previous observed Elo protects a rating when current Elo falls sharply', () => {
  const current=provisionalSkill(1400,0.4,30);
  const protectedRating=provisionalSkill(1400,0.4,30,{historicalPeakElo:2300});
  assert.equal(protectedRating.protectedElo,2150);
  assert.ok(protectedRating.score>current.score);
  assert.ok(protectedRating.reviewFlags.includes('historical_elo_drop'));
  assert.equal(protectedRating.reviewRequired,true);
});

test('legitimate small Elo changes are allowed without an integrity flag', () => {
  const result=provisionalSkill(2130,1.05,30,{historicalPeakElo:2210});
  assert.equal(result.protectedElo,2130);
  assert.equal(result.reviewFlags.includes('historical_elo_drop'),false);
});

test('the system never claims to know a peak when it has no snapshot', () => {
  const result=provisionalSkill(1100,1.1,25);
  assert.equal(result.historicalPeakElo,null);
  assert.equal(result.protectedElo,1100);
});

test('unusually strong statistics trigger review, not automatic punishment', () => {
  const result=provisionalSkill(1100,1.8,25,{lifetimeMatches:260,lifetimeKd:1.62});
  assert.equal(result.reviewRequired,true);
  assert.ok(result.reviewFlags.includes('recent_performance_mismatch'));
  assert.ok(result.reviewFlags.includes('lifetime_performance_mismatch'));
  assert.ok(result.score>=0&&result.score<=100);
});

test('limited history triggers a review signal without inventing player guilt', () => {
  const result=provisionalSkill(2000,null,0,{lifetimeMatches:8});
  assert.ok(result.reviewFlags.includes('limited_faceit_history'));
  assert.equal(result.performanceBonus,0);
});

test('invalid historical Elo cannot inflate or poison the calculation', () => {
  const current=provisionalSkill(1950,null,0);
  for (const prior of [-100,10001,Number.NaN]) {
    const result=provisionalSkill(1950,null,0,{historicalPeakElo:prior});
    assert.equal(result.score,current.score);
    assert.equal(result.historicalPeakElo,null);
  }
});
