import 'server-only';
import { provisionalSkill } from '@/lib/skill';
type FaceitPlayer={player_id:string;nickname:string;games?:Record<string,{faceit_elo?:number;skill_level?:number}>;steam_id_64?:string};
async function faceitGet<T>(path:string):Promise<T|null>{
 const key=process.env.FACEIT_API_KEY;
 if(!key)throw new Error('FACEIT API is not configured');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
 try{const response=await fetch('https://open.faceit.com/data/v4'+path,{headers:{Authorization:'Bearer '+key},signal:controller.signal,cache:'no-store'});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('FACEIT unavailable: '+response.status);
  return await response.json() as T;
 }finally{clearTimeout(timeout);}
}
export async function analyzeSteam(steamId:string){
 if(!/^[0-9]{17}$/.test(steamId))throw new Error('Invalid verified Steam ID');
 const player=await faceitGet<FaceitPlayer>('/players?game=cs2&game_player_id='+encodeURIComponent(steamId));
 const elo=player?.games?.cs2?.faceit_elo;
 if(!player||typeof elo!=='number')return {found:false as const,reason:'No available linked CS2 FACEIT ranking; requires manual tier review'};
 const result=await faceitGet<{items?:Array<{stats?:Record<string,string>}>}>('/players/'+encodeURIComponent(player.player_id)+'/games/cs2/stats?offset=0&limit=30');
 const kdValues=(result?.items||[]).map(i=>Number(i.stats?.['K/D Ratio'])).filter(n=>Number.isFinite(n)&&n>0&&n<15);
 const kd=kdValues.length?kdValues.reduce((a,b)=>a+b,0)/kdValues.length:null;
 const suggested=provisionalSkill(elo,kd,kdValues.length);
 return {found:true as const,playerId:player.player_id,nickname:player.nickname,elo,recentKd:kd,matches:kdValues.length,...suggested};
}
