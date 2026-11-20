import { directorActivity, isEmptyDeclaration } from './announcements.ts';
import { DHAKA_OFFSET_MS, dhakaToday } from './dhaka.ts';
import { cagr, pbAtYearEnd, payoutPct, roePct } from './financial-trends.ts';
import type { Company, Declaration, Metrics, Analysis, Check, FraudFlag, Reason, Summary, SummaryYear, PricePosition, PriceBand, PriceHistoryPoint, DividendStatus, Question } from './types.ts';

export { dividendStatus } from './announcements.ts';

const LIQUID_DAILY_VALUE_BDT = 1_000_000;
const toDhaka = (d: Date): Date => new Date(d.getTime() + DHAKA_OFFSET_MS);
const SPONSOR_MIN_PCT = 30;
const SMALL_PAID_UP_BDT = 300_000_000;
const TRADING_DAYS_MONTH = 22;
const TRADING_DAYS_QUARTER = 63;
const TRADING_DAYS_YEAR = 240;
const PUMP_1M = 30, PUMP_3M = 50, PUMP_1Y = 100;
const PUMP_EPS_GROWTH = 1.1;
const JUMP_MIN_EPS = 0.5;
const STRONG_GROWTH_PCT = 15;
const OWN_PE_STRETCH = 1.5;
const RUN_UP_1Y = 100;
const SPIKE_PRICE_MOVE = 5, SPIKE_MONTH_MOVE = 15;
const STRETCHED_PE = 40, STRETCHED_PB = 5;
const YIELD_WINDOW_DAYS = 365;
const STRONG_FLAGS = new Set(['Price pump', 'Loss-making but rising']);
const PRICE_FLAGS = new Set(['Price pump', 'Loss-making but rising', 'Small company, fast rise', 'Volume spike']);
const INTERIM_MAX_AGE_MONTHS = 15;
const INTERIM_ORDER: Array<[string, string]> = [['nine', '9-month'], ['q3', 'Q3'], ['half', '6-month'], ['q2', 'Q2'], ['q1', 'Q1']];

const pct = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a != null && b ? ((a - b) / Math.abs(b)) * 100 : null;
const round = (n: number | null | undefined, d = 1): number | null =>
  n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;
