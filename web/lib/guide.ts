export const GUIDE_KEY = 'guideShown';

export function shouldShowGuide(stored: string | null): boolean {
  return stored !== '1';
}

export const GUIDE_STEPS = [
  'Move around with the sidebar. On a phone, tap Menu to open it.',
  'Dashboard shows the market today. Companies lists every DSE stock. Compare puts stocks side by side.',
  'Fraud alerts flags unusual patterns. Signal scorecard ranks companies by our quality rules.',
  'Watchlist saves stocks to follow. Portfolio tracks holdings. Buy plans and Alerts let you plan entries.',
  'How it works explains every signal in plain words. Start investing is a short reading plan for new investors.',
  'Search in the top bar to find any company by name or code. The globe button switches to Bangla. The moon button toggles dark mode.',
];
