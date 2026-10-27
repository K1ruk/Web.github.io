'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { useLocale } from '@/components/LocaleProvider';

type PlayerProfile = {
  nickname: string;
  primary_role: string | null;
  secondary_role: string | null;
  preferred_language: string;
} | null;

type Draft = { nickname: string; primary_role: string; secondary_role: string };
type Props = {
  authenticated: boolean;
  discordConnected: boolean;
  steamId: string | null;
  profile: PlayerProfile;
  onBrowse?: () => void;
};
const ROLES = ['AWPer', 'IGL', 'Entry Fragger', 'Rifler', 'Support', 'Lurker'];
const DRAFT_KEY = 'nexus-onboarding-draft';
const SEEN_KEY = 'nexus-intro-dismissed';

function validDraft(input: unknown): input is Draft {
  if (!input || typeof input !== 'object') return false;
  const p = input as Partial<Draft>;
  return typeof p.nickname === 'string' && p.nickname.trim().length >= 2
    && p.nickname.trim().length <= 32
    && ROLES.includes(p.primary_role || '') && ROLES.includes(p.secondary_role || '')
    && p.primary_role !== p.secondary_role;
}
function completeProfile(profile: PlayerProfile) {
  return !!(profile && profile.nickname.trim().length >= 2
    && ROLES.includes(profile.primary_role || '')
    && ROLES.includes(profile.secondary_role || '')
    && profile.primary_role !== profile.secondary_role);
}
function nextStage(discord: boolean, steam: boolean) {
  return !discord ? 1 : !steam ? 2 : 3;
}

