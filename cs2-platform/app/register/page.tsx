import {requireUser} from '@/lib/auth';import {adminDb} from '@/lib/supabase/admin';import {redirect} from 'next/navigation';import {RegistrationClient} from './RegistrationClient';
export const dynamic='force-dynamic';
export default async function Register(){
 if(!process.env.SUPABASE_SECRET_KEY||!process.env.NEXT_PUBLIC_SUPABASE_URL)return <main className="content-page"><h1 className="page-heading">SETUP REQUIRED</h1><p className="lead">Connect Supabase and apply the migrations first.</p></main>;
 const user=await requireUser();if(!user)redirect('/login');
 const db=adminDb();
 const [{data:profile},{data:steam},{data:tournaments},{data:registrations}]=await Promise.all([
  db.from('profiles').select('nickname,primary_role,secondary_role,preferred_language').eq('user_id',user.id).maybeSingle(),
  db.from('steam_links').select('steam_id').eq('user_id',user.id).maybeSingle(),
  db.from('tournaments').select('id,name,fee_cents,currency,capacity,status').eq('status','open').order('created_at',{ascending:false}),
  db.from('registrations').select('tournament_id,status').eq('user_id',user.id)
 ]);
 return <RegistrationClient profile={profile} steamId={steam?.steam_id||null} tournaments={tournaments||[]} registrations={registrations||[]}/>;
}
