import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, isAdmin } from '@/lib/auth';
import { faceitConfigured } from '@/lib/faceit';
import { NEXUS_FACEIT_CLUB_ID, NEXUS_FACEIT_CLUB_URL, NEXUS_FACEIT_TEST_MATCH_URL } from '@/lib/faceit-club';
import { FaceitClubClient } from './FaceitClubClient';

export const dynamic = 'force-dynamic';

export default async function ClubInspectorPage() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return <main className="content-page">
      <h1 className="page-heading">SETUP REQUIRED</h1>
      <p className="lead">Configure SUPABASE_SECRET_KEY on the server first.</p>
    </main>;
  }

  const user = await requireUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) {
    return <main className="content-page">
      <h1 className="page-heading">RESTRICTED</h1>
      <p className="lead">Match inspection is reserved for NEXUS tournament administrators.</p>
      <Link href="/dashboard" className="outline-button margin-top">MY PROFILE</Link>
    </main>;
  }

  return <FaceitClubClient
    clubId={NEXUS_FACEIT_CLUB_ID}
    clubUrl={NEXUS_FACEIT_CLUB_URL}
    initialMatchUrl={NEXUS_FACEIT_TEST_MATCH_URL}
    apiConfigured={faceitConfigured()}
  />;
}
