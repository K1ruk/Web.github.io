import {redirect} from 'next/navigation';import {requireUser} from '@/lib/auth';import {adminDb} from '@/lib/supabase/admin';import {DashboardClient} from './DashboardClient';
export const dynamic='force-dynamic';
export default async function Dashboard(){
 if(!process.env.SUPABASE_SECRET_KEY)return <main className="content-page"><h1>SETUP REQUIRED</h1><p>Configure server environment first.</p></main>;
 const user=await requireUser();if(!user)redirect('/login');
 const db=adminDb();
 const [{data:profile},{data:steam},{data:regs}]=await Promise.all([
  db.from('profiles').select('nickname,primary_role,secondary_role,preferred_language').eq('user_id',user.id).maybeSingle(),
  db.from('steam_links').select('steam_id').eq('user_id',user.id).maybeSingle(),
  db.from('registrations').select('id,status,tournament_id,assigned_tier,internal_score').eq('user_id',user.id).order('created_at',{ascending:false})
 ]);
 const tournamentIds=[...new Set((regs||[]).map(r=>r.tournament_id))];
 const {data:events}=tournamentIds.length?await db.from('tournaments').select('id,name,status').in('id',tournamentIds):{data:[]};
 const {data:members}=(regs||[]).length?await db.from('team_members').select('registration_id,team_id').in('registration_id',(regs||[]).map(r=>r.id)):{data:[]};
 const teamIds=(members||[]).map(m=>m.team_id);
 const {data:teams}=teamIds.length?await db.from('teams').select('id,name').in('id',teamIds):{data:[]};
 return <DashboardClient email={user.email||''} profile={profile} steamId={steam?.steam_id||null} registrations={(regs||[]).map(r=>({...r,tournamentName:events?.find(t=>t.id===r.tournament_id)?.name||'Event',teamName:teams?.find(t=>t.id===members?.find(m=>m.registration_id===r.id)?.team_id)?.name||null}))}/>;
}
