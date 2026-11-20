import type { Analysis, Question, SeriesPoint, SharePattern, YearRow } from '../../web/lib/types.ts';

export const FETCH_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

export interface RequestOptions { method?: string; headers?: Record<string, string>; body?: string | FormData }

type Fetch = (url: string, init: RequestOptions & { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function getJson<T>(base: string | undefined, path: string, fetchFn: Fetch = fetch, options: RequestOptions = {}): Promise<T> {
  if (!base) throw new ApiError('EXPO_PUBLIC_API_URL is not set. Add it to app/.env and restart Expo.');
  let res: Awaited<ReturnType<Fetch>>;
  try {
    res = await fetchFn(base.replace(/\/$/, '') + path, { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    throw new ApiError(`Cannot reach the DSE server at ${base}. Check that the phone and PC are on the same Wi-Fi.`, null, { cause: e });
  }
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (!res.ok) throw new ApiError(typeof body?.error === 'string' ? body.error : `Server answered ${res.status}.`, res.status);
  return body as T;
}

export type Signal = Analysis['signal'];

export interface CompanyRow {
  code: string;
  name: string;
  sector: string;
  category: string;
  price: number | null;
  changePct: number | null;
  signal: Signal;
  score: number;
  quality: boolean;
  fraud: Analysis['fraud']['level'];
  pe: number | null;
  dividendYield: number | null;
}

export interface CompaniesResponse { rows: CompanyRow[] }

export interface IndexValue { key: string; value: number; change: number | null; percent: number | null }

export interface Session { isOpen: boolean; next: string | null; dataTime: string | null }

export interface Mover { code: string; price: number; percent: number }

export interface DividendSoon {
  code: string;
  name: string;
  sector: string | null;
  cashPct: number | null;
  stockPct: number | null;
  yieldPct: number | null;
  recordDate: string | null;
  lastBuyDate: string | null;
  fraud: Analysis['fraud']['level'];
}

export interface DashboardResponse {
  session: Session | null;
  showingDate: string | null;
  index: IndexValue[];
  breadth: { advanced: number; declined: number; unchanged: number };
  intraday: { t: string; value: number }[];
  gainers: Mover[];
  losers: Mover[];
  counts: Record<Signal, number>;
  fraudCount: number;
  upcomingCount: number;
  recordSoon: DividendSoon[];
  shortlist: CompanyRow[];
  today: string;
}

export interface DividendsResponse { today: string; upcoming: DividendSoon[] }

export interface CompanyResponse {
  company: {
    code: string;
    name: string;
    sector: string;
    category: string;
    price: number | null;
    changePct: number | null;
    nav: number | null;
    weekHigh52: number | null;
    weekLow52: number | null;
    marketCap?: number | null;
    pe?: number | null;
    eps?: number | null;
    paidUpCapital?: number | null;
    faceValue?: number | null;
    listingYear?: number | null;
    sharePattern?: SharePattern[];
    years?: YearRow[];
    series?: SeriesPoint[];
  };
  analysis: Analysis;
  questions: Question[];
  sectorPe: number | null;
  session: Session | null;
  position: { verdict: { label: string; tone: string; text: string } | null } | null;
}
