'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { fmt, fmtDate, fmtDateLang } from '@/components/format';
import { dhakaToday } from '@/lib/dhaka';
import { Icon, Skeleton } from '@/components/ui';
import TelegramTestButton from '@/components/TelegramTestButton';
import { TelegramConnect } from '@/components/TelegramConnect';
import { CheckBadge, KEY_STORE, SIGNED_IN_STORE, type TradesList as List } from '@/components/trades-client';
import { deleteTrade, dropRefusedKey, importFile, listTrades, saveLimits, saveTrade, useBrowserData, useKeyStopped, useMode, type ImportResult } from '@/components/portfolio-store';
import { useLang } from '@/components/i18n';
import { commissionFor, MAX_COMMISSION_PCT, tradesCsv, type Account, type Trade, type TradeInput } from '@/lib/trades';
import { useApi } from '@/components/AppProvider';
import { useStoredValue } from '@/components/useStored';
import { BROKER_COMMISSION_PCT } from '@/lib/buy-planner';
import { dividendsReceived } from '@/lib/positions';
import type { Declaration } from '@/lib/types';
import { aggregateLots, type Lot } from '@/lib/portfolio';
import { SellFacts, signed, Summary, tone } from '@/components/portfolio/Summary';
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
type PastDividends = { declarations: Declaration[]; faceValue: number } | null;

const blank = (): Record<Exclude<keyof TradeInput, 'account'>, string> => ({ date: dhakaToday(), code: '', side: 'BUY', quantity: '', price: '', commission: '', note: '' });
// What the trade cost (buy) or brought in (sell) after commission.
function tradeAmount(t: Trade): number {
  const fee = t.commission ?? 0;
  return t.side === 'BUY' ? t.quantity * t.price + fee : t.quantity * t.price - fee;
}

// On a phone the long add form starts folded, so the rest of the page is not buried under it.
const PHONE = typeof window === 'undefined' ? { matches: false } : window.matchMedia('(max-width: 640px)');

