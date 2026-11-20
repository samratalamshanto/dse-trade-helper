// Pure portfolio logic — no React, fully testable.
import { CODE_RE, dhakaToday } from './dhaka.ts';

export type Lot = { code: string; shares: number; buyPrice: number; buyDate?: string };

// Parse stored JSON defensively; damaged or wrong data gives an empty array.
export function parseLots(raw: string | null | undefined): Lot[] {
  let value: unknown;
  try { value = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): Lot[] => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
    const o = v as Record<string, unknown>;
    const code = typeof o.code === 'string' ? o.code.trim().toUpperCase() : '';
    const shares = typeof o.shares === 'number' ? o.shares : typeof o.shares === 'string' ? Number(o.shares) : NaN;
    const buyPrice = typeof o.buyPrice === 'number' ? o.buyPrice : typeof o.buyPrice === 'string' ? Number(o.buyPrice) : NaN;
    if (!CODE_RE.test(code) || !Number.isInteger(shares) || shares <= 0 || !Number.isFinite(buyPrice) || buyPrice <= 0) return [];
    const buyDate = typeof o.buyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.buyDate) ? o.buyDate : undefined;
    return [{ code, shares, buyPrice, ...(buyDate ? { buyDate } : {}) }];
  });
}

export type LiveData = { price: number | null; changePct: number | null; name?: string; signal?: string; fraud?: string };

export type AggregatedHolding = {
  code: string;
  lots: Lot[];
  totalShares: number;
  avgBuyPrice: number;
  cost: number;
  livePrice: number | null;
  value: number | null;
  pl: number | null;
  plPct: number | null;
  changePct: number | null;
  dailyPl: number | null;
};

export function aggregateLots(lots: Lot[], live: Record<string, LiveData>): AggregatedHolding[] {
  const byCode = new Map<string, Lot[]>();
  for (const lot of lots) {
    const arr = byCode.get(lot.code) ?? [];
    arr.push(lot);
    byCode.set(lot.code, arr);
  }
  return [...byCode.entries()].map(([code, codeLots]) => {
    const totalShares = codeLots.reduce((s, l) => s + l.shares, 0);
    const cost = codeLots.reduce((s, l) => s + l.shares * l.buyPrice, 0);
    const avgBuyPrice = totalShares > 0 ? cost / totalShares : 0;
    const { price: livePrice = null, changePct = null } = live[code] ?? {};
    const value = livePrice != null ? livePrice * totalShares : null;
    const pl = value != null ? value - cost : null;
    const plPct = pl != null && cost > 0 ? (pl / cost) * 100 : null;
    const dailyPlRaw = livePrice != null && changePct != null
      ? (livePrice / (1 + changePct / 100)) * totalShares * (changePct / 100)
      : null;
    const dailyPl = dailyPlRaw != null && Number.isFinite(dailyPlRaw) ? dailyPlRaw : null;
    return { code, lots: codeLots, totalShares, avgBuyPrice, cost, livePrice, value, pl, plPct, changePct, dailyPl };
  });
}

export const dhakaDateString = dhakaToday;

// Header synonyms for CSV import (case-insensitive partial match).
const CODE_HEADERS = ['code', 'symbol', 'instrument', 'scrip', 'stock'];
const SHARES_HEADERS = ['quantity', 'qty', 'shares', 'volume', 'units'];
const PRICE_HEADERS = ['avg cost', 'avg price', 'avgcost', 'avgprice', 'buy price', 'buyprice', 'cost price', 'costprice', 'average cost', 'average price', 'purchase price'];
const DATE_HEADERS = ['date', 'buy date', 'purchase date', 'trade date'];

export const CSV_MAX_ROWS = 2000;

const normHeader = (h: string) => h.toLowerCase().trim().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();

// An exact header ("Code") wins over a substring match ("Stock name") in an earlier column.
function findHeader(cols: string[], synonyms: string[]): number {
  const norm = cols.map(normHeader);
  const exact = norm.findIndex((h) => synonyms.includes(h));
  return exact >= 0 ? exact : norm.findIndex((h) => synonyms.some((s) => h.includes(s)));
}

