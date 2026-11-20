import fs from 'node:fs';
import path from 'node:path';
import { dashboard, listCompanies } from './service.ts';
import { allCompanies, ownDir, SHARED_DIR } from './store.ts';
import { scorecard, snapshotDue, validSnapshot, type DaySnapshot } from './scorecard.ts';

// Written to this process's own folder (store.ownDir); read from it and the committed data/scorecard.
const dir = () => path.join(process.cwd(), ownDir(), 'scorecard');
const readDirs = () => [...new Set([dir(), path.join(process.cwd(), SHARED_DIR, 'scorecard')])];
const FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;
const CHECK_EVERY_MS = 10 * 60_000;

export function readAll(): DaySnapshot[] {
  const byDate = new Map<string, DaySnapshot>();
  for (const folder of readDirs()) {
    let names: string[];
    try { names = fs.readdirSync(folder).filter((n) => FILE_RE.test(n)); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('scorecard folder unreadable', e);
      continue;
    }
    for (const name of names) {
      if (byDate.has(name.slice(0, 10))) continue;
      try {
        const s = validSnapshot(JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')));
        if (s && s.date + '.json' === name) byDate.set(s.date, s);
        else console.warn(`scorecard file ${name} skipped: not a valid snapshot`, new Error('invalid snapshot'));
      } catch (e) { console.warn(`scorecard file ${name} skipped`, e); }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function save(s: DaySnapshot): string {
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), s.date + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(s));
  fs.renameSync(file + '.tmp', file);
  return file;
}

export class MarketOpenError extends Error {}

// Records what the app said for the last finished session. Keyed by the session date, so a holiday never adds a day.
export async function takeSnapshot(): Promise<{ date: string; taken: boolean; calls: number; file: string }> {
  const d = await dashboard();
  if (d.session.isOpen) throw new MarketOpenError('The market is open; the snapshot is taken after the close.');
  const dsex = d.index.find((x) => x.key === 'DSEX')?.value;
  const snap = validSnapshot({ date: d.showingDate, dsex, calls: [] });
  if (!snap) throw new Error(`no session date or DSEX value to snapshot (date ${d.showingDate}, DSEX ${dsex})`);
  const file = path.join(dir(), snap.date + '.json');
  if (readDirs().some((d) => fs.existsSync(path.join(d, snap.date + '.json')))) return { date: snap.date, taken: false, calls: readAll().find((s) => s.date === snap.date)?.calls.length ?? 0, file: path.relative(process.cwd(), file) };
  const { rows } = await listCompanies();
  const full = validSnapshot({ ...snap, calls: rows.map((r) => ({ code: r.code, signal: r.signal, score: r.score, fraud: r.fraud, price: r.price })) }) as DaySnapshot;
  return { date: full.date, taken: true, calls: full.calls.length, file: path.relative(process.cwd(), save(full)) };
}

export function scorecardReport() {
  const snaps = readAll();
  const closes = Object.fromEntries(Object.values(allCompanies()).map((c) => [c.code, (c.series || []).map((p) => ({ date: p.date, price: p.price }))]));
  return {
    ...scorecard(snaps, closes),
    note: 'Each call is graded against the DSEX index after 1, 5 and 20 trading days. Excess = stock return minus DSEX return. Research is right when the stock beat DSEX; caution and avoid are right when it lagged. Neutral is not graded. Pending = call-and-horizon pairs still waiting for later sessions. Learning aid, not investment advice.',
  };
}

let running = false;
async function tick(): Promise<void> {
  if (running || !snapshotDue(Date.now())) return;
  running = true;
  try {
    await takeSnapshot();
  } catch (e) {
    if (!(e instanceof MarketOpenError)) console.warn('scorecard snapshot failed; next try in 10 minutes', e);
  } finally { running = false; }
}

// Dev hot reload re-runs register(); the global flag keeps one timer per process.
export function startScorecard(): void {
  const g = globalThis as { scorecardTimer?: boolean };
  if (g.scorecardTimer) return;
  g.scorecardTimer = true;
  void tick();
  setInterval(() => void tick(), CHECK_EVERY_MS).unref();
}
