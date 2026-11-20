import { extractJson } from './extract.ts';
import { parseAnnouncements } from './announcements.ts';
import type { Company, YearRow, Dividend, SharePattern, SeriesPoint, InterimFinancials, InterimEpsRow } from './types.ts';

const SERIES_KEEP_DAYS = 260;
export const DATA_VERSION = 5;
const NEWS_KEEP = 25;
const NEWS_BODY_CHARS = 700;

interface RawAnnouncement {
  date?: unknown;
  type?: unknown;
  summary?: unknown;
  body?: unknown;
}

interface RawSharePatternEntry {
  date?: unknown;
  pattern?: Record<string, unknown>;
}

interface RawDividendHistory {
  year?: unknown;
  cash?: unknown;
  stock?: unknown;
  yieldPct?: unknown;
}

interface RawYearFinancials {
  year?: unknown;
  epsBasic?: unknown;
  epsContBasicOriginal?: unknown;
  nav?: unknown;
  navOriginal?: unknown;
  profit?: unknown;
  profitForYear?: unknown;
  pe?: unknown;
  dividendPct?: unknown;
}

interface RawInterimRow {
  metric?: unknown;
  [key: string]: unknown;
}

interface RawInterim {
  rows?: RawInterimRow[];
  periodEnds?: Record<string, unknown>;
}

interface RawCompany {
  code?: unknown;
  name?: unknown;
  sector?: unknown;
  category?: unknown;
  price?: unknown;
  changePct?: unknown;
  marketCap?: unknown;
  pe?: unknown;
  eps?: unknown;
  nav?: unknown;
  bookValue?: unknown;
  dividendYield?: unknown;
  weekHigh52?: unknown;
  weekLow52?: unknown;
  paidUpCapital?: unknown;
  faceValue?: unknown;
  listingYear?: unknown;
  yearEnd?: unknown;
  agmDate?: unknown;
  website?: unknown;
  operationalStatus?: unknown;
  loanStatus?: Record<string, unknown> | null;
  sharePattern?: RawSharePatternEntry[];
  dividendHistory?: RawDividendHistory[];
  multiYearFinancials?: RawYearFinancials[];
  asOfDate?: unknown;
}

export function flightText(html: string): string {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => {
    try { return JSON.parse(m[1]) as string; } catch { return ''; }
  });
  return parts.length ? parts.join('') : html.replace(/\\"/g, '"');
}

export function resolveRef(text: string, value: unknown): unknown {
  if (typeof value !== 'string' || !/^\$[0-9a-f]+$/.test(value)) return value;
  const m = new RegExp(`(?<![0-9a-f])${value.slice(1)}:T([0-9a-f]+),`).exec(text);
  if (!m) return '';
  const start = m.index + m[0].length;
  const bytes = parseInt(m[1], 16);
  return Buffer.from(text.slice(start, start + bytes)).subarray(0, bytes).toString('utf8');
}

function toYear(y: RawYearFinancials): YearRow {
  return {
    year: y.year as number,
    eps: (y.epsBasic ?? y.epsContBasicOriginal ?? null) as number | null,
    nav: (y.nav ?? y.navOriginal ?? null) as number | null,
    profit: (y.profit ?? y.profitForYear ?? null) as number | null,
    pe: (y.pe ?? null) as number | null,
    dividend: (y.dividendPct ?? null) as number | null,
  };
}

export function parseCompanyPage(html: string): Company | null {
  const text = flightText(html);
  const c = extractJson<RawCompany>(text, 'company');
  if (!c || !c.code) return null;
  const series = extractJson<Array<Record<string, unknown>>>(text, 'series') ?? [];
  const interim = extractJson<RawInterim>(text, 'interimFinancials');
  const peTrend = extractJson<unknown[]>(text, 'peTrend') ?? [];
  const announcements = (extractJson<RawAnnouncement[]>(text, 'recentAnnouncements') ?? [])
    .map((a) => ({
      date: a.date as string | undefined,
      type: a.type as string | undefined,
      summary: resolveRef(text, a.summary) as string,
      body: resolveRef(text, a.body) as string,
    }));
  const interimEps = interim?.rows?.find((r) => /^Earnings Per Share \(EPS\) Basic/.test(String(r.metric)));
  const parsedInterim: InterimFinancials | null = interimEps
    ? { periods: (interim?.periodEnds ?? {}) as Record<string, unknown>, eps: interimEps as InterimEpsRow }
    : null;
  return {
    version: DATA_VERSION,
    code: c.code as string,
    name: c.name as string,
    sector: c.sector as string,
    category: c.category as string,
    price: (c.price ?? null) as number | null,
    changePct: (c.changePct ?? null) as number | null,
    marketCap: (c.marketCap ?? null) as number | null,
    pe: (c.pe ?? null) as number | null,
    eps: (c.eps ?? null) as number | null,
    nav: ((c.nav ?? c.bookValue) ?? null) as number | null,
    dividendYield: (c.dividendYield ?? null) as number | null,
    weekHigh52: (c.weekHigh52 ?? null) as number | null,
    weekLow52: (c.weekLow52 ?? null) as number | null,
    paidUpCapital: (c.paidUpCapital ?? null) as number | null,
    faceValue: (c.faceValue ?? null) as number | null,
    listingYear: (c.listingYear ?? null) as number | null,
    yearEnd: (c.yearEnd ?? null) as string | null,
    agmDate: (c.agmDate ?? null) as string | null,
    website: (c.website ?? null) as string | null,
    operationalStatus: (c.operationalStatus ?? null) as string | null,
    loanStatus: (c.loanStatus ?? null) as Record<string, unknown> | null,
    sharePattern: ((c.sharePattern || []).map((s) => ({ date: s.date as string | null | undefined, ...s.pattern })) as SharePattern[]),
    dividends: ((c.dividendHistory || []).map((d) => ({ year: d.year, cash: d.cash, stock: d.stock, yieldPct: d.yieldPct })) as Dividend[]),
    years: ((c.multiYearFinancials || []).map(toYear).sort((a, b) => (a.year ?? 0) - (b.year ?? 0))),
    interim: parsedInterim,
    peLatest: peTrend.at(-1) ?? null,
    events: parseAnnouncements(announcements),
    // Keep recent news short so the saved scan stays small.
    news: announcements.slice(0, NEWS_KEEP).map((a) => ({ date: a.date ?? null, type: a.type ?? null, summary: a.summary || '', body: (a.body || '').slice(0, NEWS_BODY_CHARS) })),
    series: series.slice(-SERIES_KEEP_DAYS).map((s) => ({ date: s['date'] as string, price: s['price'] as number, volume: s['volume'] as number })) as SeriesPoint[],
    asOf: (c.asOfDate ?? null) as string | null,
  };
}