// Plain decimal numbers only: "100abc", "0x10" and "1e3" are rejected.
// In ";" or tab files a comma before 1-2 final digits is a decimal comma ("1.234,5"); "1,000" stays one thousand.
function stripNumber(s: string, decimalComma = false): number {
  let v = s.replace(/[৳\s]/g, '');
  v = decimalComma && /,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
}

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { '\t': 0, ';': 0, ',': 0 };
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && ch in counts) counts[ch]++;
  }
  if (counts['\t'] >= counts[';'] && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] >= counts[',']) return ';';
  return ',';
}

function splitCsvLine(line: string, delim = ','): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && inQuote && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') { inQuote = !inQuote; }
    else if (ch === delim && !inQuote) { cols.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur.trim());
  return cols;
}

export type CsvImportResult = {
  lots: Lot[];
  skipped: { row: number; original: string; reason: string }[];
};

export function parseCsv(text: string, knownCodes?: Set<string>): CsvImportResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { lots: [], skipped: [{ row: 0, original: lines[0] ?? '', reason: 'Need at least a header row and one data row' }] };

  if (lines.length - 1 > CSV_MAX_ROWS) {
    return { lots: [], skipped: [{ row: 0, original: '', reason: `Too many rows (${lines.length - 1}). Import at most ${CSV_MAX_ROWS.toLocaleString('en-US')} rows at a time; split the file.` }] };
  }
  const delim = detectDelimiter(lines[0]);
  const decimalComma = delim !== ',';

  let headerIndex = -1;
  let codeIdx = -1, sharesIdx = -1, priceIdx = -1, dateIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cols = splitCsvLine(lines[i], delim);
    const c = findHeader(cols, CODE_HEADERS);
    const s = findHeader(cols, SHARES_HEADERS);
    if (c >= 0 && s >= 0) {
      headerIndex = i;
      codeIdx = c;
      sharesIdx = s;
      priceIdx = findHeader(cols, PRICE_HEADERS);
      dateIdx = findHeader(cols, DATE_HEADERS);
      break;
    }
  }
  if (headerIndex < 0) {
    return { lots: [], skipped: [{ row: 1, original: lines[0], reason: 'No recognizable header — need columns like "code/symbol" and "quantity/shares"' }] };
  }

  const headerColCount = splitCsvLine(lines[headerIndex], delim).length;

  const lots: Lot[] = [];
  const skipped: CsvImportResult['skipped'] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line, delim);
    const rawCode = (cols[codeIdx] ?? '').trim().toUpperCase();
    const rawShares = (cols[sharesIdx] ?? '').trim();
    const rawPrice = priceIdx >= 0 ? (cols[priceIdx] ?? '').trim() : '';
    const rawDate = dateIdx >= 0 ? (cols[dateIdx] ?? '').trim() : '';

    if (!rawCode && !rawShares) continue;

    if (!CODE_RE.test(rawCode)) { skipped.push({ row: i + 1, original: line, reason: `Invalid code "${rawCode}"` }); continue; }

    if (knownCodes && !knownCodes.has(rawCode)) {
      skipped.push({ row: i + 1, original: line, reason: `Code "${rawCode}" not found in company list` }); continue;
    }

    if (delim === ',' && cols.length > headerColCount) {
      skipped.push({ row: i + 1, original: line, reason: `Column count mismatch (${cols.length} vs ${headerColCount} expected) — likely unquoted thousands separator like 1,000; quote numeric fields` }); continue;
    }

    const shares = stripNumber(rawShares, decimalComma);
    if (!Number.isSafeInteger(shares) || shares <= 0) {
      skipped.push({ row: i + 1, original: line, reason: `Invalid quantity "${rawShares}"` }); continue;
    }

    if (!rawPrice) { skipped.push({ row: i + 1, original: line, reason: 'Missing buy price column' }); continue; }
    const buyPrice = stripNumber(rawPrice, decimalComma);
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      skipped.push({ row: i + 1, original: line, reason: `Invalid price "${rawPrice}"` }); continue;
    }

    const dateMatch = rawDate.match(/(\d{4}-\d{2}-\d{2})/);
    const buyDate = dateMatch ? dateMatch[1] : undefined;
    lots.push({ code: rawCode, shares, buyPrice, ...(buyDate ? { buyDate } : {}) });
  }
  return { lots, skipped };
}

