'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { fmt, fmtDate } from '@/components/format';
import { dhakaToday } from '@/lib/dhaka';
import { Icon, Skeleton } from '@/components/ui';
import TelegramTestButton from '@/components/TelegramTestButton';
import { CheckBadge, type TradesList as List } from '@/components/trades-client';
import { deleteTrade, dropRefusedKey, importFile, listTrades, saveLimits, saveTrade, useBrowserData, useMode, type ImportResult } from '@/components/portfolio-store';
import { commissionFor, MAX_COMMISSION_PCT, tradesCsv, type Account, type Trade, type TradeInput } from '@/lib/trades';
import { useApi } from '@/components/AppProvider';
import { useStoredValue } from '@/components/useStored';
import { BROKER_COMMISSION_PCT } from '@/lib/buy-planner';
import { aggregateLots, type Lot } from '@/lib/portfolio';
import { signed, Summary, tone } from '@/components/portfolio/Summary';
import { LimitsPanel } from '@/components/portfolio/LimitsPanel';
import { OldLots } from '@/components/portfolio/OldLots';
import { SyncPanel } from '@/components/portfolio/SyncPanel';
import { BackupPanel, KeyStoppedNote, UnreadableNote } from '@/components/portfolio/MyData';
import type { CalendarRow, CompanyRow } from '@/lib/service';
import type { MarketSession } from '@/lib/dse';
import { AllocationChart } from '@/components/portfolio/AllocationChart';
import { IncomeSection } from '@/components/portfolio/IncomeSection';
import { WhatIfCalc } from '@/components/portfolio/WhatIfCalc';
import css from './trades.module.css';

interface Companies { rows: CompanyRow[]; session: MarketSession | null }
interface Dividends { upcoming: CalendarRow[]; recent: CalendarRow[]; expected: CalendarRow[]; session: MarketSession | null }

const blank = (): Record<Exclude<keyof TradeInput, 'account'>, string> => ({ date: dhakaToday(), code: '', side: 'BUY', quantity: '', price: '', commission: '', note: '' });
// What the trade cost (buy) or brought in (sell) after commission.
function tradeAmount(t: Trade): number {
  const fee = t.commission ?? 0;
  return t.side === 'BUY' ? t.quantity * t.price + fee : t.quantity * t.price - fee;
}

