'use client';

import { useRef, useState } from 'react';
import { ClubArchiveClient } from './ClubArchiveClient';
import { CLUB_ARCHIVE_SINCE_SECONDS } from '@/lib/club-archive';
import type { QueueHistoryMatch } from '@/lib/faceit-hub-history';
import { FACEIT_HISTORY_MAX_AUTO_PAGES, FACEIT_HISTORY_FULL_SCAN_PAGE_SIZE } from '@/lib/faceit-hub-history';

type HistoryPage =
  | {
      status: 'available';
      matches: QueueHistoryMatch[];
      queueId: string;
      countReturned: number;
      rejectedUnverified: number;
      offset: number;
      nextOffset: number | null;
      hasMore: boolean;
      knownSampleOnThisPage: boolean;
      savedToDatabase: false;
    }
  | {
      status: 'not_exposed';
      message: string;
      queueId: string;
      matches: [];
      hasMore: false;
      nextOffset: null;
      savedToDatabase: false;
    };

type ScanState = 'idle' | 'checking' | 'scanning' | 'complete' | 'unavailable' | 'stopped' | 'partial' | 'error';

function csv(value: string | number | null | undefined) {
  const raw = String(value ?? '');
  // Spreadsheet formula injection protection for downloaded FACEIT nicknames.
  const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function QueueHistoryClient({
  queueId, locale, apiConfigured,
}: {
  queueId: string;
  locale: 'mn' | 'en';
  apiConfigured: boolean;
}) {
  const mn = locale === 'mn';
  const cancelRef = useRef(false);
  const [status, setStatus] = useState<ScanState>('idle');
  const [matches, setMatches] = useState<QueueHistoryMatch[]>([]);
  const [requestPages, setRequestPages] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [knownSampleLocated, setKnownSampleLocated] = useState(false);
  const [message, setMessage] = useState('');
  const [more, setMore] = useState(false);
  const [visible, setVisible] = useState(50);

  const busy = status === 'checking' || status === 'scanning';
  const juneMatches = matches.filter(m=>m.finishedAt!==null
    &&m.finishedAt>=CLUB_ARCHIVE_SINCE_SECONDS
    &&m.finishedAt<=Math.floor(Date.now()/1000)+3600);

  async function getPage(offset: number, limit: number): Promise<HistoryPage> {
    const response = await fetch('/api/admin/faceit-club/history?offset=' + offset + '&limit=' + limit, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null) as
      (HistoryPage & { error?: string }) | null;
    if (!response.ok || !data) {
      throw new Error(data?.error || 'FACEIT Hub match-history request failed');
    }
    return data;
  }

  async function testHistory() {
    if (!apiConfigured || busy) return;
    setStatus('checking');
    setMessage('');
    setMatches([]);
    setRequestPages(0);
    setDiscarded(0);
    setKnownSampleLocated(false);
    setMore(false);
    setVisible(50);
    try {
      const page = await getPage(0, 50);
      if (page.status === 'not_exposed') {
        setStatus('unavailable');
        setMessage(page.message);
        return;
      }
      if (page.queueId !== queueId) throw new Error('FACEIT returned another competition. Results rejected.');
      setMatches(page.matches);
      setDiscarded(page.rejectedUnverified);
      setKnownSampleLocated(page.knownSampleOnThisPage);
      setRequestPages(1);
      setMore(page.hasMore);
      setStatus('partial');
      setMessage(page.hasMore
        ? 'The FACEIT Hub endpoint returned a valid page. Run the full scan to paginate remaining matches.'
        : page.countReturned === 0
          ? 'Hub endpoint returned an empty page. This does not prove there are no Club queue matches.'
          : 'The FACEIT Hub endpoint returned a single complete page. No further page was indicated.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'FACEIT history request failed');
    }
  }

  async function scanHistory() {
    if (!apiConfigured || busy) return;
    cancelRef.current = false;
    setStatus('scanning');
    setMatches([]);
    setMessage('');
    setRequestPages(0);
    setDiscarded(0);
    setKnownSampleLocated(false);
    setMore(false);
    setVisible(50);
    const seen = new Set<string>();
    let offset = 0;
    let pages = 0;
    let matched = false;
    let rejected = 0;
    let accumulated: QueueHistoryMatch[] = [];
    let hasMore = true;

    try {
      for (; pages < FACEIT_HISTORY_MAX_AUTO_PAGES && !cancelRef.current && hasMore; pages++) {
        const page = await getPage(offset, FACEIT_HISTORY_FULL_SCAN_PAGE_SIZE);
        if (page.status === 'not_exposed') {
          setStatus('unavailable');
          setMessage(page.message);
          return;
        }
        if (page.queueId !== queueId) throw new Error('FACEIT returned another competition. Scan rejected.');
        for (const match of page.matches) {
          if (seen.has(match.matchId)) continue;
          seen.add(match.matchId);
          accumulated.push(match);
        }
        offset += page.countReturned;
        rejected += page.rejectedUnverified;
        matched = matched || page.knownSampleOnThisPage;
        hasMore = page.hasMore;
        setMatches([...accumulated]);
        setRequestPages(pages + 1);
        setDiscarded(rejected);
        setKnownSampleLocated(matched);
        setMore(hasMore);
        if (page.countReturned === 0) break;
      }

      if (cancelRef.current) {
        setStatus('stopped');
        setMessage('Scan stopped. Only the pages already fetched are displayed; no data was stored.');
      } else if (hasMore) {
        setStatus('partial');
        setMessage('Safety limit reached: ' + FACEIT_HISTORY_MAX_AUTO_PAGES
          + ' pages / up to 10,000 results. Some older history may remain. No background sync is active.');
      } else {
        setStatus('complete');
        setMessage('The FACEIT Hub endpoint returned no further pages. All available pages in this scan were fetched; nothing was stored automatically.');
      }
    } catch (error) {
      setStatus('error');
      setMessage((error instanceof Error ? error.message : 'Unknown FACEIT error')
        + '. Previously fetched pages remain visible; the history is incomplete.');
    }
  }

  function saveCsv() {
    if (!juneMatches.length) return;
    const header = ['Match ID', 'Status', 'Finished UTC', 'Competition ID', 'Organizer ID',
      'Team A', 'Team B', 'Score A', 'Score B', 'Matchroom URL'];
    const rows = juneMatches.map(match => [
      match.matchId,
      match.status,
      match.finishedAt ? new Date(match.finishedAt * 1000).toISOString() : '',
      match.competitionId,
      match.organizerId || '',
      match.teams[0]?.name || '',
      match.teams[1]?.name || '',
      match.teams[0]?.score ?? '',
      match.teams[1]?.score ?? '',
      match.faceitUrl,
    ]);
    const csvText = '\ufeff' + [header, ...rows].map(row => row.map(csv).join(',')).join('\r\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nexus-faceit-queue-' + queueId + '-june-2026-onward.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return <section className="lab-card faceit-hub-history">
    <div className="lab-panel-heading">
      <span className="section-kicker">03 / {mn ? 'ЗӨВХӨН ЭНЭ QUEUE-ИЙН MATCH HISTORY' : 'THIS QUEUE ONLY / MATCH HISTORY'}</span>
      <span className={'lab-status ' + (status === 'complete' ? 'enabled' : '')}>
        {status === 'complete' ? 'PAGES EXHAUSTED'
          : status === 'unavailable' ? 'HUB ROUTE / 404'
          : status === 'partial' ? 'PARTIAL / AVAILABLE'
          : busy ? 'FETCHING FACEIT'
          : status.toUpperCase()}
      </span>
    </div>
    <h2>{mn ? 'Бүх тоглолтын түүх' : 'Queue match history'}</h2>
    <p className="faceit-club-note">{mn
      ? 'FACEIT-ийн /hubs/{id}/matches API-г яг таны queue ID-аар шалгана. Дууссан тоглолтыг 100-аар нь татна. Тоглолтын ID, CS2, hub тэмцээний ID нь яг таарсан үед л үр дүнд оруулна.'
      : 'Check the documented FACEIT Hub match-history endpoint using the queue ID found on your matchroom. The full scan pages through up to 100 finished matches per request and only accepts exact CS2 / hub / competition ID matches.'}</p>

    <div className="faceit-history-actions">
      <button className="outline-button" type="button" disabled={!apiConfigured || busy} onClick={testHistory}>
        {mn ? 'ЭХНИЙ 50 ТОГЛОЛТЫГ ШАЛГАХ' : 'TEST HUB HISTORY (FIRST 50)'}
      </button>
      <button className="lab-run-button faceit-history-run" type="button" disabled={!apiConfigured || busy} onClick={scanHistory}>
        {mn ? 'БОЛОМЖТОЙ БҮХ ТҮҮХИЙГ ТАТАХ' : 'SCAN AVAILABLE QUEUE HISTORY'}
      </button>
      {status === 'scanning' && <button className="outline-button" type="button" onClick={() => { cancelRef.current = true; }}>
        {mn ? 'ЗОГСООХ' : 'STOP AFTER THIS PAGE'}
      </button>}
      {!!juneMatches.length && !busy && <button className="outline-button" type="button" onClick={saveCsv}>
        {mn ? 'CSV ФАЙЛ ТАТАХ' : 'EXPORT CSV'}
      </button>}
    </div>
    <p className="faceit-club-note">
      {mn
        ? 'Энэ нь зөвхөн админы хэсэгт ажиллана. Одоогоор өгөгдлийг браузерт түр харуулж CSV болгож татна; өгөгдлийн санд автоматаар хадгалах эсвэл цагийн хуваариар шинэчлэх ажил хараахан идэвхгүй.'
        : 'This is an admin-triggered read-only scan. Results stay in the browser until refresh or CSV export. Automatic scheduled syncing and database storage are not enabled yet.'}
    </p>
    {status !== 'idle' && <div className="faceit-history-status" aria-live="polite">
      <div><small>VALID MATCHES</small><strong>{matches.length.toLocaleString()}</strong></div>
      <div><small>PAGES FETCHED</small><strong>{requestPages}</strong></div>
      <div><small>REJECTED / WRONG SCOPE</small><strong>{discarded}</strong></div>
      <div><small>SUPPLIED MATCH FOUND</small><strong>{knownSampleLocated ? 'YES' : 'NOT YET'}</strong></div>
    </div>}
    {matches.length>0 && <p className="faceit-club-note">
      June 1, 2026 onward: {juneMatches.length} matches. Earlier or undated matches excluded: {matches.length-juneMatches.length}.
    </p>}
    {message && <div className={'faceit-history-message' + (status === 'error' || status === 'unavailable' ? ' caution' : '')} role="status">
      {message}
    </div>}
    {status === 'scanning' && <p className="faceit-club-note">
      {mn ? 'Скан үргэлжилж байна — табыг нээлттэй байлгана уу.' : 'Scanning while this tab is open. You can stop after the current page.'}
    </p>}
    {juneMatches.length > 0 && <div className="faceit-history-list">
      <div className="faceit-history-list-title">
        <strong>{mn ? 'FACEIT-ЭЭС БАТАЛГААЖСАН ТОГЛОЛТУУД' : 'MATCHES MATCHING THIS COMPETITION'}</strong>
        <span>{mn ? 'ХАРУУЛЖ БАЙГАА' : 'SHOWING'} {Math.min(visible,juneMatches.length)} / {juneMatches.length}</span>
      </div>
      {juneMatches.slice(0,visible).map(match => <div className="faceit-history-match" key={match.matchId}>
        <div className="faceit-history-match-meta">
          <span>{match.status}</span>
          <small>{match.finishedAt ? new Date(match.finishedAt * 1000).toLocaleString() : 'DATE UNAVAILABLE'}</small>
        </div>
        <div className="faceit-history-match-teams">
          <strong>{match.teams[0]?.name || '—'}</strong>
          <span>{match.hasScore
            ? match.teams[0]?.score + ' : ' + match.teams[1]?.score
            : 'VS'}</span>
          <strong>{match.teams[1]?.name || '—'}</strong>
        </div>
        <a href={match.faceitUrl} target="_blank" rel="noopener noreferrer" className="faceit-history-link">
          {mn ? 'FACEIT MATCHROOM' : 'VIEW MATCH / PLAYER STATS'} ↗
        </a>
      </div>)}
      {visible < juneMatches.length && <button type="button" className="outline-button" onClick={() => setVisible(x=>x+50)}>
        {mn ? 'ДАРААГИЙН 50-Г ХАРАХ' : 'SHOW 50 MORE'}
      </button>}
    </div>}
    <ClubArchiveClient
      matches={juneMatches}
      historyComplete={status==='complete' && !more}
      locale={locale}
      apiConfigured={apiConfigured}
    />
  </section>;
}
