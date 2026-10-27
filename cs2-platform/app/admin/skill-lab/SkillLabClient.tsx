'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';
import { FaceitStatsPanel } from '@/components/FaceitStatsPanel';
import type { FaceitMetrics, MetricName } from '@/lib/faceit-metrics';
import type { SkillArea } from '@/lib/skill';

type Analysis = {
  steamId: string;
  verifiedOwner: true;
  persisted: false;
} & ({
  found: true;
  playerId: string;
  nickname: string;
  faceitLevel: number | null;
  elo: number;
  protectedElo: number;
  historicalPeakElo: number | null;
  lifetimeKd: number | null;
  lifetimeMatches: number | null;
  performanceBonus: number;
  performanceSource: string;
  performanceAreas: Partial<Record<SkillArea, number>>;
  recentMetrics: Partial<FaceitMetrics> | null;
  lifetimeMetrics: Partial<FaceitMetrics> | null;
  recentMetricSamples: Partial<Record<MetricName, number>> | null;
  reviewFlags: string[];
  reviewRequired: boolean;
  score: number;
  tier: number;
  recentKd: number | null;
  matches: number;
  confidence: 'recent-data' | 'limited' | 'elo-only';
  model: string;
  statsAvailable: boolean;
} | {
  found: false;
  nickname?: string;
  reason: string;
});

const tierBands = [
  { tier: 1, range: '0 – 24.99', en: 'Developing', mn: 'Эхлэгч' },
  { tier: 2, range: '25 – 39.99', en: 'Challenger', mn: 'Өсөж буй' },
  { tier: 3, range: '40 – 58.99', en: 'Competitive', mn: 'Өрсөлдөх' },
  { tier: 4, range: '59 – 77.99', en: 'Advanced', mn: 'Ахисан' },
  { tier: 5, range: '78 – 100', en: 'Elite', mn: 'Элит' },
];

function confidenceName(confidence: string, mn: boolean) {
  if (confidence === 'recent-data') return mn ? '30 хүртэлх тоглолтын өгөгдөл' : 'RECENT MATCH DATA';
  if (confidence === 'limited') return mn ? 'Хязгаарлагдмал өгөгдөл' : 'LIMITED DATA';
  return mn ? 'Зөвхөн Elo' : 'ELO ONLY';
}

