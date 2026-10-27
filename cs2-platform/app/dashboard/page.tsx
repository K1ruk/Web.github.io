import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';

function greetingName(nickname: string | undefined, metadata: Record<string, unknown>) {
  if (nickname && !/^Player-[0-9a-f]{8}$/i.test(nickname)) return nickname;
  // OAuth profile names are used for display only, never permissions.
  for (const key of ['global_name', 'name', 'full_name', 'user_name']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim() && value.length <= 40) {
      return value.trim();
    }
  }
  return nickname || 'Player';
}

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

  // Do not misrepresent failed privileged queries as a player with no stats.
  if (profileResult.error || steamResult.error || regsResult.error) {
    return (
      <main className="content-page">
        <span className="section-kicker">ACCOUNT / SERVICE</span>
        <h1 className="page-heading">ACCOUNT UNAVAILABLE</h1>
        <p className="lead">Your login is active, but account details could not be loaded. Check the Supabase server key and try again.</p>
        <Link href="/dashboard" className="outline-button margin-top">TRY AGAIN <span className="button-line" aria-hidden="true" /></Link>
      </main>
    );
  }

  const registrations = regsResult.data || [];
  const tournamentIds = [...new Set(registrations.map(entry => entry.tournament_id))];
  const eventsResult = tournamentIds.length
    ? await db.from('tournaments').select('id,name,status').in('id', tournamentIds)
    : { data: [], error: null };
  if (eventsResult.error) {
    return (
      <main className="content-page">
        <span className="section-kicker">ACCOUNT / SERVICE</span>
        <h1 className="page-heading">STATS UNAVAILABLE</h1>
        <p className="lead">Tournament history couldn't be loaded. Please refresh this page.</p>
        <Link href="/dashboard" className="outline-button margin-top">TRY AGAIN</Link>
      </main>
    );
  }

  const events = eventsResult.data || [];
  const visibleTournamentIds = new Set(events.filter(event =>
    event.status === 'published' || event.status === 'finished'
  ).map(event => event.id));
  const confirmedRegistrations = registrations.filter(entry => entry.status === 'paid');
  const publishedRegistrationIds = confirmedRegistrations
    .filter(entry => visibleTournamentIds.has(entry.tournament_id))
    .map(entry => entry.id);

  // Team and match results are only counted AFTER tournament publication.
  // No placeholder results, private admin scores or unreleased lineups are exposed.
  const memberResult = publishedRegistrationIds.length
    ? await db.from('team_members')
      .select('registration_id,team_id').in('registration_id', publishedRegistrationIds)
    : { data: [], error: null };

  if (memberResult.error) {
    return (
      <main className="content-page">
        <h1 className="page-heading">STATS UNAVAILABLE</h1>
        <p className="lead">Player team assignments couldn't be loaded. Please refresh the page.</p>
        <Link href="/dashboard" className="outline-button margin-top">TRY AGAIN</Link>
      </main>
    );
  }

  const members = memberResult.data || [];
  const teamIds = [...new Set(members.map(member => member.team_id))];
  const teamsResult = teamIds.length
    ? await db.from('teams').select('id,name,tournament_id').in('id', teamIds)
    : { data: [], error: null };

  const matchResult = teamIds.length
    ? await db.from('matches')
      .select('id,team_a,team_b,status,score_a,score_b,tournament_id')
      .eq('status', 'completed')
      .in('tournament_id', [...visibleTournamentIds])
      .or(`team_a.in.(${teamIds.join(',')}),team_b.in.(${teamIds.join(',')})`)
      .limit(1000)
    : { data: [], error: null };

  // Never turn a broken stats query into a misleading "0 wins" display.
  const statsAvailable = !teamsResult.error && !matchResult.error
    && (!matchResult.data || matchResult.data.length < 1000);
  const verifiedTeamIds = new Set(teamIds);
  const officialMatches = statsAvailable
    ? (matchResult.data || []).filter(match =>
      match.status === 'completed'
      && match.score_a !== null
      && match.score_b !== null
      && (verifiedTeamIds.has(match.team_a || '') || verifiedTeamIds.has(match.team_b || ''))
    )
    : [];

  let wins = 0;
  let losses = 0;
  for (const match of officialMatches) {
    const onA = verifiedTeamIds.has(match.team_a || '');
    const onB = verifiedTeamIds.has(match.team_b || '');
    if (onA === onB) continue;
    const ownScore = onA ? match.score_a : match.score_b;
    const opponentScore = onA ? match.score_b : match.score_a;
    if (ownScore > opponentScore) wins++;
    else if (ownScore < opponentScore) losses++;
  }

  const providers = user.app_metadata?.providers;
  const discordConnected =
    (Array.isArray(providers) && providers.includes('discord')) ||
    user.app_metadata?.provider === 'discord';
  const profile = profileResult.data;

  return (
    <DashboardClient
      email={user.email || ''}
      displayName={greetingName(profile?.nickname, user.user_metadata || {})}
      discordConnected={discordConnected}
      profile={profile}
      steamId={steamResult.data?.steam_id || null}
      stats={{
        available: statsAvailable,
        wins,
        losses,
        played: officialMatches.length,
        events: confirmedRegistrations.length,
      }}
      registrations={registrations.map(entry => ({
        ...entry,
        tournamentName: events.find(event => event.id === entry.tournament_id)?.name || 'Event',
        teamName: members.find(member => member.registration_id === entry.id)
          ? teamsResult.data?.find(team => team.id === members.find(member => member.registration_id === entry.id)?.team_id)?.name || null
          : null,
      }))}
    />
  );
}
