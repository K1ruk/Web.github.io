import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="content-page">
        <span className="section-kicker">ACCOUNT / CONFIGURATION</span>
        <h1 className="page-heading">SETUP REQUIRED</h1>
        <p className="lead">Configure the private Supabase server key to load player accounts.</p>
      </main>
    );
  }

  const user = await requireUser();
  if (!user) redirect('/login');

  const db = adminDb();
  const [profileResult, steamResult, regsResult] = await Promise.all([
    db.from('profiles')
      .select('nickname,primary_role,secondary_role,preferred_language')
      .eq('user_id', user.id).maybeSingle(),
    db.from('steam_links')
      .select('steam_id')
      .eq('user_id', user.id).maybeSingle(),
    db.from('registrations')
      .select('id,status,tournament_id,assigned_tier,internal_score')
      .eq('user_id', user.id).order('created_at', { ascending: false }),
  ]);

  // A failed privileged query is not the same as "Steam is not linked".
  // Avoid showing misleading account state when credentials are incorrect.
  if (profileResult.error || steamResult.error || regsResult.error) {
    return (
      <main className="content-page">
        <span className="section-kicker">ACCOUNT / SERVICE</span>
        <h1 className="page-heading">ACCOUNT UNAVAILABLE</h1>
        <p className="lead">Your login is active, but account details could not be loaded. Check the Supabase server key configuration and try again.</p>
        <Link href="/dashboard" className="outline-button margin-top">TRY AGAIN <span className="button-line" aria-hidden="true" /></Link>
      </main>
    );
  }

  const registrations = regsResult.data || [];
  const tournamentIds = [...new Set(registrations.map(entry => entry.tournament_id))];
  const { data: events } = tournamentIds.length
    ? await db.from('tournaments').select('id,name,status').in('id', tournamentIds)
    : { data: [] };
  const { data: members } = registrations.length
    ? await db.from('team_members').select('registration_id,team_id').in('registration_id', registrations.map(entry => entry.id))
    : { data: [] };
  const teamIds = [...new Set((members || []).map(member => member.team_id))];
  const { data: teams } = teamIds.length
    ? await db.from('teams').select('id,name').in('id', teamIds)
    : { data: [] };

  const providers = user.app_metadata?.providers;
  const discordConnected =
    (Array.isArray(providers) && providers.includes('discord')) ||
    user.app_metadata?.provider === 'discord';

  return (
    <DashboardClient
      email={user.email || ''}
      discordConnected={discordConnected}
      profile={profileResult.data}
      steamId={steamResult.data?.steam_id || null}
      registrations={registrations.map(entry => ({
        ...entry,
        tournamentName: events?.find(event => event.id === entry.tournament_id)?.name || 'Event',
        teamName: teams?.find(team =>
          team.id === members?.find(member => member.registration_id === entry.id)?.team_id
        )?.name || null,
      }))}
    />
  );
}
