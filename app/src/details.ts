import type { InterimFinancials, SeriesPoint, YearRow } from '../../web/lib/types.ts';
import { fmtDate, fmtNum, MONTHS } from './format.ts';

// DSE data is untrusted: only open links that are plain web addresses.
export function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
}

// "freeFloatMarketCap" -> "Free float market cap".
export function labelFromKey(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Any DSE value as one line of text; missing or empty shows a dash.
export function detailText(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.trim() ? v.trim() : '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    return Number.isInteger(v) ? v.toLocaleString('en-US') : fmtNum(v);
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.map(detailText).join(', ') : '—';
  if (typeof v === 'object') {
    const parts = Object.entries(v).map(([k, x]) => `${labelFromKey(k)}: ${detailText(x)}`);
    return parts.length ? parts.join(' · ') : '—';
  }
  return String(v);
}

type Kind = 'text' | 'id' | 'mn' | 'pct' | 'crore' | 'url' | 'tel' | 'mail' | 'rating';
// Path into details: one key, or a key and a sub-key for nested blocks; hint explains jargon in one line.
type Field = [path: string[], label: string, kind?: Kind, hint?: string];

const HINT = {
  isin: 'International code that identifies this share on any market.',
  oci: 'Gains or losses not counted in profit, such as revaluation of assets.',
  freeFloat: 'Share of all shares the public can trade (not held by sponsors or government).',
  restated: 'Recalculated later (for example after a bonus issue), so years compare fairly.',
};

const GROUPS: { title: string; fields: Field[] }[] = [
  { title: 'Contact', fields: [
    [['description'], 'About'], [['hq'], 'Head office'], [['registeredOffice'], 'Registered office'], [['factoryAddress'], 'Factory'],
    [['phone'], 'Phone', 'tel'], [['fax'], 'Fax'], [['email'], 'Email', 'mail'],
  ] },
  { title: 'Links', fields: [
    [['website'], 'Website', 'url'], [['psiUrl'], 'Price-sensitive news', 'url'], [['financialStatementsUrl'], 'Financial statements', 'url'],
  ] },
  { title: 'Identifiers', fields: [
    [['isin'], 'ISIN', 'id', HINT.isin], [['scripCode'], 'Scrip code', 'id'], [['instrumentType'], 'Instrument'], [['board'], 'Board'],
    [['marketLot'], 'Market lot', 'id'], [['electronicShare'], 'Electronic share'], [['otcStatus'], 'OTC status'], [['creditRating'], 'Credit rating', 'rating'],
  ] },
  { title: 'Capital & float', fields: [
    [['authorizedCapital'], 'Authorized capital', 'mn'], [['reserveWithoutOci'], 'Reserve (without OCI)', 'mn', HINT.oci],
    [['otherComprehensiveIncome'], 'Other comprehensive income (OCI)', 'mn', HINT.oci], [['freeFloat'], 'Free float', 'pct', HINT.freeFloat],
    [['freeFloatMarketCap'], 'Free-float market cap', 'crore'],
  ] },
  { title: 'Company secretary', fields: [
    [['companySecretary', 'name'], 'Name'], [['companySecretary', 'email'], 'Email', 'mail'],
    [['companySecretary', 'phone'], 'Phone', 'tel'], [['companySecretary', 'cell'], 'Mobile', 'tel'],
  ] },
  { title: 'Status & dates', fields: [
    [['operationalStatus'], 'Operational status'], [['yearEnd'], 'Year end'], [['agmDate'], 'Last AGM'],
    [['loanStatus', 'shortTerm'], 'Short-term loan', 'mn'], [['loanStatus', 'longTerm'], 'Long-term loan', 'mn'],
  ] },
];

// The session quote is already shown in "Today's trading".
const SKIP = new Set(['sessionQuote', ...GROUPS.flatMap((g) => g.fields.map(([path]) => path[0]))]);

export interface DetailLink { label: string; url: string }
export interface DetailRow { label: string; value: string; url: string | null; links?: DetailLink[]; hint?: string }
export interface DetailGroup { title: string; rows: DetailRow[]; advanced?: boolean }

// DSE sends money in ৳ million; 10 million = 1 crore.
export function crFromMn(mn: number | null | undefined): string {
  return mn == null || !Number.isFinite(mn) ? '—' : `৳${fmtNum(mn / 10)} cr`;
}

// Percent figures such as a 12.5% bonus: up to 2 decimals, never rounded to a whole number.
export function fmtUpTo2(x: number | null | undefined): string {
  return x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// "02-9882990, +880 1711-000000" -> one tel: link per number; pieces with too few digits are dropped.
export function phoneLinks(v: unknown): DetailLink[] {
  if (typeof v !== 'string') return [];
  return v.split(/[,;]/).flatMap((piece) => {
    const raw = piece.split(/\b(?:ext|x)\b/i)[0].replace(/[^\d+]/g, ''), digits = raw.replace(/\D/g, '');
    // Only a + before the first digit is kept: "880+171" is not a valid tel: number.
    const num = (raw.startsWith('+') ? '+' : '') + digits;
    return digits.length >= 5 ? [{ label: piece.trim(), url: `tel:${num}` }] : [];
  });
}

// No ?, & or other mailto: header characters, so an address cannot prefill cc / body (same rule as the web).
const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const MAILTO = new RegExp(`^mailto:${EMAIL.source.slice(1)}`);

export function emailLinks(v: unknown): DetailLink[] {
  if (typeof v !== 'string') return [];
  return v.split(/[\s,;:<>()]+/).filter((e) => EMAIL.test(e)).map((e) => ({ label: e, url: `mailto:${e}` }));
}

// Only links this app builds itself or plain web addresses are opened.
export function isSafeLink(url: string): boolean {
  return isHttpUrl(url) || /^tel:\+?\d+$/.test(url) || MAILTO.test(url);
}

function pick(d: Record<string, unknown>, path: string[]): unknown {
  let v: unknown = d;
  for (const k of path) v = v != null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && !v.trim());

function formatField(v: unknown, kind: Kind): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : null;
  if (kind === 'id') return v == null || v === '' ? '—' : String(v);
  if (kind === 'rating' && isEmpty(v)) return 'Not rated';
  if (n != null && kind === 'mn') return crFromMn(n);
  if (n != null && kind === 'pct') return `${fmtNum(n)}%`;
  if (n != null && kind === 'crore') return `৳${fmtNum(n / 1e7, 0)} cr`;
  return detailText(v);
}

// The known DSE fields in labelled groups, then every other field so nothing DSE sends is hidden.
export function detailGroups(d: Record<string, unknown>): DetailGroup[] {
  const groups = GROUPS.map(({ title, fields }) => ({
    title,
    rows: fields.map(([path, label, kind = 'text', hint]): DetailRow => {
      const v = pick(d, path);
      const links = kind === 'tel' ? phoneLinks(v) : kind === 'mail' ? emailLinks(v) : [];
      return {
        label, value: formatField(v, kind), url: kind === 'url' && isHttpUrl(v) ? v.trim() : null,
        ...(links.length ? { links } : {}), ...(hint ? { hint } : {}),
      };
    }),
  }));
  const other = Object.keys(d).filter((k) => !SKIP.has(k)).map((k) => ({ label: labelFromKey(k), value: rawText(d[k]), url: null }));
  return other.length ? [...groups, { title: 'Advanced: raw DSE fields', rows: other, advanced: true }] : groups;
}

// Raw fields often carry big numbers as text; give them thousands separators (short ones such as years stay as sent).
function rawText(v: unknown): string {
  const n = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
  return n != null && Math.abs(n) >= 10000 ? detailText(n) : detailText(v);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2026-11-20" -> "Fri 20 Nov".
export function fmtWeekday(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  const day = fmtDate(iso);
  if (!m || day === '—') return '—';
  return `${WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]} ${day}`;
}

// "Today" only while the market is open; otherwise name the session the numbers come from.
export function todayTitle(t: { live?: boolean; sessionDate?: string | null }): string {
  if (t.live) return "Today's trading · Live";
  const day = fmtWeekday(t.sessionDate);
  return day === '—' ? 'Last session' : `Last session · ${day}`;
}

export interface ExDate { date: string; recordDate?: string | null; cashPct?: number | null; stockPct?: number | null }

// "Ex-dividend (10% cash) · ex-bonus (12.5% bonus) · record date 24 Nov 2026".
export function exLabel(e: ExDate): string {
  const parts = [
    ...((e.cashPct ?? 0) > 0 ? [`ex-dividend (${fmtUpTo2(e.cashPct)}% cash)`] : []),
    ...((e.stockPct ?? 0) > 0 ? [`ex-bonus (${fmtUpTo2(e.stockPct)}% bonus)`] : []),
  ];
  const text = [parts.length ? parts.join(' · ') : 'ex-date', ...(e.recordDate ? [`record date ${fmtDay(e.recordDate)}`] : [])].join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "2025-10-23" -> "23 Oct 2025"; the 52-week window spans two years, so the year matters.
export function fmtDay(iso: string | null | undefined): string {
  const day = fmtDate(iso);
  return day === '—' ? day : `${day} ${iso!.slice(0, 4)}`;
}

// "2025-10" -> "Oct 2025".
export function fmtMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  const name = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && name ? `${name} ${m[1]}` : '—';
}

export function changePct(from: number | null | undefined, to: number | null | undefined): number | null {
  return from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0 ? null : ((to - from) / from) * 100;
}

export interface DayRow { date: string; open: number | null; high: number | null; low: number | null; close: number; changePct: number | null; volume: number }

// The first day's change uses the close just before `from`, even outside the window.
export function dailyRows(series: SeriesPoint[], from = ''): DayRow[] {
  return series
    .map((p, i) => ({ date: p.date, open: p.open ?? null, high: p.high ?? null, low: p.low ?? null, close: p.price, volume: p.volume, changePct: i ? changePct(series[i - 1].price, p.price) : null }))
    .filter((r) => r.date >= from)
    .reverse();
}

const PERIOD_ORDER = ['q1', 'q2', 'half', 'q3', 'nine', 'annual'];
const PERIOD_LABEL: Record<string, string> = { q1: 'Q1', q2: 'Q2', half: 'Half year', q3: 'Q3', nine: 'Nine months', annual: 'Year' };

export interface InterimTable { columns: { key: string; label: string }[]; rows: { metric: string; values: string[] }[] }

// Every quarterly row DSE sends, each column labelled with its period end ("202603" -> "Q1 (to Mar 2026)").
export function interimTable(interim: InterimFinancials | null | undefined): InterimTable | null {
  const rows = Array.isArray(interim?.rows) && interim.rows.length ? interim.rows : interim?.eps ? [interim.eps] : [];
  if (!rows.length) return null;
  const keys = new Set([...Object.keys(interim?.periods ?? {}), ...rows.flatMap((r) => Object.keys(r))]);
  keys.delete('metric');
  const ordered = [...PERIOD_ORDER.filter((k) => keys.has(k)), ...[...keys].filter((k) => !PERIOD_ORDER.includes(k))];
  const columns = ordered.map((key) => {
    const end = interim?.periods?.[key];
    const month = typeof end === 'string' && /^\d{6}$/.test(end) ? fmtMonth(`${end.slice(0, 4)}-${end.slice(4)}`) : null;
    const name = PERIOD_LABEL[key] ?? labelFromKey(key);
    return { key, label: month && month !== '—' ? `${name} (to ${month})` : name };
  });
  return { columns, rows: rows.map((r) => ({ metric: detailText(r.metric), values: ordered.map((k) => detailText(r[k])) })) };
}

// DSE yearly keys; money figures come in ৳ million.
const YEAR_LABEL: Record<string, string> = {
  eps: 'EPS', epsBasic: 'EPS (basic)', epsBasicOriginal: 'EPS basic (original)', epsBasicRestated: 'EPS basic (restated)', epsDiluted: 'EPS (diluted)',
  epsContBasicOriginal: 'EPS continuing ops, basic (original)', epsContBasicRestated: 'EPS continuing ops, basic (restated)', epsContDiluted: 'EPS continuing ops (diluted)',
  nav: 'NAV per share', navOriginal: 'NAV per share (original)', navRestated: 'NAV per share (restated)', navDiluted: 'NAV per share (diluted)',
  pe: 'P/E', peBasicOriginal: 'P/E basic (original)', peBasicRestated: 'P/E basic (restated)', peDiluted: 'P/E (diluted)',
  peContBasicOriginal: 'P/E continuing ops, basic (original)', peContBasicRestated: 'P/E continuing ops, basic (restated)', peContDiluted: 'P/E continuing ops (diluted)',
  profit: 'Net profit (৳ cr)', profitForYear: 'Profit for the year (৳ cr)', pco: 'Profit from continuing operations (৳ cr)',
  comprehensive: 'Total comprehensive income (৳ cr)', oci: 'Other comprehensive income (OCI, ৳ cr)', reserve: 'Reserve (৳ cr)',
  dividend: 'Dividend (% of face value)', dividendPct: 'Dividend % (as listed)', dividendYield: 'Dividend yield (%)',
};

// Money keys DSE sends in ৳ million; shown in crore.
const YEAR_MN = new Set(['profit', 'profitForYear', 'pco', 'comprehensive', 'oci', 'reserve']);
const YEAR_HINT: Record<string, string> = { oci: HINT.oci };

function yearText(key: string, v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
  return YEAR_MN.has(key) && n != null ? fmtNum(n / 10) : detailText(v);
}

export interface YearField { key: string; label: string; values: { year: number; text: string }[]; hint?: string }

// One entry per yearly field that has a value in at least one year, newest year first; a field whose values repeat an earlier field is dropped.
export function yearFields(years: YearRow[]): YearField[] {
  const sorted = [...years].sort((a, b) => b.year - a.year);
  const keys = [...new Set(sorted.flatMap((y) => Object.keys(y)))].filter((k) => k !== 'year' && sorted.some((y) => !isEmpty(y[k])));
  const seen = new Set<string>();
  return keys.flatMap((key) => {
    const values = sorted.map((y) => ({ year: y.year, text: yearText(key, y[key]) }));
    const sig = values.map((v) => v.text).join('|');
    if (seen.has(sig)) return [];
    seen.add(sig);
    const hint = YEAR_HINT[key] ?? (/restated/i.test(key) ? HINT.restated : undefined);
    return [{ key, label: YEAR_LABEL[key] ?? key, values, ...(hint ? { hint } : {}) }];
  });
}
