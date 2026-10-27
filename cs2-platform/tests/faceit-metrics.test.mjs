import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFaceitMetrics, recentFaceitMetrics, lifetimeFaceitMetrics } from '../lib/faceit-metrics.ts';
import { provisionalSkill } from '../lib/skill.ts';

test('reads the four NEXUS signals from exact FACEIT-style values',()=>{
  const m=parseFaceitMetrics({
    ADR:'94.2','KAST %':'75.1','Opening Duel Win %':'59%', 'K/D Ratio':'1.29',
    'Headshots %':'75','Win Rate %':'62'
  });
  assert.equal(m.adr,94.2);
  assert.equal(m.kastPercent,75.1);
  assert.equal(m.openingDuelWinPercent,59);
  assert.equal(m.kd,1.29);
  assert.deepEqual(Object.keys(m).sort(),['adr','kastPercent','kd','openingDuelWinPercent'].sort());
});

test('does not mix duel counts with opening win percentages',()=>{
  const m=parseFaceitMetrics({'Opening Duels Won':'8','Opening Duels Lost':'12'});
  assert.equal(m.openingDuelWinPercent,40);
  assert.notEqual(m.openingDuelWinPercent,8);
});

test('first-kill and first-death counts only derive opening success when both exist',()=>{
  assert.equal(parseFaceitMetrics({'First Kills':'5','First Deaths':'5'}).openingDuelWinPercent,50);
  assert.equal(parseFaceitMetrics({'First Kills':'5'}).openingDuelWinPercent,null);
  assert.equal(parseFaceitMetrics({'Kills':'30','Deaths':'10'}).openingDuelWinPercent,null);
  assert.equal(parseFaceitMetrics({'Opening Duels Won':'0','Opening Duels Lost':'0'}).openingDuelWinPercent,null);
});

test('parses fractional KAST and entry rates consistently as 0–100 percentages',()=>{
  const m=parseFaceitMetrics({'KAST':0.748,'Opening Duel Win Rate':0.58});
  assert.equal(m.kastPercent,74.8);
  assert.equal(m.openingDuelWinPercent,58);
  assert.equal(parseFaceitMetrics({'KAST %':'76.3%'}).kastPercent,76.3);
  assert.equal(parseFaceitMetrics({'Entry Success Rate':'0.65'}).openingDuelWinPercent,65);
});

test('unavailable and malformed signals stay null, never zero',()=>{
  const m=parseFaceitMetrics({
    ADR:'not recorded',
    KAST:'',
    'Opening Duel Win %':'103%',
    'Average K/D Ratio':'',
  });
  assert.deepEqual(Object.values(m),[null,null,null,null]);
  assert.equal(parseFaceitMetrics(null).kastPercent,null);
  assert.equal(parseFaceitMetrics({'KAST %':'-10%'}).kastPercent,null);
});

test('recent averages track the coverage of each stat rather than invent full 30 matches',()=>{
  const result=recentFaceitMetrics([
    {stats:{ADR:'95',KAST:'72','Opening Duel Win %':'54', 'K/D Ratio':'1.2'}},
    {stats:{ADR:'85',KAST:'78','Opening Duel Win %':'62', 'K/D Ratio':'1.4'}},
    {stats:{'K/D Ratio':'1.3'}},
    {stats:{}},
  ]);
  assert.equal(result.metrics.adr,90);
  assert.equal(result.metrics.kastPercent,75);
  assert.equal(result.metrics.openingDuelWinPercent,58);
  assert.equal(result.metrics.kd,1.3);
  assert.equal(result.counts.kastPercent,2);
  assert.equal(result.counts.kd,3);
  assert.equal(result.matches,3);
});

test('opening win rate is weighted by actual duel attempts when all rows have counts',()=>{
  const result=recentFaceitMetrics([
    {stats:{'Opening Kills':'7','Opening Deaths':'3'}},
    {stats:{'Opening Kills':'1','Opening Deaths':'9'}},
  ]);
  assert.equal(result.metrics.openingDuelWinPercent,40);
  assert.equal(result.openingDuels,20);
  assert.equal(result.counts.openingDuelWinPercent,2);
});

