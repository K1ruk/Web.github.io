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

type Stats = {
  available: boolean;
  wins: number;
  losses: number;
  played: number;
  events: number;
};

type Props = {
  email: string;
  displayName: string;
  discordConnected: boolean;
  discordAvatarUrl: string | null;
  steamAvatarUrl: string | null;
  profile: Profile;
  steamId: string | null;
  stats: Stats;
  registrations: Registration[];
};

const roles = ['AWPer', 'IGL', 'Entry Fragger', 'Rifler', 'Support', 'Lurker'];

function isProfileComplete(profile: Profile) {
  return !!(
    profile
    && profile.nickname.trim().length >= 2
    && !/^Player-[0-9a-f]{8}$/i.test(profile.nickname)
    && profile.primary_role
    && profile.secondary_role
    && profile.primary_role !== profile.secondary_role
  );
}

function statusLabel(status: string, mn: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ['AWAITING PAYMENT', 'ТӨЛБӨР ХҮЛЭЭГДЭЖ БАЙНА'],
    paid: ['CONFIRMED', 'БАТАЛГААЖСАН'],
    cancelled: ['CANCELLED', 'ЦУЦЛАГДСАН'],
    refunded: ['REFUNDED', 'ТӨЛБӨР БУЦААСАН'],
    needs_refund: ['REFUND REVIEW', 'БУЦААЛТ ШАЛГАЖ БАЙНА'],
  };
  return labels[status]?.[mn ? 1 : 0] || status.replace(/_/g, ' ').toUpperCase();
}

