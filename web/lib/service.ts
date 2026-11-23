import { analyze, currentYield, expectedLatestYear, sectorMedians, fiveYearSummary, pricePosition, metrics, fourQuestions, dividendRecord, hasSector } from './analysis.ts';
import { dividendStatus, dhakaToday, previousTradingDay, toIso } from './announcements.ts';
import { DATA_VERSION } from './company.ts';
import { paidYears } from './dividend-checks.ts';
import { priceHistory } from './price-history.ts';
import { snapshot, intraday, livePrices, marketSession, seen, remember, SNAPSHOT_TTL_MS, FAILURE_TTL_MS, type MarketSession, type SnapshotRow, type Intraday, type Snapshot } from './dse.ts';
import { allCompanies, fetchCompany, readLastSession, saveCompanies, saveLastSession, storeVersion, NotFoundError, type StoredCompany, type LastSession } from './store.ts';

const COMPANY_FRESH_MS = 60 * 60_000;
const RECENT_DECLARATION_DAYS = 60;
const DASHBOARD_SOON_DAYS = 7;
const DASHBOARD_LIST = 5;
const UNUSUAL_VOLUME_X = 3;
const LAST_SESSION_SAVE_MS = 60_000;
const DAY_MS = 86_400_000;
const NOT_FOUND_MS = 10 * 60_000;
const FRESH_BYPASS_MS = 60_000;
const FETCHES_PER_MINUTE = 20;
// The background scan leaves the rest of the minute's budget to user requests.
const SCAN_FETCHES_PER_MINUTE = 15;
const SCAN_PAUSE_MS = 3_000;
const SCAN_RETRY_MS = 30 * 60_000;
const SCAN_SAVE_EVERY = 10;

type Live = Record<string, SnapshotRow>;
type Declaration = NonNullable<ReturnType<typeof dividendStatus>['latest']>;

// Before the first trade of the day DSE reports ltp 0; keep the stored (last-session) price then.
// A company page with no sector ("—") takes the sector from the live snapshot row.
function withLive<T extends StoredCompany>(company: T, live: Live): T {
  const p = live[company.code];
  const sector = !hasSector(company.sector) && p && hasSector(p.sector) ? { sector: p.sector } : {};
  return p && p.ltp > 0 ? { ...company, ...sector, price: p.ltp, changePct: p.percent } : { ...company, ...sector };
}

function memoBySource<T>(build: () => Promise<T>): () => Promise<T> {
  let last: { snap: Snapshot | null; version: number; at: number; value: Promise<T> } | null = null;
  return async () => {
    const snap = await snapshot().catch(() => null);
    const version = storeVersion();
    if (last?.snap === snap && last.version === version && Date.now() - last.at < SNAPSHOT_TTL_MS) return last.value;
    const value = build();
    last = { snap, version, at: Date.now(), value };
    value.catch(() => { if (last?.value === value) last = null; });
    return value;
  };
}

// One global budget for company-page fetches to DSE, so ?fresh=1 and the background scan cannot flood it.
const fetchTimes: number[] = [];
function takeFetchBudget(limit = FETCHES_PER_MINUTE): boolean {
  while (fetchTimes.length && Date.now() - fetchTimes[0] > 60_000) fetchTimes.shift();
  if (fetchTimes.length >= limit) return false;
  fetchTimes.push(Date.now());
  return true;
}

const refreshing = new Map<string, Promise<StoredCompany>>();
function refresh(code: string): Promise<StoredCompany> {
  const running = refreshing.get(code);
  if (running) return running;
  const p = fetchCompany(code).catch((e: unknown) => {
    remember((e instanceof NotFoundError ? 'missing:' : 'failed:') + code);
    throw e;
  }).finally(() => refreshing.delete(code));
  refreshing.set(code, p);
  return p;
}

// Serve the stored copy now and fetch a newer one in the background, so a page never waits on DSE for data it has.
function refreshLater(code: string): void {
  if (seen('failed:' + code, FAILURE_TTL_MS) || !takeFetchBudget()) return;
  refresh(code).catch((e: unknown) => console.warn(`background refresh of ${code} failed`, e));
}

