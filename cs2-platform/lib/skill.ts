// Provisional model: exact Elo matters; FACEIT level alone is insufficient.
// Calibration against tournament outcomes is required before treating scores as objective skill.
export function provisionalSkill(elo:number, recentKd:number|null, matches:number){
 if(!Number.isFinite(elo)||elo<0||elo>10000) throw new Error('Invalid Elo');
 const base=100/(1+Math.exp(-(elo-1850)/650));
 const perf=recentKd!==null&&Number.isFinite(recentKd)&&matches>=10?Math.max(-4,Math.min(4,(recentKd-1)*12)):0;
 const score=Math.max(0,Math.min(100,Math.round((base+perf)*100)/100));
 const tier=score<25?1:score<40?2:score<59?3:score<78?4:5;
 return {score,tier,confidence:matches>=20?'recent-data':matches>=10?'limited':'elo-only',model:'provisional-v1',elo,recentKd,matches};
}