function AvatarPhoto({
  src, provider, large = false, fallback = '',
}: {
  src: string | null;
  provider: 'Discord' | 'Steam';
  large?: boolean;
  fallback?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={provider + ' profile picture'}
        className={large ? 'gamer-avatar-photo' : 'gamer-provider-photo'}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  if (large && fallback) return <>{fallback}</>;
  return (
    <svg
      viewBox="0 0 24 24"
      className="gamer-avatar-fallback"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={provider + ' picture unavailable'}
      role="img"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-4 2.8-6 7-6s7 2 7 6" />
    </svg>
  );
}

export function DashboardClient({
  email, displayName, discordConnected, discordAvatarUrl, steamAvatarUrl, profile, steamId, stats, registrations,
}: Props) {
  const { locale } = useLocale();
  const mn = locale === 'mn';
  const router = useRouter();
  const [nickname, setNickname] = useState(profile && !/^Player-[0-9a-f]{8}$/i.test(profile.nickname) ? profile.nickname : '');
  const [primary, setPrimary] = useState(profile?.primary_role || 'Rifler');
  const [secondary, setSecondary] = useState(profile?.secondary_role || 'Support');
  const [language, setLanguage] = useState(profile?.preferred_language === 'mn' ? 'mn' : 'en');
  const [savedProfile, setSavedProfile] = useState<Profile>(profile);
  const [settingsOpen, setSettingsOpen] = useState(!isProfileComplete(profile));
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [signoutError, setSignoutError] = useState('');

  const profileReady = isProfileComplete(savedProfile);
  const steamReady = !!steamId;
  const setupComplete = profileReady && steamReady;
  const completionCount = 1 + Number(profileReady) + Number(steamReady);
  const playerName = profileReady ? savedProfile!.nickname : displayName;
  const monogram = playerName.trim().slice(0, 2).toUpperCase() || 'NX';
  const rate = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : null;
  const tier = registrations.find(reg => reg.status === 'paid' && reg.assigned_tier !== null)?.assigned_tier;

  const achievements = [
    { id: 'verified', symbol: '✓', en: 'Steam Verified', mn: 'Steam баталгаажсан', descriptionEn: 'Connect your Steam account', descriptionMn: 'Steam хаягаа баталгаажуулах', unlocked: steamReady },
    { id: 'roles', symbol: '◇', en: 'Role Ready', mn: 'Үүрэг сонгосон', descriptionEn: 'Complete your player profile', descriptionMn: 'Тоглогчийн мэдээллээ бөглөх', unlocked: profileReady },
    { id: 'entry', symbol: '↗', en: 'First Entry', mn: 'Анхны тэмцээн', descriptionEn: 'Confirm a tournament registration', descriptionMn: 'Тэмцээний бүртгэл баталгаажуулах', unlocked: stats.events >= 1 },
    { id: 'victory', symbol: '★', en: 'First Victory', mn: 'Анхны ялалт', descriptionEn: 'Win your first official match', descriptionMn: 'Анхны албан ёсны тоглолтдоо ялах', unlocked: stats.available && stats.wins >= 1 },
    { id: 'fivewins', symbol: '✦', en: 'Five Wins', mn: 'Таван ялалт', descriptionEn: 'Win five official matches', descriptionMn: 'Албан ёсны таван тоглолтод ялах', unlocked: stats.available && stats.wins >= 5 },
    { id: 'veteran', symbol: 'V', en: 'Tournament Regular', mn: 'Тэмцээний туршлагатай', descriptionEn: 'Join five tournaments', descriptionMn: 'Таван тэмцээнд оролцох', unlocked: stats.events >= 5 },
  ];
  const earnedCount = achievements.filter(achievement => achievement.unlocked).length;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveFeedback(null);
    if (primary === secondary || nickname.trim().length < 2) {
      setSaveFeedback({
        ok: false,
        message: mn
          ? 'Тоглогчийн нэр хамгийн багадаа 2 тэмдэгттэй, хоёр үүрэг өөр байх шаардлагатай.'
          : 'Choose a nickname with at least two characters and two different roles.',
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
      setSaveFeedback(null);
      setSettingsOpen(false);
      router.refresh();
    } catch (error) {
      setSaveFeedback({
        ok: false,
        message: error instanceof Error ? error.message : (mn ? 'Профайлыг хадгалж чадсангүй.' : 'Could not save your profile.'),
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
        method: 'POST', credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Sign-out request rejected');
      router.replace('/');
      router.refresh();
    } catch {
      setSignoutError(mn ? 'Гарч чадсангүй. Дахин оролдоно уу.' : 'Could not sign out. Please try again.');
      setSigningOut(false);
    }
  }

  return (
    <main className="content-page gamer-page">
      <div className="gamer-page-top">
        <span className="section-kicker">{mn ? 'МИНИЙ ПРОФАЙЛ' : 'MY PROFILE'} <span className="gamer-breadcrumb-divider">/</span> NEXUS</span>
        <div className="gamer-top-actions">
          <span className="gamer-online-label"><span className="gamer-online-dot" aria-hidden="true" />{mn ? 'НЭВТЭРСЭН' : 'ONLINE'}</span>
          <button type="button" className="gamer-signout-button" onClick={signOut} disabled={signingOut}>
            {signingOut ? '...' : mn ? 'ГАРАХ' : 'SIGN OUT'}
          </button>
        </div>
      </div>

      <header className="gamer-greeting">
        <div>
          <h1>{mn ? 'Сайн уу, ' : 'Hi, '}<span>{playerName}</span><span className="gamer-greeting-punctuation">.</span></h1>
          <p>{setupComplete
            ? mn ? 'Таны NEXUS тоглогчийн профайл.' : 'Your arena. Your stats. Your next match.'
            : mn ? 'Тоглогчийн профайлаа бүрдүүлээд тэмцээнд оролцоорой.' : 'Finish setting up your player profile to join tournaments.'}</p>
        </div>
        {setupComplete && <Link href="/register" className="outline-button small gamer-header-cta">{mn ? 'ТЭМЦЭЭН ХАРАХ' : 'FIND A TOURNAMENT'}<span className="button-line" aria-hidden="true" /></Link>}
      </header>
      {signoutError && <p className="steam-link-error" role="alert">{signoutError}</p>}

      {!setupComplete && (
        <section className="gamer-setup-bar" aria-label={mn ? 'Хаягийн бэлэн байдал' : 'Profile readiness'}>
          <div className="gamer-setup-icon" aria-hidden="true">!</div>
          <div className="gamer-setup-copy">
            <strong>{mn ? 'ПРОФАЙЛАА БҮРДҮҮЛЭХ' : 'FINISH YOUR PLAYER SETUP'}</strong>
            <span>
              {!profileReady
                ? mn ? 'Нэр болон үндсэн/хоёрдогч үүргээ сонго.' : 'Add your nickname and two CS2 roles.'
                : mn ? 'Steam хаягаа баталгаажуулаарай.' : 'Verify your Steam account to finish.'}
            </span>
          </div>
          <div className="gamer-setup-progress" aria-label={`${completionCount} of 3 complete`}>
            <span>{completionCount}/3</span>
            <div aria-hidden="true"><i style={{ width: `${completionCount / 3 * 100}%` }} /></div>
          </div>
          {!profileReady
            ? <button type="button" className="gamer-setup-action" onClick={() => { setSettingsOpen(true); document.getElementById('gamer-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{mn ? 'БӨГЛӨХ' : 'COMPLETE'} <span aria-hidden="true">↗</span></button>
            : <a className="gamer-setup-action" href="/api/steam/start">{mn ? 'ХОЛБОХ' : 'LINK STEAM'} <span aria-hidden="true">↗</span></a>}
        </section>
      )}

      <div className="gamer-profile-grid">
        <div className="gamer-primary-column">
          <section className="gamer-id-card" aria-label={mn ? 'Тоглогчийн карт' : 'Player card'}>
            <div className="gamer-id-topline">
              <span>NEXUS <span className="gamer-card-separator">/</span> PLAYER IDENTITY</span>
              <span className="gamer-id-edition">CS2 · SEASON 01</span>
            </div>
            <div className="gamer-id-main">
              <div className="gamer-avatar" aria-label={playerName}>
                <div className="gamer-avatar-inner"><AvatarPhoto key={steamAvatarUrl || discordAvatarUrl || "fallback"} src={steamAvatarUrl || discordAvatarUrl} provider={steamAvatarUrl ? "Steam" : "Discord"} large fallback={monogram} /></div>
                <span className="gamer-avatar-corner gamer-avatar-tl" />
                <span className="gamer-avatar-corner gamer-avatar-br" />
              </div>
              <div className="gamer-identity-text">
                <span className="gamer-identity-kicker">{mn ? 'ТОГЛОГЧ' : 'PLAYER TAG'}</span>
                <h2>{playerName}</h2>
                <div className="gamer-role-tags">
                  <span className="gamer-role-chip primary">{savedProfile?.primary_role || (mn ? 'ҮҮРЭГ СОНГООГҮЙ' : 'ROLE NOT SET')}</span>
                  {savedProfile?.secondary_role && <span className="gamer-role-chip">{savedProfile.secondary_role}</span>}
                </div>
              </div>
              <div className="gamer-rank-marker">
                <span>{mn ? 'ТҮВШИН' : 'TIER'}</span>
                <strong>{tier ? `0${tier}` : '—'}</strong>
                <small>{tier ? 'NEXUS TIER' : mn ? 'ОНООГООГҮЙ' : 'UNRANKED'}</small>
              </div>
            </div>
            <div className="gamer-id-divider" />
            <div className="gamer-stats-heading">
              <span>{mn ? 'ТЭМЦЭЭНИЙ ҮЗҮҮЛЭЛТ' : 'COMPETITIVE RECORD'}</span>
              <small>{mn ? 'NEXUS-ийн баталгаажсан тоглолтууд' : 'Verified NEXUS tournament matches only'}</small>
            </div>
            <div className="gamer-stats-grid">
              <div className="gamer-stat featured">
                <span>{mn ? 'ЯЛАЛТ' : 'WINS'}</span>
                <strong>{stats.available ? stats.wins : '—'}</strong>
              </div>
              <div className="gamer-stat">
                <span>{mn ? 'ЯЛАГДАЛ' : 'LOSSES'}</span>
                <strong>{stats.available ? stats.losses : '—'}</strong>
              </div>
              <div className="gamer-stat">
                <span>{mn ? 'ТОГЛОЛТ' : 'MATCHES'}</span>
                <strong>{stats.available ? stats.played : '—'}</strong>
              </div>
              <div className="gamer-stat">
                <span>{mn ? 'ЯЛАЛТЫН ХУВЬ' : 'WIN RATE'}</span>
                <strong>{stats.available && rate !== null ? `${rate}%` : '—'}</strong>
              </div>
              <div className="gamer-stat">
                <span>{mn ? 'ТЭМЦЭЭН' : 'EVENTS'}</span>
                <strong>{stats.events}</strong>
              </div>
            </div>
            {!stats.available && <p className="gamer-data-note">{mn ? 'Одоогоор тоглолтын мэдээллийг ачаалж чадсангүй.' : 'Match statistics are temporarily unavailable.'}</p>}
            {stats.available && stats.played === 0 && <p className="gamer-data-note">{mn ? 'Албан ёсны тоглолтын үр дүн гармагц таны үзүүлэлт энд харагдана.' : 'Your record will appear here once official match results are published.'}</p>}
          </section>

          <section className="gamer-achievements" aria-labelledby="gamer-achievements-title">
            <div className="gamer-section-top">
              <div>
                <span className="section-kicker">{mn ? 'ТОГЛОГЧИЙН АМЖИЛТ' : 'PLAYER PROGRESSION'} / 01</span>
                <h2 id="gamer-achievements-title">{mn ? 'АМЖИЛТУУД' : 'Achievements'}<span className="gamer-heading-accent">.</span></h2>
              </div>
              <span className="gamer-earned-counter"><strong>{earnedCount}</strong> / {achievements.length} {mn ? 'НЭЭГДСЭН' : 'UNLOCKED'}</span>
            </div>
            <div className="gamer-achievements-grid">
              {achievements.map(achievement => (
                <div className={'gamer-achievement' + (achievement.unlocked ? ' unlocked' : ' locked')} key={achievement.id}>
                  <span className="gamer-achievement-symbol" aria-hidden="true">{achievement.symbol}</span>
                  <div className="gamer-achievement-copy">
                    <strong>{mn ? achievement.mn : achievement.en}</strong>
                    <small>{mn ? achievement.descriptionMn : achievement.descriptionEn}</small>
                  </div>
                  <span className="gamer-achievement-state">{achievement.unlocked ? (mn ? 'НЭЭГДСЭН' : 'EARNED') : (mn ? 'ТҮГЖЭЭТЭЙ' : 'LOCKED')}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="gamer-sidebar">
          <section className="gamer-side-panel gamer-loadout" aria-label={mn ? 'Тоглогчийн мэдээлэл' : 'Player loadout'}>
            <div className="gamer-side-header"><span>{mn ? 'МИНИЙ МЭДЭЭЛЭЛ' : 'MY LOADOUT'}</span><span>01 / 03</span></div>
            <div className="gamer-loadout-row">
              <small>{mn ? 'ҮНДСЭН ҮҮРЭГ' : 'PRIMARY ROLE'}</small>
              <strong>{savedProfile?.primary_role || '—'}</strong>
            </div>
            <div className="gamer-loadout-row">
              <small>{mn ? 'ХОЁРДОГЧ ҮҮРЭГ' : 'SECONDARY ROLE'}</small>
              <strong>{savedProfile?.secondary_role || '—'}</strong>
            </div>
            <div className="gamer-loadout-connections">
              <div className="gamer-provider-row">
                <span className="gamer-provider-mark"><AvatarPhoto key={discordAvatarUrl || "discord-placeholder"} src={discordAvatarUrl} provider="Discord" /></span>
                <span>{discordConnected ? 'DISCORD' : 'EMAIL'}</span>
                <small>{discordConnected ? (mn ? 'ХОЛБОГДСОН' : 'CONNECTED') : (mn ? 'ИМЭЙЛЭЭР НЭВТЭРСЭН' : 'EMAIL LOGIN')}</small>
              </div>
              <div className="gamer-provider-row">
                <span className="gamer-provider-mark"><AvatarPhoto key={steamAvatarUrl || "steam-placeholder"} src={steamAvatarUrl} provider="Steam" /></span>
                <span>STEAM</span>
                {steamId
                  ? <a href={`https://steamcommunity.com/profiles/${steamId}`} target="_blank" rel="noopener noreferrer" title={steamId}>{mn ? 'БАТАЛГААЖСАН ↗' : 'VERIFIED ↗'}</a>
                  : <a href="/api/steam/start">{mn ? 'ХОЛБОХ ↗' : 'CONNECT ↗'}</a>}
              </div>
            </div>
          </section>

          <section id="gamer-settings" className="gamer-side-panel gamer-settings">
            <button
              className="gamer-settings-toggle"
              type="button"
              aria-controls="gamer-settings-panel"
              aria-expanded={settingsOpen}
              onClick={() => { setSettingsOpen(!settingsOpen); setSaveFeedback(null); }}
            >
              <span className="gamer-settings-icon" aria-hidden="true">⚙</span>
              <span><strong>{mn ? 'ПРОФАЙЛЫН ТОХИРГОО' : 'PROFILE SETTINGS'}</strong><small>{mn ? 'Нэр, үүрэг, хэл солих' : 'Edit nickname, roles & language'}</small></span>
              <span className={'gamer-settings-chevron' + (settingsOpen ? ' expanded' : '')} aria-hidden="true">⌄</span>
            </button>
            {settingsOpen && (
              <div id="gamer-settings-panel" className="gamer-settings-content">
                <form onSubmit={saveProfile}>
                  <div className="form-row">
                    <label className="field-label" htmlFor="gamer-nickname">CS2 NICKNAME</label>
                    <input id="gamer-nickname" className="field" name="nickname" type="text" value={nickname}
                      onChange={event => setNickname(event.target.value)} minLength={2} maxLength={32} required disabled={saving}
                      placeholder={mn ? 'Тоглогчийн нэр' : 'Your player name'} autoComplete="nickname" />
                  </div>
                  <div className="form-row">
                    <label className="field-label" htmlFor="gamer-primary">{mn ? 'ҮНДСЭН ҮҮРЭГ' : 'PRIMARY ROLE'}</label>
                    <select id="gamer-primary" className="field" value={primary} disabled={saving} onChange={event => {
                      const value = event.target.value;
                      setPrimary(value);
                      if (value === secondary) setSecondary(roles.find(role => role !== value) || 'Support');
                    }}>
                      {roles.map(role => <option value={role} key={role}>{role}</option>)}
                    </select>
                  </div>
                  <div className="form-row">
                    <label className="field-label" htmlFor="gamer-secondary">{mn ? 'ХОЁРДОГЧ ҮҮРЭГ' : 'SECONDARY ROLE'}</label>
                    <select id="gamer-secondary" className="field" value={secondary} disabled={saving}
                      onChange={event => setSecondary(event.target.value)}>
                      {roles.filter(role => role !== primary).map(role => <option value={role} key={role}>{role}</option>)}
                    </select>
                  </div>
                  <div className="form-row">
                    <label className="field-label" htmlFor="gamer-language">{mn ? 'ХЭЛ' : 'LANGUAGE'}</label>
                    <select id="gamer-language" className="field" value={language} disabled={saving}
                      onChange={event => setLanguage(event.target.value)}>
                      <option value="en">English</option>
                      <option value="mn">Монгол</option>
                    </select>
                  </div>
                  <button className="gamer-save-button" type="submit" disabled={saving || nickname.trim().length < 2 || primary === secondary}>
                    {saving ? '...' : (mn ? 'ӨӨРЧЛӨЛТ ХАДГАЛАХ' : 'SAVE PROFILE')} <span aria-hidden="true">↗</span>
                  </button>
                  {saveFeedback && <p className={saveFeedback.ok ? 'success small-text' : 'steam-link-error'} role={saveFeedback.ok ? 'status' : 'alert'}>{saveFeedback.message}</p>}
                </form>
              </div>
            )}
          </section>

          <Link href="/register" className="gamer-next-event">
            <span>{mn ? 'ДАРААГИЙН ТЭМЦЭЭН' : 'NEXT CHALLENGE'}</span>
            <strong>{mn ? 'ТЭМЦЭЭНД ОРОЛЦОХ' : 'ENTER THE ARENA'}</strong>
            <span className="gamer-next-arrow" aria-hidden="true">↗</span>
          </Link>
        </aside>
      </div>

      <section className="gamer-registrations" aria-labelledby="gamer-entries-title">
        <div className="gamer-section-top">
          <div>
            <span className="section-kicker">{mn ? 'ТОГЛОЛТЫН ТҮҮХ' : 'TOURNAMENT HISTORY'} / 02</span>
            <h2 id="gamer-entries-title">{mn ? 'МИНИЙ ТЭМЦЭЭНҮҮД' : 'My tournaments'}<span className="gamer-heading-accent">.</span></h2>
          </div>
          <Link className="gamer-section-link" href="/register">{mn ? 'ТЭМЦЭЭН ҮЗЭХ' : 'VIEW EVENTS'} <span aria-hidden="true">↗</span></Link>
        </div>
        {registrations.length === 0
          ? <div className="gamer-empty-entries"><span className="gamer-empty-mark" aria-hidden="true">✳</span><div><strong>{mn ? 'ОДООГООР ТЭМЦЭЭНД ОРОЛЦООГҮЙ' : 'YOUR STORY STARTS HERE'}</strong><p>{mn ? 'Тэмцээний бүртгэл эхлэхэд энд таны үр дүн харагдана.' : 'Your tournaments, teams and results will appear here once you enter an event.'}</p></div></div>
          : <div className="gamer-entry-grid">{registrations.map(reg => (
            <article className="gamer-entry" key={reg.id}>
              <div className="gamer-entry-heading"><h3>{reg.tournamentName}</h3><span className={'pill' + (reg.status === 'paid' ? ' orange' : '')}>{statusLabel(reg.status, mn)}</span></div>
              <div className="gamer-entry-bottom">
                <div><small>{mn ? 'ТҮВШИН' : 'TIER'}</small><strong>{reg.assigned_tier ?? '—'}</strong></div>
                <div><small>{mn ? 'БАГ' : 'TEAM'}</small><strong>{reg.teamName || (mn ? 'ХҮЛЭЭГДЭЖ БАЙНА' : 'PENDING')}</strong></div>
              </div>
            </article>
          ))}</div>}
      </section>
    </main>
  );
}
