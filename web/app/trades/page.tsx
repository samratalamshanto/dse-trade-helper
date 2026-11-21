'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { fmt, fmtDate } from '@/components/format';
import { dhakaToday } from '@/lib/dhaka';
import { Icon, Skeleton } from '@/components/ui';
import TelegramTestButton from '@/components/TelegramTestButton';
import { call, CheckBadge, ensureKey, storeKey, type TradesList as List, type Valued } from '@/components/trades-client';
import type { LimitSettings } from '@/lib/positions';
import type { Account, Trade, TradeInput } from '@/lib/trades';
import css from './trades.module.css';

interface ImportResult { date: string; added: TradeInput[]; skipped: TradeInput[]; errors: string[]; saved: boolean }

const blank = (): Record<Exclude<keyof TradeInput, 'account'>, string> => ({ date: dhakaToday(), code: '', side: 'BUY', quantity: '', price: '', commission: '', note: '' });
function tone(x: number | null): string {
  if (x == null || x === 0) return '';
  return x > 0 ? css.up : css.down;
}
function signed(x: number | null): string {
  if (x == null) return '—';
  if (x > 0) return `+৳${fmt(x)}`;
  if (x < 0) return `-৳${fmt(-x)}`;
  return `৳${fmt(0)}`;
}

// What the trade cost (buy) or brought in (sell) after commission.
function tradeAmount(t: Trade): number {
  const fee = t.commission ?? 0;
  return t.side === 'BUY' ? t.quantity * t.price + fee : t.quantity * t.price - fee;
}

function Summary({ holdings }: { holdings: Valued[] }) {
  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  const value = holdings.reduce((a, h) => a + (h.value ?? h.invested), 0);
  const realised = holdings.reduce((a, h) => a + h.realised, 0);
  const pl = value - invested;
  return (
    <div className={`panel ${css.summary}`}>
      <div><div className={css.label}>Value now</div><div className={css.value}>৳{fmt(value)}</div></div>
      <div><div className={css.label}>Invested</div><div className={css.value}>৳{fmt(invested)}</div></div>
      <div><div className={css.label}>Profit / loss now</div><div className={`${css.value} ${tone(pl)}`}>{signed(pl)}{invested ? ` (${fmt((pl / invested) * 100)}%)` : ''}</div></div>
      <div><div className={css.label}>Realised from sales</div><div className={`${css.value} ${tone(realised)}`}>{signed(realised)}</div></div>
    </div>
  );
}

type Draft = { stopPct: string; targetPct: string };
const toDraft = (l: { stopPct: number; targetPct: number }): Draft => ({ stopPct: String(l.stopPct), targetPct: String(l.targetPct) });
const toLimits = (d: Draft) => ({ stopPct: Number(d.stopPct), targetPct: Number(d.targetPct) });

function LimitInputs({ name, draft, onChange }: { name: string; draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <>
      <label>{name} stop-loss %<input type="number" min={1} max={95} step="any" required value={draft.stopPct} onChange={(e) => onChange({ ...draft, stopPct: e.target.value })} /></label>
      <label>{name} target %<input type="number" min={1} max={95} step="any" required value={draft.targetPct} onChange={(e) => onChange({ ...draft, targetPct: e.target.value })} /></label>
    </>
  );
}

// Editable copy of the saved limits; the parent remounts it (key) whenever the saved settings change.
function LimitsPanel({ settings, held, onSave }: { settings: LimitSettings; held: string[]; onSave: (s: LimitSettings) => Promise<void> }) {
  const [def, setDef] = useState(() => toDraft(settings.default));
  const [overrides, setOverrides] = useState(() => Object.entries(settings.perCode).map(([code, l]) => ({ code, ...toDraft(l) })));
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const free = held.filter((c) => !overrides.some((o) => o.code === c));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ default: toLimits(def), perCode: Object.fromEntries(overrides.map((o) => [o.code, toLimits(o)])) });
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the limits.'); } finally { setBusy(false); }
  };

  return (
    <form className={`panel ${css.section}`} onSubmit={submit} aria-labelledby="limits-title">
      <h2 className="h3" id="limits-title">My limits</h2>
      <p className="muted small">The checks flag a holding when it falls past your stop-loss or rises past your target, measured from your average cost.</p>
      <div className={css.form}><LimitInputs name="Default" draft={def} onChange={setDef} /></div>
      {overrides.map((o) => (
        <div key={o.code} className={`${css.form} ${css.section}`}>
          <LimitInputs name={o.code} draft={o} onChange={(d) => setOverrides((all) => all.map((x) => (x.code === o.code ? { ...x, ...d } : x)))} />
          <div className={css.actions}><button className="link-btn" type="button" onClick={() => setOverrides((all) => all.filter((x) => x.code !== o.code))}>Remove {o.code} override</button></div>
        </div>
      ))}
      <div className={`${css.form} ${css.section}`}>
        {free.length ? (
          <>
            <label>Holding with its own limits<select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a holding</option>{free.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className={css.actions}><button className="btn" type="button" disabled={!pick} onClick={() => { setOverrides((all) => [...all, { code: pick, ...def }]); setPick(''); }}>Add override</button></div>
          </>
        ) : null}
        <div className={css.actions}><button className="btn primary" type="submit" disabled={busy}>Save limits</button></div>
      </div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  );
}

