import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBalancedTeams} from '../lib/teams.ts';
const roles=['IGL','AWPer','Entry Fragger','Support','Lurker','Rifler'];
const players=(n)=>Array.from({length:n},(_,i)=>({registration_id:'r-'+i,score:Math.min(100,25+i*2),primary_role:roles[i%6],secondary_role:roles[(i+2)%6]}));
test('groups paid participants into five-person squads with no duplicates',()=>{
 const input=players(50),output=buildBalancedTeams(input),ids=output.flat().map(x=>x.registration_id);
 assert.equal(output.length,10);assert.ok(output.every(x=>x.length===5));assert.equal(new Set(ids).size,50);
});
test('reports invalid participant counts and duplicate entries',()=>{
 assert.throws(()=>buildBalancedTeams(players(7)),/divisible/);
 const copy=players(10);copy[9].registration_id=copy[0].registration_id;
 assert.throws(()=>buildBalancedTeams(copy),/Duplicate/);
});
test('assigns valid roles and keeps individual skill spread reasonably balanced',()=>{
 const input=players(20),output=buildBalancedTeams(input);
 const index=new Map(input.map(p=>[p.registration_id,p]));
 const sums=output.map(team=>team.reduce((sum,p)=>sum+index.get(p.registration_id).score,0));
 assert.ok(Math.max(...sums)-Math.min(...sums)<55);
 assert.ok(output.flat().every(p=>roles.includes(p.assigned_role)));
});
