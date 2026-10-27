import type { FaceitMetrics, MetricName } from '@/lib/faceit-metrics';
import type { SkillArea } from '@/lib/skill';

export type FaceitAreaPoints = Partial<Record<SkillArea, number>>;
export type FaceitMetricValues = Partial<FaceitMetrics>;

const METRICS: Array<{
  key: MetricName;
  en: string;
  mn: string;
  type: 'decimal' | 'percent' | 'fraction';
}> = [
  { key: 'adr', en: 'Damage per round (ADR)', mn: 'Нэг раунд дахь хохирол (ADR)', type: 'decimal' },
  { key: 'killsPerRound', en: 'Kills per round', mn: 'Нэг раунд дахь килл', type: 'decimal' },
  { key: 'kd', en: 'K/D ratio', mn: 'K/D харьцаа', type: 'decimal' },
  { key: 'assistsPerMatch', en: 'Assists per match', mn: 'Тоглолт дахь ассист', type: 'decimal' },
  { key: 'utilityDamagePerRound', en: 'Utility damage / round', mn: 'Гранатын хохирол / раунд', type: 'decimal' },
  { key: 'enemiesFlashedPerRound', en: 'Enemies flashed / round', mn: 'Flash-д өртсөн дайсан / раунд', type: 'decimal' },
  { key: 'entryRate', en: 'Entry attempts / round', mn: 'Entry оролдлого / раунд', type: 'fraction' },
  { key: 'entrySuccessRate', en: 'Entry success', mn: 'Entry амжилт', type: 'fraction' },
  { key: 'clutch1v1Rate', en: '1v1 clutch success', mn: '1v1 clutch амжилт', type: 'fraction' },
  { key: 'clutch1v2Rate', en: '1v2 clutch success', mn: '1v2 clutch амжилт', type: 'fraction' },
  { key: 'headshotPercent', en: 'Headshot %', mn: 'Headshot %', type: 'percent' },
  { key: 'winRatePercent', en: 'Win rate', mn: 'Ялалтын хувь', type: 'percent' },
  { key: 'sniperKillRate', en: 'Sniper kill share', mn: 'Sniper киллийн хувь', type: 'fraction' },
  { key: 'mvpPerMatch', en: 'MVPs / match', mn: 'MVP / тоглолт', type: 'decimal' },
];

const GROUPS: Array<{ key: SkillArea; cap: number; en: string; mn: string }> = [
  { key: 'impact', cap: 3, en: 'Damage & impact', mn: 'Хохирол ба нөлөө' },
  { key: 'teamplay', cap: 2.4, en: 'Teamplay & utility', mn: 'Багийн тоглолт ба гранат' },
  { key: 'opening', cap: 1.2, en: 'Entry performance', mn: 'Entry үзүүлэлт' },
  { key: 'clutch', cap: .9, en: 'Clutch situations', mn: 'Clutch нөхцөл' },
];

function format(value: unknown, kind: 'decimal' | 'percent' | 'fraction') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const n = kind === 'fraction' ? value * 100 : value;
  if (kind === 'decimal') return n.toFixed(2);
  return n.toFixed(1) + '%';
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
      ? 'Энэ үнэлгээний нарийвчилсан FACEIT статистик хадгалагдаагүй байна.'
      : 'Detailed FACEIT statistics were not saved for this assessment.'}</p>;
  }
  return (
    <div className="faceit-breakdown">
      <div className="faceit-breakdown-header">
        <strong>{mn ? 'ҮЗҮҮЛЭЛТ БА ОНООНЫ ТАЙЛБАР' : 'PERFORMANCE BREAKDOWN'}</strong>
        <span>{source === 'lifetime'
          ? mn ? 'НИЙТ ТОГЛОЛТЫН ӨГӨГДӨЛ' : 'LIFETIME EVIDENCE'
          : source === 'recent'
            ? mn ? 'СҮҮЛИЙН ТОГЛОЛТЫН ӨГӨГДӨЛ' : 'RECENT MATCH EVIDENCE'
            : mn ? 'FACEIT ELO СУУРЬ ОНОО' : 'ELO-ONLY BASELINE'}</span>
      </div>

      {areas && <div className="faceit-area-grid">
        {GROUPS.map(group => {
          const score = typeof areas[group.key] === 'number' ? areas[group.key]! : 0;
          return <div className="faceit-area" key={group.key}>
            <span>{mn ? group.mn : group.en}</span>
            <strong>+{score.toFixed(2)} <small>/ {group.cap}</small></strong>
            <div className="faceit-area-bar"><i style={{ width: Math.max(0, Math.min(100, score / group.cap * 100)) + '%' }}/></div>
          </div>;
        })}
      </div>}

      <div className="faceit-stats-table-wrap">
        <table className="faceit-stats-table">
          <thead><tr>
            <th>{mn ? 'ҮЗҮҮЛЭЛТ' : 'METRIC'}</th>
            <th>{mn ? 'СҮҮЛИЙН 30' : 'RECENT · UP TO 30'}</th>
            <th>{mn ? 'НИЙТ' : 'LIFETIME'}</th>
          </tr></thead>
          <tbody>
            {METRICS.map(metric => {
              const samples = recentCounts?.[metric.key];
              return <tr key={metric.key}>
                <td>{mn ? metric.mn : metric.en}</td>
                <td>{format(recent?.[metric.key], metric.type)}
                  {typeof samples === 'number' && samples > 0 && <small title={mn ? 'Өгөгдөлтэй тоглолтын тоо' : 'Matches with this stat'}> n={samples}</small>}
                </td>
                <td>{format(lifetime?.[metric.key], metric.type)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="faceit-breakdown-notice">{mn
        ? '— нь статистик байхгүй гэсэн үг. Elo нь үндсэн үнэлгээ хэвээр; эерэг нэмэлт үзүүлэлтүүд л оноо нэмж болно (хамгийн ихдээ +7.5). Headshot, sniper, MVP ба ялалтын хувь нь зөвхөн мэдээлэл болно. Эдгээр жинг одоогоор бодит үр дүнд тулгуурлан тохируулаагүй.'
        : '— means unavailable, not zero. Elo remains the main input; only positive supporting evidence can add points (up to +7.5). Headshots, sniper usage, MVPs and win rate are shown for context, not scored. These preliminary weights still need tournament-data calibration.'}</p>
    </div>
  );
}