export function OnboardingClient({ authenticated, discordConnected, steamId, profile, onBrowse }: Props) {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const mn = locale === 'mn';
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [primary, setPrimary] = useState(profile?.primary_role || 'Rifler');
  const [secondary, setSecondary] = useState(profile?.secondary_role || 'Support');
  const [profileSaved, setProfileSaved] = useState(completeProfile(profile));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [celebrating, setCelebrating] = useState(false);

  async function persist(draft: Draft, language: 'en' | 'mn') {
    const response = await fetch('/api/profile', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, preferred_language: language }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not save your player profile.');
  }

  useEffect(() => {
    let active = true;
    let draft: Draft | null = null;
    try {
      const stored = sessionStorage.getItem(DRAFT_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (validDraft(parsed)) draft = parsed;
        else sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch { sessionStorage.removeItem(DRAFT_KEY); }

    if (draft) {
      setNickname(draft.nickname);
      setPrimary(draft.primary_role);
      setSecondary(draft.secondary_role);
    }
    if (!authenticated) {
      setStep(draft ? 1 : 0);
      setReady(true);
    } else if (completeProfile(profile)) {
      sessionStorage.removeItem(DRAFT_KEY);
      setStep(nextStage(discordConnected, !!steamId));
      setReady(true);
    } else if (draft) {
      const pending = draft;
      setBusy(true);
      persist(pending, profile?.preferred_language === 'mn' ? 'mn' : locale)
        .then(() => {
          if (!active) return;
          sessionStorage.removeItem(DRAFT_KEY);
          setProfileSaved(true);
          setStep(nextStage(discordConnected, !!steamId));
        })
        .catch(error => {
          if (!active) return;
          setStep(0);
          setFeedback(error instanceof Error ? error.message : 'Profile setup failed. Try again.');
        })
        .finally(() => { if (active) { setBusy(false); setReady(true); } });
    } else {
      setStep(0);
      setReady(true);
    }

    const steamError = new URLSearchParams(window.location.search).get('steam');
    if (steamError === 'failed') setFeedback('Steam verification was not completed. Please try again.');
    return () => { active = false; };
    // Initial boot only. Never restart the wizard when a language switch occurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function browse() {
    localStorage.setItem(SEEN_KEY, '1');
    if (onBrowse) onBrowse();
    else { router.replace('/'); router.refresh(); }
  }

  async function continueIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');
    const draft: Draft = {
      nickname: nickname.trim(),
      primary_role: primary,
      secondary_role: secondary,
    };
    if (!validDraft(draft)) { setFeedback('Enter a name (2–32 characters) and choose two different roles.'); return; }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    if (!authenticated) { setStep(1); return; }

    setBusy(true);
    try {
      await persist(draft, locale);
      sessionStorage.removeItem(DRAFT_KEY);
      setProfileSaved(true);
      setStep(nextStage(discordConnected, !!steamId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save profile.');
    } finally { setBusy(false); }
  }

  async function connectDiscord() {
    setFeedback('');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setFeedback('Account sign-in is not configured yet.'); return; }
    const db = createBrowserClient(url, key);
    setBusy(true);
    try {
      // Use the existing OAuth callback URL unchanged so the Supabase allowlist
      // does not need a new query-string pattern just for the wizard.
      document.cookie = 'nexus_setup_resume=1; Path=/auth; Max-Age=600; SameSite=Lax'
        + (window.location.protocol === 'https:' ? '; Secure' : '');
      const options = {
        redirectTo: window.location.origin + '/auth/callback',
        scopes: 'identify email',
      };
      const { error } = authenticated
        ? await db.auth.linkIdentity({ provider: 'discord', options })
        : await db.auth.signInWithOAuth({ provider: 'discord', options });
      if (error) throw error;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Discord connection failed.');
    } finally { setBusy(false); }
  }

  async function finish() {
    setFeedback('');
    if (!authenticated || !profileSaved || !discordConnected || !steamId) {
      setFeedback('Complete your player profile and connect both accounts first.');
      return;
    }
    const draft: Draft = { nickname: nickname.trim(), primary_role: primary, secondary_role: secondary };
    setBusy(true);
    try {
      await persist(draft, locale);
      sessionStorage.removeItem(DRAFT_KEY);
      localStorage.setItem(SEEN_KEY, '1');
      setCelebrating(true);
      setStep(4);
      window.setTimeout(() => { router.replace('/'); router.refresh(); }, 1500);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not save your language preference.');
    } finally { setBusy(false); }
  }

  const stages = [
    { en: 'PLAYER', mn: 'ТОГЛОГЧ' },
    { en: 'DISCORD', mn: 'DISCORD' },
    { en: 'STEAM', mn: 'STEAM' },
    { en: 'LANGUAGE', mn: 'ХЭЛ' },
  ];

  return (
    <main className="nx-onboard" aria-label={mn ? 'NEXUS анхны тохиргоо' : 'NEXUS player onboarding'}>
      <div className="nx-onboard-ambient" aria-hidden="true"><span/><span/><span/></div>
      <div className="nx-onboard-inner">
        <div className="nx-onboard-eyebrow"><span className="nx-onboard-pulse"/> NEXUS <span>/</span> {mn ? 'ТОГЛОГЧИЙН ТОХИРГОО' : 'INITIALIZING YOUR PLAYER IDENTITY'}</div>
        <div className="nx-onboard-layout">
          <div className="nx-onboard-art" aria-hidden="true">
            <div className="nx-onboard-gridlines"/>
            <div className="nx-onboard-orbit nx-onboard-orbit-a"/>
            <div className="nx-onboard-orbit nx-onboard-orbit-b"/>
            <div className="nx-onboard-energy">N<span>.</span></div>
            <div className="nx-onboard-art-top">NEXUS // PLAYER SYSTEM <span>V.01</span></div>
            <div className="nx-onboard-art-bottom"><span>IDENTITY ENGINE</span><strong>{String(Math.min(step + 1, 4)).padStart(2,'0')} / 04</strong></div>
          </div>
          <section className="nx-onboard-content" aria-live="polite" aria-busy={!ready || busy}>
            <div className="nx-onboard-topline">
              <span>{step === 4 ? 'SYSTEM READY' : `SETUP / ${String(Math.min(step + 1, 4)).padStart(2,'0')}`}</span>
              <div className="nx-onboard-top-actions">
                <div className="nx-onboard-locale" role="group" aria-label="Website language">
                  <button type="button" className={mn?'':'selected'} onClick={()=>setLocale('en')} aria-pressed={!mn}>EN</button>
                  <span>/</span>
                  <button type="button" className={mn?'selected':''} onClick={()=>setLocale('mn')} aria-pressed={mn}>МН</button>
                </div>
                <Link href="/login" className="nx-onboard-existing">
                  {mn ? 'Бүртгэлтэй юу? Нэвтрэх' : 'Already have an account? Sign in'} <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
            <div className="nx-onboard-progress" aria-label="Setup progress">
              {stages.map((stage, index) => <div key={stage.en} className={'nx-onboard-progress-item' + (step >= index ? ' complete' : '') + (step === index ? ' active' : '')}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <small>{mn ? stage.mn : stage.en}</small>
              </div>)}
            </div>

            {!ready ? <div className="nx-onboard-screen"><h1>INITIALIZING<span className="nx-onboard-blue">.</span></h1></div> : (
              <div key={step} className="nx-onboard-screen">
                {step === 0 && <>
                  <span className="nx-onboard-label">01 / {mn ? 'ТОГЛОГЧИЙН ТАНИЛЦУУЛГА' : 'CREATE YOUR IDENTITY'}</span>
                  <h1>{mn ? 'ЧИ ХЭН БЭ?' : 'WHO ARE'}<span className="nx-onboard-blue">{mn ? '' : ' YOU?'}</span></h1>
                  <p>{mn ? 'Тоглоомын нэр болон үндсэн байрлалаа сонгоорой.' : 'Your player identity starts here. Choose the name and roles your teammates will recognize.'}</p>
                  <form onSubmit={continueIdentity} className="nx-onboard-form">
                    <label htmlFor="nx-handle">{mn ? 'ТОГЛОГЧИЙН НЭР' : 'IN-GAME NAME'}</label>
                    <input id="nx-handle" value={nickname} onChange={e=>setNickname(e.target.value)}
                      minLength={2} maxLength={32} required autoComplete="nickname"
                      placeholder="e.g. frozen" disabled={busy} />
                    <div className="nx-onboard-two">
                      <div><label htmlFor="nx-role1">PRIMARY ROLE</label><select id="nx-role1" value={primary} onChange={e=>{setPrimary(e.target.value);if(e.target.value===secondary)setSecondary(ROLES.find(role=>role!==e.target.value)||'Support');}}>{ROLES.map(role=><option key={role} value={role}>{role}</option>)}</select></div>
                      <div><label htmlFor="nx-role2">SECONDARY ROLE</label><select id="nx-role2" value={secondary} onChange={e=>setSecondary(e.target.value)}>{ROLES.filter(role=>role!==primary).map(role=><option key={role} value={role}>{role}</option>)}</select></div>
                    </div>
                    <button type="submit" className="nx-onboard-main-action" disabled={busy || !validDraft({nickname,primary_role:primary,secondary_role:secondary})}>
                      {busy ? 'SAVING…' : mn ? 'ҮРГЭЛЖЛҮҮЛЭХ' : 'CONTINUE'} <span aria-hidden="true">→</span>
                    </button>
                  </form>
                </>}
                {step === 1 && <>
                  <span className="nx-onboard-label">02 / {mn ? 'ХОЛБОГДОХ' : 'CONNECT YOUR ACCOUNT'}</span>
                  <h1>CONNECT<span className="nx-onboard-blue"> DISCORD.</span></h1>
                  <p>{mn ? 'Discord хаягаа холбож бүртгэлээ баталгаажуулаарай.' : 'Secure your player identity with Discord. We verify the connection through official sign-in.'}</p>
                  <div className="nx-onboard-provider"><span className="nx-onboard-provider-icon">D</span><div><strong>DISCORD</strong><small>{discordConnected ? 'CONNECTED / VERIFIED' : 'ACCOUNT CONNECTION REQUIRED'}</small></div><span className={discordConnected ? 'nx-verified' : ''}>{discordConnected ? '✓' : '02'}</span></div>
                  {discordConnected ? <button className="nx-onboard-main-action" type="button" onClick={()=>setStep(steamId?3:2)}>CONTINUE <span>→</span></button>
                    : <button className="nx-onboard-main-action" type="button" onClick={connectDiscord} disabled={busy}>{busy ? 'CONNECTING…' : (authenticated ? 'LINK DISCORD' : 'CONTINUE WITH DISCORD')} <span aria-hidden="true">↗</span></button>}
                  {!authenticated&&<p className="nx-onboard-note">You'll return to this setup after Discord signs you in.</p>}
                </>}
                {step === 2 && <>
                  <span className="nx-onboard-label">03 / {mn ? 'ТОГЛООМЫН ХАЯГ' : 'VERIFY YOUR GAME ACCOUNT'}</span>
                  <h1>CONNECT<span className="nx-onboard-blue"> STEAM.</span></h1>
                  <p>{mn ? 'Steam хаягаа баталгаажуулж CS2 тэмцээнд оролцох боломжтой болно.' : 'Link your real Steam account using Steam OpenID. NEXUS never asks for your Steam password.'}</p>
                  <div className="nx-onboard-provider"><span className="nx-onboard-provider-icon">S</span><div><strong>STEAM</strong><small>{steamId ? 'VERIFIED / ACCOUNT LINKED' : 'SECURE OPENID VERIFICATION'}</small></div><span className={steamId ? 'nx-verified' : ''}>{steamId ? '✓' : '03'}</span></div>
                  {steamId ? <button className="nx-onboard-main-action" type="button" onClick={()=>setStep(3)}>CONTINUE <span>→</span></button>
                    : <a href="/api/steam/start?returnTo=onboarding" className="nx-onboard-main-action">VERIFY WITH STEAM <span aria-hidden="true">↗</span></a>}
                  <p className="nx-onboard-note">Steam linking is required to register for competitive tournaments.</p>
                </>}
                {step === 3 && <>
                  <span className="nx-onboard-label">04 / {mn ? 'ХЭЛ СОНГОХ' : 'PERSONALIZE YOUR EXPERIENCE'}</span>
                  <h1>{mn ? 'ХЭЛЭЭ' : 'YOUR'}<span className="nx-onboard-blue">{mn ? ' СОНГО.' : ' LANGUAGE.'}</span></h1>
                  <p>{mn ? 'Вебсайтыг ямар хэл дээр ашиглахыг сонго.' : 'Choose the language for your NEXUS dashboard. You can change it anytime.'}</p>
                  <div className="nx-onboard-language-choice">
                    <button type="button" className={locale==='en'?'selected':''} onClick={()=>setLocale('en')} aria-pressed={locale==='en'}><strong>EN</strong><span>English</span><span>↗</span></button>
                    <button type="button" className={locale==='mn'?'selected':''} onClick={()=>setLocale('mn')} aria-pressed={locale==='mn'}><strong>МН</strong><span>Монгол</span><span>↗</span></button>
                  </div>
                  <button type="button" className="nx-onboard-main-action" disabled={busy} onClick={finish}>{busy?'SAVING…':mn?'NEXUS РҮҮ ОРОХ':'ENTER NEXUS'} <span aria-hidden="true">→</span></button>
                </>}
                {step === 4 && <div className={'nx-onboard-finish' + (celebrating?' is-celebrating':'')}>
                  <span className="nx-onboard-finish-symbol">✓</span><span className="nx-onboard-label">SYSTEM READY / IDENTITY VERIFIED</span>
                  <h1>{mn?'ТА БЭЛЭН.':'YOU’RE'}<span className="nx-onboard-blue">{mn?'':' IN.'}</span></h1>
                  <p>{mn?'NEXUS-д тавтай морил.':'Welcome to NEXUS. Entering the arena…'}</p>
                </div>}
              </div>
            )}
            {feedback&&<p className="nx-onboard-error" role="alert">{feedback}</p>}
            <div className="nx-onboard-bottom">
              <button type="button" className="nx-onboard-browse" onClick={browse}>
                {mn ? 'Одоохондоо сайт руу орох' : 'Browse without setup'} <span aria-hidden="true">↗</span>
              </button>
              {step > 0 && step < 4 && <button type="button" className="nx-onboard-back" onClick={()=>{setFeedback('');setStep(step-1);}}>← BACK</button>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
