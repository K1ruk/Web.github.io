import { requireUser } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { hasVerifiedDiscordProvider } from '@/lib/discord-auth';
import { OnboardingClient } from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return <main className="content-page">
      <span className="section-kicker">NEXUS / SETUP</span>
      <h1 className="page-heading">CONFIGURATION REQUIRED</h1>
      <p className="lead">The account service needs to be configured before player setup is available.</p>
    </main>;
  }

  const user = await requireUser();
  if (!user) {
    return <OnboardingClient authenticated={false} discordConnected={false} steamId={null} profile={null}/>;
  }

  const db = adminDb();
  const [profileResult, steamResult] = await Promise.all([
    db.from('profiles').select('nickname,primary_role,secondary_role,preferred_language').eq('user_id',user.id).maybeSingle(),
    db.from('steam_links').select('steam_id').eq('user_id',user.id).maybeSingle(),
  ]);
  if (profileResult.error || steamResult.error) {
    return <main className="content-page">
      <span className="section-kicker">NEXUS / CONNECTION</span>
      <h1 className="page-heading">SETUP UNAVAILABLE</h1>
      <p className="lead">Your session is active, but we couldn't securely load your player account. Please retry.</p>
    </main>;
  }

  return <OnboardingClient authenticated={true}
    discordConnected={hasVerifiedDiscordProvider(user.app_metadata)}
    steamId={steamResult.data?.steam_id || null}
    profile={profileResult.data}/>;
}
