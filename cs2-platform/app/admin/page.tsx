import { redirect } from 'next/navigation';
import { requireUser, isAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase/admin';
import { AdminClient } from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return <main className="content-page"><h1 className="page-heading">SETUP REQUIRED</h1><p className="lead">Connect the private Supabase server key.</p></main>;
  }

  const user = await requireUser();
  if (!user) redirect('/login');
  if (!await isAdmin(user.id)) {
    return <main className="content-page"><h1 className="page-heading">RESTRICTED</h1><p className="lead">This page is available to tournament administrators only.</p></main>;
  }

  const db = adminDb();
  const [tournamentResult, registrationResult, teamResult, matchResult] = await Promise.all([
    db.from('tournaments').select('id,name,status,capacity,fee_cents,currency')
      .order('created_at', { ascending: false }).limit(50),
    db.from('registrations').select('id,tournament_id,user_id,status,assigned_tier,internal_score,primary_role,secondary_role')
      .order('created_at', { ascending: false }).limit(1000),
    db.from('teams').select('id,name,tournament_id').order('name').limit(300),
    db.from('matches').select('id,tournament_id,team_a,team_b,stage,status,best_of,scheduled_at,score_a,score_b')
      .order('scheduled_at', { ascending: true }).limit(300),
  ]);
  if (tournamentResult.error || registrationResult.error || teamResult.error || matchResult.error) {
    return <main className="content-page"><h1 className="page-heading">ADMIN DATA UNAVAILABLE</h1><p className="lead">Could not verify tournament and player data. Please refresh.</p></main>;
  }

  const registrations = registrationResult.data || [];
  const userIds = [...new Set(registrations.map(registration => registration.user_id))];
  const registrationIds = registrations.map(registration => registration.id);
  const [profilesResult, assessmentsResult] = await Promise.all([
    userIds.length
      ? db.from('profiles').select('user_id,nickname').in('user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    registrationIds.length
      ? db.from('skill_assessments')
        .select('registration_id,source,suggested_tier,evidence,assessed_at')
        .in('registration_id', registrationIds)
        .order('assessed_at', { ascending: false }).limit(3001)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || assessmentsResult.error
      || (assessmentsResult.data?.length ?? 0) > 3000) {
    return <main className="content-page"><h1 className="page-heading">ADMIN EVIDENCE UNAVAILABLE</h1><p className="lead">Skill evidence could not be verified. Please refresh before making rating decisions.</p></main>;
  }

  const recentAssessmentByRegistration = new Map<string, NonNullable<typeof assessmentsResult.data>[number]>();
  for (const assessment of assessmentsResult.data || []) {
    if (!recentAssessmentByRegistration.has(assessment.registration_id)) {
      recentAssessmentByRegistration.set(assessment.registration_id, assessment);
    }
  }

  return <AdminClient
    tournaments={tournamentResult.data || []}
    teams={teamResult.data || []}
    matches={matchResult.data || []}
    registrations={registrations.map(registration => {
      const latest = recentAssessmentByRegistration.get(registration.id);
      const evidence = latest?.evidence;
      const flags = evidence && typeof evidence === 'object' && !Array.isArray(evidence)
        ? (evidence as Record<string, unknown>).reviewFlags
        : null;
      const reviewRequired = Array.isArray(flags) && flags.length > 0;
      const assessmentStatus = registration.assigned_tier != null
        ? 'approved'
        : !latest ? 'unchecked'
          : latest.suggested_tier == null || reviewRequired ? 'review' : 'suggested';

      return {
        ...registration,
        nickname: profilesResult.data?.find(profile => profile.user_id === registration.user_id)?.nickname || 'Player',
        assessmentStatus,
        suggestedTier: latest?.suggested_tier ?? null,
      };
    })}
  />;
}
