// Proxies public DSE data because DSE sends no CORS header.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createScanner } = require('./lib/scanner');
const { analyze, sectorMedians, fiveYearSummary, pricePosition, metrics, fourQuestions, dividendStatus } = require('./lib/analysis');
const { DATA_VERSION } = require('./lib/company');
const { dhakaToday, previousTradingDay } = require('./lib/announcements');

const PORT = Number(process.env.PORT) || 8080;
const DSE = 'https://www.dse.com.bd';
const CODE_RE = /^[A-Z0-9&().-]{1,20}$/;
const SNAPSHOT_TTL_MS = 30_000;
const HISTORY_TTL_MS = 10 * 60_000;
const COMPANY_FRESH_MS = 60 * 60_000;
const RESCAN_EVERY_MS = 6 * 60 * 60_000;
const CACHE_MAX = 200;
const SCAN_RETRY_MS = 5 * 60_000;
const RECENT_DECLARATION_DAYS = 60;
const DASHBOARD_SOON_DAYS = 7;
const DASHBOARD_LIST = 5;
const UNUSUAL_VOLUME_X = 3;
const LAST_SESSION_FILE = path.join(__dirname, 'data', 'last-session.json');
const LAST_SESSION_SAVE_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const PAGES = { '/': 'app.html', '/index.html': 'app.html', '/plan': 'plan.html' };
const cache = new Map();

