const { dividendStatus, directorActivity } = require('./announcements');

const LIQUID_DAILY_VALUE_BDT = 1_000_000;
const SPONSOR_MIN_PCT = 30;
const SMALL_PAID_UP_BDT = 300_000_000;
const TRADING_DAYS_MONTH = 22;
const TRADING_DAYS_QUARTER = 63;
const PUMP_1M = 30, PUMP_3M = 50, PUMP_1Y = 100;
const PUMP_EPS_GROWTH = 1.1;
const SPIKE_PRICE_MOVE = 5, SPIKE_MONTH_MOVE = 15;
const STRETCHED_PE = 40, STRETCHED_PB = 5;
const SECTOR_PE_CAP = 100;
const YIELD_DECLARATION_DAYS = 450;
const STRONG_FLAGS = new Set(['Price pump', 'Loss-making but rising']);
const PRICE_FLAGS = new Set(['Price pump', 'Loss-making but rising', 'Small company, fast rise', 'Volume spike']);
const INTERIM_MAX_AGE_MONTHS = 15;
const INTERIM_ORDER = [['nine', '9-month'], ['q3', 'Q3'], ['half', '6-month'], ['q2', 'Q2'], ['q1', 'Q1']];

const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const round = (n, d = 1) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const median = (xs) => {
  const s = xs.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Annual results are due within about 6 months of year-end, so before July last year's report may still be pending.
const expectedLatestYear = (now) => now.getFullYear() - (now.getMonth() >= 6 ? 1 : 2);

// Latest interim (quarterly) EPS that DSE reports, e.g. { value: -20.41, label: '9-month' }.
// Ignores interim figures whose period ended more than 15 months ago (DSE sometimes shows an old year).
function latestInterim(c, now = new Date()) {
  const row = c.interim?.eps;
  if (!row) return null;
  const period = Object.values(c.interim.periods || {}).filter((v) => /^\d{6}$/.test(String(v))).sort().at(-1);
  if (period) {
    const ageMonths = (now.getFullYear() - Number(period.slice(0, 4))) * 12 + (now.getMonth() + 1 - Number(period.slice(4)));
    if (ageMonths > INTERIM_MAX_AGE_MONTHS) return null;
  }
  for (const [key, label] of INTERIM_ORDER) if (typeof row[key] === 'number') return { value: row[key], label, period: period || null };
  return null;
}

// Yield from the latest final cash dividend declared in the last ~15 months; else DSE's figure.
function currentYield(c, priceNow, now) {
  const since = new Date(now.getTime() - YIELD_DECLARATION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const latest = (c.events?.declarations || []).find((x) => !x.interim && x.announced >= since);
  if (latest?.noDividend) return { value: 0, basis: `no dividend declared ${latest.announced}` };
  const d = latest && latest.cashPct != null ? latest : null;
  if (d && priceNow > 0) return { value: round(((d.cashPct / 100) * (c.faceValue || 10) / priceNow) * 100, 2), basis: `${d.cashPct}% cash declared ${d.announced}` };
  return { value: c.dividendYield ?? null, basis: 'DSE figure for the last full year' };
}

const MIN_BASE_SHARE = 0.4;
const dateLabel = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'unknown');

// DSE's yearly table lags; a newer final declaration often states the new yearly EPS ("EPS of Tk. 31.24").
function newestAnnouncedYear(c, tableYears) {
  const last = tableYears.at(-1)?.year ?? 0;
  const d = (c.events?.declarations || []).find((x) => !x.interim && x.eps != null && x.periodEnd && Number(x.periodEnd.slice(0, 4)) > last);
  return d ? { year: Number(d.periodEnd.slice(0, 4)), eps: d.eps, pe: null, announced: d.announced } : null;
}

function metrics(c, now = new Date()) {
  const tableYears = c.years.filter((y) => y.eps != null);
  const announced = newestAnnouncedYear(c, tableYears);
  const years = announced ? [...tableYears, announced] : tableYears;
  const last5 = years.slice(-5);
  const epsNow = last5.at(-1)?.eps ?? c.eps;
  const epsPrev = last5.at(-2)?.eps ?? null;
  const s = c.series;
  const closes = s.map((x) => x.price);
  const priceNow = c.price || closes.at(-1) || null;
  const back = (n) => (closes.length > n ? closes[closes.length - 1 - n] : null);
  const values20 = s.slice(-20).map((x) => x.price * x.volume);
  const shares = c.sharePattern.filter((x) => x.sponsor != null);
  const prevVolumes = s.slice(-61, -1).map((x) => x.volume);
  let peak = -Infinity, maxDrawdown = 0;
  for (const p of closes) { peak = Math.max(peak, p); maxDrawdown = Math.min(maxDrawdown, (p - peak) / peak); }
  const usualPe = years.filter((y) => y.pe > 0 && y.eps > 0).slice(-5).map((y) => y.pe);
  const recentDividends = c.dividends.filter((d) => d.year > expectedLatestYear(now) - 5 && ((d.cash || 0) > 0 || (d.stock || 0) > 0)).slice(0, 5);
  // Start growth from a normal year, not from a tiny one-off base (e.g. a COVID year), which inflates the rate.
  const typical = median(last5.map((y) => y.eps));
  const baseIdx = last5.findIndex((y) => y.eps > 0 && y.eps >= MIN_BASE_SHARE * typical);
  const base = baseIdx >= 0 ? last5[baseIdx] : null;
  const span = base ? last5.at(-1).year - base.year : 0;
  const cagr = span > 0 && base.eps > 0 && epsNow > 0 ? (Math.pow(epsNow / base.eps, 1 / span) - 1) * 100 : null;
  const interim = latestInterim(c, now);
  const yld = currentYield(c, priceNow, now);
  const lastDecl = (c.events?.declarations || []).find((d) => !d.interim && d.periodEnd);
  const reportedYear = Math.max(years.at(-1)?.year ?? 0, lastDecl ? Number(lastDecl.periodEnd.slice(0, 4)) : 0) || null;
  return {
    announcedEps: announced, growthFrom: base?.year ?? null,
    interim, interimLoss: interim != null && interim.value < 0,
    latestYield: yld.value, yieldBasis: yld.basis, reportedYear,
    changeToday: c.changePct ?? null,
    epsNow, epsPrev, epsYears: last5,
    epsAllPositive: last5.length >= 4 && last5.every((y) => y.eps > 0),
    epsGrowing: last5.length >= 2 && epsNow > last5[0].eps,
    epsFellTwice: years.length >= 3 && years.at(-1).eps < years.at(-2).eps && years.at(-2).eps < years.at(-3).eps,
    epsCagr: round(cagr),
    pe: priceNow && epsNow > 0 ? priceNow / epsNow : null,
    pb: priceNow && c.nav > 0 ? priceNow / c.nav : null,
    avgPastPe: round(mean(usualPe)),
    change1m: round(pct(priceNow, back(TRADING_DAYS_MONTH))),
    change3m: round(pct(priceNow, back(TRADING_DAYS_QUARTER))),
    change1y: round(pct(priceNow, closes[0])),
    maxDrawdown: round(maxDrawdown * 100),
    avgDailyValue: values20.length ? mean(values20) : null,
    volumeSpike: prevVolumes.length >= 20 && mean(prevVolumes) > 0 ? s.at(-1).volume / mean(prevVolumes) : null,
    sponsorNow: shares.at(-1)?.sponsor ?? null,
    sponsorDrop: shares.length >= 2 ? shares[0].sponsor - shares.at(-1).sponsor : 0,
    sponsorSince: shares[0]?.date ?? null,
    dividendYears: recentDividends.length,
    latestYear: years.at(-1)?.year ?? null,
    priceNow,
  };
}

function fraudFlags(c, m, now) {
  const flags = [];
  const add = (title, detail, why) => flags.push({ title, detail, why });
  if (c.category === 'Z') add('Category Z', 'DSE placed this company in category Z.',
    'Z means the company missed AGMs, paid no dividend, or stopped operating. Many manipulated shares are in Z.');
  const earningsFlat = !(m.epsNow > 0 && m.epsPrev > 0 && m.epsNow >= m.epsPrev * PUMP_EPS_GROWTH);
  const pump = m.change1m > PUMP_1M ? `${m.change1m}% in 1 month` : m.change3m > PUMP_3M ? `${m.change3m}% in 3 months` : m.change1y > PUMP_1Y ? `${m.change1y}% in 1 year` : null;
  if (pump && earningsFlat) add('Price pump', `Price rose ${pump}, but yearly earnings grew less than 10%.`,
    'A big rise with no better results often means a group is pushing the price to sell to new buyers.');
  const priceMoved = Math.abs(m.changeToday ?? 0) >= SPIKE_PRICE_MOVE || Math.abs(m.change1m ?? 0) >= SPIKE_MONTH_MOVE;
  if (m.volumeSpike >= 5 && priceMoved) add('Volume spike', `Latest volume is ${round(m.volumeSpike)}× the 3-month average while the price moved sharply.`,
    'Heavy trading together with a sharp price move, without news, is a common sign of a coordinated game.');
  if (m.sponsorDrop >= 2) add('Sponsors selling', `Sponsor/director holding fell by ${round(m.sponsorDrop)} points since ${m.sponsorSince}.`,
    'Owners sell when they expect the price to fall, or after they have pushed it up.');
  if (c.paidUpCapital && c.paidUpCapital < SMALL_PAID_UP_BDT && m.change3m > 25 && earningsFlat) add('Small company, fast rise',
    `Paid-up capital is only ৳${round(c.paidUpCapital / 1e7)} crore and the price rose ${m.change3m}% in 3 months.`,
    'Small companies need little money to move the price. They are the usual targets of manipulation.');
  if (m.epsPrev != null && ((m.epsPrev <= 0 && m.epsNow > 0) || (m.epsPrev > 0 && m.epsNow > 3 * m.epsPrev))) add('Sudden profit jump',
    `EPS went from ${m.epsPrev} to ${m.epsNow} in one year.`,
    'Real businesses rarely triple profit in a year. Check the annual report for one-time gains.');
  if (m.reportedYear && m.reportedYear < expectedLatestYear(now)) add('Old financials', `The latest yearly result on DSE is for ${m.reportedYear}.`,
    'A company that does not publish results on time may be hiding problems.');
  if (m.epsNow != null && m.epsNow <= 0 && m.change3m > 20) add('Loss-making but rising', `The company makes a loss, yet the price rose ${m.change3m}% in 3 months.`,
    'A share that rises while the company loses money is driven by speculation, not by the business.');
  const dir = directorActivity(c.events, now);
  if (dir.sells.length) add('Directors plan to sell', `${dir.sells.length} sell notice(s) by directors or sponsors in the last ${dir.windowDays} days (latest ${dir.sells[0].date}).`,
    'Insiders know the company best. When they sell, ask why before you buy.');
  // High risk needs category Z, or a strong manipulation sign confirmed by a flag that is not about the same price move.
  const strong = flags.some((f) => STRONG_FLAGS.has(f.title));
  const confirmed = flags.some((f) => !PRICE_FLAGS.has(f.title));
  const level = flags.length === 0 ? 'clean' : (c.category === 'Z' || (strong && confirmed) ? 'high' : 'suspicious');
  return { level, flags };
}

function qualityChecks(c, m, sectorPe) {
  const peLimit = sectorPe ? Math.min(2 * sectorPe, STRETCHED_PE * 2) : STRETCHED_PE;
  const stretched = m.pe == null || m.pe > peLimit || m.pb > STRETCHED_PB;
  return [
    { ok: c.category === 'A', label: 'Category A', detail: `Category ${c.category}`, why: 'A means the company holds AGMs and pays at least 10% dividend.' },
    { ok: m.epsAllPositive && !m.interimLoss, label: 'Profit every year (5 years)', detail: `EPS ৳ ${m.epsYears.map((y) => y.eps).join(' → ')}${m.interim ? ` · latest ${m.interim.label} EPS ৳${m.interim.value}` : ''}`, why: 'A company that never makes a loss, including in its latest quarters, is less risky.' },
    { ok: m.epsGrowing, label: 'Earnings growing', detail: m.epsCagr != null ? `${m.epsCagr}% a year` : 'not enough data', why: 'Your share is worth more when the profit per share grows.' },
    { ok: m.dividendYears >= 3, label: 'Dividend in 3+ of last 5 years', detail: `${m.dividendYears} of the last 5 years`, why: 'A steady dividend shows real cash, not just paper profit.' },
    { ok: m.sponsorNow >= SPONSOR_MIN_PCT, label: `Sponsors hold ${SPONSOR_MIN_PCT}%+`, detail: m.sponsorNow != null ? `${m.sponsorNow}%` : 'unknown', why: `BSEC requires sponsors to hold at least ${SPONSOR_MIN_PCT}% together. Owners with skin in the game.` },
    { ok: !stretched, label: 'Price not stretched', detail: `P/E ${m.pe == null ? '—' : round(m.pe)} (limit ${round(peLimit)}), P/B ${m.pb == null ? '—' : round(m.pb)} (limit ${STRETCHED_PB})`, why: 'Even a great company is a poor buy at a price far above its profits or book value.' },
    { ok: m.avgDailyValue >= LIQUID_DAILY_VALUE_BDT, label: 'Easy to buy and sell', detail: m.avgDailyValue == null ? 'unknown' : `৳${round(m.avgDailyValue / 1e5)} lakh traded a day`, why: 'Thinly traded shares are hard to sell at a fair price.' },
  ];
}

function history(c, m) {
  const notes = [];
  if (m.announcedEps) notes.push(`The ${m.announcedEps.year} result, announced ${dateLabel(m.announcedEps.announced)}, gives EPS ৳${m.announcedEps.eps}. DSE's yearly table does not show it yet, so this site uses the announcement.`);
  if (m.epsCagr != null && m.epsCagr > 0) notes.push(m.epsCagr >= 10 ? `Earnings grew ${m.epsCagr}% a year since ${m.growthFrom}. That is strong.`
    : `Earnings grew ${m.epsCagr}% a year since ${m.growthFrom}. That is slow but positive.`);
  if (m.pe && m.avgPastPe) {
    const d = pct(m.pe, m.avgPastPe);
    notes.push(d < -15 ? `P/E is ${round(m.pe)} now against a usual ${m.avgPastPe}. The share is cheaper than its own history.`
      : d > 15 ? `P/E is ${round(m.pe)} now against a usual ${m.avgPastPe}. The share is more expensive than usual.`
      : `P/E is ${round(m.pe)}, close to its usual ${m.avgPastPe}.`);
  }
  if (m.change1y != null) notes.push(`The price moved ${m.change1y > 0 ? '+' : ''}${m.change1y}% in the last year. The deepest fall in that time was ${m.maxDrawdown}%.`);
  if (c.weekHigh52 && c.weekLow52 != null && m.priceNow) {
    const pos = (m.priceNow - c.weekLow52) / (c.weekHigh52 - c.weekLow52 || 1);
    notes.push(pos < LOW_ZONE ? 'The price is near its 52-week low.' : pos > HIGH_ZONE ? 'The price is near its 52-week high. Avoid chasing it.' : 'The price is in the middle of its 52-week range.');
  }
  return notes;
}

function suggestion(signal, m, c) {
  if (signal === 'avoid') return 'High risk. Not a candidate to buy now. If you hold it, review why.';
  if (signal === 'caution') return 'Wait. Read the latest disclosures and quarterly results first.';
  if (signal === 'research') {
    const nearHigh = c.weekHigh52 && c.weekLow52 != null && m.priceNow && (m.priceNow - c.weekLow52) / (c.weekHigh52 - c.weekLow52 || 1) > HIGH_ZONE;
    if (nearHigh) return 'Good business, but the price is near its 52-week high. Research it and wait for a calmer price.';
    const cheap = m.pe && m.avgPastPe && m.pe < m.avgPastPe;
    return cheap ? 'Good business, and cheaper than its usual P/E. Worth researching now.'
      : 'Good business at a normal or higher P/E than usual. Research it before deciding.';
  }
  return 'No strong signal. Research more before you decide.';
}

const SCORE_BANDS = { avoid: [0, 30], caution: [31, 60], neutral: [61, 75], research: [76, 100] };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// 0..1 rank inside a signal band: checks passed, earnings growth, cheapness vs sector and own past, dividend yield.
function strength(checks, m, sectorPe, dividendYield) {
  const passed = checks.filter((x) => x.ok).length / checks.length;
  const growth = clamp01((m.epsCagr ?? 0) / 20);
  const vsSector = m.pe && sectorPe ? clamp01(1 - m.pe / (2 * sectorPe)) : 0;
  const vsOwn = m.pe && m.avgPastPe ? clamp01(1 - m.pe / (2 * m.avgPastPe)) : 0;
  const yieldPart = clamp01((dividendYield ?? 0) / 8);
  return 0.4 * passed + 0.2 * growth + 0.15 * vsSector + 0.1 * vsOwn + 0.15 * yieldPart;
}

function analyze(c, sectorPe, now = new Date()) {
  const m = metrics(c, now);
  const fraud = fraudFlags(c, m, now);
  const checks = qualityChecks(c, m, sectorPe);
  checks.push({ ok: fraud.level === 'clean', label: 'No fraud warning', detail: `${fraud.flags.length} flag(s)`, why: 'Any red flag removes a company from the shortlist.' });
  const reasons = [];
  const add = (tone, text) => reasons.push({ tone, text });
  if (m.epsNow != null && m.epsNow <= 0) add('bad', `The company made a loss (EPS ${m.epsNow}).`);
  if (m.epsFellTwice) add('warn', 'Earnings fell two years in a row.');
  if (m.interimLoss) add('bad', `Latest ${m.interim.label} result is a loss (EPS ৳${m.interim.value}).`);
  if (m.epsCagr != null && m.epsCagr < 0) add('warn', `Earnings shrank ${Math.abs(m.epsCagr)}% a year.`);
  if (m.pe && sectorPe) add(m.pe > 2 * sectorPe ? 'warn' : m.pe <= sectorPe ? 'good' : 'neutral',
    `P/E ${round(m.pe)} against the ${c.sector} sector median of ${round(sectorPe)}.`);
  if (m.pb > 5) add('warn', `Price is ${round(m.pb)}× book value. That is expensive.`);
  if (m.avgDailyValue != null && m.avgDailyValue < LIQUID_DAILY_VALUE_BDT) add('warn', 'Few shares trade each day. It may be hard to sell.');
  const buys = directorActivity(c.events, now).buys;
  if (buys.length) add('good', `Directors announced ${buys.length} share purchase(s) in the last 6 months. Insiders are buying.`);
  checks.filter((x) => x.ok && x.label !== 'No fraud warning').forEach((x) => add('good', x.detail === x.label ? `${x.label}.` : `${x.label}: ${x.detail}.`));

  const quality = checks.every((x) => x.ok);
  const bad = fraud.level === 'high' || (m.epsNow != null && m.epsNow <= 0);
  const warn = fraud.level === 'suspicious' || m.epsFellTwice || m.interimLoss || (m.epsCagr != null && m.epsCagr < 0)
    || (m.pe && sectorPe && m.pe > 2 * sectorPe) || m.pb > STRETCHED_PB || (m.avgDailyValue != null && m.avgDailyValue < LIQUID_DAILY_VALUE_BDT);
  const signal = bad ? 'avoid' : quality ? 'research' : warn ? 'caution' : 'neutral';

  const [lo, hi] = SCORE_BANDS[signal];
  const score = Math.round(lo + (hi - lo) * strength(checks, m, sectorPe, m.latestYield));

  return {
    signal, score, quality, fraud, checks, reasons,
    history: history(c, m),
    suggestion: suggestion(signal, m, c),
    metrics: { ...m, pe: round(m.pe, 2), pb: round(m.pb, 2), avgDailyValue: round(m.avgDailyValue, 0), volumeSpike: round(m.volumeSpike), epsYears: undefined },
  };
}

const SUMMARY_YEARS = 5;
const DEFAULT_FACE_VALUE = 10;

// Per-year figures derived from DSE data only: DSE publishes no revenue, cash flow or balance-sheet lines.
function fiveYearSummary(c) {
  const face = c.faceValue || DEFAULT_FACE_VALUE;
  const divByYear = Object.fromEntries((c.dividends || []).map((d) => [d.year, d]));
  const years = c.years.slice(-SUMMARY_YEARS).map((y) => {
    const d = divByYear[y.year] || {};
    const dps = d.cash != null ? (d.cash / 100) * face : null;
    return {
      year: y.year,
      profit: y.profit,
      eps: y.eps,
      nav: y.nav,
      roe: y.eps != null && y.nav > 0 ? round((y.eps / y.nav) * 100) : null,
      pe: y.pe > 0 ? round(y.pe) : null,
      pb: y.pe > 0 && y.eps > 0 && y.nav > 0 ? round((y.pe * y.eps) / y.nav, 2) : null,
      dps: round(dps, 2),
      stockPct: d.stock || 0,
      payout: dps != null && y.eps > 0 ? round((dps / y.eps) * 100) : null,
      dividendYield: d.yieldPct ?? null,
    };
  });
  const growth = (key) => {
    const first = years.find((y) => y[key] != null), last = [...years].reverse().find((y) => y[key] != null);
    const span = first && last ? last.year - first.year : 0;
    return span > 0 && first[key] > 0 && last[key] > 0 ? round((Math.pow(last[key] / first[key], 1 / span) - 1) * 100) : null;
  };
  const avg = (key) => round(mean(years.map((y) => y[key]).filter((v) => v != null && isFinite(v))));
  return {
    years,
    growth: { profit: growth('profit'), eps: growth('eps'), nav: growth('nav'), dps: growth('dps') },
    average: { roe: avg('roe'), payout: avg('payout'), pe: avg('pe'), dividendYield: avg('dividendYield') },
    span: years.length ? years.at(-1).year - years[0].year : 0,
  };
}

const LOW_ZONE = 0.25;
const HIGH_ZONE = 0.75;
const VALUATION = {
  value: { label: 'Possible value', tone: 'good', text: 'Cheap against its own 5-year history while earnings still grow. Worth researching further.' },
  trap: { label: 'Cheap for a reason', tone: 'bad', text: 'Cheap against its history, but earnings are falling. A low price can keep falling. Be careful.' },
  expensive: { label: 'Priced high', tone: 'warn', text: 'Expensive against its own history, though earnings grow. Good business, but wait for a better price.' },
  risky: { label: 'Expensive and weakening', tone: 'bad', text: 'Expensive against its history while earnings fall. High risk at this price.' },
  fair: { label: 'Fairly priced', tone: 'neutral', text: 'In the middle of its usual range. Price alone gives no strong reason to buy or wait.' },
};

const band = (values, now) => {
  const xs = values.filter((v) => v != null && isFinite(v) && v > 0);
  if (!xs.length || now == null) return null;
  const low = Math.min(...xs, now), high = Math.max(...xs, now);
  return { low: round(low, 2), high: round(high, 2), avg: round(mean(xs), 2), now: round(now, 2), position: high > low ? round((now - low) / (high - low), 2) : 0.5 };
};

// Year-end price is approximated as that year's P/E × EPS; DSE gives no long daily history.
function pricePosition(c, m) {
  const years = c.years.filter((y) => y.pe > 0 && y.eps > 0).slice(-SUMMARY_YEARS);
  const yearEnd = years.map((y) => ({ year: y.year, pe: y.pe, price: round(y.pe * y.eps, 2) }));
  const daily = (c.series || []).map((s) => s.price);
  const priceBand = band(yearEnd.map((y) => y.price), m.priceNow);
  const price = priceBand && daily.length
    ? { ...priceBand, low: round(Math.min(priceBand.low, ...daily), 2), high: round(Math.max(priceBand.high, ...daily), 2) } : priceBand;
  if (price) price.position = price.high > price.low ? round((price.now - price.low) / (price.high - price.low), 2) : 0.5;
  const pe = band(yearEnd.map((y) => y.pe), m.pe);
  const zone = pe ? (pe.position <= LOW_ZONE ? 'low' : pe.position >= HIGH_ZONE ? 'high' : 'middle') : null;
  const growing = m.epsNow > 0 && m.epsPrev != null && m.epsNow >= m.epsPrev;
  const verdict = !zone ? null : zone === 'middle' ? 'fair' : zone === 'low' ? (growing ? 'value' : 'trap') : (growing ? 'expensive' : 'risky');

  const history = yearEnd.slice(0, -1).map((y, i) => ({ year: y.year, pe: round(y.pe, 1), price: y.price, nextPrice: yearEnd[i + 1].price,
    change: round(pct(yearEnd[i + 1].price, y.price)) }));
  const usualPe = pe ? pe.avg : null;
  const cheapYears = usualPe == null ? [] : history.filter((h) => h.pe <= usualPe);
  return {
    price, pe, zone, verdict: verdict && { key: verdict, ...VALUATION[verdict] }, history,
    cheapYears: cheapYears.length, cheapYearsUp: cheapYears.filter((h) => h.change > 0).length, usualPe: round(usualPe, 1),
  };
}

const monthLabel = (ym) => (ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'unknown');
const ANSWER = { yes: 'yes', partly: 'partly', no: 'no', unknown: 'unknown' };

// Plain-language answers to the four questions a beginner asks before buying.
function fourQuestions(c, a, position, dividend) {
  const passed = a.checks.filter((x) => x.ok && x.label !== 'No fraud warning').length;
  const total = a.checks.length - 1;
  const solid = a.metrics.epsAllPositive && !a.metrics.interimLoss;
  const growing = a.metrics.epsCagr != null && a.metrics.epsCagr > 0;
  const good = { q: 'Is it a good business?', answer: solid && growing && passed >= total - 2 ? ANSWER.yes : solid ? ANSWER.partly : ANSWER.no,
    text: `Passes ${passed} of ${total} quality checks.${a.metrics.epsCagr != null ? ` Earnings ${a.metrics.epsCagr >= 0 ? 'grow' : 'shrink'} ${Math.abs(a.metrics.epsCagr)}% a year.` : ''}`, tab: 'safety' };
  const v = position?.verdict;
  const cheap = { q: 'Is it cheap now?', answer: !v ? ANSWER.unknown : v.key === 'value' ? ANSWER.yes : v.key === 'fair' ? ANSWER.partly : ANSWER.no,
    text: v ? `${v.label}. P/E ${a.metrics.pe ?? '—'} against its usual ${position.pe?.avg ?? '—'}.` : 'Not enough price history.', tab: 'valuation' };
  const safe = { q: 'Any fraud warning signs?', answer: a.fraud.level === 'clean' ? ANSWER.yes : a.fraud.level === 'suspicious' ? ANSWER.partly : ANSWER.no,
    label: a.fraud.level === 'clean' ? 'None found' : a.fraud.level === 'suspicious' ? 'Some' : 'Serious',
    text: a.fraud.flags.length ? a.fraud.flags.map((f) => f.title).join(', ') + '.' : 'No warning pattern found.', tab: 'safety' };
  const d = dividend;
  const lastBuy = (x) => `${dateLabel(x.lastBuyDate)}${x.lastBuyEstimated ? ' (estimate)' : ''}`;
  const pay = d?.upcoming && d.canStillBuy ? { answer: ANSWER.yes, label: d.upcoming.lastBuyEstimated ? 'Yes, soon (date estimated)' : 'Yes, soon', text: `Board recommended ${d.upcoming.cashPct ?? '?'}% cash. Last day to buy: ${lastBuy(d.upcoming)}. Record date ${dateLabel(d.upcoming.recordDate)}. Needs AGM approval.` }
    : d?.upcoming ? { answer: ANSWER.no, label: 'Too late', text: `${d.upcoming.cashPct ?? '?'}% cash, but the last day to buy (${lastBuy(d.upcoming)}) has passed. Next expected around ${monthLabel(d.nextExpected)}.` }
    : d?.recordToday ? { answer: ANSWER.no, label: 'Too late', text: `Today (${dateLabel(d.recordToday.recordDate)}) is the record date. Next expected around ${monthLabel(d.nextExpected)}.` }
    : d?.latest ? { answer: ANSWER.no, label: 'Not soon', text: `Last: ${d.latest.cashPct ?? '?'}% ${d.latest.interim ? 'interim ' : ''}cash, record date ${dateLabel(d.latest.recordDate)}. Next expected around ${monthLabel(d.nextExpected)}.` }
    : { answer: ANSWER.no, label: 'No', text: 'No recent dividend announcement on DSE.' };
  return [good, cheap, safe, { q: 'Is a dividend coming?', tab: 'dividends', ...pay }];
}

function sectorMedians(companies) {
  const bySector = {};
  for (const c of companies) {
    const eps = c.years.at(-1)?.eps ?? c.eps;
    const pe = c.price && eps > 0 ? c.price / eps : null;
    if (pe && pe < SECTOR_PE_CAP && c.category !== 'Z') (bySector[c.sector] ||= []).push(pe);
  }
  return Object.fromEntries(Object.entries(bySector).map(([s, xs]) => [s, median(xs)]));
}

module.exports = { analyze, sectorMedians, metrics, median, fiveYearSummary, pricePosition, fourQuestions, dividendStatus };
