import type { FaceitMetrics, MetricName } from '@/lib/faceit-metrics';
import type { SkillArea } from '@/lib/skill';
import { SKILL_BONUS_CAPS } from '@/lib/skill';

export type FaceitAreaPoints = Partial<Record<SkillArea, number>>;
export type FaceitMetricValues = Partial<FaceitMetrics>;

const SIGNALS: Array<{
  key: MetricName;
  area: SkillArea;
  en: string;
  mn: string;
  subtitle: string;
  format: (value: number) => string;
}> = [
  {
    key: 'adr', area: 'adr', en: 'ADR', mn: 'ADR', subtitle: 'DAMAGE / ROUND',
    format: value => value.toFixed(1),
  },
  {
    key: 'kastPercent', area: 'kast', en: 'KAST', mn: 'KAST', subtitle: 'KILL · ASSIST · SURVIVE · TRADE',
    format: value => value.toFixed(1) + '%',
  },
  {
    key: 'openingDuelWinPercent', area: 'opening', en: 'OPENING DUELS', mn: 'OPENING DUELS', subtitle: 'DUELS WON / ATTEMPTED',
    format: value => value.toFixed(1) + '%',
  },
  {
    key: 'kd', area: 'kd', en: 'K/D', mn: 'K/D', subtitle: 'KILLS / DEATHS',
    format: value => value.toFixed(2),
  },
];

function formatted(value: unknown, render: (value: number) => string) {
  return typeof value === 'number' && Number.isFinite(value) ? render(value) : '—';
}

export function FaceitStatsPanel({
  recent, lifetime, recentCounts, areas, source, locale,
}: {
  recent?: FaceitMetricValues | null;
  lifetime?: FaceitMetricValues | null;
  recentCounts?: Partial<Record<MetricName, number>> | null;
  areas?: FaceitAreaPoints | null;
  source?: string | null;
  locale: 'mn' | 'en';
}) {
  const mn = locale === 'mn';
  if (!recent && !lifetime && !areas) {
    return <p className="faceit-stats-unavailable">{mn
      ? 'Энэ FACEIT үнэлгээний статистик хадгалагдаагүй байна.'
      : 'Core performance metrics were not saved for this assessment. Run a fresh FACEIT scan.'}</p>;
  }

  return (
    <section className="faceit-breakdown" aria-label="FACEIT core performance">
      <div className="faceit-breakdown-header">
        <strong>{mn ? 'ГОЛ 4 ҮЗҮҮЛЭЛТ' : 'FOUR CORE PERFORMANCE SIGNALS'}</strong>
        <span>{source === 'lifetime'
          ? (mn ? 'НИЙТ ТОГЛОЛТЫН ҮНЭЛГЭЭ' : 'LIFETIME EVIDENCE USED')
          : source === 'recent' ? (mn ? 'СҮҮЛИЙН ТОГЛОЛТЫН ҮНЭЛГЭЭ' : 'RECENT MATCH EVIDENCE USED')
            : (mn ? 'ЗӨВХӨН FACEIT ELO' : 'ELO-ONLY BASELINE')}</span>
      </div>

      <div className="faceit-core-grid">
        {SIGNALS.map(signal => {
          const fromRecent = recent?.[signal.key];
          const fromLifetime = lifetime?.[signal.key];
          const count = recentCounts?.[signal.key] ?? 0;
          const noValue = fromRecent == null && fromLifetime == null;
          const bonus = areas?.[signal.area] ?? 0;
          const cap = SKILL_BONUS_CAPS[signal.area];
          return <article className="faceit-core-card" key={signal.key}>
            <div className="faceit-core-card-heading">
              <strong>{mn ? signal.mn : signal.en}</strong>
              <small>{signal.subtitle}</small>
            </div>
            <div className="faceit-core-score">{formatted(fromRecent ?? fromLifetime, signal.format)}
              {noValue && <span className="faceit-core-missing">{mn ? 'ӨГӨГДӨЛ АЛГА' : 'UNAVAILABLE FROM API'}</span>}
            </div>
            <div className="faceit-core-samples">
              <span>{mn ? 'СҮҮЛИЙН' : 'RECENT'}: {formatted(fromRecent, signal.format)}
                {count > 0 && <small> (n={count})</small>}</span>
              <span>{mn ? 'НИЙТ' : 'LIFETIME'}: {formatted(fromLifetime, signal.format)}</span>
            </div>
            <div className="faceit-core-contribution">
              <span>{mn ? 'НЭМЭЛТ ОНОО' : 'RATING BONUS'}</span>
              <strong>+{bonus.toFixed(2)} <small>/ {cap.toFixed(1)}</small></strong>
            </div>
            <div className="faceit-area-bar"><i style={{ width: Math.max(0, Math.min(100, bonus / cap * 100)) + '%' }}/></div>
          </article>;
        })}
      </div>

      <p className="faceit-breakdown-notice">{mn
        ? 'Elo нь үндсэн үзүүлэлт хэвээр. ADR, KAST, opening duel win %, K/D нийлээд хамгийн ихдээ +7.5 нэмэлт оноо өгнө. Сул үзүүлэлт оноо хасахгүй. — нь FACEIT API тухайн статистикийг өгөөгүй гэсэн үг; 0 гэж үзэхгүй.'
        : 'Elo is still the baseline. ADR, KAST, opening-duel win % and K/D can add at most +7.5 combined. Weak stats never subtract points. “—” means the FACEIT Data API did not provide a usable value — it does not mean zero. These scoring thresholds are provisional.'}</p>
      <p className="faceit-breakdown-notice">{mn
        ? 'Сүүлийн статистик нь тухайн өгөгдөлтэй 30 хүртэлх тоглолтын дундаж. Нийт статистик нь FACEIT-ээс ирсэн нэгтгэсэн утга. KAST эсвэл opening duel өгөгдөл ирээгүй тохиолдолд зохиомлоор тооцохгүй.'
        : 'Recent results average up to 30 matches that expose each field; lifetime figures come from the FACEIT aggregate. We never guess KAST or opening-duel performance from unrelated statistics.'}</p>
    </section>
  );
}