// Daily prices are embedded in the company page as {"t":..,"date":"YYYY-MM-DD","price":N,...}.
function parseHistory(html) {
  const text = html.replace(/\\"/g, '"');
  const byDate = new Map();
  for (const m of text.matchAll(/\{"t":"[^"]*","date":"(\d{4}-\d\d-\d\d)","price":([\d.]+)/g)) {
    byDate.set(m[1], Number(m[2]));
  }
  const num = (v) => (v === undefined || v === 'null' ? null : Number(v));
  const q = text.match(/"marketCap":([\d.]+|null),"pe":([\d.]+|null),"eps":(-?[\d.]+|null),"dividendYield":([\d.]+|null),"bookValue":(-?[\d.]+|null)/) || [];
  return {
    points: [...byDate].sort((a, b) => a[0].localeCompare(b[0])),
    marketCap: num(q[1]), pe: num(q[2]), eps: num(q[3]), dividendYield: num(q[4]), nav: num(q[5]),
  };
}

async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function fetchDse(urlPath) {
  const res = await fetch(DSE + urlPath, { headers: { 'User-Agent': 'Mozilla/5.0 dse-plan-local' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`DSE ${urlPath} returned HTTP ${res.status}`);
  return res;
}

const snapshot = () => cached('snapshot', SNAPSHOT_TTL_MS, async () => (await fetchDse('/api/live/snapshot')).json());

async function marketSession() {
  const snap = await snapshot();
  const s = snap.prices.session || {};
  return { isOpen: !!s.isOpen, phase: s.phase || null, tradingDay: !!s.tradingDay, sessionDate: s.sessionDate || null,
    opening: s.today?.opening || s.opening || null, today: s.today?.date || null, next: s.next?.date || null, dataTime: snap.market?.totals?.tradeTime || null };
}

async function livePrices() {
  const snap = await snapshot();
  const cols = snap.prices.cols;
  return Object.fromEntries(snap.prices.rows.map((r) => [r[0], Object.fromEntries(cols.map((c, i) => [c, r[i]]))]));
}

const scanner = createScanner({
  fetchText: async (p) => (await fetchDse(p)).text(),
  listCodes: async () => Object.values(await livePrices()).filter((p) => p.assetType === 'EQ').map((p) => p.code),
});

function withLive(company, live) {
  const p = live[company.code];
  return p && p.ltp > 0 ? { ...company, price: p.ltp, changePct: p.percent, liveValueMn: p.value } : company;
}

async function listCompanies() {
  const live = await livePrices().catch(() => ({}));
  const equities = new Set(Object.values(live).filter((p) => p.assetType === 'EQ').map((p) => p.code));
  const all = Object.values(scanner.store).filter((c) => !equities.size || equities.has(c.code)).map((c) => withLive(c, live));
  const medians = sectorMedians(all);
  const rows = all.map((c) => {
    const a = analyze(c, medians[c.sector]);
    return {
      code: c.code, name: c.name, sector: c.sector, category: c.category, price: c.price, changePct: c.changePct,
      signal: a.signal, score: a.score, quality: a.quality, fraud: a.fraud.level, flags: a.fraud.flags.map((f) => f.title),
      pe: a.metrics.pe, dividendYield: a.metrics.latestYield, epsCagr: a.metrics.epsCagr, change1y: a.metrics.change1y,
      dailyValue: a.metrics.avgDailyValue, stale: c.version !== DATA_VERSION,
    };
  });
  const codes = Object.values(live).filter((p) => p.assetType === 'EQ').map((p) => ({ code: p.code, sector: p.sector }));
  const session = await marketSession().catch(() => null);
  return { rows, codes, medians, scan: scanner.state, session, updatedAt: Date.now() };
}

async function dividendCalendar() {
  const now = new Date();
  const live = await livePrices().catch(() => ({}));
  const rows = Object.values(scanner.store).filter((c) => c.events).map((c) => ({ c: withLive(c, live), s: dividendStatus(c.events, now) }));
  const brief = ({ c, s }, d) => {
    const cashPerShare = d?.cashPct != null ? (d.cashPct / 100) * (c.faceValue || 10) : null;
    return { code: c.code, name: c.name, sector: c.sector, category: c.category, price: c.price, faceValue: c.faceValue || 10,
      cashPct: d?.cashPct ?? null, stockPct: d?.stockPct ?? null, interim: !!d?.interim, partial: !!d?.partial,
      cashPerShare, yieldPct: cashPerShare != null && c.price > 0 ? (cashPerShare / c.price) * 100 : null,
      fraud: analyze(c, null, now).fraud.level,
      announced: d?.announced ?? null, recordDate: d?.recordDate ?? null, agmDate: d?.agmDate ?? null,
      lastBuyDate: d?.lastBuyDate ?? (d?.recordDate ? previousTradingDay(d.recordDate) : null), lastBuyEstimated: d?.lastBuyDate ? !!d.lastBuyEstimated : true, nextExpected: s.nextExpected, regular: s.regular };
  };
  const recentSince = dhakaToday(new Date(now.getTime() - RECENT_DECLARATION_DAYS * 86_400_000));
  return {
    today: dhakaToday(now),
    upcoming: rows.filter((r) => r.s.upcoming).map((r) => brief(r, r.s.upcoming)).sort((a, b) => a.recordDate.localeCompare(b.recordDate)),
    recent: rows.filter((r) => r.s.latest && r.s.latest.announced >= recentSince && !r.s.upcoming).map((r) => brief(r, r.s.latest))
      .sort((a, b) => b.announced.localeCompare(a.announced)),
    expected: rows.filter((r) => !r.s.upcoming && r.s.nextExpected).map((r) => brief(r, r.s.latest))
      .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected)),
    scan: scanner.state,
    session: await marketSession().catch(() => null),
  };
}

// DSE clears its live figures before each open, so keep the last traded session to show until trading starts.
let lastSession = (() => {
  try { return JSON.parse(fs.readFileSync(LAST_SESSION_FILE, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') console.warn('last-session file unreadable, starting without it', e);
    return null;
  }
})();
let lastSessionSavedAt = 0;

function rememberSession(snap, intraday) {
  if (!(snap.market.totals?.trades > 0) || !intraday?.points?.length) return;
  if (Date.now() - lastSessionSavedAt < LAST_SESSION_SAVE_MS) return;
  lastSession = { date: intraday.day || snap.prices.session?.sessionDate, index: snap.market.indices, intraday: intraday.points };
  lastSessionSavedAt = Date.now();
  try {
    fs.mkdirSync(path.dirname(LAST_SESSION_FILE), { recursive: true });
    fs.writeFileSync(LAST_SESSION_FILE, JSON.stringify(lastSession));
  } catch (e) { console.error('could not save last session', e); }
}

async function dashboard() {
  const [snap, intraday, list] = await Promise.all([
    snapshot(),
    cached('intraday', SNAPSHOT_TTL_MS, async () => (await fetchDse('/api/live/index-intraday?code=DSEX')).json()).catch(() => null),
    listCompanies(),
  ]);
  const cal = await dividendCalendar();
  const today = dhakaToday();
  const soon = dhakaToday(new Date(Date.now() + DASHBOARD_SOON_DAYS * 86_400_000));
  const weekAgo = dhakaToday(new Date(Date.now() - DASHBOARD_SOON_DAYS * 86_400_000));
  rememberSession(snap, intraday);
  const traded = snap.market.totals?.trades > 0;
  const daily = snap.market.dailyTotals || [];
  const last = daily.at(-1) || {};
  const eq = snap.prices.rows.map((r) => Object.fromEntries(snap.prices.cols.map((c, i) => [c, r[i]]))).filter((p) => p.assetType === 'EQ' && p.ltp > 0);
  const byPct = [...eq].filter((p) => p.trades > 0).sort((a, b) => b.percent - a.percent);
  const brief = (p) => ({ code: p.code, price: p.ltp, percent: p.percent, sector: p.sector });
  const fromTop = (x) => ({ code: x.code, price: x.closep, percent: x.pct });
  const sectors = {};
  if (traded) for (const p of eq) (sectors[p.sector] ||= []).push(p.percent);
  else for (const c of Object.values(scanner.store)) if (c.changePct != null && isFinite(c.changePct)) (sectors[c.sector] ||= []).push(c.changePct);
  const savedIndex = lastSession?.date === last.date ? lastSession.index : null;
  const counts = Object.fromEntries(['research', 'neutral', 'caution', 'avoid'].map((k) => [k, list.rows.filter((r) => r.signal === k).length]));
  const unusual = Object.values(scanner.store).map((c) => {
    const s = c.series || [];
    const prev = s.slice(-61, -1).map((x) => x.volume);
    const avg = prev.length >= 20 ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
    return { code: c.code, name: c.name, x: avg > 0 ? s.at(-1).volume / avg : 0, change: c.changePct };
  }).filter((u) => u.x >= UNUSUAL_VOLUME_X).sort((a, b) => b.x - a.x);
  return {
    session: await marketSession(),
    live: traded,
    showingDate: traded ? snap.prices.session?.date || today : last.date || null,
    index: traded ? snap.market.indices : (savedIndex || snap.market.indices.map((x) => ({ ...x, change: null, percent: null }))),
    totals: traded ? snap.market.totals : { ...snap.market.totals, turnover: last.turnover ?? 0, trades: last.trades ?? 0 },
    breadth: traded ? snap.market.breadth : { advanced: last.advanced ?? 0, declined: last.declined ?? 0, unchanged: last.unchanged ?? 0 },
    previous: traded ? snap.market.previousSession : daily.at(-2) || null,
    daily,
    intraday: traded ? intraday?.points || [] : (lastSession?.date === last.date ? lastSession.intraday : []),
    intradayDay: traded ? intraday?.day || null : last.date || null,
    gainers: traded ? byPct.slice(0, DASHBOARD_LIST).map(brief) : (snap.market.topMovers?.cp?.gainers || []).slice(0, DASHBOARD_LIST).map(fromTop),
    losers: traded ? byPct.slice(-DASHBOARD_LIST).reverse().map(brief) : (snap.market.topMovers?.cp?.losers || []).slice(0, DASHBOARD_LIST).map(fromTop),
    sectors: Object.entries(sectors).map(([sector, xs]) => ({ sector, avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length })).sort((a, b) => b.avg - a.avg),
    counts,
    fraudCount: list.rows.filter((r) => r.fraud !== 'clean' && r.category !== 'Z').length,
    fraudTop: list.rows.filter((r) => r.fraud !== 'clean' && r.category !== 'Z').sort((x, y) => y.flags.length - x.flags.length).slice(0, DASHBOARD_LIST)
      .map((r) => ({ code: r.code, flags: r.flags, level: r.fraud })),
    shortlist: list.rows.filter((r) => r.quality).sort((a, b) => b.score - a.score).slice(0, 6),
    recordSoon: cal.upcoming.filter((r) => r.recordDate <= soon),
    upcomingCount: cal.upcoming.length,
    declaredThisWeek: cal.recent.concat(cal.upcoming).filter((r) => r.announced && r.announced >= weekAgo).sort((a, b) => b.announced.localeCompare(a.announced)),
    unusual: unusual.slice(0, DASHBOARD_LIST),
    unusualCount: unusual.length,
    companyCount: list.rows.length,
    scan: scanner.state,
    today,
    updatedAt: Date.now(),
  };
}

async function companyDetail(code, fresh) {
  const stored = scanner.store[code];
  const company = !fresh && stored?.version === DATA_VERSION && Date.now() - stored.fetchedAt < COMPANY_FRESH_MS ? stored : await scanner.fetchCompany(code);
  const live = await livePrices().catch(() => ({}));
  const all = Object.values(scanner.store).map((c) => withLive(c, live));
  const current = withLive(company, live);
  const sectorPe = sectorMedians(all)[company.sector];
  const analysis = analyze(current, sectorPe);
  const position = pricePosition(current, metrics(current));
  const dividend = dividendStatus(current.events);
  return { company: current, analysis, summary: fiveYearSummary(current), position, dividend, questions: fourQuestions(current, analysis, position, dividend), sectorPe, session: await marketSession().catch(() => null), updatedAt: Date.now() };
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function codeParam(raw) {
  let code;
  try { code = decodeURIComponent(raw).toUpperCase(); } catch { return null; }
  return CODE_RE.test(code) ? code : null;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (PAGES[url.pathname]) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, PAGES[url.pathname]), 'utf8'), 'text/html; charset=utf-8');
  }
  if (url.pathname === '/api/snapshot') return send(res, 200, await snapshot());
  if (url.pathname === '/api/companies') return send(res, 200, await listCompanies());
  if (url.pathname === '/api/dividends') return send(res, 200, await dividendCalendar());
  if (url.pathname === '/api/dashboard') return send(res, 200, await dashboard());
  const m = url.pathname.match(/^\/api\/(history|company)\/([^/]+)$/);
  if (m) {
    const code = codeParam(m[2]);
    if (!code) return send(res, 400, { error: 'Invalid trade code' });
    if (m[1] === 'company') return send(res, 200, await companyDetail(code, url.searchParams.get('fresh') === '1'));
    return send(res, 200, await cached('h:' + code, HISTORY_TTL_MS,
      async () => parseHistory(await (await fetchDse('/company/' + code)).text())));
  }
  return send(res, 404, { error: 'Not found' });
}

if (require.main === module) {
  http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e.notFound) return send(res, 404, { error: 'No company with that trade code on DSE.' });
      console.error(`request failed: ${req.url}`, e);
      send(res, 502, { error: 'Live DSE data is not available now. Try again later.' });
    });
  }).listen(PORT, '127.0.0.1', () => console.info(`DSE helper running at http://localhost:${PORT}`));
  const scan = () => scanner.run().catch((e) => {
    console.error('market scan failed, retrying in 5 minutes', e);
    setTimeout(scan, SCAN_RETRY_MS);
  });
  scan();
  setInterval(scan, RESCAN_EVERY_MS);
}

module.exports = { parseHistory };
