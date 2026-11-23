// The user's own investment plan (written by them); kept as data so the page logic stays generic.
export interface PlanCompany {
  code: string; name: string; sector: string; verdict: string; good: boolean; why: string;
  periods: string[]; series: Record<string, number[]>; positive: string; warning: string; final: string; trend: string; link: string;
}

export const PLAN_COMPANIES: PlanCompany[] = [
  {
    code: 'SQURPHARMA', name: 'Square Pharmaceuticals PLC', sector: 'Pharmaceuticals', verdict: "Passed the example's checks", good: true,
    why: 'Established pharmaceutical operations, a strong domestic market position, consistent profit and a long dividend record.',
    periods: ['2020–21', '2021–22', '2022–23', '2023–24', '2024–25'],
    series: { 'EPS (৳)': [17.99, 20.51, 21.41, 23.61, 27.04], 'NAV/share (৳)': [102.54, 116.70, 129.95, 142.05, 157.88] },
    positive: 'EPS rose about 50% in four years. NAV also grew steadily. FY2024–25 dividend: 120%.',
    warning: 'FY2024–25 standalone net profit fell 5.47% while revenue was almost flat. Watch margins and cost growth, not only EPS.',
    final: 'In this worked example, it passed the 5-year checks. A low P/E does not automatically mean the share is cheap.',
    trend: 'Consistently growing', link: 'https://www.squarepharma.com.bd/annual-reports.php',
  },
  {
    code: 'BRACBANK', name: 'BRAC Bank PLC', sector: 'Banking', verdict: "Passed the example's checks", good: true,
    why: 'SME, retail and corporate banking operations with fast profit growth.',
    periods: ['2021', '2022', '2023', '2024', '2025'],
    series: { 'EPS (৳)': [3.93, 4.02, 4.73, 6.95, 9.12], 'NAV/share (৳)': [41.08, 40.86, 41.36, 44.11, 51.56], 'Net profit (৳ crore)': [546.5, 601.4, 761.0, 1229.6, 1816.3] },
    positive: 'EPS more than doubled from 2021 to 2025. 2025 dividend: 15% cash + 15% stock. 2026 nine-month EPS: ৳7.70.',
    warning: 'Check non-performing loans, loan-loss provisions, capital adequacy, deposit costs and troubled borrowers. A bank can grow EPS while loan quality falls, so do not judge a bank on P/E alone.',
    final: 'In this worked example, it passed the 5-year checks.',
    trend: 'Rapid growth', link: 'https://www.dse.com.bd/company/BRACBANK',
  },
  {
    code: 'GP', name: 'Grameenphone Ltd', sector: 'Telecommunications', verdict: 'Did not pass yet', good: false,
    why: 'A strong telecom business with large operating cash flow.',
    periods: ['2021', '2022', '2023', '2024', '2025'],
    series: { 'EPS (৳)': [25.28, 22.29, 24.49, 26.89, 21.90], 'Dividend/share (৳)': [25.00, 22.00, 12.50, 33.00, 21.50] },
    positive: 'Useful as a dividend company.',
    warning: '2025 revenue was ৳158.06 bn, almost flat on 2024, while net profit fell 18.5%.',
    final: 'In this worked example, it did not pass the 5-year checks because earnings fell in 2025.',
    trend: 'Declining in 2025', link: 'https://www.grameenphone.com/about/investor-relations',
  },
  {
    code: 'MARICO', name: 'Marico Bangladesh Ltd', sector: 'Consumer goods', verdict: 'Did not pass yet', good: false,
    why: 'Strong revenue growth.',
    periods: ['2021–22', '2022–23', '2023–24', '2024–25', '2025–26'],
    series: { 'Revenue (৳ crore)': [1303, 1414, 1452, 1631, 2071] },
    positive: 'FY2025–26 profit after tax: ৳649 crore.',
    warning: 'The share price is high (above ৳2,600). One share takes a large part of a small monthly budget.',
    final: 'In this worked example, it did not pass because one share costs more than a small monthly budget allows.',
    trend: 'Strong revenue growth', link: 'https://www.dse.com.bd/company/MARICO',
  },
];

export const ALLOCATION = [
  { code: 'SQURPHARMA', label: 'Square Pharma (example)', note: 'Core long-term holding', pct: 45, color: '--accent' },
  { code: 'BRACBANK', label: 'BRAC Bank (example)', note: 'Banking-sector exposure', pct: 35, color: '--up' },
  { code: null, label: 'Cash', note: 'Future chances and risk buffer', pct: 20, color: '--muted' },
] as const;

export const MONTHLY_SPLIT: [string, number][] = [['Square Pharma (example)', 0.4], ['BRAC Bank (example)', 0.3], ['Cash', 0.2], ['Extra opportunity', 0.1]];
export const RESEARCH = ['SQURPHARMA', 'BRACBANK', 'EBL', 'CITYBANK', 'GP', 'MARICO', 'BERGERPBL', 'WALTONHIL', 'LHB', 'UPGDCL'];
export const INITIAL_CHOICES = [10000, 20000, 30000, 40000, 50000];
export const GROWTH_YEARS = 5;
export const GROWTH_RATES = [0, 4, 8, 12];

// Future value: initial lump sum plus a payment at the end of each month, compounded monthly.
export function futureValue(initial: number, monthly: number, annualPct: number, months: number): number {
  const r = annualPct / 100 / 12;
  if (r === 0) return initial + monthly * months;
  const g = Math.pow(1 + r, months);
  return initial * g + (monthly * (g - 1)) / r;
}
