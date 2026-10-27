'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';
import type { FaceitMatchInspection, FaceitQueueSummary } from '@/lib/faceit-club';

type QueueDiagnosis = {
  status: 'details_accessible' | 'listed_only' | 'inconclusive';
  queue: FaceitQueueSummary | null;
  detailLookup: 'found' | 'not_found';
  listingChecks: Array<{
    entityType: 'clan' | 'club' | 'hub';
    outcome: 'matched' | 'not_listed' | 'not_found' | 'access_denied' | 'temporarily_unavailable' | 'invalid_response';
  }>;
  sampleMatch: {
    id: string;
    status: 'available' | 'not_found' | 'unavailable';
    competitionId: string | null;
    competitionType: string | null;
    organizerId: string | null;
  } | null;
  note: string;
  provider: 'FACEIT Data API';
};

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
  const [queueResult, setQueueResult] = useState<QueueDiagnosis | null>(null);
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
        | (QueueDiagnosis & { error?: string }) | null;
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
            <span className={'lab-status' + (queueResult?.status === 'details_accessible' || queueResult?.status === 'listed_only' ? ' enabled' : '')}>
              {queueResult?.status === 'details_accessible' ? 'DETAILS API OK'
                : queueResult?.status === 'listed_only' ? 'QUEUE FOUND IN LIST'
                : queueResult?.status === 'inconclusive' ? '404 / INCONCLUSIVE'
                : queueError ? 'ACCESS NOT VERIFIED' : 'READY FOR DIAGNOSTICS'}
            </span>
          </div>
          <p className="faceit-club-ref-label">CS2 QUEUE ID</p>
          <strong className="faceit-club-id">{queueId}</strong>
          <a className="faceit-club-go" href={queueUrl} target="_blank" rel="noopener noreferrer">
            {mn ? 'FACEIT QUEUE НЭЭХ' : 'OPEN THIS FACEIT QUEUE'} <span aria-hidden="true">↗</span>
          </a>
          <p className="faceit-club-note">{mn
            ? 'Энэ бол таны сонгосон ганц queue. FACEIT queue owner API-г зөвшөөрсөн эсэхийг таны хувийн серверийн API түлхүүрээр шалгана.'
            : 'Only this one queue is configured. As its owner, you can test the server key against the documented queue API and filtered queue listing. A 404 alone does not prove a permission issue.'}</p>

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
              <small>{mn ? 'FACEIT API ШАЛГАЛТ' : 'FACEIT QUEUE API DIAGNOSTICS'}</small>
              <strong>{queueResult.status === 'details_accessible'
                ? (mn ? 'Queue мэдээлэл ирлээ' : 'Queue details accessible')
                : queueResult.status === 'listed_only'
                  ? (mn ? 'Queue жагсаалтаас олдсон' : 'Queue found in filtered list')
                  : (mn ? '404 — шалтгаан тодорхойгүй' : '404 — cause still inconclusive')}</strong>
            </div>
            <p className="faceit-club-diagnostic-note">{mn && queueResult.status === 'inconclusive'
              ? 'FACEIT API 404 буцаасан. Энэ нь таны Club queue байхгүй эсвэл owner эрхгүй гэсэн баталгаа БИШ.'
              : queueResult.note}</p>
            {queueResult.queue && <div className="faceit-club-meta">
              <span>GAME <strong>{queueResult.queue.game.toUpperCase()}</strong></span>
              <span>QUEUE NAME <strong>{queueResult.queue.name || '—'}</strong></span>
              <span>REGION <strong>{queueResult.queue.region || '—'}</strong></span>
              <span>STATE <strong>{queueResult.queue.state || (queueResult.queue.open === null ? '—' : queueResult.queue.open ? 'Open' : 'Closed')}</strong></span>
              <span>ENTITY TYPE <strong>{queueResult.queue.entityType || '—'}</strong></span>
              <span>ENTITY ID <strong>{queueResult.queue.entityId || '—'}</strong></span>
            </div>}
            <div className="faceit-club-probe-results">
              <p>DIRECT QUEUE DETAILS <strong>{queueResult.detailLookup === 'found' ? 'FOUND' : '404 NOT FOUND'}</strong></p>
              {queueResult.listingChecks.length > 0 && <>
                <p className="faceit-club-diagnostic-title">{mn ? 'КЛУБИЙН ID-ААР ХИЙСЭН ШАЛГАЛТ' : 'FILTERED QUEUE LOOKUPS (THIS CLUB ONLY)'}</p>
                {queueResult.listingChecks.map(check => <p key={check.entityType}>
                  <span>entity_type={check.entityType}</span>
                  <strong>{check.outcome.replaceAll('_', ' ').toUpperCase()}</strong>
                </p>)}
              </>}
            </div>
            {queueResult.sampleMatch && <div className="faceit-club-probe-results">
              <p className="faceit-club-diagnostic-title">{mn ? 'ӨМНӨ ИЛГЭЭСЭН ТОГЛОЛТ' : 'PREVIOUSLY SUPPLIED MATCHROOM / INDEPENDENT CHECK'}</p>
              <p>FACEIT MATCH API <strong>{queueResult.sampleMatch.status.toUpperCase()}</strong></p>
              {queueResult.sampleMatch.status === 'available' && <>
                <p>COMPETITION ID <strong>{queueResult.sampleMatch.competitionId || '—'}</strong></p>
                <p>COMPETITION TYPE <strong>{queueResult.sampleMatch.competitionType || '—'}</strong></p>
                <p>ORGANIZER ID <strong>{queueResult.sampleMatch.organizerId || '—'}</strong></p>
              </>}
              <p className="faceit-club-diagnostic-footnote">{mn
                ? 'Энэ тоглолт таны Club queue-ийнх гэдгийг тусад нь баталгаажуулах шаардлагатай.'
                : 'Match metadata is only additional context. It does not prove that the match originated from this Club queue.'}</p>
            </div>}
            <div className="faceit-club-unverified" role="status">
              <strong>{queueResult.status === 'inconclusive'
                ? (mn ? 'OWNER ЭРХИЙГ 404-ӨӨР ДҮГНЭХГҮЙ' : '404 IS NOT PROOF OF MISSING OWNER PERMISSIONS')
                : (mn ? 'QUEUE МЭДЭЭЛЭЛ ИРСЭН — MATCH HISTORY ҮГҮЙ' : 'QUEUE IDENTIFIED — MATCH HISTORY NOT YET CONNECTED')}</strong>
              <p>{mn
                ? 'FACEIT Data API-аас queue-ийн бүх тоглолтын түүхийг авах аргыг одоогоор батлаагүй. Таны эрхтэй эсэхийг энэ хариултаар бүрэн шийдэхгүй.'
                : 'These checks do not authenticate the FACEIT account owner and do not establish a complete queue match-history feed. Nothing has been imported into NEXUS.'}</p>
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
            <span className={'faceit-club-state '+(queueResult?.status === 'details_accessible' || queueResult?.status === 'listed_only' ? 'available' : 'pending')}>03</span>
            <div><strong>{mn?'Зөвхөн энэ queue-ийн API':'Selected queue / organizer API'}</strong>
              <p>{queueResult?.status === 'details_accessible' ? 'Queue details confirmed'
                : queueResult?.status === 'listed_only' ? 'Found in club-filtered queue list'
                : queueResult?.status === 'inconclusive' ? '404 returned; access cannot be determined'
                : queueError ? 'FACEIT API check failed'
                : 'Run a bounded diagnostic with the private key'}</p></div>
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