export default function TradesPage() {
  const [key, setKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
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

  const loadSeq = useRef(0);
  const load = useCallback(async (k: string, acc: Account = 'real') => {
    const seq = ++loadSeq.current;
    setBusy(true);
    try {
      const list = await call<List>(k, acc === 'paper' ? '/api/trades?account=paper' : '/api/trades');
      // A slower answer for the other account must never replace the list now shown (Practice could show real trades).
      if (seq === loadSeq.current) { setData(list); setError(null); }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : 'Could not load trades.');
      if ((e as { status?: number }).status === 401) { storeKey(''); setKey(''); }
    } finally { if (seq === loadSeq.current) setBusy(false); }
  }, []);

  useEffect(() => {
    void ensureKey().then((k) => { if (k) { setKey(k); void load(k); } });
  }, [load]);

  const unlock = (e: FormEvent) => { e.preventDefault(); storeKey(keyDraft.trim()); setKey(keyDraft.trim()); void load(keyDraft.trim()); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call(key, editing ? `/api/trades/${editing}` : '/api/trades', { method: editing ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, account }) });
      setForm(blank()); setEditing(null); await load(key, account);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the trade.'); setBusy(false); }
  };

  const remove = async (t: Trade) => {
    if (!window.confirm(`Delete ${t.side} ${t.quantity} ${t.code} on ${fmtDate(t.date)}?`)) return;
    setBusy(true);
    try { await call(key, `/api/trades/${t.id}`, { method: 'DELETE' }); await load(key, account); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete.'); setBusy(false); }
  };

  const switchTo = (acc: Account) => {
    if (acc === account) return;
    setAccount(acc); setData(null); setEditing(null); setForm(blank()); setPreview(null);
    void load(key, acc);
  };

  // Uses the normal delete path one trade at a time; the list holds only practice trades, so real rows are never touched.
  const resetPractice = async () => {
    const paperTrades = (data?.trades ?? []).filter((t) => t.account === 'paper');
    if (!paper || !paperTrades.length || !window.confirm(`Delete all ${paperTrades.length} practice trades? Real trades are not touched.`)) return;
    setBusy(true);
    try {
      for (const t of paperTrades) await call(key, `/api/trades/${t.id}`, { method: 'DELETE' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reset the practice account.'); }
    await load(key, 'paper');
  };

  const upload = async (file: File, saveIt: boolean) => {
    setBusy(true);
    setPreview(null);
    const body = new FormData();
    body.append('file', file);
    if (saveIt) body.append('save', '1');
    if (importDate) body.append('date', importDate);
    try {
      const result = await call<ImportResult>(key, '/api/trades/import', { method: 'POST', body });
      setPreview(saveIt ? null : { file, result }); setError(null);
      // A date typed for one file must not silently apply to the next one.
      if (saveIt) { setImportDate(''); await load(key); } else setBusy(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the file.'); setBusy(false); }
  };

  if (!key) {
    return (
      <>
        <h1>My trades</h1>
        <p className="muted">Your buys and sells are saved in your own Google Sheet. Enter the trades key once on this device.</p>
        <form className={`panel ${css.form}`} onSubmit={unlock}>
          <label>Trades key<input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} required minLength={16} /></label>
          <button className="btn primary" type="submit">Open my trades</button>
        </form>
        {error ? <p className={css.error} role="alert">{error}</p> : null}
      </>
    );
  }

  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <h1>My trades</h1>
      <p className="muted">Saved in your Google Sheet (tab “trades”). You can also open and edit the sheet yourself; reload here after.</p>
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
      {data?.badRows.length ? <div className="note warn">Rows {data.badRows.join(', ')} in the sheet could not be read; fix them in the sheet.</div> : null}
      {data ? <Summary holdings={data.holdings} /> : busy ? <Skeleton label="Loading trades" rows={4} /> : null}

      {paper ? null : <div className={`panel ${css.section}`}>
        <h2 className="h3">Import from your broker (Excel order summary)</h2>
        <p className="muted">Pick the day’s <b>order_summary_….xlsx</b>. You see what will be added first; trades already in the sheet are skipped.</p>
        <div className={css.form}>
          <label className="btn"><Icon name="upload" />Choose broker file (.xlsx)<input className="sr-only" type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, false); e.target.value = ''; }} /></label>
          <label>Trade date (only if the file name has none)<input type="date" value={importDate} max={dhakaToday()} onChange={(e) => setImportDate(e.target.value)} /></label>
        </div>
        {preview ? (
          <div className={css.section}>
            <p><b>{fmtDate(preview.result.date)}</b>: {preview.result.added.length} to add, {preview.result.skipped.length} already in the sheet.</p>
            <ul>{preview.result.added.map((t, i) => <li key={`${i}-${t.code}-${t.side}`}><span className={`${css.side} ${t.side === 'BUY' ? css.buy : css.sell}`}>{t.side}</span> {t.quantity} {t.code} @ ৳{fmt(t.price)}</li>)}</ul>
            {preview.result.errors.map((e) => <p key={e} className={css.error}>{e}</p>)}
            {preview.result.added.length ? (
              <div className={css.actions}>
                <button className="btn primary" type="button" disabled={busy} onClick={() => void upload(preview.file, true)}>Save {preview.result.added.length} {preview.result.added.length === 1 ? 'trade' : 'trades'}</button>
                <button className="link-btn" type="button" onClick={() => setPreview(null)}>Cancel</button>
              </div>
            ) : (
              <p className="muted">Nothing new to add — this file is already in your sheet. <button className="link-btn" type="button" onClick={() => setPreview(null)}>Close</button></p>
            )}
          </div>
        ) : null}
      </div>}

      <form className={`panel ${css.section}`} onSubmit={save}>
        <h2 className="h3">{editing ? 'Edit trade' : 'Add a trade'}{paper ? ' (practice)' : ''}</h2>
        <div className={css.form}>
          <label>Date<input type="date" value={form.date} max={dhakaToday()} onChange={set('date')} required /></label>
          <label>Code<input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="GP" required /></label>
          <label>Side<select value={form.side} onChange={set('side')}><option>BUY</option><option>SELL</option></select></label>
          <label>Quantity<input inputMode="numeric" value={form.quantity} onChange={set('quantity')} required /></label>
          <label>Price ৳<input inputMode="decimal" value={form.price} onChange={set('price')} required /></label>
          <label>Commission ৳<input inputMode="decimal" value={form.commission} onChange={set('commission')} /></label>
          <label>Note<input value={form.note} onChange={set('note')} maxLength={200} /></label>
          <div className={css.actions}>
            <button className="btn primary" type="submit" disabled={busy}>{editing ? 'Save changes' : paper ? 'Add practice trade' : 'Add trade'}</button>
            {editing ? <button className="link-btn" type="button" onClick={() => { setEditing(null); setForm(blank()); }}>Cancel</button> : null}
          </div>
        </div>
      </form>

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
      {!paper && data?.settings ? <LimitsPanel key={JSON.stringify(data.settings)} settings={data.settings} held={data.holdings.filter((h) => h.shares > 0).map((h) => h.code)}
        onSave={async (s) => { await call(key, '/api/trades/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) }); await load(key, account); }} /> : null}
      <div className={`panel ${css.section}`}>
        <p className="small muted">Phone alerts via Telegram — setup: web/docs/telegram-setup.md</p>
        <TelegramTestButton />
      </div>

      <div className={`panel table-wrap ${css.section}`}><h2 className="h3">All trades</h2>
        {data && !data.trades.length ? <p className="muted">{paper ? 'No practice trades yet. Add one above to try it out.' : 'No trades yet. Import your broker file or add one above.'}</p> : null}
        {data?.trades.length ? (
          <table className="cards"><thead><tr><th>Date</th><th>Trade</th><th className="n">Price</th><th className="n">Amount</th><th>Note</th><th /></tr></thead>
            <tbody>{data.trades.map((t) => (
              <tr key={t.id}><td>{fmtDate(t.date)}</td><td><span className={`${css.side} ${t.side === 'BUY' ? css.buy : css.sell}`}>{t.side}</span> {t.quantity} <b>{t.code}</b></td>
                <td className="n">৳{fmt(t.price)}</td><td className="n">৳{fmt(tradeAmount(t))}</td><td className="muted">{t.note}</td>
                <td className={css.actions}>
                  <button className="link-btn" type="button" aria-label={`Edit ${t.side} ${t.quantity} ${t.code} on ${t.date}`} onClick={() => { setEditing(t.id); setForm({ date: t.date, code: t.code, side: t.side, quantity: String(t.quantity), price: String(t.price), commission: t.commission == null ? '' : String(t.commission), note: t.note }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                  <button className="link-btn danger" type="button" aria-label={`Delete ${t.side} ${t.quantity} ${t.code} on ${t.date}`} onClick={() => void remove(t)}>Delete</button>
                </td></tr>
            ))}</tbody></table>
        ) : null}
        {paper && data?.trades.length ? <div className={`${css.actions} ${css.section}`}><button className="link-btn danger" type="button" disabled={busy} onClick={() => void resetPractice()}>Reset practice account</button></div> : null}
      </div>
      </div>
    </>
  );
}
