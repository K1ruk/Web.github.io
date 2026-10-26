import {adminDb} from '@/lib/supabase/admin';import {Home} from './Home';
export const dynamic='force-dynamic';
export default async function Page(){
 let data:null|{id:string;name:string;status:string;capacity:number;fee_cents:number;currency:string;starts_at:string|null;paid:number}=null;
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY){
  const db=adminDb();
  const {data:t}=await db.from('tournaments').select('id,name,status,capacity,fee_cents,currency,starts_at').in('status',['open','locked','published']).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(t){const {count}=await db.from('registrations').select('id',{head:true,count:'exact'}).eq('tournament_id',t.id).eq('status','paid');data={...t,paid:count||0};}
 }
 return <Home tournament={data}/>;
}
