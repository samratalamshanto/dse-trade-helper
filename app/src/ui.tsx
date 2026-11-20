import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, type PressableProps, StyleSheet, Text, useAnimatedValue, View, type ViewStyle } from 'react-native';
import Svg, { Polygon, Polyline } from 'react-native-svg';
import type { CompanyRow, Signal } from './api.ts';
import { sparkPoints } from './chart.ts';
import { checkColor } from './checks.ts';
import { changeColor, daysLeftText, fmtDate, fmtNum, fmtPct, SIGNAL } from './format.ts';
import type { Catchable } from './list.ts';
import { useTheme } from './useTheme.tsx';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface StatusProps { loading: boolean; error: string | null; onRetry: () => void; children: ReactNode }

export function Status({ loading, error, onRetry, children }: StatusProps) {
  const { colors, s } = useTheme();
  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={s.error}>{error}</Text>
        <Button label="Try again" onPress={onRetry} />
      </View>
    );
  }
  if (loading) {
    return (
      <View style={s.center}>
        <MarketLoader />
        <Text style={s.muted}>Loading DSE data…</Text>
      </View>
    );
  }
  return <>{children}</>;
}

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  style?: ViewStyle; // layout only (flex, minHeight); colours come from the variant
}

// Rest props are forwarded so it works as the child of <Link asChild> (which injects onPress/href/role).
export function Button({ label, icon, variant = 'secondary', loading = false, disabled, style, accessibilityLabel, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? colors.onLink : variant === 'danger' ? colors.down : colors.link;
  const base: ViewStyle = {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1,
    backgroundColor: primary ? colors.link : colors.card,
    borderColor: primary ? colors.link : variant === 'danger' ? colors.down : colors.outline,
  };
  const off = disabled || loading;
  return (
    <Pressable
      {...rest}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => StyleSheet.flatten([base, style, { opacity: off ? 0.5 : pressed ? 0.75 : 1 }])}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const CANDLES = [0.55, 0.8, 0.4, 0.95, 0.6, 0.75];
const CANDLE_HEIGHT = 44;

// A looping wave of candlesticks; reduced motion shows one still frame.
export function MarketLoader() {
  const { colors } = useTheme();
  const t = useAnimatedValue(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    let alive = true;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => { if (!alive) return; setStill(reduce); if (!reduce) loop.start(); })
      .catch((e: unknown) => { console.warn('reduce motion check failed', e); if (alive) loop.start(); });
    return () => { alive = false; loop.stop(); };
  }, [t]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: CANDLE_HEIGHT + 12 }} accessibilityRole="progressbar" accessibilityLabel="Loading DSE data">
      {CANDLES.map((h, i) => {
        const up = i % 2 === 0;
        const color = up ? colors.up : colors.down;
        const phase = i / CANDLES.length;
        const scaleY = still ? h : t.interpolate({
          inputRange: [0, phase, Math.min(phase + 0.5, 1), 1],
          outputRange: [h * 0.6, 1, h * 0.4, h * 0.6],
        });
        return (
          <Animated.View key={i} style={{ width: 10, height: CANDLE_HEIGHT, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY }] }}>
            <View style={{ position: 'absolute', width: 2, top: 0, bottom: 0, backgroundColor: color }} />
            <View style={{ width: 10, height: CANDLE_HEIGHT * 0.6, borderRadius: 2, backgroundColor: color }} />
          </Animated.View>
        );
      })}
    </View>
  );
}

export function CheckPill({ label, tone }: { label: string; tone: string }) {
  const { colors, s } = useTheme();
  const color = checkColor(tone, colors);
  return (
    <View style={[s.pill, { borderColor: color, backgroundColor: color + '22', alignSelf: 'flex-start' }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function SignalPill({ signal, small = false }: { signal: Signal; small?: boolean }) {
  const { colors, s } = useTheme();
  const sig = SIGNAL[signal];
  const color = colors[sig.tone];
  return (
    <View style={[s.pill, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={{ color, fontSize: small ? 11 : 13, fontWeight: '700' }}>{sig.label}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, color: tint }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  const { colors, s } = useTheme();
  const color = tint ?? colors.link;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[s.chip, active && { backgroundColor: color + '33', borderColor: color }]}
    >
      <Text style={{ color: active ? color : colors.text, fontWeight: active ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Sparkline({ values, width, height, color, fill = false }: { values: number[]; width: number; height: number; color: string; fill?: boolean }) {
  const points = sparkPoints(values, width, height);
  if (!points) return null;
  return (
    <Svg width={width} height={height}>
      {fill && <Polygon points={`0,${height} ${points} ${width},${height}`} fill={color} fillOpacity={0.15} />}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function ScoreBar({ score, color }: { score: number; color: string }) {
  const { s } = useTheme();
  const pct = Math.max(0, Math.min(100, score));
  return (
    <View style={s.barTrack} accessibilityLabel={`Score ${pct} out of 100`}>
      <View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function SectionTitle({ icon, title, action }: { icon: IconName; title: string; action?: { label: string; href: Href } }) {
  const { colors, s } = useTheme();
  return (
    <View style={s.sectionRow}>
      <Ionicons name={icon} size={20} color={colors.link} />
      <Text style={[s.title, { flex: 1 }]}>{title}</Text>
      {action && <Link href={action.href} style={s.link}>{action.label}</Link>}
    </View>
  );
}

export function DividendLine({ item }: { item: Catchable }) {
  const { colors, s } = useTheme();
  const { d, tradingDaysLeft, lastDayIsToday } = item;
  const parts = [d.cashPct != null ? `${d.cashPct}% cash` : null, d.stockPct ? `${d.stockPct}% bonus` : null].filter(Boolean).join(' + ');
  return (
    <Link href={`/c/${encodeURIComponent(d.code)}`} asChild>
      <Pressable style={s.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.code}>{d.code}{d.fraud !== 'clean' ? '  ⚠ risky' : ''}</Text>
          <Text style={s.muted} numberOfLines={1}>{parts}{d.yieldPct != null ? ` · ${fmtNum(d.yieldPct)}% yield` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ color: tradingDaysLeft <= 2 ? colors.warn : colors.text, fontWeight: '700' }}>{daysLeftText(tradingDaysLeft, lastDayIsToday)}</Text>
          <Text style={s.muted}>Buy by {fmtDate(d.lastBuyDate)}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

export function CompanyLine({ row }: { row: CompanyRow }) {
  const { colors, s } = useTheme();
  return (
    <Link href={`/c/${encodeURIComponent(row.code)}`} asChild>
      <Pressable style={s.row} accessibilityHint={`Opens ${row.name}`}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.code}>{row.code}</Text>
            <SignalPill signal={row.signal} small />
          </View>
          <Text style={s.muted} numberOfLines={1}>{row.name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={s.price}>৳{fmtNum(row.price)}</Text>
          <Text style={{ color: changeColor(row.changePct, colors), fontWeight: '600' }}>{fmtPct(row.changePct)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ alignSelf: 'center', marginLeft: 8 }} />
      </Pressable>
    </Link>
  );
}