test('lifetime aggregates do not become recent match samples',()=>{
  const result=lifetimeFaceitMetrics({
    Matches:'145','Average K/D Ratio':'1.11',
    'Average ADR':'89.8','Average KAST %':'73.3',
    'Opening Duel Success Rate':'57',
  });
  assert.equal(result.matches,145);
  assert.equal(result.metrics.adr,89.8);
  assert.equal(result.metrics.kastPercent,73.3);
  assert.equal(result.metrics.openingDuelWinPercent,57);
  assert.equal(lifetimeFaceitMetrics(null).matches,null);
});

test('the four signal model rewards good measured impact but never punishes weak recent games',()=>{
  const base=provisionalSkill(1850,null,30);
  const high=provisionalSkill(1850,1.35,30,{
    recentMetrics:{adr:102,kastPercent:79,openingDuelWinPercent:64,kd:1.35},
    recentMetricSamples:{adr:30,kastPercent:30,openingDuelWinPercent:30,kd:30},
  });
  assert.equal(high.model,'core-four-v4');
  assert.ok(high.performanceBonus>4);
  assert.ok(high.performanceBonus<=7.5);
  assert.ok(high.score>base.score);
  assert.equal(high.performanceSource,'recent');
  assert.equal(high.confidence,'recent-data');
  assert.ok(high.performanceAreas.adr>0);
  assert.ok(high.performanceAreas.kast>0);
  assert.ok(high.performanceAreas.opening>0);
  assert.ok(high.performanceAreas.kd>0);
});

test('KAST without enough data is not used for a bonus',()=>{
  const baseline=provisionalSkill(1850,null,30);
  const candidate=provisionalSkill(1850,null,30,{
    recentMetrics:{kastPercent:95,adr:130,openingDuelWinPercent:82},
    recentMetricSamples:{kastPercent:2,adr:1,openingDuelWinPercent:3},
  });
  assert.equal(candidate.score,baseline.score);
  assert.equal(candidate.performanceBonus,0);
  assert.equal(candidate.confidence,'elo-only');
});

test('low K/D cannot outweigh good KAST/ADR; no negative score adjustment',()=>{
  const base=provisionalSkill(2000,0.4,30);
  const impact=provisionalSkill(2000,0.4,30,{
    recentMetrics:{adr:103,kastPercent:80,openingDuelWinPercent:50,kd:0.4},
  });
  assert.ok(impact.score>base.score);
  assert.equal(impact.performanceAreas.kd,0);
});

test('strong lifetime KAST/ADR can survive a poor recent streak',()=>{
  const base=provisionalSkill(2150,.6,30,{
    lifetimeMatches:130,
    lifetimeKd:1.23,
    lifetimeMetrics:{adr:94,kastPercent:78,openingDuelWinPercent:63,kd:1.23},
  });
  assert.equal(base.performanceSource,'lifetime');
  assert.ok(base.performanceAreas.kast>0);
  assert.ok(base.performanceBonus>0);
});

test('strong KAST or opening percentage with low Elo asks for review, not punishment',()=>{
  const result=provisionalSkill(1350,1.1,30,{
    recentMetrics:{kastPercent:82,openingDuelWinPercent:71,adr:96},
    recentMetricSamples:{kastPercent:25,openingDuelWinPercent:25,adr:25,kd:25},
  });
  assert.ok(result.reviewFlags.includes('kast_elo_mismatch'));
  assert.ok(result.reviewFlags.includes('opening_elo_mismatch'));
  assert.ok(result.reviewFlags.includes('damage_elo_mismatch'));
  assert.equal(result.reviewRequired,true);
  assert.ok(result.score>=provisionalSkill(1350,1.1,30).score);
});

test('missing opening and KAST do not turn 0 into a meaningful performance reading',()=>{
  const result=provisionalSkill(2200,1.07,30,{
    recentMetrics:{adr:82,kastPercent:null,openingDuelWinPercent:null,kd:1.07},
    recentMetricSamples:{adr:30,kastPercent:0,openingDuelWinPercent:0,kd:30},
  });
  assert.equal(result.performanceAreas.kast,0);
  assert.equal(result.performanceAreas.opening,0);
  assert.equal(result.confidence,'limited');
});