export const median = (xs: (number | null | undefined)[]): number | null => {
  const s = xs.filter((x): x is number => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const expectedLatestYear = (now: Date): number => { const d = toDhaka(now); return d.getUTCFullYear() - (d.getUTCMonth() >= 6 ? 1 : 2); };

function pickedInterimPeriod(interim: NonNullable<Company['interim']>): string | null {
  const row = interim.eps;
  if (!row) return null;
  for (const [key] of INTERIM_ORDER) {
    if (typeof (row as Record<string, unknown>)[key] === 'number') {
      const p = (interim.periods as Record<string, unknown> | undefined)?.[key];
      return typeof p === 'string' && /^\d{6}$/.test(p) ? p : null;
    }
  }
  return null;
}

// Interim figures older than INTERIM_MAX_AGE_MONTHS belong to a finished year and must not be read as current.
export function interimIsFresh(interim: Company['interim'], now = new Date()): boolean {
  if (!interim) return false;
  const period = pickedInterimPeriod(interim);
  if (!period) return false;
  const d = toDhaka(now);
  return (d.getUTCFullYear() - Number(period.slice(0, 4))) * 12 + (d.getUTCMonth() + 1 - Number(period.slice(4))) <= INTERIM_MAX_AGE_MONTHS;
}

function latestInterim(c: Company, now = new Date()): { value: number; label: string; period: string | null } | null {
  if (!c.interim) return null;
  const row = c.interim.eps;
  if (!row) return null;
  if (!interimIsFresh(c.interim, now)) return null;
  for (const [key, label] of INTERIM_ORDER) {
    const val = (row as Record<string, unknown>)[key];
    if (typeof val === 'number') return { value: val, label, period: pickedInterimPeriod(c.interim) };
  }
  return null;
}

const monthYear = (iso: string | null | undefined): string =>
  iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', '-') : '?';
const money = (n: number): string => `৳${round(n, 2)!.toFixed(n < 1 ? 2 : 1)}`;

// One yield everywhere: cash per share declared in the last 12 months (the newest final plus any interims) ÷ today's price.
export function currentYield(c: Company, priceNow: number | null, now: Date): { value: number | null; basis: string; cash: number | null } {
  const since = dhakaToday(new Date(now.getTime() - YIELD_WINDOW_DAYS * 86_400_000));
  const known = (c.events?.declarations || []).filter((d) => !isEmptyDeclaration(d));
  const recent = known.filter((d) => (d.announced || d.recordDate || '') >= since)
    .sort((a, b) => (b.announced || '').localeCompare(a.announced || ''));
  const interims = recent.filter((d, i) => d.interim && recent.findIndex((x) => x.interim && x.cashPct === d.cashPct && x.recordDate === d.recordDate) === i);
  const final = recent.find((d) => !d.interim);
  const parts = [...interims, ...(final ? [final] : [])].sort((a, b) => (b.announced || '').localeCompare(a.announced || ''));
  if (!parts.length) return known.length ? { value: 0, basis: 'No dividend declared in the last 12 months', cash: 0 } : { value: null, basis: 'No dividend announcement found on DSE', cash: null };
  const face = c.faceValue || 10;
  const cashOf = (d: Declaration): number => ((d.cashPct ?? 0) / 100) * face;
  const cash = parts.reduce((sum, d) => sum + cashOf(d), 0);
  const partText = (d: Declaration): string => {
    const when = `${monthYear(d.announced)} ${d.interim ? 'interim' : 'final'}`;
    if (cashOf(d) > 0) return `${money(cashOf(d))} ${when}`;
    return d.noDividend ? `no dividend ${when}` : `bonus shares only ${when}`;
  };
  const basis = `${cash > 0 ? `${money(cash)} cash` : 'No cash'} in last 12 months: ${parts.map(partText).join(' + ')}`;
  if (priceNow == null || priceNow <= 0) return { value: null, basis, cash };
  return { value: round((cash / priceNow) * 100, 2), basis: `${basis} ÷ ৳${round(priceNow, 2)}`, cash };
}

const MIN_BASE_SHARE = 0.4;
const dateLabel = (iso: string | null | undefined): string =>
  iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'unknown';

function newestAnnouncedYear(c: Company, tableYears: Array<{ year?: number | null; eps?: number | null }>): { year: number; eps: number; pe: null; announced: string } | null {
  const last = tableYears.at(-1)?.year ?? 0;
  const d = (c.events?.declarations || []).find((x) => !x.interim && x.eps != null && x.periodEnd && Number(x.periodEnd.slice(0, 4)) > (last ?? 0));
  return d ? { year: Number(d.periodEnd!.slice(0, 4)), eps: d.eps!, pe: null, announced: d.announced! } : null;
}

export function metrics(c: Company, now = new Date()): Metrics {
  const tableYears = c.years.filter((y) => y.eps != null);
  const announced = newestAnnouncedYear(c, tableYears);
  const years = announced ? [...tableYears, announced] : tableYears;
  const last5 = years.slice(-5);
  // DSE shows EPS 0 when a company publishes none (life insurers); that is missing data, not a loss.
  const epsNow = last5.at(-1)?.eps ?? (c.eps || null);
  const epsPrev = last5.at(-2)?.eps ?? null;
  const s = c.series;
  const closes = s.map((x) => x.price);
  const priceNow = c.price || closes.at(-1) || null;
  const back = (n: number): number | null => (closes.length > n ? closes[closes.length - 1 - n] : null);
  const values20 = s.slice(-20).map((x) => x.price * x.volume);
  const shares = c.sharePattern.filter((x) => x.sponsor != null);
  const prevVolumes = s.slice(-61, -1).map((x) => x.volume);
  let peak = -Infinity, maxDrawdown = 0;
  for (const p of closes) { peak = Math.max(peak, p); maxDrawdown = Math.min(maxDrawdown, (p - peak) / peak); }
  const usualPe = years.filter((y) => (y.pe ?? 0) > 0 && (y.eps ?? 0) > 0).slice(-5).map((y) => y.pe as number);
  const recentDividends = c.dividends.filter((d) => (d.year ?? 0) > expectedLatestYear(now) - 5 && (((d.cash ?? 0) > 0) || ((d.stock ?? 0) > 0))).slice(0, 5);
  const typical = median(last5.map((y) => y.eps ?? null));
  const baseIdx = last5.findIndex((y) => (y.eps ?? 0) > 0 && (y.eps ?? 0) >= MIN_BASE_SHARE * (typical ?? 0));
  const base = baseIdx >= 0 ? last5[baseIdx] : null;
  const span = base ? (last5.at(-1)?.year ?? 0) - (base.year ?? 0) : 0;
  const cagr = span > 0 && (base?.eps ?? 0) > 0 && (epsNow ?? 0) > 0 ? (Math.pow(epsNow! / base!.eps!, 1 / span) - 1) * 100 : null;
  const interim = latestInterim(c, now);
  const yld = currentYield(c, priceNow, now);
  const lastDecl = (c.events?.declarations || []).find((d) => !d.interim && d.periodEnd);
  const reportedYear = Math.max(years.at(-1)?.year ?? 0, lastDecl ? Number(lastDecl.periodEnd!.slice(0, 4)) : 0) || null;
  return {
    announcedEps: announced,
    growthFrom: base?.year ?? null,
    interim, interimLoss: interim != null && interim.value < 0,
    latestYield: yld.value, yieldBasis: yld.basis, reportedYear,
    changeToday: c.changePct ?? null,
    epsNow, epsPrev, epsYears: last5,
    epsAllPositive: last5.length >= 4 && last5.every((y) => (y.eps ?? 0) > 0),
    epsGrowing: last5.length >= 2 && (epsNow ?? -Infinity) > (last5[0].eps ?? -Infinity),
    epsFellTwice: years.length >= 3 && (years.at(-1)?.eps ?? 0) < (years.at(-2)?.eps ?? 0) && (years.at(-2)?.eps ?? 0) < (years.at(-3)?.eps ?? 0),
    epsCagr: round(cagr),
    pe: priceNow && (epsNow ?? 0) > 0 ? priceNow / epsNow! : null,
    pb: priceNow && (c.nav ?? 0) > 0 ? priceNow / c.nav! : null,
    avgPastPe: round(mean(usualPe)),
    change1m: round(pct(priceNow, back(TRADING_DAYS_MONTH))),
    change3m: round(pct(priceNow, back(TRADING_DAYS_QUARTER))),
    // A shorter series (new listing, partial history) would make a short move look like a 1-year one.
    change1y: closes.length >= TRADING_DAYS_YEAR ? round(pct(priceNow, closes[0])) : null,
    maxDrawdown: round(maxDrawdown * 100),
    avgDailyValue: values20.length ? mean(values20) : null,
    volumeSpike: prevVolumes.length >= 20 && mean(prevVolumes)! > 0 ? (s.at(-1)?.volume ?? 0) / mean(prevVolumes)! : null,
    sponsorNow: shares.at(-1)?.sponsor ?? null,
    sponsorDrop: shares.length >= 2 ? (shares[0].sponsor ?? 0) - (shares.at(-1)!.sponsor ?? 0) : 0,
    sponsorSince: shares[0]?.date ?? null,
    dividendYears: recentDividends.length,
    latestYear: years.at(-1)?.year ?? null,
    priceNow,
  };
}

function fraudFlags(c: Company, m: Metrics, now: Date): { level: 'clean' | 'suspicious' | 'high'; flags: FraudFlag[] } {
  const flags: FraudFlag[] = [];
  const add = (title: string, detail: string, why: string) => flags.push({ title, detail, why });
  if (c.category === 'Z') add('Category Z', 'DSE placed this company in category Z.',
    'Z means the company missed AGMs, paid no dividend, or stopped operating. Many manipulated shares are in Z.');
  const earningsFlat = !((m.epsNow ?? 0) > 0 && (m.epsPrev ?? 0) > 0 && (m.epsNow ?? 0) >= (m.epsPrev ?? 0) * PUMP_EPS_GROWTH);
  const epsGrowth = (m.epsNow ?? 0) > 0 && (m.epsPrev ?? 0) > 0 ? m.epsNow! / m.epsPrev! - 1 : 0;
  // A rise is a pump when the P/E itself expands past the limit, i.e. the price outruns the earnings.
  const peRise = (change: number): number => ((1 + change / 100) / (1 + epsGrowth) - 1) * 100;
  const windows: Array<[number | null, number, string]> = [[m.change1m, PUMP_1M, '1 month'], [m.change3m, PUMP_3M, '3 months'], [m.change1y, PUMP_1Y, '1 year']];
  const pump = windows.find(([change, limit]) => change != null && change > limit && peRise(change) > limit);
  if (pump) add('Price pump', epsGrowth
    ? `Price rose ${pump[0]}% in ${pump[2]} while yearly earnings changed ${round(epsGrowth * 100)}%, so the P/E rose ${round(peRise(pump[0]!))}%.`
    : `Price rose ${pump[0]}% in ${pump[2]} with no earnings growth behind it.`,
  'A big rise with no better results often means a group is pushing the price to sell to new buyers.');
  const priceMoved = Math.abs(m.changeToday ?? 0) >= SPIKE_PRICE_MOVE || Math.abs(m.change1m ?? 0) >= SPIKE_MONTH_MOVE;
  if ((m.volumeSpike ?? 0) >= 5 && priceMoved) add('Volume spike', `Latest volume is ${round(m.volumeSpike)}× the 3-month average while the price moved sharply.`,
    'Heavy trading together with a sharp price move, without news, is a common sign of a coordinated game.');
  if ((m.sponsorDrop ?? 0) >= 2) add('Sponsors selling', `Sponsor/director holding fell by ${round(m.sponsorDrop)} points since ${m.sponsorSince}.`,
    'Owners sell when they expect the price to fall, or after they have pushed it up.');
  if (c.paidUpCapital && c.paidUpCapital < SMALL_PAID_UP_BDT && (m.change3m ?? 0) > 25 && earningsFlat) add('Small company, fast rise',
    `Paid-up capital is only ৳${round(c.paidUpCapital / 1e7)} crore and the price rose ${m.change3m}% in 3 months.`,
    'Small companies need little money to move the price. They are the usual targets of manipulation.');
  if (m.epsPrev != null && (m.epsNow ?? 0) >= JUMP_MIN_EPS && (m.epsPrev <= 0 || (m.epsNow ?? 0) > 3 * m.epsPrev)) add('Sudden profit jump',
    `EPS went from ${m.epsPrev} to ${m.epsNow} in one year.`,
    'Real businesses rarely triple profit in a year. Check the annual report for one-time gains.');
  if (m.reportedYear && m.reportedYear < expectedLatestYear(now)) add('Old financials', `The latest yearly result on DSE is for ${m.reportedYear}.`,
    'A company that does not publish results on time may be hiding problems.');
  const epsLatest = m.interim?.value ?? m.epsNow;
  if (epsLatest != null && epsLatest <= 0 && (m.change3m ?? 0) > 20) add('Loss-making but rising', `The company makes a loss, yet the price rose ${m.change3m}% in 3 months.`,
    'A share that rises while the company loses money is driven by speculation, not by the business.');
  const dir = directorActivity(c.events, now);
  if (dir.sells.length) add('Directors plan to sell', `${dir.sells.length} sell notice(s) by directors or sponsors in the last ${dir.windowDays} days (latest ${dir.sells[0].date}).`,
    'Insiders know the company best. When they sell, ask why before you buy.');
  const strong = flags.some((f) => STRONG_FLAGS.has(f.title));
  const confirmed = flags.some((f) => !PRICE_FLAGS.has(f.title));
  const level: 'clean' | 'suspicious' | 'high' = flags.length === 0 ? 'clean' : (c.category === 'Z' || (strong && confirmed) ? 'high' : 'suspicious');
  return { level, flags };
}

function qualityChecks(c: Company, m: Metrics, zone: PricePosition['zone']): Check[] {
  const peLimit = m.avgPastPe ? Math.min(OWN_PE_STRETCH * m.avgPastPe, STRETCHED_PE) : STRETCHED_PE;
  const stretched = m.pe == null || m.pe > peLimit || (m.pb ?? 0) > STRETCHED_PB;
  const ranUp = (m.change1y ?? 0) >= RUN_UP_1Y;
  return [
    { ok: c.category === 'A', label: 'Category A', detail: `Category ${c.category}`, why: 'A means the company holds AGMs and pays at least 10% dividend.' },
    { ok: m.epsAllPositive && !m.interimLoss, label: 'Profit every year (5 years)', detail: `EPS ৳ ${(m.epsYears ?? []).map((y) => y.eps).join(' → ')}${m.interim ? ` · latest ${m.interim.label} EPS ৳${m.interim.value}` : ''}`, why: 'A company that never makes a loss, including in its latest quarters, is less risky.' },
    { ok: m.epsGrowing, label: 'Earnings growing', detail: m.epsCagr != null ? `${m.epsCagr}% a year` : 'not enough data', why: 'Your share is worth more when the profit per share grows.' },
    { ok: (m.dividendYears ?? 0) >= 3, label: 'Dividend in 3+ of last 5 years', detail: `${m.dividendYears} of the last 5 years`, why: 'A steady dividend shows real cash, not just paper profit.' },
    { ok: (m.sponsorNow ?? 0) >= SPONSOR_MIN_PCT, label: `Sponsors hold ${SPONSOR_MIN_PCT}%+`, detail: m.sponsorNow != null ? `${m.sponsorNow}%` : 'unknown', why: `BSEC requires sponsors to hold at least ${SPONSOR_MIN_PCT}% together. Owners with skin in the game.` },
    { ok: !stretched && !ranUp && zone !== 'high', label: 'Price not stretched',
      detail: `P/E ${m.pe == null ? '—' : round(m.pe)} (limit ${round(peLimit)}), P/B ${m.pb == null ? '—' : round(m.pb)} (limit ${STRETCHED_PB})${zone === 'high' ? ', P/E high in its 5-year range' : ''}${ranUp ? `, price up ${m.change1y}% in a year` : ''}`,
      why: 'Even a great company is a poor buy at a price far above its own usual P/E, its book value, or after it has doubled in a year.' },
    { ok: (m.avgDailyValue ?? 0) >= LIQUID_DAILY_VALUE_BDT, label: 'Easy to buy and sell', detail: m.avgDailyValue == null ? 'unknown' : `৳${round(m.avgDailyValue / 1e7, m.avgDailyValue >= 1e7 ? 1 : 2)} cr traded a day`, why: 'Thinly traded shares are hard to sell at a fair price.' },
  ];
}

function history(c: Company, m: Metrics): string[] {
  const notes: string[] = [];
  if (m.announcedEps) notes.push(`The ${m.announcedEps.year} result, announced ${dateLabel(m.announcedEps.announced)}, gives EPS ৳${m.announcedEps.eps}. DSE's yearly table does not show it yet, so this site uses the announcement.`);
  if (m.epsCagr != null && m.epsCagr > 0) notes.push(m.epsCagr >= STRONG_GROWTH_PCT ? `Earnings grew ${m.epsCagr}% a year since ${m.growthFrom}. That is strong.`
    : `Earnings grew ${m.epsCagr}% a year since ${m.growthFrom}. That is slow but positive.`);
  if (m.pe && m.avgPastPe) {
    const d = pct(m.pe, m.avgPastPe);
    notes.push((d ?? 0) < -15 ? `P/E is ${round(m.pe)} now against a usual ${m.avgPastPe}. The share is cheaper than its own history.`
      : (d ?? 0) > 15 ? `P/E is ${round(m.pe)} now against a usual ${m.avgPastPe}. The share is more expensive than usual.`
      : `P/E is ${round(m.pe)}, close to its usual ${m.avgPastPe}.`);
  }
  if (m.change1y != null) notes.push(`The price moved ${m.change1y > 0 ? '+' : ''}${m.change1y}% in the last year. The deepest fall in that time was ${m.maxDrawdown}%.`);
  if (c.weekHigh52 && c.weekLow52 != null && m.priceNow) {
    const pos = (m.priceNow - c.weekLow52) / (c.weekHigh52 - c.weekLow52 || 1);
    notes.push(pos < LOW_ZONE ? 'The price is near its 52-week low.' : pos > HIGH_ZONE ? 'The price is near its 52-week high. Avoid chasing it.' : 'The price is in the middle of its 52-week range.');
  }
  return notes;
}

const HOLDER: Record<Analysis['signal'], string> = {
  avoid: 'If you own it: review why you hold it before the next results.',
  caution: 'If you own it: hold for now, read the disclosures, and re-check after the next results.',
  neutral: 'If you own it: hold and re-check after the next results.',
  research: 'If you own it: hold and re-check after the next results.',
};

function buyLine(signal: Analysis['signal'], m: Metrics, c: Company): string {
  if (signal === 'avoid') return 'High risk. Not a candidate to buy now.';
  if (signal === 'caution') return 'Wait. Read the latest disclosures and quarterly results first.';
  if (signal === 'neutral') return m.epsNow == null ? `${NOT_RATED}, so the profit checks cannot run. Judge it on its dividends and reports.` : 'No strong signal. Research more before you decide.';
  const nearHigh = c.weekHigh52 && c.weekLow52 != null && m.priceNow && (m.priceNow - c.weekLow52) / (c.weekHigh52 - c.weekLow52 || 1) > HIGH_ZONE;
  if (nearHigh) return 'Good business, but the price is near its 52-week high. Research it and wait for a calmer price.';
  return m.pe && m.avgPastPe && m.pe < m.avgPastPe ? 'Good business, and cheaper than its usual P/E. Worth researching now.'
    : 'Good business at a normal or higher P/E than usual. Research it before deciding.';
}

const suggestion = (signal: Analysis['signal'], m: Metrics, c: Company): string => `${buyLine(signal, m, c)} ${HOLDER[signal]}`;

const NOT_RATED = 'Not rated — no EPS published';

const SCORE_BANDS: Record<string, [number, number]> = { avoid: [0, 30], caution: [31, 60], neutral: [61, 75], research: [76, 100] };
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function strength(checks: Check[], m: Metrics, sectorPe: number | null, dividendYield: number | null): number {
  const passed = checks.filter((x) => x.ok).length / checks.length;
  const growth = clamp01((m.epsCagr ?? 0) / 20);
  const vsSector = m.pe && sectorPe ? clamp01(1 - m.pe / (2 * sectorPe)) : 0;
  const vsOwn = m.pe && m.avgPastPe ? clamp01(1 - m.pe / (2 * m.avgPastPe)) : 0;
  const yieldPart = clamp01((dividendYield ?? 0) / 8);
  return 0.4 * passed + 0.2 * growth + 0.15 * vsSector + 0.1 * vsOwn + 0.15 * yieldPart;
}

export function analyze(c: Company, sectorPe: number | null, now = new Date()): Analysis {
  const m = metrics(c, now);
  const fraud = fraudFlags(c, m, now);
  const checks = qualityChecks(c, m, pricePosition(c, m).zone);
  checks.push({ ok: fraud.level === 'clean', label: 'No fraud warning', detail: `${fraud.flags.length} flag(s)`, why: 'Any red flag removes a company from the shortlist.' });
  const reasons: Reason[] = [];
  const add = (tone: string, text: string) => reasons.push({ tone, text });
  if (m.epsNow == null) add('warn', `${NOT_RATED}. Some companies, such as life insurers, do not report EPS, so the profit checks cannot run.`);
  if (m.epsNow != null && m.epsNow < 0) add('bad', `The company made a loss (EPS ${m.epsNow}).`);
  if (m.epsFellTwice) add('warn', 'Earnings fell two years in a row.');
  if (m.interimLoss) add('bad', `Latest ${m.interim!.label} result is a loss (EPS ৳${m.interim!.value}).`);
  if (m.epsCagr != null && m.epsCagr < 0) add('warn', `Earnings shrank ${Math.abs(m.epsCagr)}% a year.`);
  if (m.pe && sectorPe) add(m.pe > 2 * sectorPe ? 'warn' : m.pe <= sectorPe ? 'good' : 'neutral',
    `P/E ${round(m.pe)} against the ${c.sector} sector median of ${round(sectorPe)}.`);
  if ((m.pb ?? 0) > 5) add('warn', `Price is ${round(m.pb)}× book value. That is expensive.`);
  if (m.avgDailyValue != null && m.avgDailyValue < LIQUID_DAILY_VALUE_BDT) add('warn', 'Few shares trade each day. It may be hard to sell.');
  const buys = directorActivity(c.events, now).buys;
  if (buys.length) add('good', `Directors announced ${buys.length} share purchase(s) in the last 6 months. Insiders are buying.`);
  checks.filter((x) => x.ok && x.label !== 'No fraud warning').forEach((x) => add('good', x.detail === x.label ? `${x.label}.` : `${x.label}: ${x.detail}.`));

  const quality = checks.every((x) => x.ok);
  const bad = fraud.level === 'high' || (m.epsNow != null && m.epsNow < 0);
  const warn = fraud.level === 'suspicious' || m.epsFellTwice || m.interimLoss || (m.epsCagr != null && m.epsCagr < 0)
    || (m.pe != null && sectorPe != null && m.pe > 2 * sectorPe) || (m.pb ?? 0) > STRETCHED_PB || (m.avgDailyValue != null && m.avgDailyValue < LIQUID_DAILY_VALUE_BDT);
  const signal = bad ? 'avoid' : quality ? 'research' : warn ? 'caution' : 'neutral';

  const [lo, hi] = SCORE_BANDS[signal];
  const score = Math.round(lo + (hi - lo) * strength(checks, m, sectorPe, m.latestYield));

  const metricsOut: Metrics = { ...m, pe: round(m.pe, 2), pb: round(m.pb, 2), avgDailyValue: round(m.avgDailyValue, 0), volumeSpike: round(m.volumeSpike), epsYears: undefined };

  return {
    signal: signal as Analysis['signal'], score, quality, notRated: m.epsNow == null, fraud, checks, reasons,
    history: history(c, m),
    suggestion: suggestion(signal as Analysis['signal'], m, c),
    metrics: metricsOut,
  };
}

const SUMMARY_YEARS = 5;
const DEFAULT_FACE_VALUE = 10;

export function fiveYearSummary(c: Company): Summary {
  const face = c.faceValue || DEFAULT_FACE_VALUE;
  const divByYear: Record<number, { cash?: number | null; stock?: number | null; yieldPct?: number | null }> = Object.fromEntries((c.dividends || []).map((d) => [d.year, d]));
  const years: SummaryYear[] = c.years.slice(-SUMMARY_YEARS).map((y) => {
    const d = divByYear[y.year ?? 0] || {};
    const dps = d.cash != null ? (d.cash / 100) * face : null;
    const eps = y.eps ?? null, nav = y.nav ?? null, pe = y.pe ?? null;
    return {
      year: y.year!,
      profit: y.profit ?? null,
      eps,
      nav,
      roe: round(roePct(eps, nav)),
      pe: (pe ?? 0) > 0 ? round(pe) : null,
      pb: round(pbAtYearEnd(pe, eps, nav), 2),
      dps: round(dps ?? null, 2),
      stockPct: d.stock || 0,
      payout: round(payoutPct(d.cash ?? null, face, eps)),
      dividendYield: d.yieldPct ?? null,
    };
  });
  // Same CAGR rule as the Financials cards: first to last year that has the value.
  const growth = (key: keyof SummaryYear): number | null =>
    round(cagr(years.flatMap((y) => (y[key] != null ? [{ year: y.year, value: y[key] as number }] : [])))?.pct);
  const avg = (key: keyof SummaryYear): number | null =>
    round(mean(years.map((y) => y[key] as number | null).filter((v): v is number => v != null && isFinite(v))));
  return {
    years,
    growth: { profit: growth('profit'), eps: growth('eps'), nav: growth('nav'), dps: growth('dps') },
    average: { roe: avg('roe'), payout: avg('payout'), pe: avg('pe'), dividendYield: avg('dividendYield') },
    span: years.length ? years.at(-1)!.year - years[0].year : 0,
  };
}

const LOW_ZONE = 0.25;
const HIGH_ZONE = 0.75;
const VALUATION: Record<string, { label: string; tone: string; text: string }> = {
  value: { label: 'Possible value', tone: 'good', text: 'Cheap against its own 5-year history while earnings still grow. Worth researching further.' },
  trap: { label: 'Cheap for a reason', tone: 'bad', text: 'Cheap against its history, but earnings are falling. A low price can keep falling. Be careful.' },
  expensive: { label: 'Priced high', tone: 'warn', text: 'Expensive against its own history, though earnings grow. Good business, but wait for a better price.' },
  risky: { label: 'Expensive and weakening', tone: 'bad', text: 'Expensive against its history while earnings fall. High risk at this price.' },
  fair: { label: 'Fairly priced', tone: 'neutral', text: 'In the middle of its usual range. Price alone gives no strong reason to buy or wait.' },
};

const band = (values: (number | null | undefined)[], now: number | null): PriceBand | null => {
  const xs = values.filter((v): v is number => v != null && isFinite(v) && v > 0);
  if (!xs.length || now == null) return null;
  const low = Math.min(...xs, now), high = Math.max(...xs, now);
  return { low: round(low, 2)!, high: round(high, 2)!, avg: round(mean(xs), 2)!, now: round(now, 2)!, position: high > low ? round((now - low) / (high - low), 2)! : 0.5 };
};

export function pricePosition(c: Company, m: Metrics): PricePosition {
  const years = c.years.filter((y) => (y.pe ?? 0) > 0 && (y.eps ?? 0) > 0).slice(-SUMMARY_YEARS);
  const yearEnd = years.map((y) => ({ year: y.year!, pe: y.pe!, price: round(y.pe! * y.eps!, 2)! }));
  const daily = (c.series || []).map((s) => s.price);
  const priceBand = band(yearEnd.map((y) => y.price), m.priceNow);
  const price = priceBand && daily.length
    ? { ...priceBand, low: round(Math.min(priceBand.low, ...daily), 2)!, high: round(Math.max(priceBand.high, ...daily), 2)! } : priceBand;
  if (price) price.position = price.high > price.low ? round((price.now - price.low) / (price.high - price.low), 2)! : 0.5;
  const pe = band(yearEnd.map((y) => y.pe), m.pe);
  const zone: 'low' | 'high' | 'middle' | null = pe ? (pe.position <= LOW_ZONE ? 'low' : pe.position >= HIGH_ZONE ? 'high' : 'middle') : null;
  const growing = (m.epsNow ?? 0) > 0 && m.epsPrev != null && (m.epsNow ?? 0) >= m.epsPrev;
  const verdictKey = !zone ? null : zone === 'middle' ? 'fair' : zone === 'low' ? (growing ? 'value' : 'trap') : (growing ? 'expensive' : 'risky');

  const historyRows: PriceHistoryPoint[] = yearEnd.slice(0, -1).map((y, i) => ({
    year: y.year, pe: round(y.pe, 1)!, price: y.price, nextPrice: yearEnd[i + 1].price,
    change: round(pct(yearEnd[i + 1].price, y.price))!,
  }));
  const usualPe = pe ? pe.avg : null;
  const cheapYears = usualPe == null ? [] : historyRows.filter((h) => h.pe <= usualPe);
  return {
    price, pe, zone, verdict: verdictKey ? { key: verdictKey, ...VALUATION[verdictKey] } : null, history: historyRows,
    cheapYears: cheapYears.length, cheapYearsUp: cheapYears.filter((h) => h.change > 0).length, usualPe: round(usualPe, 1),
  };
}

const monthLabel = (ym: string | null | undefined): string =>
  ym ? new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'unknown';
const ANSWER = { yes: 'yes', partly: 'partly', no: 'no', unknown: 'unknown' } as const;

const CHEAP_ANSWER: Record<string, Question['answer']> = { value: 'yes', fair: 'partly', trap: 'partly', expensive: 'no', risky: 'no' };
const CHEAP_LABEL: Record<string, string> = { trap: 'Cheap, but profits falling' };
const FRAUD_ANSWER: Record<Analysis['fraud']['level'], Question['answer']> = { clean: 'yes', suspicious: 'partly', high: 'no' };
export const FRAUD_LABEL: Record<Analysis['fraud']['level'], string> = { clean: 'Clean', suspicious: 'Suspicious', high: 'High risk' };

// Without P/E history (no profit), the place of the price in its 52-week range is the only guide.
function rangeAnswer(c: Company, price: number | null): Pick<Question, 'answer' | 'label' | 'text'> | null {
  const closes = (c.series || []).map((s) => s.price);
  const high = c.weekHigh52 || (closes.length ? Math.max(...closes) : null);
  const low = c.weekLow52 || (closes.length ? Math.min(...closes) : null);
  if (!price || !high || low == null || high <= low) return null;
  const pos = (price - low) / (high - low);
  let answer: Question['answer'] = 'partly', label = 'Middle of its 52-week range';
  if (pos < LOW_ZONE) label = 'Near its 52-week low';
  if (pos > HIGH_ZONE) { answer = 'no'; label = 'Near its 52-week high'; }
  return { answer, label, text: `${label}: ৳${round(price, 2)} against ৳${round(low, 2)}–৳${round(high, 2)} in the last year. No P/E history, so this is the price range only.` };
}

const rate = (d: Declaration): string =>
  [d.cashPct != null ? `${d.cashPct}% cash` : '', d.stockPct != null ? `${d.stockPct}% bonus shares` : ''].filter(Boolean).join(' + ') || 'a dividend';

export function fourQuestions(c: Company, a: Analysis, position: PricePosition | null, dividend: DividendStatus | null): Question[] {
  const passed = a.checks.filter((x) => x.ok && x.label !== 'No fraud warning').length;
  const total = a.checks.length - 1;
  const solid = a.metrics.epsAllPositive && !a.metrics.interimLoss;
  const growing = a.metrics.epsCagr != null && a.metrics.epsCagr > 0;
  const good: Question = a.notRated
    ? { q: 'Is it a good business?', answer: ANSWER.unknown, label: 'Not rated', text: `${NOT_RATED}. Passes ${passed} of ${total} quality checks.`, tab: 'safety' }
    : { q: 'Is it a good business?', answer: solid && growing && passed >= total - 2 ? ANSWER.yes : solid ? ANSWER.partly : ANSWER.no,
      text: `Passes ${passed} of ${total} quality checks.${a.metrics.epsCagr != null ? ` Earnings ${a.metrics.epsCagr >= 0 ? 'grow' : 'shrink'} ${Math.abs(a.metrics.epsCagr)}% a year.` : ''}`, tab: 'safety' };
  const v = position?.verdict;
  const cheapLabel = v ? CHEAP_LABEL[v.key] ?? v.label : null;
  const cheap: Question = { q: 'Is it cheap now?', tab: 'valuation',
    ...(v ? { answer: CHEAP_ANSWER[v.key], label: cheapLabel!, text: `${cheapLabel}. P/E ${a.metrics.pe ?? '—'} against its usual ${position?.pe?.avg ?? '—'}.` }
      : rangeAnswer(c, a.metrics.priceNow) ?? { answer: ANSWER.unknown, text: 'Not enough price history.' }) };
  const safe: Question = { q: 'Any fraud warning signs?', answer: FRAUD_ANSWER[a.fraud.level], label: FRAUD_LABEL[a.fraud.level],
    text: a.fraud.flags.length ? a.fraud.flags.map((f) => f.title).join(', ') + '.' : 'No warning pattern found.', tab: 'safety' };
  const d = dividend;
  const lastBuy = (x: { lastBuyDate?: string | null; lastBuyEstimated?: boolean }): string =>
    `${dateLabel(x.lastBuyDate)}${x.lastBuyEstimated ? ' (estimate)' : ''}`;
  const pay: Omit<Question, 'q' | 'tab'> = d?.upcoming && d.canStillBuy
    ? { answer: ANSWER.yes, label: d.upcoming.lastBuyEstimated ? 'Yes, soon (date estimated)' : 'Yes, soon', text: `Board recommended ${rate(d.upcoming)}. Last day to buy: ${lastBuy(d.upcoming)}. Record date ${dateLabel(d.upcoming.recordDate)}. Needs AGM approval.` }
    : d?.upcoming
    ? { answer: ANSWER.no, label: 'Too late', text: `${rate(d.upcoming)}, but the last day to buy (${lastBuy(d.upcoming)}) has passed. Next expected around ${monthLabel(d.nextExpected)}.` }
    : d?.recordToday
    ? { answer: ANSWER.no, label: 'Too late', text: `Today (${dateLabel(d.recordToday.recordDate)}) is the record date. Next expected around ${monthLabel(d.nextExpected)}.` }
    : d?.latest
    ? { answer: ANSWER.no, label: 'Not soon', text: `Last: ${rate(d.latest)}${d.latest.interim ? ' (interim)' : ''}, record date ${dateLabel(d.latest.recordDate)}. Next expected around ${monthLabel(d.nextExpected)}.` }
    : { answer: ANSWER.no, label: 'No', text: 'No recent dividend announcement on DSE.' };
  return [good, cheap, safe, { q: 'Is a dividend coming?', tab: 'dividends', ...pay }];
}

// A true median of every positive P/E in the sector, with the same P/E the company rows show.
export function sectorMedians(companies: Company[], now = new Date()): Record<string, number | null> {
  const bySector: Record<string, number[]> = {};
  for (const c of companies) {
    const pe = metrics(c, now).pe;
    if (pe != null && pe > 0) (bySector[c.sector] ??= []).push(pe);
  }
  return Object.fromEntries(Object.entries(bySector).map(([s, xs]) => [s, median(xs)]));
}
