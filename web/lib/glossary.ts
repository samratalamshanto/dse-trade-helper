// Plain-text learning content shared by the web Learn page and the mobile app.
export const SIGNAL_TEXT = {
  research: { label: 'Passes the checks', text: 'Passes all 8 rule checks and has no warning sign.' },
  neutral: { label: 'No strong signal', text: 'Not bad, but misses one or more quality checks.' },
  caution: { label: 'Caution', text: 'Has a warning: falling profit, high price, thin trading or one warning sign.' },
  avoid: { label: 'High risk', text: 'Loss-making, category Z, or several warning-sign patterns. If you hold it, re-read its disclosures.' },
} as const;

export const FLAGS: [string, string][] = [
  ['Fast price rise', 'Price up more than 30% in 1 month, 50% in 3 months or 100% in 1 year, while yearly earnings grew less than 10%.'],
  ['Volume spike', 'Volume 5× or more above the 3-month average, together with a price move of 5%+ in a day or 15%+ in a month.'],
  ['Sponsors selling', 'Owner holding fell 2 points or more.'],
  ['Small company, fast rise', 'Paid-up capital under ৳30 crore, up 25%+ in 3 months, with no earnings growth.'],
  ['Directors plan to sell', 'A director or sponsor sell notice on DSE in the last 6 months.'],
  ['Sudden profit jump', 'From a loss to a profit, or profit tripled in one year.'],
  ['Old financials', 'No yearly result for last year.'],
  ['Loss-making but rising', 'A loss, yet the price is up 20%+ in 3 months.'],
  ['Category Z', 'DSE marks companies that miss AGMs, skip dividends or stop work.'],
];

export const TERMS: [string, string][] = [
  ['EPS (earnings per share)', 'Yearly profit ÷ number of shares. EPS ৳10 means each share earned ৳10 last year.'],
  ['P/E (price to earnings)', 'Price ÷ EPS. A P/E of 8 means you pay ৳8 for each ৳1 of yearly profit. Compare it with the same sector and with the company\'s own past.'],
  ['NAV (net asset value) and P/B', 'NAV is what the company owns minus what it owes, per share. P/B is price ÷ NAV. A P/B above 5 is expensive for most DSE shares.'],
  ['Dividend yield', 'Yearly cash dividend ÷ price. A 5% yield on ৳200 pays ৳10 a year.'],
  ['Categories A, B, N, Z', 'A: holds AGMs and pays 10%+ dividend. B: pays less than 10%. N: newly listed. Z: missed AGMs, no dividend, or stopped operating.'],
  ['Sponsor / director holding', 'Shares held by the owners. BSEC rules require at least 30% together.'],
  ['Dividend % and taka per share', 'DSE states dividends as a % of the face value, which is usually ৳10. So 130% cash = ৳13 per share, and 10% = ৳1.'],
  ['Cash, bonus, interim and final', 'Cash dividend: money paid to you. Bonus (stock) dividend: free extra shares, the price adjusts down. Interim: paid during the year. Final: paid after the yearly results.'],
  ['Last day to buy (cum date)', 'The last trading day on which buying the share still gets you the dividend. DSE moves the share to the spot market for a few days before the record date and states this date in its notice.'],
  ['Record date', 'The day the company checks who owns the share. Owners on this day get the dividend. Buying on the record date itself is too late.'],
  ['AGM (annual general meeting)', 'The yearly meeting where shareholders approve the dividend. Payment usually follows within about a month.'],
  ['Quarterly (interim) results', 'Unaudited results for 3, 6 or 9 months. A loss there is an early warning, even when the last full year was profitable.'],
  ['Price vs own history', 'Compares today\'s P/E with the company\'s own P/E over the last 5 years, then checks whether earnings still grow. Near its low with growing earnings is "Possible value". Near its low with falling earnings is "Cheap for a reason". It is not a prediction: a cheap share can stay cheap.'],
  ['Score', 'Each signal has its own range: High risk 0–30, Caution 31–60, No strong signal 61–75, Passes the checks 76–100. Inside a range, a company ranks higher for passing more checks, faster earnings growth, a P/E below its sector and its own past, and a higher dividend yield.'],
];

export const CATEGORY_TEXT: Record<string, string> = {
  A: 'Category A: holds its AGM and pays a 10%+ dividend.',
  B: 'Category B: holds its AGM but paid less than a 10% dividend.',
  N: 'Category N: newly listed, no full year on DSE yet.',
  Z: 'Category Z: missed AGMs, paid no dividend or stopped operating. Highest risk on DSE.',
};