export default function PortfolioPage() {
  const { mode, ready } = useMode();
  const sheet = mode === 'sheet';
  const browserTrades = useBrowserData().trades.good;
  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: File; result: ImportResult } | null>(null);
  const [importDate, setImportDate] = useState('');
  const [openReasons, setOpenReasons] = useState<string | null>(null);
  const [account, setAccount] = useState<Account>('real');
  const paper = account === 'paper';
  const [addOpen, setAddOpen] = useState(false);
  const [feePct, setFeePct] = useStoredValue('brokerCommissionPct', String(BROKER_COMMISSION_PCT));
  const addRef = useRef<HTMLDetailsElement>(null);
  const { data: compData } = useApi<Companies>('/api/companies');
  const { data: divData } = useApi<Dividends>('/api/dividends');
  const companies = useMemo(() => compData?.rows ?? [], [compData]);
  const dividends = useMemo(() => (divData ? [...divData.upcoming, ...divData.recent, ...divData.expected] : []), [divData]);
  // Income and allocation reuse the lot maths, with one lot per holding at its average cost.
  const lots = useMemo<Lot[]>(() => (data?.holdings ?? []).filter((h) => h.shares > 0).map((h) => ({ code: h.code, shares: h.shares, buyPrice: h.avgCost })), [data]);
  const liveMap = useMemo(() => Object.fromEntries(companies.map((c) => [c.code, { price: c.price, changePct: c.changePct ?? null }])), [companies]);
  const grouped = useMemo(() => aggregateLots(lots, liveMap), [lots, liveMap]);

  const loadSeq = useRef(0);
  const load = useCallback(async (acc: Account = 'real') => {
    const seq = ++loadSeq.current;
    setBusy(true);
    try {
      const list = await listTrades(acc);
      // A slower answer for the other account must never replace the list now shown (Practice could show real trades).
      if (seq === loadSeq.current) { setData(list); setError(null); if (!list.trades.length) setAddOpen(true); }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : 'Could not load trades.');
      // A key that stopped working falls back to this browser; the Sheet is not touched.
      if ((e as { status?: number }).status === 401) dropRefusedKey();
    } finally { if (seq === loadSeq.current) setBusy(false); }
  }, []);

  // Loads again whenever the account or the source changes (connect, disconnect, the dev key arriving).
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(account); });
    return () => { active = false; };
  }, [ready, mode, account, load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveTrade({ ...form, account }, editing);
      setForm(blank()); setEditing(null); await load(account);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the trade.'); setBusy(false); }
  };

  const remove = async (t: Trade) => {
    if (!window.confirm(`Delete ${t.side} ${t.quantity} ${t.code} on ${fmtDate(t.date)}?`)) return;
    setBusy(true);
    try { await deleteTrade(t.id); await load(account); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete.'); setBusy(false); }
  };

  // One normal save per old lot, through the same path as Add trade (this browser or the Sheet).
  const postOldLot = async (l: Lot) => {
    setBusy(true);
    await saveTrade({ date: l.buyDate || dhakaToday(), code: l.code, side: 'BUY', quantity: String(l.shares), price: String(l.buyPrice), commission: '', note: 'moved from the old Portfolio page', account: 'real' });
  };
  // Reload first (some may have moved), then show the error, since a good reload clears the message.
  const oldLotsDone = (err?: unknown) => {
    void load().then(() => { if (err) setError(err instanceof Error ? err.message : 'Could not move the saved holdings.'); });
  };

  const switchTo = (acc: Account) => {
    if (acc === account) return;
    setAccount(acc); setData(null); setEditing(null); setForm(blank()); setPreview(null);
  };

  // Uses the normal delete path one trade at a time; the list holds only practice trades, so real rows are never touched.
  const resetPractice = async () => {
    const paperTrades = (data?.trades ?? []).filter((t) => t.account === 'paper');
    if (!paper || !paperTrades.length || !window.confirm(`Delete all ${paperTrades.length} practice trades? Real trades are not touched.`)) return;
    setBusy(true);
    try {
      for (const t of paperTrades) await deleteTrade(t.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reset the practice account.'); }
    await load('paper');
  };

  const upload = async (file: File, saveIt: boolean) => {
    setBusy(true);
    setPreview(null);
    try {
      const result = await importFile(file, importDate, saveIt, feePct);
      setPreview(saveIt ? null : { file, result }); setError(null);
      // A date typed for one file must not silently apply to the next one.
      if (saveIt) { setImportDate(''); await load(); } else setBusy(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the file.'); setBusy(false); }
  };

  if (!ready) return <><h1>Portfolio</h1><Skeleton label="Loading trades" rows={4} /></>;

  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // The commission follows quantity, price and rate until the user types an amount of their own.
  const isAuto = (f: ReturnType<typeof blank>) => f.commission === '' || f.commission === commissionFor(f.quantity, f.price, feePct);
  const setAmount = (k: 'quantity' | 'price') => (e: { target: { value: string } }) => setForm((f) => {
    const next = { ...f, [k]: e.target.value };
    return isAuto(f) ? { ...next, commission: commissionFor(next.quantity, next.price, feePct) } : next;
  });
  const changePct = (v: string) => { setForm((f) => (isAuto(f) ? { ...f, commission: commissionFor(f.quantity, f.price, v) } : f)); setFeePct(v); };
  const badPct = feePct.trim() !== '' && commissionFor('1', '1', feePct) === '';
  const commissionPaid = (data?.trades ?? []).reduce((a, t) => a + (t.commission ?? 0), 0);

  return (
    <>
      <h1>Portfolio</h1>
      {sheet ? <p className="muted">Your shares, worked out from your buys and sells. They are saved in your own Google Sheet, so every page and device shows the same numbers.</p> : (
        <p className="muted">Your shares, worked out from your buys and sells. Saved in this browser only. Export a copy, or turn on Google Sheet sync to use it on other devices.
          {browserTrades.length ? <> <a href={'data:text/csv;charset=utf-8,' + encodeURIComponent(tradesCsv(browserTrades))} download="my-trades.csv">Trades as a spreadsheet (CSV)</a></> : null}</p>
      )}
      <BackupPanel mode={mode} onChanged={() => void load(account)} />
      <KeyStoppedNote />
      <UnreadableNote />
      <div className={`${css.actions} ${css.switch}`} role="group" aria-label="Account">
        <button type="button" className={`btn${paper ? '' : ` ${css.on}`}`} aria-pressed={!paper} disabled={busy} onClick={() => switchTo('real')}>Real</button>
        <button type="button" className={`btn${paper ? ` ${css.on} ${css.onPractice}` : ''}`} aria-pressed={paper} disabled={busy} onClick={() => switchTo('paper')}>Practice</button>
      </div>
      {paper ? (
        <div className={`note warn ${css.banner}`} role="status">
          <b>PRACTICE — not real money.</b> Try buys, sells and plans here to learn; these trades are kept apart from your real ones and never count in your real holdings.
        </div>
      ) : null}
      <div className={paper ? css.practice : undefined}>
      {error ? <div className="note bad" role="alert">{error}</div> : null}
      {data?.warnings.map((w) => <div key={w} className="note warn">{w}</div>)}
      {data?.badRows.length ? <div className="note warn">Rows {data.badRows.join(', ')} in your Google Sheet could not be read; fix them in the Sheet.</div> : null}
      {paper ? null : <OldLots busy={busy} postLot={postOldLot} onDone={oldLotsDone} />}
      {data ? <Summary holdings={data.holdings} commissionPaid={commissionPaid} /> : busy ? <Skeleton label="Loading trades" rows={4} /> : null}
      {data?.holdings.length ? (
        <div className={`panel table-wrap ${css.section}`}><h2 className="h3">Holdings</h2>
        <p className="small muted">Checks use fixed rules on your numbers and public DSE data — a learning aid, not investment advice.</p>
        <table className="cards">
          <thead><tr><th>Code</th><th className="n">Shares</th><th className="n">Avg cost</th><th className="n">Price now</th><th className="n">Value</th><th className="n">P/L</th><th>Check</th></tr></thead>
          <tbody>{data.holdings.map((h) => (
            <tr key={h.code}><td><Link href={`/c/${encodeURIComponent(h.code)}`}><b>{h.code}</b></Link></td><td className="n" data-label="Shares">{h.shares}</td><td className="n" data-label="Avg cost">৳{fmt(h.avgCost)}</td>
              <td className="n" data-label="Price now">{h.price == null ? '—' : `৳${fmt(h.price)}`}</td><td className="n" data-label="Value">{h.value == null ? '—' : `৳${fmt(h.value)}`}</td><td className={`n ${tone(h.unrealised)}`} data-label="P/L">{signed(h.unrealised)}</td>
              <td className={css.check}>{h.check ? (
                <>
                  <button type="button" className={css.checkToggle} aria-expanded={openReasons === h.code} aria-controls={`why-${h.code}`} onClick={() => setOpenReasons((c) => (c === h.code ? null : h.code))}>
                    <CheckBadge check={h.check} /><span className="small muted">{openReasons === h.code ? 'Hide why' : 'Why?'}</span>
                  </button>
                  <span className={css.checkBadge}><CheckBadge check={h.check} /></span>
                  <ul id={`why-${h.code}`} className={`${css.reasons} ${openReasons === h.code ? css.open : ''}`}>{h.check.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </>
              ) : <span className="muted">—</span>}</td></tr>
          ))}</tbody></table></div>
      ) : null}
      {!paper && grouped.length ? (
        <div className={`grid g2 ${css.topAlign}`}>
          <div className={`panel ${css.section}`}><h2 className="h3">Allocation</h2><AllocationChart holdings={grouped} /></div>
          <div className={`panel ${css.section}`}><IncomeSection lots={lots} dividends={dividends} totalCost={lots.reduce((a, l) => a + l.shares * l.buyPrice, 0)} /></div>
        </div>
      ) : null}
      <details ref={addRef} className={`panel ${css.section}`} open={addOpen} onToggle={(e) => setAddOpen(e.currentTarget.open)}>
        <summary className="h3">{paper ? 'Add a practice trade' : 'Add or import trades'}</summary>
      {paper ? null : <div className={css.section}>
        <h3>Import from your broker (Excel order summary)</h3>
        <p className="muted">Pick the day’s <b>order_summary_….xlsx</b>. You see what will be added first; trades you already have are skipped. The file has no commission, so {feePct.trim() ? <>each trade gets your broker rate ({feePct}%) — set it in the form below.</> : <>set your broker rate in the form below, or trades come in with no commission.</>}</p>
        <div className={css.form}>
          <label className="btn"><Icon name="upload" />Choose broker file (.xlsx)<input className="sr-only" type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, false); e.target.value = ''; }} /></label>
          <label>Trade date (only if the file name has none)<input type="date" value={importDate} max={dhakaToday()} onChange={(e) => setImportDate(e.target.value)} /></label>
        </div>
        {preview ? (
          <div className={css.section}>
            <p><b>{fmtDate(preview.result.date)}</b>: {preview.result.added.length} to add, {preview.result.skipped.length} already in your trades.</p>
            <ul>{preview.result.added.map((t, i) => <li key={`${i}-${t.code}-${t.side}`}><span className={`${css.side} ${t.side === 'BUY' ? css.buy : css.sell}`}>{t.side}</span> {t.quantity} {t.code} @ ৳{fmt(t.price)}{t.commission != null ? <span className="muted"> + ৳{fmt(t.commission)} commission</span> : null}</li>)}</ul>
            {preview.result.errors.map((e) => <p key={e} className={css.error}>{e}</p>)}
            {preview.result.added.length ? (
              <div className={css.actions}>
                <button className="btn primary" type="button" disabled={busy} onClick={() => void upload(preview.file, true)}>Save {preview.result.added.length} {preview.result.added.length === 1 ? 'trade' : 'trades'}</button>
                <button className="link-btn" type="button" onClick={() => setPreview(null)}>Cancel</button>
              </div>
            ) : (
              <p className="muted">Nothing new to add — this file is already in your trades. <button className="link-btn" type="button" onClick={() => setPreview(null)}>Close</button></p>
            )}
          </div>
        ) : null}
      </div>}
      <form className={css.section} onSubmit={save}>
        <h3>{editing ? 'Edit trade' : 'Add a trade'}{paper ? ' (practice)' : ''}</h3>
        <div className={css.form}>
          <label>Date<input type="date" value={form.date} max={dhakaToday()} onChange={set('date')} required /></label>
          <label>Code<input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="GP" required /></label>
          <label>Side<select value={form.side} onChange={set('side')}><option>BUY</option><option>SELL</option></select></label>
          <label>Quantity<input inputMode="numeric" value={form.quantity} onChange={setAmount('quantity')} required /></label>
          <label>Price ৳<input inputMode="decimal" value={form.price} onChange={setAmount('price')} required /></label>
          <label>Broker rate %<input type="number" min={0} max={MAX_COMMISSION_PCT} step={0.01} value={feePct} onChange={(e) => changePct(e.target.value)} aria-describedby="fee-hint" /></label>
          <label>Commission ৳<input inputMode="decimal" value={form.commission} onChange={set('commission')} aria-describedby="fee-hint" /></label>
          <label>Note<input value={form.note} onChange={set('note')} maxLength={200} /></label>
          <div className={css.actions}>
            <button className="btn primary" type="submit" disabled={busy}>{editing ? 'Save changes' : paper ? 'Add practice trade' : 'Add trade'}</button>
            {editing ? <button className="link-btn" type="button" onClick={() => { setEditing(null); setForm(blank()); }}>Cancel</button> : null}
          </div>
        </div>
        {badPct ? <p className="note warn" role="alert">Broker rate must be a percentage from 0 to {MAX_COMMISSION_PCT}. Commission is not filled in until it is fixed.</p> : null}
        <p id="fee-hint" className="small muted">Commission fills in at your broker rate (saved in this browser). Type the exact amount from your broker slip to replace it.</p>
      </form>
      </details>
      <div className={`panel table-wrap ${css.section}`}><h2 className="h3">All trades</h2>
        {data && !data.trades.length ? <p className="muted">{paper ? 'No practice trades yet. Add one above to try it out.' : 'No trades yet. Import your broker file or add one above.'}</p> : null}
        {data?.trades.length ? (
          <table className="cards"><thead><tr><th>Date</th><th>Trade</th><th className="n">Price</th><th className="n">Amount</th><th>Note</th><th /></tr></thead>
            <tbody>{data.trades.map((t) => (
              <tr key={t.id}><td>{fmtDate(t.date)}</td><td><span className={`${css.side} ${t.side === 'BUY' ? css.buy : css.sell}`}>{t.side}</span> {t.quantity} <b>{t.code}</b></td>
                <td className="n">৳{fmt(t.price)}</td><td className="n">৳{fmt(tradeAmount(t))}</td><td className="muted">{t.note}</td>
                <td className={css.actions}>
                  <button className="link-btn" type="button" aria-label={`Edit ${t.side} ${t.quantity} ${t.code} on ${t.date}`} onClick={() => { setEditing(t.id); setForm({ date: t.date, code: t.code, side: t.side, quantity: String(t.quantity), price: String(t.price), commission: t.commission == null ? '' : String(t.commission), note: t.note }); setAddOpen(true); requestAnimationFrame(() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>Edit</button>
                  <button className="link-btn danger" type="button" aria-label={`Delete ${t.side} ${t.quantity} ${t.code} on ${t.date}`} onClick={() => void remove(t)}>Delete</button>
                </td></tr>
            ))}</tbody></table>
        ) : null}
        {paper && data?.trades.length ? <div className={`${css.actions} ${css.section}`}><button className="link-btn danger" type="button" disabled={busy} onClick={() => void resetPractice()}>Reset practice account</button></div> : null}
      </div>
      {!paper && data?.settings ? <LimitsPanel key={JSON.stringify(data.settings)} settings={data.settings} held={data.holdings.filter((h) => h.shares > 0).map((h) => h.code)}
        onSave={async (s) => { await saveLimits(s); await load(account); }} /> : null}
      {paper ? null : <div className={`panel ${css.section}`}><WhatIfCalc companies={companies} dividends={dividends} /></div>}
      <div className={`panel ${css.section}`}>
        <h2 className="h3">Phone alerts</h2>
        <p className="small muted">Get a Telegram message when a plan reaches its price or a holding needs a look. Ask whoever set up this site to connect Telegram, then send a test.</p>
        {sheet ? <TelegramTestButton /> : <p className="small">Phone alerts need Google Sheet sync (below).</p>}
      </div>
      </div>
      <SyncPanel mode={mode} onChanged={() => void load(account)} />
    </>
  );
}