// Filters incoming lots to remove exact duplicates already present in existing.
export function dedupLots(incoming: Lot[], existing: Lot[]): { unique: Lot[]; skippedCount: number } {
  let skippedCount = 0;
  const unique = incoming.filter((inc) => {
    const isDupe = existing.some((ex) =>
      ex.code === inc.code && ex.shares === inc.shares &&
      ex.buyPrice === inc.buyPrice && (ex.buyDate ?? '') === (inc.buyDate ?? '')
    );
    if (isDupe) skippedCount++;
    return !isDupe;
  });
  return { unique, skippedCount };
}

export function toCsv(lots: Lot[]): string {
  const rows = lots.map((l) => `${l.code},${l.shares},${l.buyPrice},${l.buyDate ?? ''}`);
  return ['code,shares,buy_price,buy_date', ...rows].join('\n');
}

export type DividendRow = {
  code: string;
  cashPerShare: number | null;
  yearlyCashPerShare?: number | null;
  recordDate: string | null;
  nextExpected: string | null;
};

// Picks the best dividend row for a code: upcoming (recordDate >= today) > expected (has nextExpected) > recent.
export function pickDividend(rows: DividendRow[], code: string, today: string): DividendRow | undefined {
  const candidates = rows.filter((r) => r.code === code && r.cashPerShare != null && r.cashPerShare > 0);
  const upcoming = candidates.find((r) => r.recordDate != null && r.recordDate >= today);
  if (upcoming) return upcoming;
  const expected = candidates.find((r) => r.nextExpected != null);
  if (expected) return expected;
  return candidates[0];
}

// Month of the next payment: an upcoming record date, else the expected announcement month.
export function nextPaymentMonth(div: DividendRow, today: string): string | null {
  if (div.recordDate != null && div.recordDate >= today) return div.recordDate.slice(0, 7);
  return div.nextExpected ? div.nextExpected.slice(0, 7) : null;
}

export type LotIncome = {
  code: string;
  totalShares: number;
  cashPerShare: number | null;
  nextIncome: number | null;
  yearlyIncome: number | null;
  month: string | null;
};

export function projectIncome(lots: Lot[], dividends: DividendRow[], today = dhakaDateString()): LotIncome[] {
  const byCode = new Map<string, number>();
  for (const l of lots) byCode.set(l.code, (byCode.get(l.code) ?? 0) + l.shares);
  return [...byCode.entries()].map(([code, totalShares]) => {
    const div = pickDividend(dividends, code, today);
    const cashPerShare = div?.cashPerShare ?? null;
    const nextIncome = cashPerShare != null ? cashPerShare * totalShares : null;
    // One declaration is not a year for interim payers (GP pays interim + final); use the 12-month cash sum when known.
    const yearlyCash = div?.yearlyCashPerShare ?? cashPerShare;
    const yearlyIncome = yearlyCash != null && yearlyCash > 0 ? yearlyCash * totalShares : nextIncome;
    const month = div ? nextPaymentMonth(div, today) ?? div.recordDate?.slice(0, 7) ?? null : null;
    return { code, totalShares, cashPerShare, nextIncome, yearlyIncome, month };
  });
}

// Only the next payment of each company is placed: it is the only payment whose month is known.
export function monthlyIncomeMap(incomes: LotIncome[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const inc of incomes) {
    if (inc.nextIncome != null && inc.month) {
      map.set(inc.month, (map.get(inc.month) ?? 0) + inc.nextIncome);
    }
  }
  return map;
}