let scanRunning = false;
const isStale = (c: StoredCompany) => c.version !== DATA_VERSION;

// Re-fetch rows saved by an older parser one at a time. Only codes DSE lists as equities now are tried, and a code
// that failed is skipped for SCAN_RETRY_MS, so one bad page can never block the codes after it.
async function scanStale(): Promise<void> {
  if (scanRunning) return;
  scanRunning = true;
  let done = 0;
  try {
    const live: Live = await livePrices().catch(() => ({}));
    const due = (k: string) => isStale(allCompanies()[k]) && live[k]?.assetType === 'EQ' && !seen('failed:' + k, SCAN_RETRY_MS) && !seen('missing:' + k, SCAN_RETRY_MS);
    for (const code of Object.keys(allCompanies()).filter(due)) {
      while (!takeFetchBudget(SCAN_FETCHES_PER_MINUTE)) await new Promise((r) => setTimeout(r, SCAN_PAUSE_MS).unref());
      try { await refresh(code); } catch (e) {
        console.warn(`stale scan skipped ${code}`, e);
        continue;
      }
      if (++done % SCAN_SAVE_EVERY === 0) saveCompanies();
    }
  } finally {
    scanRunning = false;
    saveCompanies();
  }
}

const scanState = () => {
  const all = Object.values(allCompanies());
  return { running: scanRunning, done: all.filter((c) => !isStale(c)).length, total: all.length };
};

async function buildCompanyList() {
  const live: Live = await livePrices().catch(() => ({}));
  const equities = new Set(Object.values(live).filter((p) => p.assetType === 'EQ').map((p) => p.code));
  const all = Object.values(allCompanies()).filter((c) => !equities.size || equities.has(c.code)).map((c) => withLive(c, live));
  const medians = sectorMedians(all);
  if (all.some(isStale)) void scanStale();
  const rows = all.map((c) => {
    const a = analyze(c, medians[c.sector]);
    return {
      code: c.code, name: c.name, sector: c.sector, category: c.category, price: c.price, changePct: c.changePct,
      signal: a.signal, score: a.score, quality: a.quality, fraud: a.fraud.level, flags: a.fraud.flags.map((f) => f.title),
      missed: a.checks.filter((x) => !x.ok).map((x) => x.label).slice(0, 3),
      pe: a.metrics.pe, avgPastPe: a.metrics.avgPastPe, dividendYield: a.metrics.latestYield, epsCagr: a.metrics.epsCagr, change1y: a.metrics.change1y,
      dailyValue: a.metrics.avgDailyValue, weekHigh52: c.weekHigh52 ?? null, weekLow52: c.weekLow52 ?? null, stale: c.version !== DATA_VERSION,
      nextExpected: dividendStatus(c.events).nextExpected,
    };
  });
  const codes = Object.values(live).filter((p) => p.assetType === 'EQ').map((p) => ({ code: p.code, sector: p.sector }));
  return { rows, codes, medians, scan: scanState(), session: await marketSession().catch(() => null), updatedAt: Date.now() };
}

export const listCompanies = memoBySource(buildCompanyList);

export type CompanyRow = Awaited<ReturnType<typeof listCompanies>>['rows'][number];

