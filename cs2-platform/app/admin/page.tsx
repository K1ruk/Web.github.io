import {redirect} from 'next/navigation';import {requireUser,isAdmin} from '@/lib/auth';import {adminDb} from '@/lib/supabase/admin';import {AdminClient} from './AdminClient';
export const dynamic='force-dynamic';
export default async function Admin(){
 if(!process.env.SUPABASE_SECRET_KEY)return <main className="content-page"><h1>SETUP REQUIRED</h1></main>;
 const user=await requireUser();if(!user)redirect('/login');if(!await isAdmin(user.id))return <main className="content-page"><h1 className="page-heading">RESTRICTED</h1><p className="lead">This page is available to verified tournament administrators only.</p></main>;
 const db=adminDb();const {data:tournaments}=await db.from('tournaments').select('id,name,status,capacity,fee_cents,currency').order('created_at',{ascending:false}).limit(50);
 const {data:registrations}=await db.from('registrations').select('id,tournament_id,user_id,status,assigned_tier,internal_score,primary_role,secondary_role').order('created_at',{ascending:false}).limit(1000);
 const ids=[...new Set((registrations||[]).map(r=>r.user_id))];
 const {data:profiles}=ids.length?await db.from('profiles').select('user_id,nickname').in('user_id',ids):{data:[]};
 const [{data:teams},{data:matches}]=await Promise.all([db.from('teams').select('id,name,tournament_id').order('name').limit(300),db.from('matches').select('id,tournament_id,team_a,team_b,stage,status,best_of,scheduled_at,score_a,score_b').order('scheduled_at',{ascending:true}).limit(300)]);\n return <AdminClient teams={teams||[]} matches={matches||[]} tournaments={tournaments||[]} registrations={(registrations||[]).map(r=>({...r,nickname:profiles?.find(p=>p.user_id===r.user_id)?.nickname||'Player'}))}/>;
}
