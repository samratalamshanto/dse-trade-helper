'use client';

import { useLang } from '@/components/i18n';
import { fmt } from '@/components/format';
import { SignalPill, type Signal } from '@/components/ui';
import { PillPopover } from '@/components/PillPopover';
import { dividendChecks, dividendPerTenK, passCount, perTenK, yieldVsUsual, type DividendCheck } from '@/lib/dividend-checks';
import { RangeCell } from '@/components/PositionBar';
import type { CalendarRow } from '@/lib/service';

const MARK: Record<DividendCheck['state'], string> = { pass: '✔', fail: '✖', unknown: '?' };

export const checksOf = (r: CalendarRow): DividendCheck[] => dividendChecks(r);

// The pop-up holds every figure the table no longer shows as a column, so no number is lost.
function ChecksPill({ r, upcoming }: { r: CalendarRow; upcoming: boolean }) {
  const { t } = useLang();
  const checks = checksOf(r);
  const vs = yieldVsUsual(r.yieldPct, r.avgYieldPct), tenK = perTenK(r.yieldPct), thisOne = upcoming ? dividendPerTenK(r.cashPerShare, r.price) : null;
  const money = [r.price != null ? t(`Price ৳${fmt(r.price)}`) : null, tenK != null ? t(`৳${fmt(tenK, 0)} per ৳10,000 per year`) : null,
    thisOne != null ? t(`this dividend ৳${fmt(thisOne, 0)}`) : null].filter(Boolean).join(' · ');
  const items = [...checks.map((c) => `${MARK[c.state]} ${t(c.text)}`),
    ...(vs != null ? [t(`Yield vs usual: ${vs > 0 ? '+' : ''}${fmt(vs, 1)} pts (usual ${fmt(r.avgYieldPct, 1)}%)`)] : []), ...(money ? [money] : [])];
  return (
    <PillPopover className="pill s-neutral" pill={t('Passes {n} of 5').replace('{n}', String(passCount(checks)))}
      meaning="Five fixed rules about this dividend. Facts, not advice." title="The five checks" items={items} />
  );
}

export function ValueCells({ r, upcoming = false }: { r: CalendarRow; upcoming?: boolean }) {
  const { t } = useLang();
  return (
    <>
      <td data-label={t('Dividend checks')} className="chk-cell"><ChecksPill r={r} upcoming={upcoming} /><div className="chk-range" title={t('52-week position')}><RangeCell price={r.price} low={r.weekLow52} high={r.weekHigh52} /></div></td>
      <td data-label={t('Score')} className="n">{r.score != null && r.signal ? <><span className="mono">{r.score}</span><div><SignalPill signal={r.signal as Signal} /></div></> : '—'}</td>
    </>
  );
}
