import type { Declaration, DirectorTrade, Events, DividendStatus } from './types.ts';
import { dhakaToday, previousTradingDay } from './dhaka.ts';

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const RECORD_MATCH_DAYS = 90;
const PAYOUT_MAX_DAYS = 180;
const DIRECTOR_WINDOW_DAYS = 180;
// DSE rules want payment within 30 days of the AGM; after 45 with no notice the payment is not "pending" any more.
export const PAYMENT_GRACE_DAYS = 45;
const DAY_MS = 86_400_000;
const LEAD_CHARS = 120;
const DATE_LOOKAHEAD = 65;
const PERIOD_RE = /(?:year|period)\s+ended\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;

export { dhakaToday, previousTradingDay };

const iso = (y: number, mo: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, mo, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};
const month = (name: unknown): number | undefined => MONTHS[String(name).slice(0, 3).toLowerCase()];

type DateForm = [RegExp, (m: RegExpMatchArray) => string | null | false | undefined];

const DATE_FORMS: DateForm[] = [
  [/(\d{1,2})[\s.\-/]+([A-Za-z]{3,9})[\s.\-/,]+(\d{4})/g, (m) => month(m[2]) != null ? iso(+m[3], month(m[2])!, +m[1]) : null],
  [/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/g, (m) => month(m[1]) != null ? iso(+m[3], month(m[1])!, +m[2]) : null],
  [/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/g, (m) => iso(+m[3], +m[2] - 1, +m[1])],
];

export function toIso(s: unknown): string | null {
  if (!s) return null;
  let best: { at: number; value: string } | null = null;
  for (const [re, read] of DATE_FORMS) {
    for (const m of String(s).matchAll(re)) {
      const value = read(m);
      if (value && (!best || (m.index ?? 0) < best.at)) best = { at: m.index ?? 0, value };
    }
  }
  return best?.value ?? null;
}

const days = (a: string, b: string): number => (Date.parse(a) - Date.parse(b)) / DAY_MS;
const dateAfter = (text: string, label: RegExp): string | null => {
  const at = text.search(label);
  return at < 0 ? null : toIso(text.slice(at, at + DATE_LOOKAHEAD));
};

interface Announcement {
  date?: string | null;
  type?: string | null;
  summary?: string | null;
  body?: string | null;
}

interface Disbursement {
  date: string | null;
  periodEnd: string | null;
}

interface SpotWindow {
  lastCum: string | null;
  recordDate: string | null;
}

function parseDeclaration(a: Announcement, summary: string, body: string): Declaration {
  const text = `${summary} ${body}`;
  const lead = body.slice(0, LEAD_CHARS);
  const cash = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:final\s+|interim\s+)?cash/i) || text.match(/cash\s+dividend[^.%]{0,120}?(\d+(?:\.\d+)?)\s*%/i);
  const stock = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:final\s+|interim\s+)?(?:stock|bonus)/i) || text.match(/(?:stock|bonus)\s+dividend[^.%]{0,60}?(\d+(?:\.\d+)?)\s*%/i);
  return {
    announced: toIso(a.date),
    cashPct: cash ? Number(cash[1]) : null,
    stockPct: stock ? Number(stock[1]) : null,
    noDividend: /no\s+dividend/i.test(text),
    interim: /interim/i.test(summary) || (/interim/i.test(lead) && !/final/i.test(lead)),
    partial: /except\s+sponsors/i.test(text),
    eps: (() => { const m = text.match(/\bEPS\s+(?:of\s+)?Tk\.?\s*(-?\d+(?:\.\d+)?)/i); return m ? Number(m[1]) : null; })(),
    periodEnd: toIso(text.match(PERIOD_RE)?.[1]),
    recordDate: dateAfter(text, /record\s+date/i),
    agmDate: dateAfter(text, /\bAGM\b/),
  };
}

function matchPayouts(declarations: Declaration[], disbursements: Disbursement[]): void {
  const used = new Set<Disbursement>();
  for (const d of [...declarations].sort((x, y) => (x.recordDate || '').localeCompare(y.recordDate || ''))) {
    const hit = disbursements.find((p) => !used.has(p) && d.periodEnd && p.periodEnd === d.periodEnd)
      || disbursements.find((p) => !used.has(p) && (!p.periodEnd || !d.periodEnd) && d.recordDate && days(p.date ?? '', d.recordDate) > 0 && days(p.date ?? '', d.recordDate) <= PAYOUT_MAX_DAYS);
    if (hit) used.add(hit);
    d.paidOn = hit?.date ?? null;
  }
}