export default function PortfolioPage() {
  const { mode, ready } = useMode();
  const sheet = mode === 'sheet';
  // Telegram still sends to the one owner chat (lib/trades-http.ts ownerOnly): only the owner key may test it.
  const [ownerKey] = useStoredValue(KEY_STORE, '');
  const [signedIn] = useStoredValue(SIGNED_IN_STORE, '');
  const ownerMode = !!ownerKey && signedIn !== '1';
  const browserData = useBrowserData();
  const browserTrades = browserData.trades.good;
  const { t: tr, lang } = useLang();
  const keyStopped = useKeyStopped();
  // Settings opens by itself when the Sheet panel inside needs the user (same test as SyncPanel's "pending").
  const settingsNeeded = keyStopped || (sheet && (browserTrades.length + browserData.plans.good.length > 0 || browserData.hasLimits));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Opens once when it becomes needed; the user can still fold it again.
  const [wasNeeded, setWasNeeded] = useState(false);
  if (settingsNeeded !== wasNeeded) { setWasNeeded(settingsNeeded); if (settingsNeeded) setSettingsOpen(true); }
  const [tab, setTab] = useState<'allocation' | 'income'>('allocation');
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
  // Every past declaration of each held code, from the company page's data; a code that fails to load shows "—".
  const heldCodes = useMemo(() => (data?.holdings ?? []).filter((h) => h.shares > 0).map((h) => h.code).join(','), [data]);
  const [pastDividends, setPastDividends] = useState<Record<string, PastDividends>>({});
  useEffect(() => {
    if (!heldCodes) return;
    let active = true;
    void Promise.all(heldCodes.split(',').map((code) => fetch(`/api/company/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { company?: { events?: { declarations?: Declaration[] }; faceValue?: number | null } } | null): [string, PastDividends] =>
        [code, b?.company ? { declarations: b.company.events?.declarations ?? [], faceValue: b.company.faceValue || 10 } : null],
      (): [string, PastDividends] => [code, null])))
      .then((pairs) => { if (active) setPastDividends(Object.fromEntries(pairs)); });
    return () => { active = false; };
  }, [heldCodes]);

  const loadSeq = useRef(0);
  const load = useCallback(async (acc: Account = 'real') => {
    const seq = ++loadSeq.current;
    setBusy(true);
    try {
      const list = await listTrades(acc);
      // A slower answer for the other account must never replace the list now shown (Practice could show real trades).
      if (seq === loadSeq.current) { setData(list); setError(null); if (!list.trades.length && !PHONE.matches) setAddOpen(true); }
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

  if (!ready) return <><h1>{tr('Portfolio')}</h1><Skeleton label={tr('Loading trades')} rows={4} /></>;

  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // The commission follows quantity, price and rate until the user types an amount of their own.
  const isAuto = (f: ReturnType<typeof blank>) => f.commission === '' || f.commission === commissionFor(f.quantity, f.price, feePct);
  const setAmount = (k: 'quantity' | 'price') => (e: { target: { value: string } }) => setForm((f) => {
    const next = { ...f, [k]: e.target.value };
    return isAuto(f) ? { ...next, commission: commissionFor(next.quantity, next.price, feePct) } : next;
  });
  // For a trade dated today, a known code fills in today's price until the user types a price of their own.
  const livePrice = (code: string) => { const p = companies.find((c) => c.code === code)?.price; return p == null ? '' : String(p); };
  const setCode = (v: string) => setForm((f) => {
    const code = v.toUpperCase();
    if (f.date !== dhakaToday() || (f.price !== '' && f.price !== livePrice(f.code))) return { ...f, code };
    const price = livePrice(code);
    return { ...f, code, price, commission: isAuto(f) ? commissionFor(f.quantity, price, feePct) : f.commission };
  });
  const changePct = (v: string) => { setForm((f) => (isAuto(f) ? { ...f, commission: commissionFor(f.quantity, f.price, v) } : f)); setFeePct(v); };
  const badPct = feePct.trim() !== '' && commissionFor('1', '1', feePct) === '';
  const commissionPaid = (data?.trades ?? []).reduce((a, t) => a + (t.commission ?? 0), 0);
  // Selling facts: dividends on the shares held at each record date, break-even after the sell fee, and share of the portfolio.
  const held = (data?.holdings ?? []).filter((h) => h.shares > 0);
  const today = dhakaToday();
  const dividendsOf = (code: string) => { const p = pastDividends[code]; return p && data ? dividendsReceived(data.trades, code, p.declarations, p.faceValue, today) : null; };
  const allDividends = held.reduce<number | null>((a, h) => { const d = dividendsOf(h.code); return a == null || d == null ? null : a + d; }, 0);
  const sellFeePct = feePct.trim() !== '' && !badPct ? Number(feePct) : BROKER_COMMISSION_PCT;
  const portfolioValue = held.reduce((a, h) => a + (h.value ?? h.invested), 0);

  const openAdd = () => { setAddOpen(true); requestAnimationFrame(() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

  return (
    <>
      <h1>{tr('Portfolio')}</h1>
      {sheet ? <p className="muted">{tr('Your shares, worked out from your buys and sells. Saved in your own Google Sheet, so every device shows the same numbers.')}</p> : (
        <p className="muted">{tr('Your shares, worked out from your buys and sells. Saved in this browser only. To see them on other devices, turn on Google Sheet sync in Settings at the bottom.')}
          {browserTrades.length ? <> <a href={'data:text/csv;charset=utf-8,' + encodeURIComponent(tradesCsv(browserTrades))} download="my-trades.csv">{tr('Trades as a spreadsheet (CSV)')}</a></> : null}</p>
      )}
      <KeyStoppedNote />
      <UnreadableNote />
      <div className={`${css.actions} ${css.switch}`} role="group" aria-label={tr('Account')}>
        <button type="button" className={`btn${paper ? '' : ` ${css.on}`}`} aria-pressed={!paper} disabled={busy} onClick={() => switchTo('real')}>{tr('Real')}</button>
        <button type="button" className={`btn${paper ? ` ${css.on} ${css.onPractice}` : ''}`} aria-pressed={paper} disabled={busy} onClick={() => switchTo('paper')}>{tr('Practice')}</button>
      </div>
      {paper ? (
        <div className={`note warn ${css.banner}`} role="status">
          <b>{tr('PRACTICE — not real money.')}</b> {tr('Try buys, sells and plans here to learn; these trades are kept apart from your real ones and never count in your real holdings.')}
        </div>
      ) : null}
      <div className={paper ? css.practice : undefined}>
      {error ? <div className="note bad" role="alert">{error}</div> : null}
      {data?.warnings.map((w) => <div key={w} className="note warn">{tr(w)}</div>)}
      {data?.badRows.length ? <div className="note warn">{tr(`Rows ${data.badRows.join(', ')} in your Google Sheet could not be read; fix them in the Sheet.`)}</div> : null}
      {paper ? null : <OldLots busy={busy} postLot={postOldLot} onDone={oldLotsDone} />}
      {data ? (
        <Summary holdings={data.holdings} commissionPaid={commissionPaid} dividends={held.length ? allDividends : undefined}>
          <button type="button" className="btn primary" onClick={openAdd}>{tr(paper ? 'Add a practice trade' : 'Add a trade')}</button>
        </Summary>
      ) : busy ? <Skeleton label={tr('Loading trades')} rows={4} /> : null}
      {data?.holdings.length ? (
        <div className={`panel table-wrap ${css.section}`}><h2 className="h3">{tr('Holdings')}</h2>
        <p className="small muted">{tr('The status comes from fixed rules on your numbers and public DSE data. It is a learning aid, not advice. Tap a status to see why.')}</p>
        <table className="cards">
          <thead><tr><th>{tr('Code')}</th><th className="n">{tr('Shares')}</th><th className="n">{tr('Avg cost')}</th><th className="n">{tr('Price now')}</th><th className="n">{tr('Value')}</th><th className="n">{tr('Profit / loss')}</th><th>{tr('Status')}</th></tr></thead>
          <tbody>{data.holdings.map((h) => {
            const open = openReasons === h.code;
            return (
              <Fragment key={h.code}>
                <tr><td><Link href={`/c/${encodeURIComponent(h.code)}`}><b>{h.code}</b></Link></td><td className="n" data-label={tr('Shares')}>{h.shares}</td><td className="n" data-label={tr('Avg cost')}>৳{fmt(h.avgCost)}</td>
                  <td className="n" data-label={tr('Price now')}>{h.price == null ? '—' : `৳${fmt(h.price)}`}</td><td className="n" data-label={tr('Value')}>{h.value == null ? '—' : `৳${fmt(h.value)}`}</td><td className={`n ${tone(h.unrealised)}`} data-label={tr('Profit / loss')}>{signed(h.unrealised)}</td>
                  <td className={css.check}>{h.check || h.shares > 0 ? (
                    <button type="button" className={css.checkToggle} aria-expanded={open} onClick={() => setOpenReasons((c) => (c === h.code ? null : h.code))}>
                      {h.check ? <CheckBadge check={{ ...h.check, label: tr(h.check.label) }} /> : null}<span className="small">{tr(open ? 'Hide' : 'Details')}</span>
                    </button>
                  ) : <span className="muted">—</span>}</td></tr>
                {open ? (
                  <tr className={css.detail}><td colSpan={7}>
                    {h.check ? <ul className={css.reasons}>{h.check.reasons.map((r) => <li key={r}>{tr(r)}</li>)}</ul> : null}
                    {h.shares > 0 ? <SellFacts h={h} dividends={dividendsOf(h.code)} feePct={sellFeePct} weightPct={portfolioValue > 0 ? ((h.value ?? h.invested) / portfolioValue) * 100 : null} /> : null}
                    {h.limits ? <p className="small muted">{tr('Your limits')}: {tr(`stop-loss ${h.limits.stopPct}%, target ${h.limits.targetPct}%`)}</p> : null}
                  </td></tr>
                ) : null}
              </Fragment>
            );
          })}</tbody></table></div>
      ) : null}
      {paper ? null : (
        <div className={`panel ${css.section}`}>
          <div className={`tabs ${css.tabsTop}`} role="tablist" aria-label={tr('Allocation and dividend income')}
            onKeyDown={(e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const next = tab === 'allocation' ? 'income' : 'allocation'; setTab(next); document.getElementById(`tab-${next}`)?.focus(); }}>
            <button type="button" role="tab" id="tab-allocation" aria-controls="tab-pane" aria-selected={tab === 'allocation'} tabIndex={tab === 'allocation' ? 0 : -1} onClick={() => setTab('allocation')}>{tr('Allocation')}</button>
            <button type="button" role="tab" id="tab-income" aria-controls="tab-pane" aria-selected={tab === 'income'} tabIndex={tab === 'income' ? 0 : -1} onClick={() => setTab('income')}>{tr('Dividend income')}</button>
          </div>
          <div id="tab-pane" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'allocation' ? (
              grouped.length ? <><p className="small muted">{tr('How your money is spread, by value now.')}</p><AllocationChart holdings={grouped} /></> : <p className="muted">{tr('No holdings yet.')}</p>
            ) : (
              <>
                <IncomeSection lots={lots} dividends={dividends} totalCost={lots.reduce((a, l) => a + l.shares * l.buyPrice, 0)} />
                <div className={`panel ${css.section}`}><WhatIfCalc companies={companies} dividends={dividends} /></div>
              </>
            )}
          </div>
        </div>
      )}
      <details ref={addRef} className={`panel ${css.section}`} open={addOpen} onToggle={(e) => setAddOpen(e.currentTarget.open)}>
        <summary className="h3">{tr(paper ? 'Add a practice trade' : 'Add or import trades')}</summary>
      {paper ? null : <div className={css.section}>
        <h3>{tr('Import from your broker (Excel order summary)')}</h3>
        <p className="muted">{tr('Pick the day’s')} <b>order_summary_….xlsx</b>{tr('. You see what will be added first; trades you already have are skipped.')} {tr('The file has no commission, so')} {feePct.trim() ? tr(`each trade gets your broker rate (${feePct}%) — set it in the form below.`) : tr('set your broker rate in the form below, or trades come in with no commission.')}</p>
        <div className={css.form}>
          <label className="btn"><Icon name="upload" />{tr('Choose broker file (.xlsx)')}<input className="sr-only" type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, false); e.target.value = ''; }} /></label>
          <label>{tr('Trade date (only if the file name has none)')}<input type="date" value={importDate} max={dhakaToday()} onChange={(e) => setImportDate(e.target.value)} /></label>
        </div>
        {preview ? (
          <div className={css.section}>
            <p><b>{fmtDateLang(preview.result.date, lang)}</b>: {tr(`${preview.result.added.length} to add, ${preview.result.skipped.length} already in your trades.`)}</p>
            <ul>{preview.result.added.map((t, i) => <li key={`${i}-${t.code}-${t.side}`}><span className={`${css.side} ${t.side === 'BUY' ? css.buy : css.sell}`}>{t.side}</span> {t.quantity} {t.code} @ ৳{fmt(t.price)}{t.commission != null ? <span className="muted"> + {tr(`৳${fmt(t.commission)} commission`)}</span> : null}</li>)}</ul>
            {preview.result.errors.map((e) => <p key={e} className={css.error}>{e}</p>)}
            {preview.result.added.length ? (
              <div className={css.actions}>
                <button className="btn primary" type="button" disabled={busy} onClick={() => void upload(preview.file, true)}>{preview.result.added.length === 1 ? tr(`Save ${preview.result.added.length} trade`) : tr(`Save ${preview.result.added.length} trades`)}</button>
                <button className="link-btn" type="button" onClick={() => setPreview(null)}>{tr('Cancel')}</button>
              </div>
            ) : (
              <p className="muted">{tr('Nothing new to add — this file is already in your trades.')} <button className="link-btn" type="button" onClick={() => setPreview(null)}>{tr('Close')}</button></p>
            )}
          </div>
        ) : null}
      </div>}
      <form className={css.section} onSubmit={save}>
        <h3>{tr(editing ? 'Edit trade' : 'Add a trade')}{paper ? ' ' + tr('(practice)') : ''}</h3>
        <div className={css.form}>
          <label>{tr('Date')}<input type="date" value={form.date} max={dhakaToday()} onChange={set('date')} required /></label>
          <label>{tr('Code')}<input list="trade-codes" value={form.code} onChange={(e) => setCode(e.target.value)} placeholder="GP" required /></label>
          <datalist id="trade-codes">{companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</datalist>
          <label>{tr('Side')}<select value={form.side} onChange={set('side')}><option>BUY</option><option>SELL</option></select></label>
          <label>{tr('Quantity')}<input inputMode="numeric" value={form.quantity} onChange={setAmount('quantity')} required /></label>
          <label>{tr('Price ৳')}<input inputMode="decimal" value={form.price} onChange={setAmount('price')} required /></label>
          <label>{tr('Commission % (broker fee)')}<input type="number" min={0} max={MAX_COMMISSION_PCT} step={0.01} value={feePct} onChange={(e) => changePct(e.target.value)} aria-describedby="fee-hint" /></label>
          <label>{tr('Commission ৳')}<input inputMode="decimal" value={form.commission} onChange={set('commission')} aria-describedby="fee-hint" /></label>
          <label>{tr('Note')}<input value={form.note} onChange={set('note')} maxLength={200} /></label>
          <div className={css.actions}>
            <button className="btn primary" type="submit" disabled={busy}>{tr(editing ? 'Save changes' : paper ? 'Add practice trade' : 'Add trade')}</button>
            {editing ? <button className="link-btn" type="button" onClick={() => { setEditing(null); setForm(blank()); }}>{tr('Cancel')}</button> : null}
          </div>
        </div>
        {badPct ? <p className="note warn" role="alert">{tr(`Commission % must be from 0 to ${MAX_COMMISSION_PCT}.`)} {tr('Commission is not filled in until it is fixed.')}</p> : null}
        <p id="fee-hint" className="small muted">{tr(sheet ? 'Picking a code fills in today’s price; commission fills in at your commission % (saved in your Google Sheet).' : 'Picking a code fills in today’s price; commission fills in at your commission % (saved in this browser).')} {tr('Check both, and type the exact amounts from your broker slip to replace them.')}</p>
      </form>
      </details>
      <div className={`panel table-wrap ${css.section}`}><h2 className="h3">{tr('All trades')}</h2>
        {data && !data.trades.length ? <p className="muted">{tr(paper ? 'No practice trades yet. Add one above to try it out.' : 'No trades yet. Import your broker file or add one above.')}</p> : null}
        {data?.trades.length ? (
          <table className="cards"><thead><tr><th>{tr('Date')}</th><th>{tr('Trade')}</th><th className="n">{tr('Price')}</th><th className="n">{tr('Amount')}</th><th>{tr('Note')}</th><th /></tr></thead>
            <tbody>{data.trades.map((t) => (
              <tr key={t.id}><td>{fmtDateLang(t.date, lang)}</td><td><span className={`${css.side} ${t.side === 'BUY' ? css.buy : css.sell}`}>{t.side}</span> {t.quantity} <b>{t.code}</b></td>
                <td className="n">৳{fmt(t.price)}</td><td className="n">৳{fmt(tradeAmount(t))}</td><td className="muted">{t.note}</td>
                <td className={css.actions}>
                  <button className="link-btn" type="button" aria-label={`Edit ${t.side} ${t.quantity} ${t.code} on ${t.date}`} onClick={() => { setEditing(t.id); setForm({ date: t.date, code: t.code, side: t.side, quantity: String(t.quantity), price: String(t.price), commission: t.commission == null ? '' : String(t.commission), note: t.note }); openAdd(); }}>{tr('Edit')}</button>
                  <button className="link-btn danger" type="button" aria-label={`Delete ${t.side} ${t.quantity} ${t.code} on ${t.date}`} onClick={() => void remove(t)}>{tr('Delete')}</button>
                </td></tr>
            ))}</tbody></table>
        ) : null}
        {paper && data?.trades.length ? <div className={`${css.actions} ${css.section}`}><button className="link-btn danger" type="button" disabled={busy} onClick={() => void resetPractice()}>{tr('Reset practice account')}</button></div> : null}
      </div>
      </div>
      <details className={`panel ${css.section}`} open={settingsOpen} onToggle={(e) => setSettingsOpen(e.currentTarget.open)}>
        <summary className="h3">{tr('Settings')} <span className="small muted">{tr('Your stop-loss and target, phone alerts, backup and Google Sheet sync.')}</span></summary>
        {!paper && data?.settings ? <LimitsPanel key={JSON.stringify(data.settings)} settings={data.settings} held={data.holdings.filter((h) => h.shares > 0).map((h) => h.code)}
          onSave={async (s) => { await saveLimits(s); await load(account); }} /> : null}
        <div className={`panel ${css.section}`}>
          <h2 className="h3">{tr('Phone alerts')}</h2>
          {ownerMode ? (
            <>
              <p className="small muted">{tr('Get a Telegram message when a plan reaches its price, a holding hits your stop-loss or target, or a dividend\'s last buy day is near.')}</p>
              <TelegramTestButton />
            </>
          ) : signedIn === '1' ? (
            <TelegramConnect />
          ) : (
            <p className="small">{tr('Sign in with Google (in the panel below) to get Telegram alerts from your own Sheet.')} {tr('For price alerts in this browser, use the')} <Link href="/alerts">{tr('Alerts page')}</Link>{tr('.')}</p>
          )}
        </div>
        <div className={`panel ${css.section}`}>
          <h2 className="h3">{tr('My data')}</h2>
          <BackupPanel mode={mode} onChanged={() => void load(account)} />
        </div>
        <SyncPanel mode={mode} onChanged={() => void load(account)} />
      </details>
    </>
  );
}
