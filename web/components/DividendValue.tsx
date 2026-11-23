'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Tr } from '@/components/Tr';
import { useLang } from '@/components/i18n';
import { fmt } from '@/components/format';
import { SignalPill, type Signal } from '@/components/ui';
import { dividendChecks, dividendPerTenK, paidFromProfit, passCount, PAID_YEARS_WINDOW, perTenK, rangePos, yieldVsUsual, type DividendCheck } from '@/lib/dividend-checks';
import type { CalendarRow } from '@/lib/service';

const MARK: Record<DividendCheck['state'], string> = { pass: '✔', fail: '✖', unknown: '?' };

export const checksOf = (r: CalendarRow): DividendCheck[] => dividendChecks(r);

// Same look as the /range page bar. shortcut: a copy of RangePage's PositionBar; share it when that page is next changed.
function PositionBar({ position }: { position: number }) {
  return (
    <span role="img" aria-label={`${Math.round(position * 100)}%`} style={{ display: 'inline-block', width: '56px', height: '8px', background: 'var(--border)', borderRadius: '4px', position: 'relative', verticalAlign: 'middle' }}>
      <span style={{ position: 'absolute', left: `${Math.round(position * 44)}px`, top: '-2px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent)' }} />
    </span>
  );
}

const POP_WIDTH = 300;

// Fixed position so the scrolling table cannot clip it. shortcut: local popover; move to the shared components/PillPopover.tsx once it lands.
function ChecksPill({ checks }: { checks: DividendCheck[] }) {
  const { t } = useLang();
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const show = (el: Element) => {
    const b = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(b.left, window.innerWidth - Math.min(POP_WIDTH, window.innerWidth * 0.85) - 8));
    setPos(b.bottom + 180 < window.innerHeight ? { left, top: b.bottom } : { left, bottom: window.innerHeight - b.top });
  };
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setPos(null); };
    addEventListener('scroll', close, true);
    addEventListener('pointerdown', outside);
    return () => { removeEventListener('scroll', close, true); removeEventListener('pointerdown', outside); };
  }, [pos]);
  const open = pos != null;
  return (
    <span ref={box} className="chk-pop" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setPos(null); }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(e.currentTarget); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPos(null); }}>
      {/* Hover already opened it for a mouse, so a mouse click keeps it open; a tap or Enter toggles. */}
      <button type="button" className="pill s-neutral" aria-expanded={open} aria-controls={open ? id : undefined} onClick={(e) => (open && (e.nativeEvent as PointerEvent).pointerType !== 'mouse' ? setPos(null) : show(e.currentTarget))}>
        {t('Passes {n} of 5').replace('{n}', String(passCount(checks)))}
      </button>
      {open ? (
        <ul id={id} className="chk-list" style={pos}>
          {checks.map((c) => <li key={c.key} className={`chk-${c.state}`}><span aria-hidden="true">{MARK[c.state]}</span> {t(c.text)}</li>)}
        </ul>
      ) : null}
    </span>
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
