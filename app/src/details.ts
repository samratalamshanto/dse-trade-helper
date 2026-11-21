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

type Kind = 'text' | 'id' | 'mn' | 'pct' | 'crore' | 'url';
// Path into details: one key, or a key and a sub-key for nested blocks.
type Field = [path: string[], label: string, kind?: Kind];

const GROUPS: { title: string; fields: Field[] }[] = [
  { title: 'Identifiers', fields: [
    [['isin'], 'ISIN', 'id'], [['scripCode'], 'Scrip code', 'id'], [['instrumentType'], 'Instrument'], [['board'], 'Board'],
    [['marketLot'], 'Market lot', 'id'], [['electronicShare'], 'Electronic share'], [['otcStatus'], 'OTC status'], [['creditRating'], 'Credit rating'],
  ] },
  { title: 'Capital & float', fields: [
    [['authorizedCapital'], 'Authorized capital', 'mn'], [['reserveWithoutOci'], 'Reserve (without OCI)', 'mn'],
    [['otherComprehensiveIncome'], 'Other comprehensive income (OCI)', 'mn'], [['freeFloat'], 'Free float', 'pct'],
    [['freeFloatMarketCap'], 'Free-float market cap', 'crore'],
  ] },
  { title: 'Contact', fields: [
    [['description'], 'About'], [['hq'], 'Head office'], [['registeredOffice'], 'Registered office'], [['factoryAddress'], 'Factory'],
    [['phone'], 'Phone'], [['fax'], 'Fax'], [['email'], 'Email'],
  ] },
  { title: 'Company secretary', fields: [
    [['companySecretary', 'name'], 'Name'], [['companySecretary', 'email'], 'Email'],
    [['companySecretary', 'phone'], 'Phone'], [['companySecretary', 'cell'], 'Mobile'],
  ] },
  { title: 'Status & dates', fields: [
    [['operationalStatus'], 'Operational status'], [['yearEnd'], 'Year end'], [['agmDate'], 'Last AGM'],
    [['loanStatus', 'shortTerm'], 'Short-term loan', 'mn'], [['loanStatus', 'longTerm'], 'Long-term loan', 'mn'],
  ] },
  { title: 'Links', fields: [
    [['website'], 'Website', 'url'], [['psiUrl'], 'Price-sensitive news', 'url'], [['financialStatementsUrl'], 'Financial statements', 'url'],
  ] },
];

// The session quote is already shown in "Today's trading".
const SKIP = new Set(['sessionQuote', ...GROUPS.flatMap((g) => g.fields.map(([path]) => path[0]))]);

export interface DetailRow { label: string; value: string; url: string | null }
export interface DetailGroup { title: string; rows: DetailRow[] }

function pick(d: Record<string, unknown>, path: string[]): unknown {
  let v: unknown = d;
  for (const k of path) v = v != null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v;
}

function formatField(v: unknown, kind: Kind): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : null;
  if (kind === 'id') return v == null || v === '' ? '—' : String(v);
  if (n != null && kind === 'mn') return `৳${fmtNum(n, 1)} mn`;
  if (n != null && kind === 'pct') return `${fmtNum(n)}%`;
  if (n != null && kind === 'crore') return `৳${fmtNum(n / 1e7, 0)} cr`;
  return detailText(v);
}

// The known DSE fields in labelled groups, then every other field so nothing DSE sends is hidden.
export function detailGroups(d: Record<string, unknown>): DetailGroup[] {
  const groups = GROUPS.map(({ title, fields }) => ({
    title,
    rows: fields.map(([path, label, kind = 'text']) => {
      const v = pick(d, path);
      return { label, value: formatField(v, kind), url: kind === 'url' && isHttpUrl(v) ? v.trim() : null };
    }),
  }));
  const other = Object.keys(d).filter((k) => !SKIP.has(k)).map((k) => ({ label: labelFromKey(k), value: detailText(d[k]), url: null }));
  return other.length ? [...groups, { title: 'Other fields from DSE', rows: other }] : groups;
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

// Newest day first; each day's change is against the close of the trading day before it.
export function dailyRows(series: SeriesPoint[]): DayRow[] {
  return series
    .map((p, i) => ({ date: p.date, open: p.open ?? null, high: p.high ?? null, low: p.low ?? null, close: p.price, volume: p.volume, changePct: i ? changePct(series[i - 1].price, p.price) : null }))
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
  profit: 'Net profit (৳ mn)', profitForYear: 'Profit for the year (৳ mn)', pco: 'Profit from continuing operations (৳ mn)',
  comprehensive: 'Total comprehensive income (৳ mn)', oci: 'Other comprehensive income (৳ mn)', reserve: 'Reserve (৳ mn)',
  dividend: 'Dividend (% of face value)', dividendPct: 'Dividend % (as listed)', dividendYield: 'Dividend yield (%)',
};

const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && !v.trim());

export interface YearField { key: string; label: string; values: { year: number; text: string }[] }

// One entry per yearly field that has a value in at least one year, oldest year first.
export function yearFields(years: YearRow[]): YearField[] {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const keys = [...new Set(sorted.flatMap((y) => Object.keys(y)))].filter((k) => k !== 'year' && sorted.some((y) => !isEmpty(y[k])));
  return keys.map((key) => ({ key, label: YEAR_LABEL[key] ?? key, values: sorted.map((y) => ({ year: y.year, text: detailText(y[key]) })) }));
}