async function buildDividendCalendar() {
  const now = new Date();
  const live: Live = await livePrices().catch(() => ({}));
  const rows = Object.values(allCompanies()).filter((c) => c.events).map((c) => ({ c: withLive(c, live), s: dividendStatus(c.events, now) }));
  // The same score and signal the Companies page shows (it compares P/E with the sector median).
  const listed = new Map((await listCompanies().catch(() => null))?.rows.map((r) => [r.code, r]));
  const brief = ({ c, s }: (typeof rows)[number], d: Declaration | null) => {
    const cashPerShare = d?.cashPct != null ? (d.cashPct / 100) * (c.faceValue || 10) : null;
    const a = analyze(c, null, now);
    return {
      code: c.code, name: c.name, sector: c.sector, category: c.category, price: c.price, faceValue: c.faceValue || 10,
      cashPct: d?.cashPct ?? null, stockPct: d?.stockPct ?? null, interim: !!d?.interim, partial: !!d?.partial,
      // yearlyCashPerShare: every cash declaration of the last 12 months (interims + final), the same sum the yield uses.
      cashPerShare, yearlyCashPerShare: currentYield(c, null, now).cash, yieldPct: a.metrics.latestYield, yieldBasis: a.metrics.yieldBasis,
      fraud: a.fraud.level, flags: a.fraud.flags.map((f) => f.title), eps: a.metrics.epsNow, avgYieldPct: fiveYearSummary(c).average.dividendYield,
      paidYears: paidYears(c.dividends, expectedLatestYear(now)), weekLow52: c.weekLow52 ?? null, weekHigh52: c.weekHigh52 ?? null,
      score: listed.get(c.code)?.score ?? null, signal: listed.get(c.code)?.signal ?? null,
      announced: d?.announced ?? null, recordDate: d?.recordDate ?? null, agmDate: d?.agmDate ?? null,
      lastBuyDate: d?.lastBuyDate ?? (d?.recordDate ? previousTradingDay(d.recordDate) : null),
      lastBuyEstimated: d?.lastBuyDate ? !!d.lastBuyEstimated : true, nextExpected: s.nextExpected, regular: s.regular,
    };
  };
  const recentSince = dhakaToday(new Date(now.getTime() - RECENT_DECLARATION_DAYS * DAY_MS));
  return {
    today: dhakaToday(now),
    upcoming: rows.filter((r) => r.s.upcoming).map((r) => brief(r, r.s.upcoming)).sort((a, b) => (a.recordDate || '').localeCompare(b.recordDate || '')),
    recent: rows.filter((r) => r.s.latest && (r.s.latest.announced || '') >= recentSince && !r.s.upcoming).map((r) => brief(r, r.s.latest))
      .sort((a, b) => (b.announced || '').localeCompare(a.announced || '')),
    expected: rows.filter((r) => !r.s.upcoming && r.s.nextExpected).map((r) => brief(r, r.s.latest))
      .sort((a, b) => (a.nextExpected || '').localeCompare(b.nextExpected || '')),
    scan: scanState(),
    session: await marketSession().catch(() => null),
  };
}

export const dividendCalendar = memoBySource(buildDividendCalendar);

export type CalendarRow = Awaited<ReturnType<typeof dividendCalendar>>['upcoming'][number];

// DSE clears its live figures before each open, so keep the last traded session to show until trading starts.
let lastSession: LastSession | null | undefined;
let lastSessionSavedAt = 0;

