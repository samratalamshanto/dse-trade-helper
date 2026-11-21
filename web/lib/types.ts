export interface YearRow {
  year: number;
  eps?: number | null;
  nav?: number | null;
  profit?: number | null;
  pe?: number | null;
  dividend?: number | null;
  // Every other yearly DSE field (restated / diluted EPS, NAV and P/E, comprehensive income, OCI, reserve).
  [key: string]: unknown;
}

export interface Dividend {
  year: number;
  cash?: number | null;
  stock?: number | null;
  yieldPct?: number | null;
  rights?: string | null;
}

export interface SharePattern {
  date?: string | null;
  sponsor?: number | null;
  institution?: number | null;
  foreign?: number | null;
  government?: number | null;
  public?: number | null;
  [key: string]: unknown;
}

export interface SeriesPoint {
  date: string;
  price: number;
  volume: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  trades?: number | null;
}

export interface Declaration {
  announced?: string | null;
  cashPct?: number | null;
  stockPct?: number | null;
  noDividend?: boolean;
  interim?: boolean;
  partial?: boolean;
  eps?: number | null;
  periodEnd?: string | null;
  recordDate?: string | null;
  agmDate?: string | null;
  paidOn?: string | null;
  lastBuyDate?: string | null;
  lastBuyEstimated?: boolean;
}

export interface DirectorTrade {
  date: string | null;
  side: string;
  who: string;
}

export interface Events {
  declarations: Declaration[];
  recordDates?: string[];
  disbursements?: Array<{ date: string | null; periodEnd: string | null }>;
  directorTrades?: DirectorTrade[];
  spotWindows?: Array<{ lastCum: string | null; recordDate: string | null }>;
}

export interface InterimEpsRow {
  metric?: string;
  nine?: number;
  q3?: number;
  half?: number;
  q2?: number;
  q1?: number;
  [key: string]: unknown;
}

export interface InterimFinancials {
  periods: Record<string, unknown>;
  eps: InterimEpsRow;
  rows?: InterimEpsRow[];
}

export interface PeTrendPoint { date: string; audited?: number | null; unaudited?: number | null }

export interface NewsItem { date: string | null; type: string | null; summary: string; body: string }

export interface Company {
  version: number;
  code: string;
  name: string;
  sector: string;
  category: string;
  price: number | null;
  changePct?: number | null;
  marketCap?: number | null;
  pe?: number | null;
  eps?: number | null;
  nav?: number | null;
  dividendYield?: number | null;
  weekHigh52?: number | null;
  weekLow52?: number | null;
  paidUpCapital?: number | null;
  faceValue?: number | null;
  listingYear?: number | null;
  yearEnd?: string | null;
  agmDate?: string | null;
  website?: string | null;
  operationalStatus?: string | null;
  loanStatus?: { shortTerm?: number | null; longTerm?: number | null } | null;
  sharePattern: SharePattern[];
  dividends: Dividend[];
  years: YearRow[];
  interim?: InterimFinancials | null;
  peLatest?: unknown;
  events?: Events;
  news?: NewsItem[];
  series: SeriesPoint[];
  asOf?: string | null;
  peTrend?: PeTrendPoint[];
  // The rest of DSE's company block: ISIN, free float, capital, contacts, links, today's session quote.
  details?: Record<string, unknown>;
}

export interface FraudFlag {
  title: string;
  detail: string;
  why: string;
}

export interface Check {
  ok: boolean;
  label: string;
  detail: string;
  why: string;
}

export interface Reason {
  tone: string;
  text: string;
}

export interface Metrics {
  announcedEps: { year: number; eps: number; pe: null; announced: string } | null;
  growthFrom: number | null;
  // Span in years of epsCagr (bonus-adjusted EPS, last 5 yearly results).
  growthYears: number | null;
  interim: { value: number; label: string; period: string | null } | null;
  interimLoss: boolean;
  latestYield: number | null;
  yieldBasis: string;
  // Set when a late-paid older (or repeated) final was left out of the 12-month yield.
  yieldNote: string | null;
  reportedYear: number | null;
  changeToday: number | null;
  epsNow: number | null;
  epsPrev: number | null;
  epsYears?: YearRow[];
  epsAllPositive: boolean;
  epsGrowing: boolean;
  epsFellTwice: boolean;
  epsCagr: number | null;
  pe: number | null;
  // The EPS behind the headline P/E, e.g. 'FY Jun-2026 audited (announced)'; peOthers are DSE's own P/Es, labelled.
  peBasis: string | null;
  peEpsYear: number | null;
  peOthers: Array<{ label: string; value: number }>;
  pb: number | null;
  avgPastPe: number | null;
  change1m: number | null;
  change3m: number | null;
  change1y: number | null;
  maxDrawdown: number | null;
  avgDailyValue: number | null;
  volumeSpike: number | null;
  sponsorNow: number | null;
  sponsorDrop: number;
  sponsorSince: string | null;
  dividendYears: number;
  latestYear: number | null;
  priceNow: number | null;
  // No trade in the 365-day window; lastTradeDate is the newest day with a trade in the stored series.
  illiquid: boolean;
  lastTradeDate: string | null;
}

export interface Analysis {
  signal: 'avoid' | 'caution' | 'neutral' | 'research';
  score: number;
  quality: boolean;
  notRated: boolean;
  fraud: { level: 'clean' | 'suspicious' | 'high'; flags: FraudFlag[] };
  checks: Check[];
  reasons: Reason[];
  history: string[];
  suggestion: string;
  metrics: Metrics;
}

export interface SummaryYear {
  year: number;
  profit: number | null;
  eps: number | null;
  nav: number | null;
  roe: number | null;
  pe: number | null;
  pb: number | null;
  dps: number | null;
  stockPct: number;
  payout: number | null;
  dividendYield: number | null;
}

export interface Summary {
  years: SummaryYear[];
  growth: { profit: number | null; eps: number | null; nav: number | null; dps: number | null };
  average: { roe: number | null; payout: number | null; pe: number | null; dividendYield: number | null };
  span: number;
}

export interface PriceBand {
  low: number;
  high: number;
  avg: number;
  now: number;
  position: number;
}

export interface PriceHistoryPoint {
  year: number;
  pe: number;
  price: number;
  nextPrice: number;
  change: number;
}

export interface PricePosition {
  price: PriceBand | null;
  pe: PriceBand | null;
  zone: 'low' | 'high' | 'middle' | null;
  verdict: { key: string; label: string; tone: string; text: string } | null;
  history: PriceHistoryPoint[];
  cheapYears: number;
  cheapYearsUp: number;
  usualPe: number | null;
}

export interface DividendStatus {
  latest: Declaration | null;
  upcoming: Declaration | null;
  recordToday: Declaration | null;
  canStillBuy: boolean;
  nextExpected: string | null;
  regular: boolean;
  today: string;
  skippedLast: boolean;
  // Newest dividend whose record date has passed with no payment notice yet, until AGM + 45 days.
  unpaid: Declaration | null;
}

export interface DividendRecordRow {
  year: number;
  cashPct: number | null;
  cashPerShare: number | null;
  stockPct: number | null;
  rights: string | null;
  payout: number | null;
  yieldPct: number | null;
  // A year DSE's yearly record does not list yet, taken from the board's declaration.
  declared: boolean;
  announcedCashPct: number | null;
  note: string | null;
}

export interface Question {
  q: string;
  answer: 'yes' | 'partly' | 'no' | 'unknown';
  text: string;
  tab: string;
  label?: string;
}
