'use client';

import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { fmt } from '@/components/format';
import { SignalPill, type Signal } from '@/components/ui';
import { PillPopover } from '@/components/PillPopover';
import { PositionBar } from '@/components/PositionBar';
import { dividendChecks, dividendPerTenK, paidFromProfit, passCount, PAID_YEARS_WINDOW, perTenK, rangePos, yieldVsUsual, type DividendCheck } from '@/lib/dividend-checks';
import type { CalendarRow } from '@/lib/service';

const MARK: Record<DividendCheck['state'], string> = { pass: '✔', fail: '✖', unknown: '?' };

export const checksOf = (r: CalendarRow): DividendCheck[] => dividendChecks(r);

function ChecksPill({ checks }: { checks: DividendCheck[] }) {
  const { t } = useLang();
  return (
    <PillPopover className="pill s-neutral" pill={t('Passes {n} of 5').replace('{n}', String(passCount(checks)))}
      meaning="Five fixed rules about this dividend. Facts, not advice." title="The five checks"
      items={checks.map((c) => `${MARK[c.state]} ${t(c.text)}`)} />
  );
}

export function ValueCells({ r, upcoming = false }: { r: CalendarRow; upcoming?: boolean }) {
  const { t } = useLang();
  const tenK = perTenK(r.yieldPct), thisOne = upcoming ? dividendPerTenK(r.cashPerShare, r.price) : null;
  const pos = rangePos(r.price, r.weekLow52, r.weekHigh52);
  const vs = yieldVsUsual(r.yieldPct, r.avgYieldPct);
  const payout = paidFromProfit(r.yearlyCashPerShare, r.eps);
  return (
    <>
      <td data-label={t('৳ per ৳10,000')} className="n mono nw">{tenK != null ? <>৳{fmt(tenK, 0)}<span className="sub">/{t('year')}</span></> : '—'}
        {thisOne != null ? <div className="sub">{t('this dividend')} ৳{fmt(thisOne, 0)}</div> : null}</td>
      <td data-label={t('52-week position')}>{pos != null ? <><PositionBar position={pos} /> <span className="small mono">{Math.round(pos * 100)}%</span></> : '—'}</td>
      <td data-label={t('Yield vs usual')} className="n mono nw">{vs != null ? <>{vs > 0 ? '+' : ''}{fmt(vs, 1)} {t('pts')}<div className="sub">{t('usual')} {fmt(r.avgYieldPct, 1)}%</div></> : '—'}</td>
      <td data-label={t('Paid from profit')} className="n mono">{r.eps != null && r.eps <= 0 ? <span className="sub">{t('loss year')}</span>
        : payout != null ? <>{fmt(payout, 0)}%{payout > 100 ? <div className="sub">{t('more than earned')}</div> : null}</> : '—'}</td>
      <td data-label={t('Paid in')} className="n mono nw">{r.paidYears != null ? `${r.paidYears}/${PAID_YEARS_WINDOW}` : '—'}</td>
      <td data-label={t('Dividend checks')} className="chk-cell"><ChecksPill checks={checksOf(r)} /></td>
      <td data-label={t('Score')} className="n">{r.score != null && r.signal ? <><span className="mono">{r.score}</span><div><SignalPill signal={r.signal as Signal} /></div></> : '—'}</td>
    </>
  );
}

export function ValueHeaders() {
  return (
    <>
      <th className="n"><Tr text="৳ per ৳10,000" /></th><th><Tr text="52-week position" /></th><th className="n"><Tr text="Yield vs usual" /></th>
      <th className="n"><Tr text="Paid from profit" /></th><th className="n"><Tr text="Paid in" /></th>
    </>
  );
}

export function ScoreHeader() {
  return <th className="n"><Tr text="Score" /></th>;
}
