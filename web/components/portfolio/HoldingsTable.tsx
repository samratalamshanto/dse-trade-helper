'use client';

import { useState } from 'react';
import type { AggregatedHolding, Lot } from '@/lib/portfolio';
import type { CompanyRow } from '@/lib/service';
import { fmt, fmtDate, tone } from '@/components/format';
import { FraudPill, SignalPill, type FraudLevel, type Signal } from '@/components/ui';
import { LotForm } from '@/components/portfolio/LotForm';
import { useLang } from '@/components/i18n';
import styles from '@/app/portfolio/portfolio.module.css';

function PlCell({ v, pct }: { v: number | null; pct?: number | null }) {
  if (v == null) return <span className="muted">—</span>;
  const cls = tone(v);
  return <span className={cls}>{v > 0 ? '+' : v < 0 ? '−' : ''}৳{fmt(Math.abs(v))}{pct != null ? ` (${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(pct), 1)}%)` : ''}</span>;
}

interface Props {
  holdings: AggregatedHolding[];
  companies: Record<string, CompanyRow>;
  allLots: Lot[];
  onEdit: (index: number, lot: Lot) => void;
  onRemove: (index: number) => void;
}

export function HoldingsTable({ holdings, companies, allLots, onEdit, onRemove }: Props) {
  const { t, lang } = useLang();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ lotIndex: number } | null>(null);

  const toggle = (code: string) => setExpanded((s) => { const n = new Set(s); if (n.has(code)) { n.delete(code); } else { n.add(code); } return n; });

  const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
  // P/L only over holdings with a live price; an unpriced code (typo, delisted) must not show as a fake loss.
  const priced = holdings.filter((h) => h.value != null);
  const pricedCost = priced.reduce((s, h) => s + h.cost, 0);
  const totalValue = priced.length ? priced.reduce((s, h) => s + (h.value as number), 0) : null;
  const totalPl = totalValue != null ? totalValue - pricedCost : null;
  const totalPlPct = totalPl != null && pricedCost > 0 ? (totalPl / pricedCost) * 100 : null;
  const unpriced = holdings.length - priced.length;
  const totalDailyPl = holdings.some((h) => h.dailyPl != null) ? holdings.reduce((s, h) => s + (h.dailyPl ?? 0), 0) : null;

  return (
    <div className="panel table-wrap">
      <table className={`cards ${styles.holdings}`}>
        <thead>
          <tr>
            <th>{t('Company')}</th>
            <th className="n">{t('Shares')}</th>
            <th className="n">{t('Avg buy ৳')}</th>
            <th className="n">{t('Cost')}</th>
            <th className="n">{t('Price now')}</th>
            <th className="n">{t('Value now')}</th>
            <th className="n">{t('Profit / Loss')}</th>
            <th className="n">{t('Today')}</th>
            <th>{t('Signal')}</th>
            <th>{t('Fraud')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const co = companies[h.code];
            const isExpanded = expanded.has(h.code);
            return [
              <tr key={h.code} className={styles.holdingRow}>
                <td>
                  <div>
                    <button type="button" className="btn" style={{ padding: '2px 8px', minHeight: 32, fontSize: 13 }}
                      aria-expanded={isExpanded} aria-controls={'lots-' + h.code}
                      onClick={() => toggle(h.code)}>
                      <b className="mono">{h.code}</b> {h.lots.length > 1 ? (lang === 'bn' ? `(${h.lots.length} টি লট)` : `(${h.lots.length} lots)`) : ''}
                    </button>
                    {co && <div className="small muted">{co.name}</div>}
                  </div>
                </td>
                <td className={`n mono ${styles.wide}`} data-label="Shares">{h.totalShares.toLocaleString()}</td>
                <td className={`n mono ${styles.wide}`} data-label="Avg buy">৳{fmt(h.avgBuyPrice)}</td>
                <td className={`n mono ${styles.wide}`} data-label="Cost">৳{fmt(h.cost)}</td>
                <td className={`n mono ${styles.wide}`} data-label="Price">{h.livePrice != null ? '৳' + fmt(h.livePrice) : <span className="muted">—</span>}</td>
                <td className="n mono" data-label="Value">{h.value != null ? '৳' + fmt(h.value) : <span className="muted">—</span>}</td>
                <td className="n" data-label="P/L"><PlCell v={h.pl} pct={h.plPct} /></td>
                <td className={`n ${styles.wide}`} data-label="Today"><PlCell v={h.dailyPl} /></td>
                <td className={styles.wide} data-label="Signal">{co ? <SignalPill signal={co.signal as Signal} /> : '—'}</td>
                <td className={styles.wide} data-label="Fraud">{co ? <FraudPill level={co.fraud as FraudLevel} /> : '—'}</td>
                <td className={styles.wide}></td>
              </tr>,
              isExpanded ? (
                <tr key={h.code + '-lots'} id={'lots-' + h.code}>
                  <td colSpan={11} style={{ padding: '0 0 8px 0' }}>
                    <table style={{ width: '100%', fontSize: 13 }}>
                      <thead><tr>
                        <th>{t('Lot')}</th><th className="n">{t('Shares')}</th><th className="n">{t('Buy price ৳')}</th><th>{t('Buy date')}</th><th></th>
                      </tr></thead>
                      <tbody>
                        {h.lots.map((lot) => {
                          const lotIdx = allLots.findIndex((l) => l === lot);
                          const isEditingThis = editing?.lotIndex === lotIdx;
                          return (
                            <tr key={lotIdx} className={styles.lotRow}>
                              {isEditingThis ? (
                                <td colSpan={5}>
                                  <LotForm companies={[]} initial={lot} submitLabel={t('Save')}
                                    onSave={(updated) => { onEdit(lotIdx, updated); setEditing(null); }}
                                    onCancel={() => setEditing(null)} />
                                </td>
                              ) : (<>
                                <td className="mono small muted">{h.code} #{lotIdx + 1}</td>
                                <td className="n mono" data-label="Shares">{lot.shares.toLocaleString()}</td>
                                <td className="n mono" data-label="Buy price">৳{fmt(lot.buyPrice)}</td>
                                <td data-label="Buy date">{fmtDate(lot.buyDate)}</td>
                                <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button type="button" className="link-btn"
                                    aria-label={lang === 'bn' ? `${h.code}-এর ${lotIdx + 1} নং লট সম্পাদনা করুন` : `Edit lot ${lotIdx + 1} of ${h.code}`}
                                    onClick={() => setEditing({ lotIndex: lotIdx })}>{t('Edit')}</button>
                                  <button type="button" className="link-btn danger"
                                    aria-label={lang === 'bn' ? `${h.code}-এর ${lotIdx + 1} নং লট সরান` : `Remove lot ${lotIdx + 1} of ${h.code}`}
                                    onClick={() => { setEditing(null); onRemove(lotIdx); }}>{t('Remove')}</button>
                                </td>
                              </>)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
            ];
          })}
          <tr className={styles.totalsRow}>
            <td colSpan={3}><b>{t('Total')}</b></td>
            <td className={`n mono ${styles.wide}`} data-label="Total cost"><b>৳{fmt(totalCost)}</b></td>
            <td className={styles.wide}></td>
            <td className="n mono" data-label="Total value"><b>{totalValue != null ? '৳' + fmt(totalValue) : '—'}</b></td>
            <td className="n" data-label="Total P/L"><PlCell v={totalPl} pct={totalPlPct} /></td>
            <td className={`n ${styles.wide}`} data-label="Today's P/L"><PlCell v={totalDailyPl} /></td>
            <td className={styles.wide} colSpan={3}></td>
          </tr>
        </tbody>
      </table>
      {unpriced ? <p className="small muted">{lang === 'bn' ? `${unpriced} টি হোল্ডিংয়ের লাইভ দাম নেই (কোড যাচাই করুন), তাই মূল্য ও মুনাফায় ধরা হয়নি।` : `${unpriced} holding${unpriced > 1 ? 's have' : ' has'} no live price (check the code), so ${unpriced > 1 ? 'they are' : 'it is'} left out of value and profit.`}</p> : null}
    </div>
  );
}
