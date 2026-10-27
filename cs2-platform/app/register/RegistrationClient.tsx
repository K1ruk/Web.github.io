'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import {
  activePayment, confirmedEntry, displayFee, entryAvailability, profileIsReady,
  type PlayerProfile, type PlayerRegistration, type PublicTournament,
} from '@/lib/registration';

type Props = {
  profile: PlayerProfile;
  steamId: string | null;
  discordConnected: boolean;
  tournaments: PublicTournament[];
  registrations: PlayerRegistration[];
  rulesUrl: string | null;
  freeRulesUrl: string;
  refundUrl: string | null;
  paymentsEnabled: boolean;
  now: number;
};

const steamErrors: Record<string, [string, string]> = {
  session: ['NEXUS session expired. Sign in again, then reconnect Steam.', 'NEXUS нэвтрэлт дууссан байна. Дахин нэвтэрнэ үү.'],
  state: ['Steam verification expired or cookies were blocked. Please retry.', 'Steam баталгаажуулалт дууссан. Дахин оролдоно уу.'],
  locked: ['Steam cannot be changed during an active registration.', 'Идэвхтэй бүртгэлийн үед Steam солих боломжгүй.'],
  duplicate: ['This Steam account is already linked to another NEXUS account.', 'Энэ Steam өөр NEXUS хаягтай холбогдсон байна.'],
  verification: ['Steam could not confirm this account. Try again.', 'Steam баталгаажуулж чадсангүй. Дахин оролдоно уу.'],
  credentials: ['Supabase rejected the server key. Contact the tournament administrator.', 'Supabase серверийн тохиргоог шалгана уу.'],
  setup: ['Steam linking is not configured yet.', 'Steam холболтын тохиргоо дутуу байна.'],
  origin: ['Steam was opened from another website. Please retry here.', 'Steam-ийг өөр вэб хаягаас нээсэн байна.'],
  service: ['Could not finish Steam linking. Please try again.', 'Steam холболт амжилтгүй. Дахин оролдоно уу.'],
};

function eventStatus(status: string, availability: string, mn: boolean) {
  if (status === 'demo') return mn ? 'ЗАГВАР / ДЕМО' : 'DEMO PREVIEW';
  if (status === 'published') return mn ? 'БАГУУД ГАРСАН' : 'TEAMS RELEASED';
  if (status === 'finished') return mn ? 'ДУУССАН' : 'COMPLETED';
  if (availability === 'full') return mn ? 'ДҮҮРСЭН' : 'FULL';
  if (availability === 'open') return mn ? 'БҮРТГЭЛ НЭЭЛТТЭЙ' : 'REGISTRATION OPEN';
  return mn ? 'ХААГДСАН' : 'CLOSED';
}

