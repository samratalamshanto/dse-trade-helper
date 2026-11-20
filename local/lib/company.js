const { extractJson } = require('./extract');
const { parseAnnouncements } = require('./announcements');

const SERIES_KEEP_DAYS = 260;
const DATA_VERSION = 4;

// DSE pages ship their data as Next.js flight chunks: self.__next_f.push([1,"<JSON string>"]).
function flightText(html) {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch { return ''; }
  });
  return parts.length ? parts.join('') : html.replace(/\\"/g, '"');
}

// Long strings are stored once as "<id>:T<hex byte length>,<text>" and referenced as "$<id>".
function resolveRef(text, value) {
  if (typeof value !== 'string' || !/^\$[0-9a-f]+$/.test(value)) return value;
  const m = new RegExp(`(?<![0-9a-f])${value.slice(1)}:T([0-9a-f]+),`).exec(text);
  if (!m) return '';
  const start = m.index + m[0].length;
  const bytes = parseInt(m[1], 16);
  return Buffer.from(text.slice(start, start + bytes)).subarray(0, bytes).toString('utf8');
}

function toYear(y) {
  return {
    year: y.year,
    eps: y.epsBasic ?? y.epsContBasicOriginal ?? null,
    nav: y.nav ?? y.navOriginal ?? null,
    profit: y.profit ?? y.profitForYear ?? null,
    pe: y.pe ?? null,
    dividend: y.dividendPct ?? null,
  };
}

function parseCompanyPage(html) {
  const text = flightText(html);
  const c = extractJson(text, 'company');
  if (!c || !c.code) return null;
  const series = extractJson(text, 'series') || [];
  const interim = extractJson(text, 'interimFinancials');
  const peTrend = extractJson(text, 'peTrend') || [];
  const announcements = (extractJson(text, 'recentAnnouncements') || [])
    .map((a) => ({ date: a.date, type: a.type, summary: resolveRef(text, a.summary), body: resolveRef(text, a.body) }));
  const interimEps = interim?.rows?.find((r) => /^Earnings Per Share \(EPS\) Basic/.test(r.metric));
  return {
    version: DATA_VERSION,
    code: c.code,
    name: c.name,
    sector: c.sector,
    category: c.category,
    price: c.price,
    changePct: c.changePct,
    marketCap: c.marketCap,
    pe: c.pe,
    eps: c.eps,
    nav: c.nav ?? c.bookValue,
    dividendYield: c.dividendYield,
    weekHigh52: c.weekHigh52,
    weekLow52: c.weekLow52,
    paidUpCapital: c.paidUpCapital,
    faceValue: c.faceValue,
    listingYear: c.listingYear,
    yearEnd: c.yearEnd,
    agmDate: c.agmDate,
    website: c.website,
    operationalStatus: c.operationalStatus,
    loanStatus: c.loanStatus,
    sharePattern: (c.sharePattern || []).map((s) => ({ date: s.date, ...s.pattern })),
    dividends: (c.dividendHistory || []).map((d) => ({ year: d.year, cash: d.cash, stock: d.stock, yieldPct: d.yieldPct })),
    years: (c.multiYearFinancials || []).map(toYear).sort((a, b) => a.year - b.year),
    interim: interimEps ? { periods: interim.periodEnds, eps: interimEps } : null,
    peLatest: peTrend.at(-1) || null,
    events: parseAnnouncements(announcements),
    series: series.slice(-SERIES_KEEP_DAYS).map((s) => ({ date: s.date, price: s.price, volume: s.volume })),
    asOf: c.asOfDate,
  };
}

module.exports = { parseCompanyPage, flightText, resolveRef, DATA_VERSION };