export function SkillLabClient({
  playerName, steamId, apiConfigured,
}: {
  playerName: string;
  steamId: string | null;
  apiConfigured: boolean;
}) {
  const { locale } = useLocale();
  const mn = locale === 'mn';
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function analyzeMyAccount() {
    if (!apiConfigured || !steamId || loading) return;
    setLoading(true);
    setResult(null);
    setError('');
    setErrorCode('');
    try {
      const response = await fetch('/api/admin/faceit-test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await response.json().catch(() => null) as (Analysis & { error?: string; code?: string }) | null;
      if (!response.ok) {
        setErrorCode(body?.code || '');
        throw new Error(body?.error || 'FACEIT could not complete the lookup');
      }
      if (!body || typeof body.found !== 'boolean') throw new Error('Unexpected FACEIT response');
      setResult(body);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to run analysis');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content-page lab-page">
      <div className="lab-nav">
        <span className="section-kicker">NEXUS / ADMIN / SKILL LAB</span>
        <Link href="/admin" className="lab-back">{mn ? 'УДИРДЛАГА РУУ' : 'BACK TO CONTROL'} <span aria-hidden="true">↗</span></Link>
      </div>
      <header className="lab-header">
        <span className="lab-eyebrow">{mn ? 'УР ЧАДВАРЫН ҮНЭЛГЭЭНИЙ ТУРШИЛТ' : 'COMPETITIVE INTELLIGENCE / V1'}</span>
        <h1>{mn ? 'Ур чадварын' : 'Skill'} <span>{mn ? 'шинжилгээ.' : 'analysis.'}</span></h1>
        <p>{mn
          ? 'Баталгаажсан SteamID-аас FACEIT-ийн CS2 үзүүлэлтүүдийг шалгаж, NEXUS-ийн урьдчилсан түвшинг тооцоолно.'
          : 'Analyze a verified Steam account using FACEIT CS2 Elo and recent match data, then review the proposed NEXUS tier.'}</p>
      </header>

      <div className="lab-grid">
        <section className="lab-main">
          <div className="lab-card lab-identity">
            <div className="lab-panel-heading">
              <span className="section-kicker">01 / {mn ? 'БАТАЛГААЖСАН ТОГЛОГЧ' : 'VERIFIED PLAYER'}</span>
              <span className={'lab-status' + (steamId ? ' enabled' : '')}>{steamId ? 'STEAM VERIFIED' : 'STEAM REQUIRED'}</span>
            </div>
            <div className="lab-player-row">
              <div className="lab-player-monogram">{playerName.trim().slice(0, 2).toUpperCase()}</div>
              <div className="lab-player-info"><small>YOUR NEXUS ACCOUNT</small><strong>{playerName}</strong><code>{steamId || 'Steam not connected'}</code></div>
              {steamId && <a className="lab-outlink" href={'https://steamcommunity.com/profiles/' + steamId} target="_blank" rel="noopener noreferrer" aria-label="Open verified Steam profile">↗</a>}
            </div>
            <div className="lab-safety-line">
              <span aria-hidden="true">✓</span>
              {mn
                ? 'Зөвхөн таны Steam OpenID-аар баталгаажсан хаягийг шинжилнэ. Энэ туршилт түвшин хадгалахгүй.'
                : 'Uses your Steam OpenID-verified account. Test results are not saved or approved for tournaments.'}
            </div>
          </div>

          <div className="lab-card lab-run">
            <div className="lab-panel-heading">
              <span className="section-kicker">02 / {mn ? 'FACEIT API' : 'FACEIT CONNECTION'}</span>
              <span className={'lab-status' + (apiConfigured ? ' enabled' : ' disabled')}>{apiConfigured ? 'API KEY CONFIGURED' : 'CONFIGURATION NEEDED'}</span>
            </div>
            <h2>{mn ? 'Өөрийн FACEIT үзүүлэлтийг шалгах' : 'Analyze your FACEIT record'}</h2>
            <p>{mn
              ? 'Энэ үйлдэл FACEIT-ийн тоглогчийн мэдээлэл, Elo болон сүүлийн 30 хүртэлх тоглолтын K/D-г татна.'
              : 'Request your FACEIT CS2 profile, exact Elo and K/D ratios from up to 30 recent matches.'}</p>

            {!steamId && <div className="lab-instruction">
              <strong>{mn ? 'Steam хаягаа эхлээд холбоно уу' : 'Connect Steam first'}</strong>
              <Link href="/dashboard">{mn ? 'МИНИЙ ПРОФАЙЛ' : 'GO TO MY PROFILE'} ↗</Link>
            </div>}
            {!apiConfigured && <div className="lab-instruction" role="status">
              <strong>{mn ? 'FACEIT API түлхүүр байхгүй байна' : 'FACEIT API key not configured'}</strong>
              <p>{mn ? 'FACEIT Developer Portal-оос server-side API түлхүүр авч, .env.local дотор FACEIT_API_KEY гэж тохируулаад dev серверийг дахин асаана уу.' : 'Create a server-side Data API key in the FACEIT Developer Portal, set FACEIT_API_KEY in cs2-platform/.env.local and restart npm run dev.'}</p>
              <a href="https://developers.faceit.com/" target="_blank" rel="noopener noreferrer">FACEIT DEVELOPER PORTAL ↗</a>
            </div>}

            <button className="lab-run-button" type="button" onClick={analyzeMyAccount} disabled={loading || !steamId || !apiConfigured}>
              <span>{loading ? (mn ? 'ШИНЖИЛЖ БАЙНА...' : 'ANALYZING FACEIT...') : (mn ? 'МИНИЙ FACEIT-ИЙГ ШИНЖЛЭХ' : 'ANALYZE MY FACEIT ACCOUNT')}</span>
              <span aria-hidden="true">↗</span>
            </button>
            {error && <div className="lab-error" role="alert"><strong>{errorCode ? errorCode.replace(/_/g, ' ').toUpperCase() : 'REQUEST FAILED'}</strong><p>{error}</p></div>}
          </div>

          {result && (
            <section className="lab-card lab-results" aria-label="FACEIT analysis results" aria-live="polite">
              <div className="lab-panel-heading">
                <span className="section-kicker">03 / {mn ? 'ШИНЖИЛГЭЭНИЙ ҮР ДҮН' : 'ANALYSIS RESULT'}</span>
                <span className="lab-status enabled">{result.found ? 'FOUND ON FACEIT' : 'MANUAL REVIEW'}</span>
              </div>
              {result.found ? (
                <>
                  <div className="lab-faceit-heading">
                    <span className="lab-faceit-kicker">FACEIT CS2 / {result.model.toUpperCase()}</span>
                    <h2>{result.nickname}</h2>
                    <span>{mn ? 'Одоогийн FACEIT өгөгдөлд суурилсан зөвлөмж' : 'Provisional recommendation based on available FACEIT data'}</span>
                  </div>
                  <div className="lab-result-grid">
                    <div className="lab-result-hero"><small>{mn ? 'NEXUS ТҮВШИН' : 'PROPOSED NEXUS TIER'}</small><strong>{String(result.tier).padStart(2, '0')}</strong><span>{mn ? 'ЗӨВЛӨМЖ' : 'SUGGESTED ONLY'}</span></div>
                    <div className="lab-result-metric"><small>FACEIT ELO</small><strong>{result.elo.toLocaleString()}</strong><span>LEVEL {result.faceitLevel ?? '—'}</span></div>
                    <div className="lab-result-metric"><small>NEXUS SCORE</small><strong>{result.score.toFixed(2)}<em>/100</em></strong><span>{confidenceName(result.confidence, mn)}</span></div>
                    <div className="lab-result-metric"><small>{mn ? 'СҮҮЛИЙН K/D' : 'RECENT K/D'}</small><strong>{result.recentKd === null ? '—' : result.recentKd.toFixed(2)}</strong><span>{result.matches} {mn ? 'АШИГЛАСАН ТОГЛОЛТ' : 'MATCHES SAMPLED'}</span></div>
                    <div className="lab-result-metric"><small>{mn ? 'НИЙТ K/D' : 'LIFETIME K/D'}</small><strong>{result.lifetimeKd === null ? '—' : result.lifetimeKd.toFixed(2)}</strong><span>{result.lifetimeMatches ?? '—'} {mn ? 'FACEIT ТОГЛОЛТ' : 'FACEIT MATCHES'}</span></div>
                    <div className="lab-result-metric"><small>{mn ? 'ХАМГААЛСАН ELO' : 'SEEDING ELO'}</small><strong>{result.protectedElo.toLocaleString()}</strong><span>{mn ? 'ӨМНӨХ ТҮҮХТЭЙ БОЛ НӨЛӨӨЛНӨ' : 'USES VERIFIED HISTORY WHEN AVAILABLE'}</span></div>
                  </div>
                  <FaceitStatsPanel
                    locale={locale}
                    recent={result.recentMetrics}
                    lifetime={result.lifetimeMetrics}
                    recentCounts={result.recentMetricSamples}
                    areas={result.performanceAreas}
                    source={result.performanceSource}
                  />
                  <div className="lab-score-area">
                    <div className="lab-score-caption"><span>NEXUS SCORE / 100</span><strong>{result.score.toFixed(2)}</strong></div>
                    <div className="lab-score-track" role="img" aria-label={'NEXUS skill score ' + result.score + ' out of 100'}><span style={{ width: result.score + '%' }} /></div>
                  </div>
                  {result.reviewFlags.length > 0 && <div className="lab-review-alert" role="status">
                    <strong>{mn ? 'АДМИНЫ ХЯНАЛТ ШААРДЛАГАТАЙ' : 'REVIEW FLAGS — NOT EVIDENCE OF INTENTIONAL THROWING'}</strong>
                    {result.reviewFlags.map(flag => <p key={flag}>{({
                      historical_elo_drop: mn ? 'Өмнө бүртгэсэн Elo-оос мэдэгдэхүйц буурсан' : 'Drop from previously observed Elo',
                      recent_performance_mismatch: mn ? 'Сүүлийн үзүүлэлттэй зөрүүтэй' : 'Recent performance does not align with current Elo',
                      lifetime_performance_mismatch: mn ? 'Нийт үзүүлэлттэй зөрүүтэй' : 'Lifetime performance does not align with current Elo',
                      limited_faceit_history: mn ? 'FACEIT тоглолтын түүх бага' : 'Limited lifetime FACEIT match history',
                      damage_elo_mismatch: mn ? 'Damage үзүүлэлт Elo-оос өндөр' : 'Recent damage appears high relative to Elo',
                      utility_elo_mismatch: mn ? 'Utility үзүүлэлт Elo-оос өндөр' : 'Lifetime utility appears high relative to Elo',
                    } as Record<string, string>)[flag] || flag}</p>)}
                  </div>}
                  <p className="lab-protection-note">{mn
                    ? 'Сүүлийн тоглолт муу байсан ч NEXUS оноо буурахгүй. Түүхэн Elo хамгаалалт зөвхөн өмнө бүртгэсэн, баталгаажсан үнэлгээнд үйлчилнэ.'
                    : 'Weak recent performance never lowers the Elo-based score. Strong damage, teamwork, opening or clutch play can provide small positive evidence. Historical Elo protection applies only to previously verified tournament snapshots.'}</p>
                  {!result.statsAvailable && <p className="lab-results-note">{mn ? 'Сүүлийн тоглолтын мэдээлэл байхгүй тул энэ тооцоо зөвхөн Elo дээр үндэслэсэн.' : 'Recent match statistics were unavailable. The recommendation uses FACEIT Elo only.'}</p>}
                  <p className="lab-results-note">{mn ? 'Энэ нь эцсийн батлагдсан үнэлгээ биш. Тэмцээний бүртгэлтэй тоглогчдын үнэлгээг админ тусад нь батална.' : 'This does not assign an official tournament tier. An administrator must review and approve each paid tournament entry separately.'}</p>
                </>
              ) : (
                <div className="lab-no-result"><strong>{mn ? 'Гараар үнэлэх шаардлагатай' : 'Manual assessment required'}</strong><p>{result.reason}</p></div>
              )}
            </section>
          )}
        </section>

        <aside className="lab-aside">
          <section className="lab-card lab-model">
            <div className="lab-panel-heading"><span className="section-kicker">MODEL / MULTI-SIGNAL V3</span><span className="lab-model-dot" aria-hidden="true">✳</span></div>
            <h2>{mn ? 'NEXUS түвшин' : 'Tier breakdown'}<span>.</span></h2>
            <p>{mn ? 'FACEIT Elo үндсэн үзүүлэлт хэвээр. Damage, ассист, utility, entry, clutch-ийн нэмэлт үзүүлэлт хамгийн ихдээ 7.5 оноо нэмж болно. Сул үзүүлэлт оноо хасахгүй.' : 'Exact Elo is translated into a 0–100 score. Recent and lifetime damage, assists, utility, entry and clutch evidence can add up to 7.5 points in total. Missing or weak stats never lower Elo-based seeding. This is an uncalibrated, provisional model.'}</p>
            <div className="lab-tier-list">
              {tierBands.map(band => (
                <div key={band.tier} className={'lab-tier' + (result?.found && result.tier === band.tier ? ' current' : '')}>
                  <span className="lab-tier-number">0{band.tier}</span>
                  <span className="lab-tier-copy"><strong>{mn ? band.mn : band.en}</strong><small>{band.range} / 100</small></span>
                  {result?.found && result.tier === band.tier && <span className="lab-tier-current">{mn ? 'ЗӨВЛӨМЖ' : 'SUGGESTED'}</span>}
                </div>
              ))}
            </div>
            <p className="lab-model-caption">{mn ? 'Энэхүү NEXUS онооны загварыг бодит тэмцээний үр дүнгээр цаашид тохируулна.' : 'We will calibrate NEXUS tiers against actual tournament results before relying on them for team balance.'}</p>
          </section>
          <div className="lab-next">
            <span className="section-kicker">NEXT / TOURNAMENT ROSTERS</span>
            <strong>{mn ? 'Дараа нь багийн тэнцвэржүүлэлт.' : 'Next: balanced squads.'}</strong>
            <p>{mn ? '50 тоглогчтой BVG – Friends League загвараар баг бүрдүүлэгчийг туршина.' : 'Test the team generator with 50 simulated players across BVG – Friends League’s 10 teams.'}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
