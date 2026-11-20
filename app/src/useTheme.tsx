import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { isThemePreference, type Palette, palettes, resolveScheme, type Scheme, type ThemePreference } from './theme.ts';

const KEY = 'themePreference';

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    pad: { padding: 16, gap: 16, paddingBottom: 32 },
    center: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
    card: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
    row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, minHeight: 64, alignItems: 'center' },
    button: { borderColor: c.link, borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    chip: { borderColor: c.outline, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
    pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    input: { flex: 1, color: c.text, minHeight: 44, fontSize: 16 },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderColor: c.outline, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: c.outline, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: c.text, fontSize: 18, fontWeight: '700' },
    big: { color: c.text, fontSize: 32, fontWeight: '800' },
    code: { color: c.text, fontWeight: '800', fontSize: 16 },
    price: { color: c.text, fontWeight: '700', fontSize: 16 },
    text: { color: c.text, fontSize: 15, lineHeight: 21 },
    muted: { color: c.muted, fontSize: 14 },
    link: { color: c.link, fontWeight: '600' },
    error: { color: c.text, textAlign: 'center', fontSize: 16 },
  });
}

const STYLES = { dark: makeStyles(palettes.dark), light: makeStyles(palettes.light) };

interface Theme {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  scheme: Scheme;
  colors: Palette;
  s: (typeof STYLES)['dark'];
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(KEY);
        if (alive && isThemePreference(stored)) setPref(stored);
      } catch (e) {
        console.warn('theme preference read failed', e);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);
  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    (async () => {
      try {
        await AsyncStorage.setItem(KEY, p);
      } catch (e) {
        console.warn('theme preference save failed', e);
      }
    })();
  }, []);
  const scheme = resolveScheme(preference, system);
  const value = useMemo(() => ({ preference, setPreference, scheme, colors: palettes[scheme], s: STYLES[scheme] }), [preference, setPreference, scheme]);
  // Wait for the stored choice (a few ms) so the app never flashes the wrong theme on launch.
  if (!ready) return null;
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
