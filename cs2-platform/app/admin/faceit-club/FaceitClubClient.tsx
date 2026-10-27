'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';
import type { FaceitMatchInspection, FaceitQueueSummary } from '@/lib/faceit-club';

type Inspection = FaceitMatchInspection & {
  statsStatus: 'available' | 'not_found' | 'temporarily_unavailable';
  source: 'FACEIT Data API';
  dataImported: false;
  matchClubMembershipVerified: false;
};

function display(value: number | null | undefined, percent = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(percent ? 1 : 2) + (percent ? '%' : '');
}

export function FaceitClubClient({
  clubId, clubUrl, queueId, queueUrl, initialMatchUrl, apiConfigured,
}: {
  clubId: string;
  clubUrl: string;
  queueId: string;
  queueUrl: string;
  initialMatchUrl: string;
  apiConfigured: boolean;
}) {
  const { locale } = useLocale();
  const mn = locale === 'mn';
  const [match, setMatch] = useState(initialMatchUrl);
  const [result, setResult] = useState<Inspection | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueResult, setQueueResult] = useState<(FaceitQueueSummary & { apiAccess: 'granted' }) | null>(null);
  const [queueError, setQueueError] = useState('');

  async function checkQueueAccess() {
    if (!apiConfigured || queueLoading) return;
    setQueueLoading(true);
    setQueueResult(null);
    setQueueError('');
    try {
      const response = await fetch('/api/admin/faceit-club/queue', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null) as
        | (FaceitQueueSummary & { apiAccess: 'granted'; error?: string }) | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || 'FACEIT did not grant access to this queue.');
      }
      setQueueResult(payload);
    } catch (failure) {
      setQueueError(failure instanceof Error ? failure.message : 'FACEIT permission check failed.');
    } finally {
      setQueueLoading(false);
    }
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !apiConfigured || !match.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/admin/faceit-club/inspect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match: match.trim() }),
      });
      const data = await response.json().catch(() => null) as (Inspection & { error?: string }) | null;
      if (!response.ok || !data) {
        throw new Error(data?.error || 'FACEIT matchroom could not be inspected');
      }
      setResult(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'FACEIT inspection failed');
    } finally {
      setLoading(false);
    }
  }

  return <main className="content-page faceit-club-page">
    <div className="lab-nav">
      <span className="section-kicker">NEXUS / ADMIN / FACEIT CLUB</span>
      <Link href="/admin" className="lab-back">{mn ? 'УДИРДЛАГА РУУ' : 'BACK TO CONTROL'} ↗</Link>
    </div>
    <header className="lab-header">
      <span className="lab-eyebrow">{mn ? 'CS2 КЛУБИЙН ТОГЛОЛТЫН МЭДЭЭЛЭЛ' : 'CONNECTED REFERENCE / MATCH EXPLORER'}</span>
      <h1>FACEIT <span>Club.</span></h1>
      <p>{mn
        ? 'Таны FACEIT Club-ийн холбоосыг NEXUS дээр бүртгэсэн. Одоогоор matchroom URL-аар статистикийг шалгаж болно.'
        : 'Your Club reference is configured in NEXUS. Inspect real CS2 matchrooms using the official FACEIT Data API.'}</p>
    </header>

    <div className="faceit-club-layout">
      <section className="faceit-club-primary">
        <div className="lab-card faceit-club-reference">
          <div className="lab-panel-heading">
            <span className="section-kicker">01 / {mn ? 'КЛУБИЙН ХОЛБООС' : 'YOUR FACEIT CLUB'}</span>
            <span className="lab-status enabled">URL CONFIGURED</span>
          </div>
          <p className="faceit-club-ref-label">FACEIT CLUB ID</p>
          <strong className="faceit-club-id">{clubId}</strong>
          <a href={clubUrl} target="_blank" rel="noopener noreferrer" className="faceit-club-go">
            {mn ? 'FACEIT КЛУБ НЭЭХ' : 'OPEN YOUR FACEIT CLUB'} <span aria-hidden="true">↗</span>
          </a>
          <p className="faceit-club-note">{mn
            ? 'Клубийн ID болон Hub-ийн ID ижил гэдгийг батлаагүй. Нийт гишүүд, queue, эсвэл тоглолтын тоог зохиохгүй.'
            : 'This identifies the Club page, not a verified Hub or tournament connection. The public Data API does not document an automatic Club-match listing by this ID.'}</p>
        </div>

        <section className="lab-card faceit-club-queue">
          <div className="lab-panel-heading">
            <span className="section-kicker">02 / {mn ? 'СОНГОСОН НЭГ QUEUE' : 'YOUR SELECTED CLUB QUEUE'}</span>
            <span className={'lab-status' + (queueResult ? ' enabled' : '')}>
              {queueResult ? 'API ACCESS GRANTED' : queueError ? 'ACCESS NOT VERIFIED' : 'AWAITING OWNER API CHECK'}
            </span>
          </div>
          <p className="faceit-club-ref-label">CS2 QUEUE ID</p>
          <strong className="faceit-club-id">{queueId}</strong>
          <a className="faceit-club-go" href={queueUrl} target="_blank" rel="noopener noreferrer">
            {mn ? 'FACEIT QUEUE НЭЭХ' : 'OPEN THIS FACEIT QUEUE'} <span aria-hidden="true">↗</span>
          </a>
          <p className="faceit-club-note">{mn
            ? 'Энэ бол таны сонгосон ганц queue. FACEIT queue owner API-г зөвшөөрсөн эсэхийг таны хувийн серверийн API түлхүүрээр шалгана.'
            : 'Only this one queue is configured. As its owner, you can check whether the NEXUS server API key has organizer-restricted access to its details.'}</p>

          <button type="button" className="lab-run-button faceit-queue-probe"
            disabled={!apiConfigured || queueLoading} onClick={checkQueueAccess}>
            <span>{queueLoading ? (mn ? 'FACEIT ЭРХ ШАЛГАЖ БАЙНА...' : 'CHECKING FACEIT PERMISSIONS...')
              : (mn ? 'QUEUE API ЭРХ ШАЛГАХ' : 'CHECK OWNER QUEUE API ACCESS')}</span>
            <span aria-hidden="true">↗</span>
          </button>
          {!apiConfigured && <div className="faceit-club-unverified" role="status">
            <strong>FACEIT_API_KEY REQUIRED</strong>
            <p>{mn
              ? 'Энэ шалгалтыг хийхийн тулд FACEIT API түлхүүрээ NEXUS серверт тохируулна уу.'
              : 'Set the private FACEIT_API_KEY on your NEXUS server, then check organizer permissions here. Do not share your key in chat or store it in the browser.'}</p>
          </div>}
          {queueError && <div className="faceit-club-unverified" role="alert">
            <strong>{mn ? 'FACEIT QUEUE API ЭРХ БАТЛАГДААГҮЙ' : 'FACEIT QUEUE API PERMISSION NOT CONFIRMED'}</strong>
            <p>{queueError}</p>
            <p>{mn
              ? 'FACEIT Club-ийн owner байх нь Developer API түлхүүрт автоматаар эрх өгдөг гэсэн үг биш.'
              : 'Being the Club or queue owner does not necessarily grant organizer permissions to an unrelated developer API key. FACEIT Developer Support may need to authorize it.'}</p>
          </div>}
          {queueResult && <div className="faceit-club-queue-result" aria-live="polite">
            <div className="faceit-club-queue-name">
              <small>{mn ? 'FACEIT-ЭЭС ИРСЭН QUEUE' : 'QUEUE RETURNED BY FACEIT'}</small>
              <strong>{queueResult.name || 'Unnamed CS2 queue'}</strong>
            </div>
            <div className="faceit-club-meta">
              <span>GAME <strong>{queueResult.game.toUpperCase()}</strong></span>
              <span>REGION <strong>{queueResult.region || '—'}</strong></span>
              <span>STATE <strong>{queueResult.state || (queueResult.open === null ? '—' : queueResult.open ? 'Open' : 'Closed')}</strong></span>
              <span>ENTITY TYPE <strong>{queueResult.entityType || '—'}</strong></span>
              <span>ENTITY ID <strong>{queueResult.entityId || '—'}</strong></span>
              <span>ELO ENABLED <strong>{queueResult.calculateElo === null ? '—' : queueResult.calculateElo ? 'YES' : 'NO'}</strong></span>
            </div>
            <div className="faceit-club-unverified" role="status">
              <strong>{mn ? 'API ЭРХТЭЙ — ТОГЛОЛТЫН ТҮҮХ ОДООГООР БИШ' : 'QUEUE DETAILS ACCESSIBLE — MATCH HISTORY NOT YET AVAILABLE'}</strong>
              <p>{mn
                ? 'FACEIT энэ queue-ийн мэдээллийг серверийн түлхүүрт өгсөн. Гэхдээ queue-ийн бүх тоглолтыг жагсаах API, мөн FACEIT owner нэвтрэлтийг одоогоор баталгаажаагүй.'
                : 'FACEIT accepted the NEXUS server key for this specific queue details endpoint. This does not authenticate the signed-in user as the FACEIT owner and does not mean FACEIT exposed an automatic queue match-history feed.'}</p>
              {queueResult.entityIdMatchesProvidedClub && <p>{mn
                ? 'FACEIT-ийн entity ID өгсөн Club ID-тэй таарч байна.'
                : 'The provider queue entity ID matches your supplied Club ID.'}</p>}
            </div>
          </div>}
        </section>

        <div className="lab-card faceit-club-inspector">
          <div className="lab-panel-heading">
            <span className="section-kicker">03 / {mn ? 'ТОГЛОЛТ ШАЛГАХ' : 'MATCHROOM INSPECTOR'}</span>
            <span className={'lab-status'+(apiConfigured?' enabled':' disabled')}>
              {apiConfigured ? 'FACEIT API READY' : 'FACEIT KEY REQUIRED'}
            </span>
          </div>
          <h2>{mn ? 'FACEIT тоглолтын үр дүнг шалгах' : 'Inspect a CS2 matchroom'}</h2>
          <div className="faceit-club-unverified" role="note">
            <strong>{mn ? 'ТОГЛОЛТЫН URL НЭМЭГДСЭН' : 'MATCHROOM LINK PRE-FILLED'}</strong>
            <p>{mn
              ? 'Таны илгээсэн matchroom холбоосыг доор орууллаа. Inspect товчийг дарж FACEIT API-аас бодит мэдээллийг шалгана. Клубийн хамаарал одоогоор баталгаажаагүй.'
              : 'Your supplied matchroom is entered below. Click Inspect to request its real FACEIT data using your server-side key. Membership in your Club is not yet verified.'}</p>
          </div>
          <p>{mn
            ? 'Club Queue → MATCHES цэснээс тоглолтын холбоос хуулна уу. Статистикийг FACEIT API-аас шууд уншина.'
            : 'In your Club, open Club Queues → MATCHES and copy a finished matchroom link. NEXUS will look up its match details and available player statistics.'}</p>
          <form onSubmit={inspect} className="faceit-club-form">
            <label htmlFor="club-match-url" className="field-label">FACEIT MATCHROOM URL / ID</label>
            <input
              id="club-match-url"
              className="field"
              type="text"
              autoComplete="off"
              value={match}
              onChange={event => setMatch(event.target.value)}
              maxLength={400}
              placeholder="https://www.faceit.com/en/cs2/room/1-..."
              required
            />
            <a href={initialMatchUrl} target="_blank" rel="noopener noreferrer" className="faceit-club-go">
              {mn ? 'FACEIT ДЭЭР ЭНЭ ТОГЛОЛТЫГ НЭЭХ' : 'OPEN THIS MATCHROOM ON FACEIT'} ↗
            </a>
            <button type="submit" className="lab-run-button" disabled={loading || !apiConfigured || !match.trim()}>
              <span>{loading ? (mn?'ШАЛГАЖ БАЙНА...':'CHECKING MATCH...') : (mn?'ТОГЛОЛТЫН СТАТИСТИК ШАЛГАХ':'INSPECT MATCH STATS')}</span>
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          {!apiConfigured && <div className="lab-instruction" role="status">
            <strong>FACEIT_API_KEY</strong>
            <p>{mn
              ? 'Энэ функцэд NEXUS сервер дээр FACEIT_API_KEY тохируулсан байх шаардлагатай.'
              : 'Set FACEIT_API_KEY on the NEXUS server before inspecting live matches. Never place this key in the browser.'}</p>
          </div>}
          {error && <div className="lab-error" role="alert"><strong>{mn?'АЛДАА':'INSPECTION FAILED'}</strong><p>{error}</p></div>}
        </div>

        {result && <section className="lab-card faceit-club-results" aria-live="polite">
          <div className="lab-panel-heading">
            <span className="section-kicker">04 / {mn?'FACEIT ТОГЛОЛТ':'LIVE FACEIT RESPONSE'}</span>
            <span className={'lab-status'+(result.hasPlayerStats?' enabled':'')}>{result.status}</span>
          </div>
          <h2>{result.competitionName || (mn?'CS2 ТОГЛОЛТ':'CS2 MATCH')}</h2>
          <p className="faceit-club-result-id">{result.matchId}</p>
          <div className="faceit-club-meta">
            <span>{mn?'ТӨРӨЛ':'COMPETITION TYPE'} <strong>{result.competitionType || '—'}</strong></span>
            <span>{mn?'ТЭМЦЭЭНИЙ ID':'COMPETITION ID'} <strong>{result.competitionId || '—'}</strong></span>
            <span>{mn?'ОГНОО':'FINISHED'} <strong>{result.finishedAt ? new Date(result.finishedAt * 1000).toLocaleDateString() : '—'}</strong></span>
          </div>
          <div className="faceit-club-team-grid">
            {result.teams.map(team => <div className="faceit-club-team" key={team.faction}>
              <small>{team.faction.toUpperCase()}</small>
              <strong>{team.name}</strong>
              <span>{team.score === null ? '—' : team.score}</span>
            </div>)}
          </div>
          <a className="faceit-club-go" href={result.faceitUrl} target="_blank" rel="noopener noreferrer">
            {mn?'ТОГЛОЛТЫГ FACEIT ДЭЭР НЭЭХ':'VIEW SOURCE MATCHROOM'} ↗
          </a>
          <div className="faceit-club-unverified" role="status">
            <strong>{mn?'КЛУБИЙН ХАРЬЯАЛАЛ БАТЛАГДААГҮЙ':'CLUB ASSOCIATION NOT YET VERIFIED'}</strong>
            <p>{mn
              ? 'Энэ тоглолтын статистик FACEIT-ээс ирсэн боловч тухайн тоглолт яг таны Club-ийнх гэдгийг API-аар баталгаажуулаагүй. Үр дүнг NEXUS-ийн албан ёсны тэмцээнд хадгалаагүй.'
              : 'These are FACEIT match data, but NEXUS cannot yet establish that this match belongs to your specific Club. No tournament results, player tiers, or league standings have been written.'}</p>
          </div>
          {result.maps.length ? result.maps.map((map, i) => <div className="faceit-club-map" key={i}>
            <div className="faceit-club-map-heading">
              <h3>{map.mapName}</h3>
              <small>{mn?'ТОГЛОГЧДЫН FACEIT ҮЗҮҮЛЭЛТ':'PER-PLAYER FACEIT STATS'}</small>
            </div>
            {map.teams.map((team, j) => <section className="faceit-club-map-team" key={j}>
              <h4>{team.teamName}</h4>
              {team.players.length ? <div className="faceit-club-table-wrap">
                <table className="faceit-club-stats-table">
                  <thead><tr>
                    <th>PLAYER</th><th>K</th><th>D</th><th>ADR</th><th>KAST</th>
                    <th>OPENING WIN %</th><th>K/D</th>
                  </tr></thead>
                  <tbody>
                    {team.players.map((player, k) => <tr key={player.playerId || k}>
                      <td>{player.nickname}</td>
                      <td>{player.kills ?? '—'}</td>
                      <td>{player.deaths ?? '—'}</td>
                      <td>{display(player.metrics.adr)}</td>
                      <td>{display(player.metrics.kastPercent,true)}</td>
                      <td>{display(player.metrics.openingDuelWinPercent,true)}</td>
                      <td>{display(player.metrics.kd)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div> : <p className="faceit-club-note">No player statistics were provided for this map.</p>}
            </section>)}
          </div>) : <div className="faceit-club-no-stats">
            <strong>{mn?'ТОГЛОЛТЫН СТАТИСТИК АЛГА':'MATCH STATISTICS UNAVAILABLE'}</strong>
            <p>{result.statsStatus === 'temporarily_unavailable'
              ? 'The FACEIT match statistics endpoint temporarily failed.'
              : 'FACEIT did not provide player statistics for this matchroom.'}</p>
          </div>}
          <p className="faceit-breakdown-notice">{mn
            ? '— гэдэг нь FACEIT тухайн үзүүлэлтийг өгөөгүй гэсэн үг. Оноог зохиож оруулаагүй.'
            : '— means the field was not provided by FACEIT; values are not reconstructed or estimated.'}</p>
        </section>}
      </section>

      <aside className="faceit-club-aside">
        <div className="lab-card">
          <span className="section-kicker">CONNECTION / STATUS</span>
          <h2>{mn?'Юу ажиллаж байгаа вэ?':'What works today?'}</h2>
          <div className="faceit-club-capability">
            <span className="faceit-club-state available">01</span>
            <div><strong>{mn?'Клубийн линк':'Club reference'}</strong><p>{mn?'URL-г хадгалсан':'Club URL is configured'}</p></div>
          </div>
          <div className="faceit-club-capability">
            <span className="faceit-club-state available">02</span>
            <div><strong>{mn?'Тоглолтын API':'Match API'}</strong><p>{mn?'Нэг matchroom-ын мэдээллийг унших боломжтой':'Official match details and player stats by match ID'}</p></div>
          </div>
          <div className="faceit-club-capability">
            <span className={'faceit-club-state '+(queueResult?'available':'pending')}>03</span>
            <div><strong>{mn?'Зөвхөн энэ queue-ийн owner API':'Selected queue / owner API'}</strong>
              <p>{queueResult?'Queue details accessible':queueError?'FACEIT API did not confirm access':'Check permissions using the private API key'}</p></div>
          </div>
          <div className="faceit-club-capability">
            <span className="faceit-club-state pending">04</span>
            <div><strong>{mn?'Бүх тоглолтыг автоматаар татах':'Automatic queue match history'}</strong><p>{mn?'Тоглолтын түүхийн API баталгаажаагүй':'No verified queue match listing endpoint yet'}</p></div>
          </div>
          <div className="faceit-club-capability">
            <span className="faceit-club-state pending">05</span>
            <div><strong>{mn?'Тэмцээний үр дүн шинэчлэх':'League result importing'}</strong><p>{mn?'Энэ хэсэг зөвхөн унших горимтой':'Read-only diagnostic; no NEXUS tournament write'}</p></div>
          </div>
        </div>
        <div className="lab-next">
          <span className="section-kicker">BVG / FRIENDS LEAGUE</span>
          <strong>{mn?'Дараагийн алхам':'Next: Club match verification'}</strong>
          <p>{mn
            ? 'Клубийн Queue → MATCHES хэсгээс нэг дууссан тоглолтын URL аваад шалгана. Ингэснээр бодит stat-д тулгуурласан импорт хийх эсэхийг шийднэ.'
            : 'Inspect a completed match from your Club queue. Once its competition provenance is confirmed, we can design a safe importer for BVG.'}</p>
        </div>
      </aside>
    </div>
  </main>;
}