function readableDate(value: string | null, locale: 'en' | 'mn') {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(locale === 'mn' ? 'mn-MN' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(time);
}

export function RegistrationClient({
  profile, steamId, discordConnected, tournaments, registrations, rulesUrl, freeRulesUrl, refundUrl, paymentsEnabled, now,
}: Props) {
  const { locale } = useLocale();
  const mn = locale === 'mn';
  const params = useSearchParams();
  const urlEvent = params.get('event');
  const [selected, setSelected] = useState(
    tournaments.find(event => event.slug === urlEvent)?.id ||
    tournaments.find(event => entryAvailability(event, now) === 'open')?.id ||
    tournaments[0]?.id || '',
  );
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const event = tournaments.find(item => item.id === selected) || null;
  const availability = event ? entryAvailability(event, now) : 'closed';
  const playerReady = profileIsReady(profile);
  const steamReady = !!steamId;
  const registration = registrations.find(item => item.tournament_id === selected);
  const alreadyPaid = confirmedEntry(registration);
  const pending = activePayment(registration, now);
  const isFree = !!event && !event.demo && event.fee_cents === 0;
  const rulesReady = isFree ? !!freeRulesUrl : !!rulesUrl && !!refundUrl;
  const entryReady = !!event && !event.demo && availability === 'open' && playerReady && steamReady
    && discordConnected && rulesReady && (isFree || paymentsEnabled) && !alreadyPaid;
  const canCheckout = entryReady && accepted && !busy;
  const paidRegistrations = registrations.filter(reg => reg.status === 'paid').length;

  let blocker: string | null = null;
  if (!event) blocker = mn ? 'Одоогоор нээлттэй тэмцээн байхгүй.' : 'No tournaments have been announced yet.';
  else if (event.demo) blocker = mn ? 'Энэ нь зөвхөн загвар. Бодит бүртгэл, төлбөр авахгүй.' : 'Preview only — no registration or payment will be taken.';
  else if (alreadyPaid) blocker = mn ? 'Та энэ тэмцээнд бүртгүүлсэн.' : 'You already have a confirmed place in this event.';
  else if (availability === 'full') blocker = mn ? 'Энэ тэмцээний бүх слот дүүрсэн.' : 'All confirmed places are taken.';
  else if (availability !== 'open') blocker = mn ? 'Энэ тэмцээний бүртгэл хаагдсан.' : 'Registration is not open for this event.';
  else if (!discordConnected) blocker = mn ? 'Тэмцээнд бүртгүүлэхийн тулд Discord-р нэвтэрнэ үү.' : 'Sign in with a verified Discord account to register for tournaments.';
  else if (!steamReady) blocker = mn ? 'Эхлээд Steam хаягаа баталгаажуулна уу.' : 'Connect your Steam account before entering.';
  else if (!playerReady) blocker = mn ? 'Тоглогчийн профайлаа бүрэн бөглөнө үү.' : 'Complete your nickname and preferred roles in My Account.';
  else if (!rulesReady) blocker = mn ? 'Тэмцээний дүрэм, буцаалтын нөхцөл хараахан нийтлэгдээгүй.' : 'Tournament rules must be published before registration opens.';
  else if (!isFree && !paymentsEnabled) blocker = mn ? 'Төлбөрийн систем хараахан идэвхжээгүй байна.' : 'Checkout is not configured yet. No payment can be taken.';
  else if (!accepted) blocker = mn ? 'Үргэлжлүүлэхийн тулд дүрэм, нөхцөлийг зөвшөөрнө үү.' : 'Review and accept the tournament rules to continue.';

  async function checkout() {
    if (!canCheckout || !event) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const response = await fetch(isFree ? '/api/registrations/free' : '/api/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: event.id, acceptedRules: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Unable to register');
      if (isFree) {
        if (body?.registered !== true || body?.paymentRequired !== false)
          throw new Error('Registration was not confirmed by the server');
        window.location.assign('/dashboard?registration=confirmed');
        return;
      }

      // Stripe-hosted checkout only. Reject unexpected third-party redirects.
      const nextUrl = new URL(body?.url);
      if (nextUrl.protocol !== 'https:' || nextUrl.hostname !== 'checkout.stripe.com') {
        throw new Error('The checkout provider returned an unexpected destination.');
      }
      window.location.assign(nextUrl.toString());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to start checkout');
      setBusy(false);
    }
  }

  return (
    <main className="content-page entry-page">
      <div className="entry-overline">
        <span className="section-kicker">NEXUS / {mn ? 'ТЭМЦЭЭН' : 'TOURNAMENTS'}</span>
        <span className="entry-top-code">CS2 — SOLO ENTRY / 2026</span>
      </div>

      <header className="entry-header">
        <div>
          <h1>{mn ? 'Тэмцээнд оролц.' : 'Enter the arena'}<span>.</span></h1>
          <p>{mn ? 'Тэмцээнээ сонгож, бүртгэлийн мэдээллээ шалга. Бид багийг ур чадварт тулгуурлан бүрдүүлнэ.' : 'Choose your tournament, review your player details and secure a place in the next NEXUS competition.'}</p>
        </div>
        <Link className="entry-profile-link" href="/dashboard">
          <span className="entry-profile-monogram">{(profile?.nickname || 'NX').slice(0,2).toUpperCase()}</span>
          <span><small>{mn ? 'ТОГЛОГЧИЙН ПРОФАЙЛ' : 'PLAYER PROFILE'}</small><strong>{profile?.nickname || 'My Account'} <span aria-hidden="true">↗</span></strong></span>
        </Link>
      </header>

      <div className="entry-flow-labels" aria-label={mn ? 'Бүртгэлийн алхмууд' : 'Registration steps'}>
        <span><i>01</i>{mn ? 'ТЭМЦЭЭН СОНГОХ' : 'CHOOSE EVENT'}</span>
        <span className="entry-flow-rule" aria-hidden="true"/>
        <span><i>02</i>{mn ? 'МЭДЭЭЛЭЛ ШАЛГАХ' : 'VERIFY DETAILS'}</span>
        <span className="entry-flow-rule" aria-hidden="true"/>
        <span><i>03</i>{mn ? 'БҮРТГЭЛ БАТАЛГААЖУУЛАХ' : 'SECURE ENTRY'}</span>
      </div>

      {(params.get('checkout') === 'cancel' || params.get('steam') === 'linked' || params.get('steam') === 'failed') && (
        <div className={'entry-notice' + (params.get('steam') === 'failed' ? ' danger' : '')} role="status">
          {params.get('checkout') === 'cancel'
            ? (mn ? 'Төлбөрийг цуцаллаа. Баталгаажсан бүртгэл үүсээгүй.' : 'Checkout cancelled. Your place is not confirmed.')
            : params.get('steam') === 'linked'
              ? (mn ? 'Steam хаяг амжилттай баталгаажлаа.' : 'Steam account verified. You can continue.')
              : mn
                ? (steamErrors[params.get('reason') || 'service'] || steamErrors.service)[1]
                : (steamErrors[params.get('reason') || 'service'] || steamErrors.service)[0]}
        </div>
      )}

      <div className="entry-layout">
        <section className="entry-events" aria-labelledby="entry-events-title">
          <div className="entry-section-head">
            <div>
              <span className="section-kicker">01 / {mn ? 'БОЛОМЖИТ ТЭМЦЭЭНҮҮД' : 'AVAILABLE COMPETITIONS'}</span>
              <h2 id="entry-events-title">{mn ? 'Тэмцээн сонгох' : 'Choose your event'}<span>.</span></h2>
            </div>
            <small>{String(tournaments.length).padStart(2,'0')} {mn ? 'ТЭМЦЭЭН' : 'EVENTS'}</small>
          </div>

          {!tournaments.length ? (
            <div className="entry-no-events">
              <span className="entry-standby-emblem" aria-hidden="true">✳</span>
              <span className="entry-standby-id">NX / STANDBY</span>
              <h3>{mn ? 'Тун удахгүй.' : 'Next drop incoming.'}</h3>
              <p>{mn ? 'Одоогоор тэмцээний бүртгэл нээгдээгүй байна. Шинэ тэмцээн нийтлэгдмэгц энд харагдана.' : 'No tournament has been announced yet. New competitions will appear here as soon as registration opens.'}</p>
              <Link href="/dashboard" className="entry-standby-link">{mn ? 'МИНИЙ ПРОФАЙЛ' : 'VIEW YOUR PLAYER PROFILE'} <span aria-hidden="true">↗</span></Link>
            </div>
          ) : (
            <div className="entry-event-list">
              {tournaments.map(item => {
                const state = entryAvailability(item, now);
                const eventRegistration = registrations.find(reg => reg.tournament_id === item.id);
                const chosen = item.id === selected;
                return (
                  <button key={item.id} className={'entry-event-card' + (chosen ? ' selected' : '')}
                    type="button" aria-pressed={chosen}
                    onClick={() => { setSelected(item.id); setAccepted(false); setErrorMessage(''); }}>
                    <span className="entry-event-card-top">
                      <span className="entry-event-tag">{item.demo ? 'NX / CONCEPT · BVG' : item.slug.toUpperCase()}</span>
                      <span className={'entry-event-status' + (state === 'open' ? ' open' : '')}>
                        <span aria-hidden="true" className="entry-status-dot"/>
                        {eventStatus(item.status, state, mn)}
                      </span>
                    </span>
                    <strong className="entry-event-name">{item.name}</strong>
                    <span className="entry-event-date">{item.starts_at
                      ? (mn ? 'ЭХЛЭХ · ' : 'STARTS · ') + readableDate(item.starts_at, locale)
                      : (mn ? 'ЭХЛЭХ ӨДӨР ТОВЛООГҮЙ' : 'DATE TO BE ANNOUNCED')}</span>
                    <span className="entry-event-card-bottom">
                      <span><small>{mn ? 'ТЭМЦЭЭНИЙ ХУРААМЖ' : 'ENTRY FEE'}</small><b>{item.demo ? (mn ? 'ТОВЛООГҮЙ' : 'TBA') : displayFee(item.fee_cents, item.currency, locale)}</b></span>
                      <span><small>{mn ? 'БАТАЛГААЖСАН СЛОТ' : 'CONFIRMED PLAYERS'}</small><b>{item.demo ? '10 ' : item.confirmed} <em>{item.demo ? (mn ? 'БАГ · 50 СЛОТ' : 'TEAMS · 50 SLOTS') : '/ ' + item.capacity}</em></b></span>
                      <span className="entry-card-select" aria-hidden="true">{chosen ? '✓' : '↗'}</span>
                    </span>
                    {confirmedEntry(eventRegistration) && <span className="entry-event-registered">{mn ? 'ТА БҮРТГҮҮЛСЭН' : 'YOUR ENTRY IS CONFIRMED'}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="entry-review" aria-labelledby="entry-review-title">
          {event?.demo && <div className="entry-notice" role="note">{mn ? 'BVG – Friends League: 10 баг / 50 тоглогчийн демо тэмцээн. Бодит бүртгэл хараахан эхлээгүй.' : 'BVG – Friends League: preview tournament for 10 squads / 50 players. Registration is not live.'}</div>}
          <div className="entry-review-heading">
            <div><span className="section-kicker">02 / {mn ? 'МИНИЙ БҮРТГЭЛ' : 'YOUR ENTRY'}</span><h2 id="entry-review-title">{mn ? 'Бүртгэлийн мэдээлэл' : 'Review your entry'}</h2></div>
            <span className="entry-review-mark">NX</span>
          </div>

          <div className="entry-review-identity">
            <div className="entry-small-avatar" aria-hidden="true">{(profile?.nickname || 'NX').slice(0,2).toUpperCase()}</div>
            <div><small>{mn ? 'ТОГЛОГЧ' : 'PLAYER'}</small><strong>{profile?.nickname || (mn ? 'Нэр сонгоогүй' : 'Not configured')}</strong></div>
            <Link href="/dashboard" aria-label={mn ? 'Профайл засах' : 'Edit player profile'}>↗</Link>
          </div>

          <div className="entry-checklist">
            <div className="entry-check-row">
              <span className={'entry-check-icon' + (discordConnected ? ' done' : '')}>{discordConnected ? '✓' : '!'}</span>
              <span><strong>DISCORD</strong><small>{discordConnected ? (mn ? 'БАТАЛГААЖСАН' : 'OAUTH VERIFIED') : (mn ? 'DISCORD-Р НЭВТРЭХ ШААРДЛАГАТАЙ' : 'DISCORD SIGN-IN REQUIRED')}</small></span>
              {!discordConnected && <Link href="/login">{mn ? 'НЭВТРЭХ' : 'SIGN IN'} ↗</Link>}
            </div>
            <div className="entry-check-row">
              <span className={'entry-check-icon' + (steamReady ? ' done' : '')}>{steamReady ? '✓' : '!'}</span>
              <span><strong>STEAM</strong><small>{steamReady ? (mn ? 'БАТАЛГААЖСАН' : 'VERIFIED ACCOUNT') : (mn ? 'ХОЛБООГҮЙ' : 'NOT CONNECTED')}</small></span>
              {!steamReady && <a href="/api/steam/start">{mn ? 'ХОЛБОХ' : 'CONNECT'} ↗</a>}
            </div>
            <div className="entry-check-row">
              <span className={'entry-check-icon' + (playerReady ? ' done' : '')}>{playerReady ? '✓' : '!'}</span>
              <span><strong>{mn ? 'ПРОФАЙЛ' : 'PLAYER PROFILE'}</strong><small>{playerReady ? (profile?.primary_role + ' / ' + profile?.secondary_role) : (mn ? 'НЭР БА ҮҮРЭГ ШААРДЛАГАТАЙ' : 'NICKNAME & ROLES REQUIRED')}</small></span>
              {!playerReady && <Link href="/dashboard">{mn ? 'ЗАСАХ' : 'EDIT'} ↗</Link>}
            </div>
          </div>

          <div className="entry-summary">
            <span className="entry-summary-label">{mn ? 'СОНГОСОН ТЭМЦЭЭН' : 'SELECTED TOURNAMENT'}</span>
            <strong className="entry-summary-name">{event?.name || '—'}</strong>
            {event && <div className="entry-summary-meta">
              <span>{mn ? 'ТӨЛӨВ' : 'STATUS'}</span>
              <strong>{eventStatus(event.status, availability, mn)}</strong>
            </div>}
            {event?.registration_closes_at && <div className="entry-summary-meta">
              <span>{mn ? 'БҮРТГЭЛ ХААГДАХ' : 'REGISTRATION CLOSES'}</span>
              <strong>{readableDate(event.registration_closes_at, locale)}</strong>
            </div>}
            <div className="entry-summary-total">
              <span>{mn ? 'НИЙТ' : 'ENTRY TOTAL'}</span>
              <strong>{event ? (event.demo ? (mn ? 'ТОВЛООГҮЙ' : 'TBA') : displayFee(event.fee_cents, event.currency, locale)) : '—'}</strong>
            </div>
            <p className="entry-summary-payment">{isFree
              ? (mn ? 'Энэ тэмцээн үнэгүй. Steam, Discord болон дүрмийг баталгаажуулсны дараа оролцоо шууд бүртгэгдэнэ.' : 'This tournament is free. After verifying Discord, Steam and the rules, your entry is confirmed instantly without payment.')
              : (mn ? 'Stripe-ийн аюулгүй хуудсаар төлбөр төлнө. Төлбөр баталгаажсаны дараа таны оролцоо бүртгэгдэнэ.' : 'Payment is processed securely by Stripe. A place is only confirmed once payment is verified.')}</p>
          </div>

          {rulesReady && <label className="entry-consent">
            <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={!entryReady || busy}/>
            <span>{mn ? 'Би ' : 'I agree to the '}
              <a href={isFree ? freeRulesUrl : rulesUrl!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{mn ? 'тэмцээний дүрэм' : 'tournament rules'}</a>
              {!isFree && <>{mn ? ' болон ' : ' and '}
                <a href={refundUrl!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{mn ? 'төлбөр буцаах нөхцөлийг' : 'refund policy'}</a></>}.
            </span>
          </label>}

          <button className="entry-checkout" type="button" disabled={!canCheckout} onClick={checkout}>
            <span>{event?.demo ? (mn ? 'ЗАГВАР ҮЗЭХ ГОРИМ' : 'PREVIEW ONLY') : busy ? (mn ? 'ТҮР ХҮЛЭЭНЭ ҮҮ' : 'OPENING CHECKOUT...')
              : alreadyPaid ? (mn ? 'БҮРТГЭЛ БАТАЛГААЖСАН' : 'ENTRY CONFIRMED')
                : pending ? (mn ? 'ТӨЛБӨР ҮРГЭЛЖЛҮҮЛЭХ' : 'RESUME CHECKOUT')
                  : isFree ? (mn ? 'ҮНЭГҮЙ БҮРТГҮҮЛЭХ' : 'CONFIRM FREE ENTRY') : (mn ? 'ТӨЛБӨР ТӨЛӨХ' : 'CONTINUE TO CHECKOUT')}</span>
            <span aria-hidden="true">↗</span>
          </button>
          {errorMessage && <p className="entry-review-error" role="alert">{errorMessage}</p>}
          {blocker && <p className="entry-review-hint" role="status">{blocker}</p>}
          {paidRegistrations > 0 && <Link className="entry-account-link" href="/dashboard">{mn ? 'МИНИЙ ТЭМЦЭЭНҮҮД' : 'VIEW MY ENTRIES'} ↗</Link>}
        </aside>
      </div>

      <section className="entry-how" aria-labelledby="entry-how-title">
        <span className="section-kicker">03 / {mn ? 'ҮЙЛ ЯВЦ' : 'THE FORMAT'}</span>
        <h2 id="entry-how-title">{mn ? 'Хэрхэн ажилладаг вэ?' : 'How it works'}<span>.</span></h2>
        <div className="entry-how-grid">
          <div><span>01</span><strong>{mn ? 'БҮРТГҮҮЛЭХ' : 'SECURE YOUR PLACE'}</strong><p>{mn ? 'Steam хаягаа холбож, профайлаа бөглөөд тэмцээний оролцох эрхээ баталгаажуулна.' : 'Link Steam, complete your profile and confirm your entry through checkout.'}</p></div>
          <div><span>02</span><strong>{mn ? 'УР ЧАДВАРЫН ҮНЭЛГЭЭ' : 'SKILL REVIEW'}</strong><p>{mn ? 'Зохион байгуулагч таны ур чадварыг шалгаж, түвшинг баталгаажуулна.' : 'Tournament admins review available skill data and approve player tiers.'}</p></div>
          <div><span>03</span><strong>{mn ? 'БАГ БҮРДҮҮЛЭХ' : 'FIVE-PLAYER SQUADS'}</strong><p>{mn ? 'Тоглогчдын түвшин болон сонгосон үүрэгт үндэслэн тэнцвэртэй баг бүрдүүлнэ.' : 'Players are assigned into balanced five-person squads using roles and approved tiers.'}</p></div>
        </div>
      </section>
    </main>
  );
}