function rememberSession(snap: Snapshot, day: Intraday | null) {
  if (!(snap.market.totals?.trades > 0) || !day?.points?.length) return;
  if (Date.now() - lastSessionSavedAt < LAST_SESSION_SAVE_MS) return;
  lastSession = { date: day.day || snap.prices.session?.sessionDate || '', index: snap.market.indices, intraday: day.points };
  lastSessionSavedAt = Date.now();
  saveLastSession(lastSession);
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// The day the figures belong to: DSE keeps the last session's figures after the close, so "today" would be wrong.
export function sessionDay(snap: Snapshot): string | null {
  const s = snap.prices.session;
  if (s?.sessionDate) return s.sessionDate;
  return toIso(snap.market.totals?.tradeTime);
}

export async function dashboard() {
  const [snap, day, list, cal] = await Promise.all([snapshot(), intraday().catch(() => null), listCompanies(), dividendCalendar()]);
  if (lastSession === undefined) lastSession = readLastSession();
  const today = dhakaToday();
  const soon = dhakaToday(new Date(Date.now() + DASHBOARD_SOON_DAYS * DAY_MS));
  const weekAgo = dhakaToday(new Date(Date.now() - DASHBOARD_SOON_DAYS * DAY_MS));
  rememberSession(snap, day);
  const traded = snap.market.totals?.trades > 0;
  const daily = snap.market.dailyTotals || [];
  const last = daily.at(-1);
  const eq = Object.values(await livePrices()).filter((p) => p.assetType === 'EQ' && p.ltp > 0);
  const byPct = eq.filter((p) => p.trades > 0 && isNum(p.percent)).sort((a, b) => (b.percent as number) - (a.percent as number));
  const fraudMap = new Map(list.rows.map((r) => [r.code, { fraud: r.fraud, flags: r.flags }]));
  const withFraud = (code: string) => { const f = fraudMap.get(code); return { fraud: (f?.fraud ?? 'clean') as string, flags: (f?.flags ?? []) as string[] }; };
  const brief = (p: SnapshotRow) => ({ code: p.code, price: p.ltp, percent: p.percent as number, ...withFraud(p.code) });
  const fromTop = (x: { code: string; closep: number; pct: number }) => ({ code: x.code, price: x.closep, percent: x.pct, ...withFraud(x.code) });
  const sectors: Record<string, number[]> = {};
  if (traded) for (const p of byPct) (sectors[p.sector] ||= []).push(p.percent as number);
  else for (const c of Object.values(allCompanies())) if (isNum(c.changePct)) (sectors[c.sector] ||= []).push(c.changePct);
  const savedIndex = last && lastSession?.date === last.date ? lastSession.index : null;
  const counts = Object.fromEntries(['research', 'neutral', 'caution', 'avoid'].map((k) => [k, list.rows.filter((r) => r.signal === k).length]));
  const unusual = Object.values(allCompanies()).map((c) => {
    const s = c.series || [];
    const prev = s.slice(-61, -1).map((x) => x.volume);
    const avg = prev.length >= 20 ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
    return { code: c.code, name: c.name, x: avg > 0 && s.length ? (s.at(-1)?.volume ?? 0) / avg : 0, ...withFraud(c.code) };
  }).filter((u) => u.x >= UNUSUAL_VOLUME_X).sort((a, b) => b.x - a.x);
  const warned = list.rows.filter((r) => r.fraud !== 'clean' && r.category !== 'Z');
  return {
    session: await marketSession(),
    live: traded,
    showingDate: traded ? sessionDay(snap) || today : last?.date || null,
    index: traded ? snap.market.indices : ((savedIndex as Snapshot['market']['indices'] | null) || snap.market.indices.map((x) => ({ ...x, change: null, percent: null }))),
    totals: traded ? snap.market.totals : { ...snap.market.totals, turnover: last?.turnover ?? 0, trades: last?.trades ?? 0 },
    breadth: traded ? snap.market.breadth : { advanced: last?.advanced ?? 0, declined: last?.declined ?? 0, unchanged: last?.unchanged ?? 0 },
    previous: traded ? snap.market.previousSession || null : daily.at(-2) || null,
    daily,
    intraday: traded ? day?.points || [] : (last && lastSession?.date === last.date ? lastSession.intraday : []),
    intradayDay: traded ? day?.day || null : last?.date || null,
    gainers: traded ? byPct.slice(0, DASHBOARD_LIST).map(brief) : (snap.market.topMovers?.cp?.gainers || []).slice(0, DASHBOARD_LIST).map(fromTop),
    losers: traded ? byPct.slice(-DASHBOARD_LIST).reverse().map(brief) : (snap.market.topMovers?.cp?.losers || []).slice(0, DASHBOARD_LIST).map(fromTop),
    sectors: Object.entries(sectors).map(([sector, xs]) => ({ sector, avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length })).sort((a, b) => b.avg - a.avg),
    counts,
    fraudCount: warned.length,
    fraudTop: [...warned].sort((x, y) => y.flags.length - x.flags.length).slice(0, DASHBOARD_LIST).map((r) => ({ code: r.code, flags: r.flags, level: r.fraud })),
    shortlist: list.rows.filter((r) => r.quality).sort((a, b) => b.score - a.score).slice(0, 6),
    recordSoon: cal.upcoming.filter((r) => (r.recordDate || '') <= soon),
    upcomingCount: cal.upcoming.length,
    declaredThisWeek: [...cal.recent, ...cal.upcoming].filter((r) => r.announced && r.announced >= weekAgo).sort((a, b) => (b.announced || '').localeCompare(a.announced || '')),
    unusual: unusual.slice(0, DASHBOARD_LIST),
    unusualCount: unusual.length,
    companyCount: list.rows.length,
    scan: scanState(),
    today,
    updatedAt: Date.now(),
  };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;

// freshSkipped: the user asked for a fresh copy but got the stored one (no DSE budget left, or the fetch failed).
async function loadCompany(code: string, fresh: boolean): Promise<{ company: StoredCompany; freshSkipped: boolean }> {
  const stored = allCompanies()[code];
  if (stored) {
    const wantFresh = fresh && !seen('fresh:' + code, FRESH_BYPASS_MS);
    if (wantFresh && takeFetchBudget()) {
      remember('fresh:' + code);
      return refresh(code).then((company) => ({ company, freshSkipped: false }), (e: unknown) => {
        console.warn(`fresh fetch of ${code} failed; serving the stored copy`, e);
        return { company: allCompanies()[code] ?? stored, freshSkipped: true };
      });
    }
    if (isStale(stored) || Date.now() - stored.fetchedAt >= COMPANY_FRESH_MS) refreshLater(code);
    return { company: stored, freshSkipped: wantFresh };
  }
  if (seen('missing:' + code, NOT_FOUND_MS)) throw new NotFoundError(`company ${code} was not found recently`);
  // Only a code DSE lists right now may be fetched; if the list cannot be read, do not send unknown codes to DSE.
  if (!(code in await livePrices())) throw new NotFoundError(`company ${code} is not listed on DSE`);
  return { company: await refresh(code), freshSkipped: false };
}

// live: the market is open now; sessionDate: the DSE session the figures belong to (else the last trade date).
export interface TodayTrading { open: number | null; high: number | null; low: number | null; close: number | null; prevClose: number | null; volume: number | null; valueMn: number | null; trades: number | null; live: boolean; sessionDate: string | null }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Live snapshot first; before the first trade (ltp 0) fall back to the session quote saved from the company page.
export function todayTrading(row: SnapshotRow | undefined, details: Record<string, unknown> | undefined, session?: MarketSession | null, lastTradeDate: string | null = null): TodayTrading | null {
  const sessionDate = session?.sessionDate || lastTradeDate;
  if (row && row.ltp > 0) {
    return { open: num(row.open), high: num(row.high), low: num(row.low), close: num(row.ltp), prevClose: num(row.ycp), volume: num(row.volume), valueMn: num(row.value), trades: num(row.trades), live: !!session?.isOpen, sessionDate };
  }
  const q = details?.sessionQuote as Record<string, unknown> | null | undefined;
  if (!q || typeof q !== 'object') return null;
  return { open: num(q.open), high: num(q.high), low: num(q.low), close: num(q.close ?? q.lastPrice), prevClose: num(q.prevClose), volume: num(q.volume), valueMn: num(q.valueMn), trades: num(q.trades), live: false, sessionDate: lastTradeDate };
}

export async function companyDetail(code: string, fresh: boolean) {
  const { company, freshSkipped } = await loadCompany(code, fresh);
  const live: Live = await livePrices().catch(() => ({}));
  const current = withLive(company, live);
  const sectorPe = (await listCompanies()).medians[current.sector];
  const analysis = analyze(current, sectorPe);
  const position = pricePosition(current, metrics(current));
  const dividend = dividendStatus(current.events);
  const session = await marketSession().catch(() => null);
  return {
    company: { ...current, pe: analysis.metrics.pe, dividendYield: analysis.metrics.latestYield }, analysis, summary: fiveYearSummary(current), position, dividend,
    dividendRecord: dividendRecord(current),
    questions: fourQuestions(current, analysis, position, dividend), sectorPe: sectorPe ?? null, freshSkipped, dataStale: isStale(company),
    today: todayTrading(live[code], company.details, session, analysis.metrics.lastTradeDate),
    // Live price, like the lists, so the 1-year change is the same number everywhere.
    priceHistory: priceHistory(company.series ?? [], company.events?.declarations ?? [], company.faceValue ?? null, analysis.metrics.priceNow),
    session, updatedAt: Date.now(),
  };
}

export type CompanyDetail = Awaited<ReturnType<typeof companyDetail>>;
