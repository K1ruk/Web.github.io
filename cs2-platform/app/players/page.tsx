import {serverDb} from '@/lib/supabase/server';import {Directory} from './Directory';
export const dynamic='force-dynamic';
export default async function Players(){
 let players:{nickname:string;primary_role:string;secondary_role:string;tier:number;team_name:string}[]=[];
 if(process.env.NEXT_PUBLIC_SUPABASE_URL){const db=await serverDb();const {data}=await db.rpc('published_players');players=data||[];}
 return <Directory players={players}/>;
}
