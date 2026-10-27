'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';

type Profile = {
  nickname: string;
  primary_role: string | null;
  secondary_role: string | null;
  preferred_language: string;
} | null;

type Registration = {
  id: string;
  status: string;
  assigned_tier: number | null;
  internal_score: number | null;
  tournamentName: string;
  teamName: string | null;
};

type Props = {
  email: string;
  discordConnected: boolean;
  profile: Profile;
  steamId: string | null;
  registrations: Registration[];
};

const roles = ['AWPer', 'IGL', 'Entry Fragger', 'Rifler', 'Support', 'Lurker'];

function statusLabel(status: string, mn: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ['AWAITING PAYMENT', 'ТӨЛБӨР ХҮЛЭЭГДЭЖ БАЙНА'],
    paid: ['CONFIRMED', 'БАТАЛГААЖСАН'],
    cancelled: ['CANCELLED', 'ЦУЦЛАГДСАН'],
    refunded: ['REFUNDED', 'ТӨЛБӨР БУЦААСАН'],
    needs_refund: ['REFUND REVIEW', 'БУЦААЛТ ШАЛГАЖ БАЙНА'],
  };
  const pair = labels[status];
  return pair ? pair[mn ? 1 : 0] : status.replace(/_/g, ' ').toUpperCase();
}

function isProfileComplete(profile: Profile) {
  return !!(
    profile &&
    profile.nickname.trim().length >= 2 &&
    profile.primary_role &&
    profile.secondary_role &&
    profile.primary_role !== profile.secondary_role
  );
}

