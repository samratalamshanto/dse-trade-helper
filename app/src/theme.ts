// Pure (no React Native imports) so node --test can check the palettes.

export interface Palette {
  bg: string;
  card: string;
  cardHi: string;
  border: string; // decorative: card edges and row dividers
  outline: string; // control edges a user must see: inputs, chips, bar tracks
  text: string;
  muted: string;
  up: string;
  down: string;
  warn: string;
  link: string;
  onLink: string; // text on a filled `link` button
}

export const dark: Palette = {
  bg: '#0b1220',
  card: '#131c2e',
  cardHi: '#1a2540',
  border: '#24304a',
  outline: '#6b7a96',
  text: '#e6ebf5',
  muted: '#9aa6be',
  up: '#22c55e',
  down: '#f87171',
  warn: '#f59e0b',
  link: '#60a5fa',
  onLink: '#0b1220',
};

export const light: Palette = {
  bg: '#f3f5f9',
  card: '#ffffff',
  cardHi: '#eaeef5',
  border: '#dbe1ea',
  outline: '#7b879c',
  text: '#0f172a',
  muted: '#4a5568',
  up: '#166534',
  down: '#991b1b',
  warn: '#92400e',
  link: '#1e40af',
  onLink: '#ffffff',
};

export type Scheme = 'light' | 'dark';
export type ThemePreference = 'system' | Scheme;
export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];
export const palettes: Record<Scheme, Palette> = { dark, light };

// Five distinct colours for parts-of-a-whole charts (pie slices and their legend dots); each needs 3:1 on the card.
export const SERIES: Record<Scheme, readonly string[]> = {
  dark: ['#60a5fa', '#f59e0b', '#a78bfa', '#2dd4bf', '#f472b6'],
  light: ['#1d4ed8', '#b45309', '#6d28d9', '#0f766e', '#be185d'],
};

export function isThemePreference(x: unknown): x is ThemePreference {
  return typeof x === 'string' && (THEME_PREFERENCES as string[]).includes(x);
}

// Unknown system scheme (null) keeps the app's original dark look.
export function resolveScheme(preference: ThemePreference, system: Scheme | null | undefined): Scheme {
  return preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
}

function channels(hex: string): number[] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

// Colour `fg` drawn at `alpha` over `bg`, as #rrggbb — how the '22' tinted pills render.
export function mix(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  return '#' + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
