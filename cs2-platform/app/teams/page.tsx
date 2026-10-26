import {serverDb} from '@/lib/supabase/server';import {TeamDirectory} from './TeamDirectory';
export const dynamic='force-dynamic';
export default async function Teams(){let teams:{id:string;name:string}[]=[];
 if(process.env.NEXT_PUBLIC_SUPABASE_URL){const db=await serverDb();const {data}=await db.from('teams').select('id,name').order('name').limit(100);teams=data||[];}
 return <TeamDirectory teams={teams}/>;
}
