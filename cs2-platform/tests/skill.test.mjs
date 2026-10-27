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


test('recent K/D adjustment is bounded to four score points',()=>{
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

test('larger recent-match samples receive their proper confidence labels',()=>{
 assert.equal(provisionalSkill(2400,1.15,10).confidence,'limited');
 assert.equal(provisionalSkill(2400,1.15,20).confidence,'recent-data');
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
