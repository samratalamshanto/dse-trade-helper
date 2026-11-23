import { CODE_RE, DHAKA_OFFSET_MS } from './dhaka.ts';

// Pure scorecard logic: what the app said on each trading day, graded later against the DSEX index.
export const HORIZONS = [1, 5, 20] as const;
// Percent-right figures need this many trading days of results before they mean anything.
export const SCORECARD_MIN_DAYS = 20;
export const scorecardTooEarly = (days: number | null | undefined): boolean => (days ?? 0) < SCORECARD_MIN_DAYS;
export const GRADED_SIGNALS = ['research', 'caution', 'avoid'] as const;
export type GradedSignal = (typeof GRADED_SIGNALS)[number];
const SIGNALS = new Set(['research', 'neutral', 'caution', 'avoid']);
const BEST_WORST = 5;
// DSE's session ends at 14:30 Dhaka time; 15 minutes later the closing figures are settled.
const SNAPSHOT_AFTER_MIN = 14 * 60 + 45;
const FRIDAY = 5, SATURDAY = 6;

export interface Call { code: string; signal: string; score: number; fraud: string; price: number; planAction?: string }
export interface DaySnapshot { date: string; dsex: number; calls: Call[] }
export interface Grade { code: string; signal: GradedSignal; date: string; horizon: number; excess: number; right: boolean }
export interface Group { n: number; right: number; pctRight: number | null; avgExcess: number | null }
type Closes = Record<string, { date: string; price: number }[] | undefined>;

const pos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function validCall(c: unknown): c is Call {
  const x = c as Call;
  return !!x && typeof x.code === 'string' && CODE_RE.test(x.code) && SIGNALS.has(x.signal) && Number.isFinite(x.score) && typeof x.fraud === 'string' && pos(x.price);
}

// A stored file is trusted only after this check; bad calls are dropped, a bad header rejects the file.
export function validSnapshot(x: unknown): DaySnapshot | null {
  const s = x as DaySnapshot;
  if (!s || typeof s.date !== 'string' || !ISO_RE.test(s.date) || !pos(s.dsex) || !Array.isArray(s.calls)) return null;
  return { date: s.date, dsex: s.dsex, calls: s.calls.filter(validCall) };
}

// Sunday to Thursday, after the close (Dhaka time). Holidays are handled by the caller: it keys by the session date.
export function snapshotDue(now: number): boolean {
  const d = new Date(now + DHAKA_OFFSET_MS);
  if (d.getUTCDay() === FRIDAY || d.getUTCDay() === SATURDAY) return false;
  return d.getUTCHours() * 60 + d.getUTCMinutes() >= SNAPSHOT_AFTER_MIN;
}

export const isRight = (signal: GradedSignal, excess: number): boolean => (signal === 'research' ? excess > 0 : excess < 0);

// How much the call helped: positive when right. Research gains when the stock beats DSEX; avoid/caution when it lags.
const edge = (g: Grade) => (g.signal === 'research' ? g.excess : -g.excess);

// shortcut: a horizon counts recorded snapshot days, so a day the server missed stretches it by one; use a DSE holiday list if that matters.
export function gradeAll(snapshots: DaySnapshot[], closes: Closes = {}) {
  const days = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const grades: Grade[] = [];
  let pending = 0;
  days.forEach((day, i) => {
    for (const call of day.calls) {
      if (!(GRADED_SIGNALS as readonly string[]).includes(call.signal)) continue;
      for (const h of HORIZONS) {
        const later = days[i + h];
        if (!later) { pending++; continue; }
        const p1 = later.calls.find((c) => c.code === call.code)?.price ?? closes[call.code]?.find((x) => x.date === later.date)?.price;
        if (!pos(p1)) continue;
        const excess = ((p1 / call.price) - (later.dsex / day.dsex)) * 100;
        if (!Number.isFinite(excess)) continue;
        const signal = call.signal as GradedSignal;
        grades.push({ code: call.code, signal, date: day.date, horizon: h, excess, right: isRight(signal, excess) });
      }
    }
  });
  return { grades, pending };
}

function group(gs: Grade[]): Group {
  const right = gs.filter((g) => g.right).length;
  return {
    n: gs.length, right,
    pctRight: gs.length ? (right / gs.length) * 100 : null,
    avgExcess: gs.length ? gs.reduce((a, g) => a + g.excess, 0) / gs.length : null,
  };
}

export function scorecard(snapshots: DaySnapshot[], closes: Closes = {}) {
  const { grades, pending } = gradeAll(snapshots, closes);
  const bySignal = Object.fromEntries(GRADED_SIGNALS.map((s) => [s,
    Object.fromEntries(HORIZONS.map((h) => [h, group(grades.filter((g) => g.signal === s && g.horizon === h))])) as Record<number, Group>,
  ])) as Record<GradedSignal, Record<number, Group>>;
  // Best and worst use each call's longest graded horizon, so one call is not listed three times.
  const longest = new Map<string, Grade>();
  for (const g of grades) {
    const k = g.code + '|' + g.date;
    if ((longest.get(k)?.horizon ?? 0) < g.horizon) longest.set(k, g);
  }
  const ranked = [...longest.values()].sort((a, b) => edge(b) - edge(a));
  const dates = snapshots.map((s) => s.date).sort();
  return {
    since: dates[0] ?? null,
    days: dates.length,
    horizons: [...HORIZONS],
    bySignal,
    best: ranked.slice(0, BEST_WORST).filter((g) => edge(g) > 0),
    worst: ranked.slice(-BEST_WORST).reverse().filter((g) => edge(g) < 0),
    pending,
  };
}

export type Scorecard = ReturnType<typeof scorecard>;

// The group with the lowest share of right calls (ties: the larger sample), or null before any grade.
export function weakestGroup(bySignal: Scorecard['bySignal']) {
  let worst: { signal: GradedSignal; horizon: number; group: Group } | null = null;
  for (const s of GRADED_SIGNALS) for (const h of HORIZONS) {
    const g = bySignal[s][h];
    if (g.pctRight == null) continue;
    if (!worst || g.pctRight < (worst.group.pctRight as number) || (g.pctRight === worst.group.pctRight && g.n > worst.group.n)) worst = { signal: s, horizon: h, group: g };
  }
  return worst;
}
