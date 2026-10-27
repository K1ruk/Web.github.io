import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { buildClubDemoCandidates } from '@/lib/demo-tournament';
import { DemoTournamentClient } from './DemoTournamentClient';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** No writes; no Auth test users, Stripe, registrations, or real team records. */
export default async function ClubDemoTournament() {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <main className="content-page">
      <div className="section-kicker">NEXUS / SIMULATION</div>
      <h1 className="page-heading">DATABASE SETUP REQUIRED</h1>
      <p className="lead">A server-side Supabase key is required to read the archived FACEIT Club statistics.</p>
      <Link className="outline-button margin-top" href="/admin">BACK TO ADMIN</Link>
    </main>;
  }
  const user=await requireUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) return <main className="content-page">
    <h1 className="page-heading">ADMIN ONLY</h1>
    <p className="lead">The Club tournament simulator is restricted to NEXUS administrators.</p>
  </main>;

  const db=adminDb();
  const [playerResult,mapResult]=await Promise.all([
    db.from('nexus_club_players').select('faceit_player_id,nickname')
      .order('last_seen_at',{ascending:false}).limit(101),
    db.from('nexus_club_player_maps')
      .select('faceit_player_id,match_id,map_index,adr,kd,nexus_match_rating,raw_stats')
      .limit(5001),
  ]);
  if (playerResult.error || mapResult.error || !playerResult.data || !mapResult.data
    || playerResult.data.length>100 || mapResult.data.length>5000) {
    return <main className="content-page">
      <div className="section-kicker">NEXUS / SIMULATION</div>
      <h1 className="page-heading">ARCHIVE UNAVAILABLE</h1>
      <p className="lead">The saved Club player data could not be loaded completely. No demo registration was created.</p>
      <Link className="outline-button margin-top" href="/admin">BACK TO ADMIN</Link>
    </main>;
  }
  const candidates=buildClubDemoCandidates(playerResult.data,mapResult.data);
  return <DemoTournamentClient candidates={candidates}
    archivePlayers={playerResult.data.length}
    archiveMaps={mapResult.data.length}/>;
}