export function parseAnnouncements(list?: Announcement[]): Events {
  const declarations: Declaration[] = [], recordDates: string[] = [], disbursements: Disbursement[] = [], directorTrades: DirectorTrade[] = [], spotWindows: SpotWindow[] = [];
  for (const a of list || []) {
    const summary = String(a.summary ?? ''), body = String(a.body ?? '');
    const date = toIso(a.date);
    const cum = body.match(/cum\s+benefit\s+from\s+(.{6,20}?)\s+to\s+(.{6,20}?)(?:\s+and\b|[,;]|$)/i);
    if (cum && toIso(cum[2])) spotWindows.push({ lastCum: toIso(cum[2]), recordDate: dateAfter(body, /record\s+date/i) });
    if (/suspension for record date/i.test(summary)) {
      const rd = dateAfter(body, /record\s+date/i);
      if (rd) recordDates.push(rd);
    } else if (a.type === 'Dividend' && /disburs|credited/i.test(summary)) {
      disbursements.push({ date, periodEnd: toIso(`${summary} ${body}`.match(PERIOD_RE)?.[1]) });
    } else if (a.type === 'Dividend' && /declar|recommend/i.test(`${summary} ${body}`)) {
      declarations.push(parseDeclaration(a, summary, body));
    } else {
      const side = summary.match(/^\s*(buy|sell)\s+declaration\b/i);
      if (side) directorTrades.push({ date, side: side[1].toLowerCase(), who: summary.replace(/^\s*(buy|sell)\s+declaration\s+(of\s+)?(an?\s+)?/i, '') });
    }
  }
  const taken = new Set(declarations.map((d) => d.recordDate).filter(Boolean) as string[]);
  for (const d of [...declarations].sort((x, y) => (x.announced || '').localeCompare(y.announced || ''))) {
    if (d.recordDate) continue;
    const rd = recordDates.filter((r) => !taken.has(r) && d.announced && days(r, d.announced) >= 0 && days(r, d.announced) <= RECORD_MATCH_DAYS).sort()[0];
    if (rd) { d.recordDate = rd; taken.add(rd); }
  }
  for (const d of declarations) {
    const spot = d.recordDate && spotWindows.find((w) => w.recordDate === d.recordDate || (!w.recordDate && days(d.recordDate!, w.lastCum!) > 0 && days(d.recordDate!, w.lastCum!) <= 7));
    d.lastBuyDate = spot ? spot.lastCum : d.recordDate ? previousTradingDay(d.recordDate) : null;
    d.lastBuyEstimated = !spot;
  }
  matchPayouts(declarations, disbursements);
  declarations.sort((a, b) => (b.announced || '').localeCompare(a.announced || ''));
  return { declarations, recordDates: [...new Set(recordDates)].sort(), disbursements, directorTrades, spotWindows };
}

const addMonths = (isoDate: string, n: number): string => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

// A record with neither a cash nor a bonus rate (a parse miss or a notice) is not a dividend.
export const isEmptyDeclaration = (d: Declaration): boolean => !d.noDividend && d.cashPct == null && d.stockPct == null;

const plusDays = (isoDate: string, n: number): string => new Date(Date.parse(isoDate + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);

// paid: a payment notice matched; pending: record date passed, within AGM (else record date) + PAYMENT_GRACE_DAYS;
// no-notice: past that with no notice found; none: no cash dividend (bonus shares only), or record date still ahead / unknown.
export function paymentState(d: Declaration, today: string): 'paid' | 'pending' | 'no-notice' | 'none' {
  if (d.paidOn) return 'paid';
  if (d.noDividend || !((d.cashPct ?? 0) > 0) || !d.recordDate || d.recordDate >= today) return 'none';
  return plusDays(d.agmDate || d.recordDate, PAYMENT_GRACE_DAYS) >= today ? 'pending' : 'no-notice';
}

export function dividendStatus(events?: Events | null, now = new Date()): DividendStatus {
  const today = dhakaToday(now);
  const all = (events?.declarations || []).filter((d) => d.announced && !isEmptyDeclaration(d));
  const decls = all.filter((d) => !d.noDividend);
  const latest = decls[0] || null;
  const upcoming = decls.find((d) => d.recordDate && d.recordDate > today) || null;
  const finals = decls.filter((d) => !d.interim);
  const base = finals[0] || latest;
  let next = base ? addMonths(base.announced!, 12) : null;
  while (next && next.slice(0, 7) < today.slice(0, 7)) next = addMonths(next, 12);
  const regular = finals.length >= 2 && Math.abs(days(finals[0].announced!, addMonths(finals[1].announced!, 12))) <= 45;
  const recordToday = decls.find((d) => d.recordDate === today) || null;
  const canStillBuy = !!upcoming && !!upcoming.lastBuyDate && upcoming.lastBuyDate >= today;
  const unpaid = decls.find((d) => paymentState(d, today) === 'pending') || null;
  return { latest, upcoming, recordToday, canStillBuy, nextExpected: next ? next.slice(0, 7) : null, regular, today, skippedLast: !!all[0]?.noDividend, unpaid };
}

export function directorActivity(events?: Events | null, now = new Date()): { sells: DirectorTrade[]; buys: DirectorTrade[]; windowDays: number } {
  const since = dhakaToday(new Date(now.getTime() - DIRECTOR_WINDOW_DAYS * DAY_MS));
  const recent = (events?.directorTrades || []).filter((t) => t.date && t.date >= since);
  return { sells: recent.filter((t) => t.side === 'sell'), buys: recent.filter((t) => t.side === 'buy'), windowDays: DIRECTOR_WINDOW_DAYS };
}

export interface RecordDividend { recordDate: string; cashPct: number | null; stockPct: number | null; cashPerShare: number | null }

// The real dividend with the newest record date, and its cash per share (cash % of the face value).
export function latestRecordDividend(events: Events | null | undefined, faceValue: number): RecordDividend | null {
  const d = (events?.declarations || []).filter((x) => !x.noDividend && x.recordDate)
    .reduce<Declaration | null>((best, x) => (!best || x.recordDate! > best.recordDate!
      || (x.recordDate === best.recordDate && (x.announced || '') > (best.announced || '')) ? x : best), null);
  if (!d) return null;
  const cashPct = d.cashPct ?? null;
  return { recordDate: d.recordDate!, cashPct, stockPct: d.stockPct ?? null, cashPerShare: cashPct != null ? Math.round(cashPct * faceValue) / 100 : null };
}