export function DashboardClient({ email, discordConnected, profile, steamId, registrations }: Props) {
  const { locale } = useLocale();
  const mn = locale === 'mn';
  const router = useRouter();
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [primary, setPrimary] = useState(profile?.primary_role || 'Rifler');
  const [secondary, setSecondary] = useState(profile?.secondary_role || 'Support');
  const [language, setLanguage] = useState(profile?.preferred_language === 'mn' ? 'mn' : 'en');
  const [savedProfile, setSavedProfile] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [signoutError, setSignoutError] = useState('');

  const profileReady = isProfileComplete(savedProfile);
  const steamReady = !!steamId;
  const completedSteps = 1 + Number(steamReady) + Number(profileReady);
  const steps = [
    {
      label: mn ? 'НЭВТЭРСЭН' : 'SIGNED IN',
      detail: discordConnected ? 'DISCORD' : 'EMAIL',
      completed: true,
    },
    {
      label: mn ? 'STEAM БАТАЛГААЖСАН' : 'VERIFY STEAM',
      detail: steamReady ? (mn ? 'ХОЛБОГДСОН' : 'CONNECTED') : (mn ? 'ШААРДЛАГАТАЙ' : 'REQUIRED'),
      completed: steamReady,
    },
    {
      label: mn ? 'ПРОФАЙЛ БҮРЭН' : 'PLAYER PROFILE',
      detail: profileReady ? (mn ? 'БЭЛЭН' : 'COMPLETE') : (mn ? 'ДУТУУ' : 'INCOMPLETE'),
      completed: profileReady,
    },
  ];

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveFeedback(null);

    if (primary === secondary || nickname.trim().length < 2) {
      setSaveFeedback({
        ok: false,
        message: mn
          ? 'Нэр хамгийн багадаа 2 тэмдэгттэй байх ёстой. Үндсэн ба хоёрдогч үүрэг өөр байх шаардлагатай.'
          : 'Use a nickname with at least 2 characters and choose two different roles.',
      });
      return;
    }

    setSaving(true);
    const update = {
      nickname: nickname.trim(),
      primary_role: primary,
      secondary_role: secondary,
      preferred_language: language,
    };

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to save profile');
      setSavedProfile(update);
      setNickname(update.nickname);
      setSaveFeedback({
        ok: true,
        message: mn ? 'Профайл амжилттай хадгалагдлаа.' : 'Player profile saved successfully.',
      });
      router.refresh();
    } catch (error) {
      setSaveFeedback({
        ok: false,
        message: error instanceof Error ? error.message : (mn ? 'Хадгалж чадсангүй.' : 'Unable to save profile.'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setSignoutError('');
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Sign-out request was rejected');
      router.replace('/');
      router.refresh();
    } catch {
      setSignoutError(mn ? 'Гарч чадсангүй. Дахин оролдоно уу.' : 'Could not sign out. Please try again.');
      setSigningOut(false);
    }
  }

  const nextAction = !steamReady
    ? { href: '/api/steam/start', label: mn ? 'STEAM ХОЛБОХ' : 'CONNECT STEAM', text: mn ? 'Эхлээд Steam хаягаа баталгаажуулна уу.' : 'Verify your Steam account to unlock tournament eligibility.' }
    : !profileReady
      ? { href: '#player-profile', label: mn ? 'ПРОФАЙЛ БҮРДҮҮЛЭХ' : 'COMPLETE PROFILE', text: mn ? 'Тоглоомын нэр болон хоёр үүргээ хадгална уу.' : 'Choose your nickname and two distinct CS2 roles.' }
      : { href: '/register', label: mn ? 'ТЭМЦЭЭН ҮЗЭХ' : 'BROWSE TOURNAMENTS', text: mn ? 'Та тэмцээнд бүртгүүлэхэд бэлэн байна.' : 'Your account is ready. See which tournaments are accepting entries.' };

  return (
    <main className="content-page account-page">
      <div className="account-overline">
        <span className="section-kicker">NEXUS / PLAYER PORTAL</span>
        <span className="account-session"><span className="account-live-dot" aria-hidden="true" />{mn ? 'НЭВТЭРСЭН' : 'SESSION ACTIVE'}</span>
      </div>

      <div className="account-heading-row">
        <div>
          <h1 className="page-heading account-heading">{mn ? 'МИНИЙ ХАЯГ' : 'MY ACCOUNT'}</h1>
          <p className="lead account-intro">
            {mn ? 'Тоглогчийн мэдээлэл, баталгаажуулалт, тэмцээний бүртгэл — бүгд нэг дор.' : 'Your player identity, connected accounts and tournament entries in one place.'}
          </p>
        </div>
        <button className="outline-button small account-signout" type="button" onClick={signOut} disabled={signingOut}>
          {signingOut ? '...' : (mn ? 'ГАРАХ' : 'SIGN OUT')}
        </button>
      </div>
      {signoutError && <p className="steam-link-error" role="alert">{signoutError}</p>}

      <section className="account-progress" aria-label={mn ? 'Хаягийн бэлэн байдал' : 'Account readiness'}>
        <div className="account-progress-header">
          <span className="section-kicker">{mn ? 'БҮРТГЭЛИЙН ЯВЦ' : 'ACCOUNT READINESS'}</span>
          <strong>{completedSteps} / 3</strong>
        </div>
        <div className="account-progress-track" aria-hidden="true">
          <span style={{ width: (completedSteps / 3) * 100 + '%' }} />
        </div>
        <div className="account-steps">
          {steps.map((step, index) => (
            <div className={'account-step' + (step.completed ? ' is-complete' : '')} key={step.label}>
              <span className="account-step-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
              <span className="account-step-mark" aria-hidden="true">{step.completed ? '✓' : '–'}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="account-main-grid">
        <section id="player-profile" className="panel account-profile-panel" aria-labelledby="profile-heading">
          <div className="account-panel-topline">
            <span className="section-kicker">01 / {mn ? 'ТОГЛОГЧИЙН ПРОФАЙЛ' : 'PLAYER PROFILE'}</span>
            <span className={'pill' + (profileReady ? ' orange' : '')}>{profileReady ? (mn ? 'БҮРЭН' : 'COMPLETE') : (mn ? 'ДУТУУ' : 'INCOMPLETE')}</span>
          </div>
          <h2 id="profile-heading">{mn ? 'ТАНЫ ТОГЛООМЫН МЭДЭЭЛЭЛ' : 'YOUR PLAYER DETAILS'}</h2>
          <p className="small-text">{mn ? 'Тэмцээнд оролцохдоо ашиглах нэр, үндсэн болон хоёрдогч үүргээ сонгоно уу.' : 'Choose the nickname and roles used for solo tournament matchmaking.'}</p>

          <form className="account-profile-form" onSubmit={saveProfile}>
            <div className="form-row">
              <label className="field-label" htmlFor="account-nickname">CS2 NICKNAME</label>
              <input
                className="field"
                id="account-nickname"
                name="nickname"
                autoComplete="nickname"
                value={nickname}
                onChange={event => setNickname(event.target.value)}
                minLength={2}
                maxLength={32}
                required
                disabled={saving}
                placeholder="Your player name"
              />
            </div>
            <div className="account-role-grid">
              <div className="form-row">
                <label className="field-label" htmlFor="account-primary">{mn ? 'ҮНДСЭН ҮҮРЭГ' : 'PRIMARY ROLE'}</label>
                <select
                  className="field"
                  id="account-primary"
                  value={primary}
                  onChange={event => {
                    const value = event.target.value;
                    setPrimary(value);
                    if (secondary === value) setSecondary(roles.find(role => role !== value) || 'Support');
                  }}
                  disabled={saving}
                >
                  {roles.map(role => <option value={role} key={role}>{role}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label className="field-label" htmlFor="account-secondary">{mn ? 'ХОЁРДОГЧ ҮҮРЭГ' : 'SECONDARY ROLE'}</label>
                <select
                  className="field"
                  id="account-secondary"
                  value={secondary}
                  onChange={event => setSecondary(event.target.value)}
                  disabled={saving}
                >
                  {roles.filter(role => role !== primary).map(role => <option value={role} key={role}>{role}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <label className="field-label" htmlFor="account-language">{mn ? 'ХЭЛ' : 'PREFERRED LANGUAGE'}</label>
              <select
                className="field"
                id="account-language"
                value={language}
                onChange={event => setLanguage(event.target.value)}
                disabled={saving}
              >
                <option value="en">English</option>
                <option value="mn">Монгол</option>
              </select>
            </div>
            <div className="account-form-bottom">
              <button className="outline-button" type="submit" disabled={saving || primary === secondary || nickname.trim().length < 2}>
                {saving ? (mn ? 'ХАДГАЛЖ БАЙНА...' : 'SAVING...') : (mn ? 'ӨӨРЧЛӨЛТ ХАДГАЛАХ' : 'SAVE CHANGES')}
                <span className="button-line" aria-hidden="true" />
              </button>
              <span className="account-helper-text">{mn ? 'Нэр: 2–32 тэмдэгт' : 'Nickname: 2–32 characters'}</span>
            </div>
            {saveFeedback && <p className={saveFeedback.ok ? 'success small-text' : 'steam-link-error'} role={saveFeedback.ok ? 'status' : 'alert'}>{saveFeedback.message}</p>}
          </form>
        </section>

        <aside className="account-aside">
          <section className="panel account-connection-panel" aria-label={mn ? 'Холбогдсон хаягууд' : 'Connected accounts'}>
            <span className="section-kicker">02 / {mn ? 'ХОЛБОГДСОН ХАЯГУУД' : 'CONNECTED ACCOUNTS'}</span>
            <div className="account-connection-row">
              <div className="account-connection-symbol">D</div>
              <div className="account-connection-details">
                <strong>{discordConnected ? 'DISCORD' : 'EMAIL'}</strong>
                <small className="account-email">{email || (mn ? 'Нэвтэрсэн хаяг' : 'Signed-in account')}</small>
              </div>
              <span className="account-connected-indicator" title={mn ? 'Холбогдсон' : 'Connected'}>✓</span>
            </div>
            <div className="account-connection-row">
              <div className="account-connection-symbol">S</div>
              <div className="account-connection-details">
                <strong>STEAM</strong>
                {steamId
                  ? <a className="account-steam-id" target="_blank" rel="noopener noreferrer" href={'https://steamcommunity.com/profiles/' + steamId}>{steamId}</a>
                  : <small>{mn ? 'ХОЛБОГДООГҮЙ' : 'NOT YET CONNECTED'}</small>}
              </div>
              <span className={'account-connected-indicator' + (!steamReady ? ' pending' : '')} title={steamReady ? 'Verified' : 'Not linked'}>{steamReady ? '✓' : '–'}</span>
            </div>
            {!steamReady && <a className="outline-button account-connect-steam" href="/api/steam/start">{mn ? 'STEAM ХОЛБОХ' : 'VERIFY STEAM'}<span className="button-line" aria-hidden="true" /></a>}
          </section>

          <section className="panel account-next-panel">
            <span className="section-kicker">03 / {mn ? 'ДАРААГИЙН АЛХАМ' : 'NEXT STEP'}</span>
            <p>{nextAction.text}</p>
            <a className="outline-button account-next-action" href={nextAction.href}>
              {nextAction.label}
              <span className="button-line" aria-hidden="true" />
            </a>
          </section>
        </aside>
      </div>

      <section className="account-tournaments" aria-labelledby="account-entries">
        <div className="account-section-title">
          <div>
            <span className="section-kicker">04 / {mn ? 'ТЭМЦЭЭНҮҮД' : 'COMPETITION'}</span>
            <h2 id="account-entries">{mn ? 'МИНИЙ БҮРТГЭЛҮҮД' : 'MY REGISTRATIONS'}</h2>
          </div>
          <Link href="/register" className="outline-button small">{mn ? 'БҮРТГЭЛ ХАРАХ' : 'VIEW REGISTRATION'}</Link>
        </div>

        {registrations.length === 0 ? (
          <div className="account-empty-state">
            <span className="account-empty-index">00</span>
            <div>
              <strong>{mn ? 'ОДООГООР БҮРТГЭЛ АЛГА' : 'NO TOURNAMENT ENTRIES YET'}</strong>
              <p>{mn ? 'Бэлэн болмогцоо тэмцээний бүртгэлийн хуудсаар орж оролцох боломжтой.' : 'When a tournament opens, you can review it from the registration page.'}</p>
            </div>
          </div>
        ) : (
          <div className="account-registration-list">
            {registrations.map(registration => (
              <article key={registration.id} className="account-registration-item">
                <div className="account-registration-head">
                  <h3>{registration.tournamentName}</h3>
                  <span className={'pill' + (registration.status === 'paid' ? ' orange' : '')}>{statusLabel(registration.status, mn)}</span>
                </div>
                <div className="account-registration-meta">
                  <div><small>{mn ? 'ТҮВШИН' : 'TIER'}</small><strong>{registration.assigned_tier ?? '—'}</strong></div>
                  <div><small>{mn ? 'БАГ' : 'TEAM'}</small><strong>{registration.teamName || (mn ? 'ХҮЛЭЭГДЭЖ БАЙНА' : 'PENDING')}</strong></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
