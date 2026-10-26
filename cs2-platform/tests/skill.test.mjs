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
