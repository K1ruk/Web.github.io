import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { RegistrationClient } from './RegistrationClient';
import { BVG_FRIENDS_LEAGUE_DEMO, type PublicTournament } from '@/lib/registration';

export const dynamic = 'force-dynamic';

const policyUrl = (raw: string | undefined): string | null => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

export default async function Register() {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="content-page">
        <div className="section-kicker">NEXUS / CONFIGURATION</div>
        <h1 className="page-heading">SETUP REQUIRED</h1>
        <p className="lead">Connect Supabase before loading tournament entries.</p>
      </main>
    );
  }

  const user = await requireUser();
  if (!user) redirect('/login');

  const db = adminDb();
  const [profileResult, steamResult, tournamentResult, registrationsResult] = await Promise.all([
    db.from('profiles').select('nickname,primary_role,secondary_role,preferred_language')
      .eq('user_id', user.id).maybeSingle(),
    db.from('steam_links').select('steam_id').eq('user_id', user.id).maybeSingle(),
    db.from('tournaments')
      .select('id,name,slug,fee_cents,currency,capacity,status,starts_at,registration_closes_at')
      .in('status', ['open', 'locked', 'published', 'finished'])
      .order('created_at', { ascending: false }).limit(16),
    db.from('registrations')
      .select('tournament_id,status,hold_expires_at')
      .eq('user_id', user.id),
  ]);

  if (profileResult.error || steamResult.error || tournamentResult.error || registrationsResult.error) {
    return (
      <main className="content-page">
        <div className="section-kicker">NEXUS / CONNECTION</div>
        <h1 className="page-heading">REGISTRATION UNAVAILABLE</h1>
        <p className="lead">We couldn't load registration details safely. Check the Supabase server key and refresh.</p>
      </main>
    );
  }

  const events = tournamentResult.data || [];
  const counts = await Promise.all(events.map(async event => {
    const { count, error } = await db.from('registrations')
      .select('id', { head: true, count: 'exact' })
      .eq('tournament_id', event.id).eq('status', 'paid');
    return { id: event.id, count, error };
  }));

  if (counts.some(result => result.error)) {
    return (
      <main className="content-page">
        <div className="section-kicker">NEXUS / EVENTS</div>
        <h1 className="page-heading">EVENTS UNAVAILABLE</h1>
        <p className="lead">Event capacity couldn't be verified. Refresh before trying to register.</p>
      </main>
    );
  }

  const countById = new Map(counts.map(result => [result.id, result.count || 0]));
  const tournaments: PublicTournament[] = events.length
    ? events.map(event => ({
        ...event,
        confirmed: countById.get(event.id) || 0,
      }))
    : [BVG_FRIENDS_LEAGUE_DEMO];

  const rulesUrl = policyUrl(process.env.NEXT_PUBLIC_TOURNAMENT_RULES_URL);
  const refundUrl = policyUrl(process.env.NEXT_PUBLIC_REFUND_POLICY_URL);
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const stripeEnabled = stripeKey.startsWith('sk_test_') ||
    (stripeKey.startsWith('sk_live_') && process.env.ALLOW_LIVE_PAYMENTS === 'true');

  return (
    <RegistrationClient
      profile={profileResult.data}
      steamId={steamResult.data?.steam_id || null}
      tournaments={tournaments}
      registrations={registrationsResult.data || []}
      rulesUrl={rulesUrl}
      refundUrl={refundUrl}
      paymentsEnabled={stripeEnabled}
      now={Date.now()}
    />
  );
}
