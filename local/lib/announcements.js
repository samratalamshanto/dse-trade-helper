const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const RECORD_MATCH_DAYS = 90;
const PAYOUT_MAX_DAYS = 180;
const DIRECTOR_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const LEAD_CHARS = 120;
const DATE_LOOKAHEAD = 65;
const FRIDAY = 5, SATURDAY = 6;
const PERIOD_RE = /(?:year|period)\s+ended\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;

// Exchange dates are Dhaka dates (UTC+6), not UTC dates.
const dhakaToday = (now = new Date()) => new Date(now.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

const iso = (y, mo, d) => {
  const t = new Date(Date.UTC(y, mo, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};
const month = (name) => MONTHS[String(name).slice(0, 3).toLowerCase()];

// Accepts "16 Nov 2026", "16-Nov-2026", "16 November 2026", "16.11.2026", "16/11/2026", "June 30, 2026".
const DATE_FORMS = [
  [/(\d{1,2})[\s.\-/]+([A-Za-z]{3,9})[\s.\-/,]+(\d{4})/g, (m) => month(m[2]) != null && iso(+m[3], month(m[2]), +m[1])],
  [/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/g, (m) => month(m[1]) != null && iso(+m[3], month(m[1]), +m[2])],
  [/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/g, (m) => iso(+m[3], +m[2] - 1, +m[1])],
];

// Returns the earliest valid date written anywhere in the text, as "YYYY-MM-DD".
function toIso(s) {
  if (!s) return null;
  let best = null;
  for (const [re, read] of DATE_FORMS) {
    for (const m of String(s).matchAll(re)) {
      const value = read(m);
      if (value && (!best || m.index < best.at)) best = { at: m.index, value };
    }
  }
  return best?.value ?? null;
}

const days = (a, b) => (Date.parse(a) - Date.parse(b)) / DAY_MS;
const dateAfter = (text, label) => {
  const at = text.search(label);
  return at < 0 ? null : toIso(text.slice(at, at + DATE_LOOKAHEAD));
};

function parseDeclaration(a, summary, body) {
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

// Each payout belongs to one declaration: same period, else the first payout within 180 days after its record date.
function matchPayouts(declarations, disbursements) {
  const used = new Set();
  for (const d of [...declarations].sort((x, y) => (x.recordDate || '').localeCompare(y.recordDate || ''))) {
    const hit = disbursements.find((p) => !used.has(p) && d.periodEnd && p.periodEnd === d.periodEnd)
      || disbursements.find((p) => !used.has(p) && (!p.periodEnd || !d.periodEnd) && d.recordDate && days(p.date, d.recordDate) > 0 && days(p.date, d.recordDate) <= PAYOUT_MAX_DAYS);
    if (hit) used.add(hit);
    d.paidOn = hit?.date || null;
  }
}

// DSE trades Sunday to Thursday; public holidays are not known here, so the result is an estimate.
function previousTradingDay(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === FRIDAY || d.getUTCDay() === SATURDAY);
  return d.toISOString().slice(0, 10);
}

function parseAnnouncements(list) {
  const declarations = [], recordDates = [], disbursements = [], directorTrades = [], spotWindows = [];
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
  const taken = new Set(declarations.map((d) => d.recordDate).filter(Boolean));
  for (const d of [...declarations].sort((x, y) => (x.announced || '').localeCompare(y.announced || ''))) {
    if (d.recordDate) continue;
    const rd = recordDates.filter((r) => !taken.has(r) && d.announced && days(r, d.announced) >= 0 && days(r, d.announced) <= RECORD_MATCH_DAYS).sort()[0];
    if (rd) { d.recordDate = rd; taken.add(rd); }
  }
  for (const d of declarations) {
    const spot = d.recordDate && spotWindows.find((w) => w.recordDate === d.recordDate || (!w.recordDate && days(d.recordDate, w.lastCum) > 0 && days(d.recordDate, w.lastCum) <= 7));
    d.lastBuyDate = spot ? spot.lastCum : d.recordDate ? previousTradingDay(d.recordDate) : null;
    d.lastBuyEstimated = !spot;
  }
  matchPayouts(declarations, disbursements);
  declarations.sort((a, b) => (b.announced || '').localeCompare(a.announced || ''));
  return { declarations, recordDates: [...new Set(recordDates)].sort(), disbursements, directorTrades, spotWindows };
}

const addMonths = (isoDate, n) => { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

function dividendStatus(events, now = new Date()) {
  const today = dhakaToday(now);
  const all = (events?.declarations || []).filter((d) => d.announced);
  const decls = all.filter((d) => !d.noDividend);
  const latest = decls[0] || null;
  const upcoming = decls.find((d) => d.recordDate && d.recordDate > today) || null;
  const finals = decls.filter((d) => !d.interim);
  const base = finals[0] || latest;
  let next = base ? addMonths(base.announced, 12) : null;
  while (next && next.slice(0, 7) < today.slice(0, 7)) next = addMonths(next, 12);
  const regular = finals.length >= 2 && Math.abs(days(finals[0].announced, addMonths(finals[1].announced, 12))) <= 45;
  const recordToday = decls.find((d) => d.recordDate === today) || null;
  const canStillBuy = !!upcoming && !!upcoming.lastBuyDate && upcoming.lastBuyDate >= today;
  return { latest, upcoming, recordToday, canStillBuy, nextExpected: next ? next.slice(0, 7) : null, regular, today, skippedLast: !!all[0]?.noDividend };
}

function directorActivity(events, now = new Date()) {
  const since = dhakaToday(new Date(now.getTime() - DIRECTOR_WINDOW_DAYS * DAY_MS));
  const recent = (events?.directorTrades || []).filter((t) => t.date && t.date >= since);
  return { sells: recent.filter((t) => t.side === 'sell'), buys: recent.filter((t) => t.side === 'buy'), windowDays: DIRECTOR_WINDOW_DAYS };
}

module.exports = { parseAnnouncements, dividendStatus, directorActivity, toIso, dhakaToday, previousTradingDay };
