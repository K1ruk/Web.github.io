import { randomInt } from 'node:crypto';
export type SkillPlayer={registration_id:string;score:number;primary_role:string;secondary_role:string};
export type RosterMember={registration_id:string;assigned_role:string};
const ROLES=['IGL','AWPer','Entry Fragger','Support','Lurker','Rifler'];
const roleFit=(team:SkillPlayer[])=>{
 const igl=team.some(p=>p.primary_role==='IGL'||p.secondary_role==='IGL');
 const awps=team.filter(p=>p.primary_role==='AWPer').length;
 return (igl?0:150)+(awps>1?(awps-1)*90:0);
};
export function buildBalancedTeams(players:SkillPlayer[]):RosterMember[][]{
 if(players.length<5||players.length%5!==0)throw new Error('Paid participant count must be divisible by five');
 if(players.some(p=>!Number.isFinite(p.score)||p.score<0||p.score>100))throw new Error('Every paid player needs an approved score');
 if(new Set(players.map(p=>p.registration_id)).size!==players.length)throw new Error('Duplicate registration');
 const n=players.length/5;
 // Strong players distributed with a serpentine draft; local search balances skill and roles.
 const initial=players.map(p=>({p,random:randomInt(0x7fffffff)})).sort((a,b)=>Math.floor(b.p.score/8)-Math.floor(a.p.score/8)||a.random-b.random).map(x=>x.p);
 const squads:SkillPlayer[][]=Array.from({length:n},()=>[]);
 initial.forEach((p,i)=>{const row=Math.floor(i/n);const idx=row%2===0?i%n:n-1-i%n;squads[idx].push(p);});
 const mean=players.reduce((sum,p)=>sum+p.score,0)/n;
 const penalty=()=>squads.reduce((total,t)=>{const sum=t.reduce((s,p)=>s+p.score,0);return total+(sum-mean)**2+roleFit(t)},0);
 let current=penalty();
 for(let step=0;step<8;step++){
   let best=current,bestSwap:null|[number,number,number,number]=null;
   for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let i=0;i<5;i++)for(let j=0;j<5;j++){
      [squads[a][i],squads[b][j]]=[squads[b][j],squads[a][i]];
      const value=penalty();
      if(value<best-0.00001){best=value;bestSwap=[a,b,i,j];}
      [squads[a][i],squads[b][j]]=[squads[b][j],squads[a][i]];
   }
   if(!bestSwap)break;
   const [a,b,i,j]=bestSwap;[squads[a][i],squads[b][j]]=[squads[b][j],squads[a][i]];current=best;
 }
 return squads.map(team=>{
  const remaining=new Set(ROLES);
  const sorted=[...team].sort((a,b)=>Number(b.primary_role==='IGL')-Number(a.primary_role==='IGL'));
  return sorted.map(p=>{
    const assigned_role=remaining.has(p.primary_role)?p.primary_role:remaining.has(p.secondary_role)?p.secondary_role:(remaining.values().next().value||p.primary_role);
    remaining.delete(assigned_role);
    return {registration_id:p.registration_id,assigned_role};
  });
 });
}
