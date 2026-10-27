import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { faceitConfigured } from '@/lib/faceit';
import { SkillLabClient } from './SkillLabClient';

export const dynamic = 'force-dynamic';

export default async function SkillLab() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return (
      <main className="content-page">
        <span className="section-kicker">ADMIN / CONFIGURATION</span>
        <h1 className="page-heading">SETUP REQUIRED</h1>
        <p className="lead">The private Supabase server key must be configured before opening the skill lab.</p>
      </main>
    );
  }

  const user = await requireUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) {
    return (
      <main className="content-page">
        <span className="section-kicker">ADMIN / ACCESS</span>
        <h1 className="page-heading">RESTRICTED</h1>
        <p className="lead">Skill analysis tools are available to verified administrators only.</p>
        <Link href="/dashboard" className="outline-button margin-top">MY PROFILE</Link>
      </main>
    );
  }

  const db = adminDb();
  const [steam, profile] = await Promise.all([
    db.from('steam_links').select('steam_id').eq('user_id', user.id).maybeSingle(),
    db.from('profiles').select('nickname').eq('user_id', user.id).maybeSingle(),
  ]);

  if (steam.error || profile.error) {
    return (
      <main className="content-page">
        <h1 className="page-heading">DATA UNAVAILABLE</h1>
        <p className="lead">Unable to load the verified player identity. Check your Supabase server credentials.</p>
      </main>
    );
  }

  return (
    <SkillLabClient
      playerName={profile.data?.nickname || 'NEXUS Admin'}
      steamId={steam.data?.steam_id || null}
      apiConfigured={faceitConfigured()}
    />
  );
}
