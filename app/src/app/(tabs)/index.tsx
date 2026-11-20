import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { CompaniesResponse, CompanyRow, DashboardResponse, Mover } from '../../api.ts';
import { changeColor, fmtDate, fmtNum, fmtPct, fmtSigned, fmtTakaSigned, SIGNAL, SIGNAL_ORDER } from '../../format.ts';
import { changedCodes, parseStoredChecks } from '../../checks.ts';
import { catchableDividends } from '../../list.ts';
import { isOpenPlan, loadPlans, parseBudget, type PicksResponse, picksPath, type PlansResponse, STATUS_LOOK } from '../../plans.ts';
import { holdingTotals, loadTrades, type TradesResponse } from '../../trades.ts';
import { CheckPill, Chip, CompanyLine, DividendLine, SectionTitle, SignalPill, Sparkline, Status } from '../../ui.tsx';
import { useApi } from '../../useApi.ts';
import { useWatchlist } from '../../watchlist.ts';
import { useTheme } from '../../useTheme.tsx';

const SHORTLIST_PREVIEW = 5;
const DIVIDENDS_PREVIEW = 5;
const CHECKS_KEY = 'holdingChecks';
const PICKS_KEY = 'picksBudget';
const PICKS_PREVIEW = 5;
const PLANS_PREVIEW = 3;

// Compares today's labels with the last saved ones, then saves today's labels.
function useChangedChecks(data: TradesResponse | null, today: string | undefined): string[] {
  const [changed, setChanged] = useState<string[]>([]);
  useEffect(() => {
    if (!data || !today) return;
    const labels = Object.fromEntries(data.holdings.flatMap((h) => (h.shares > 0 && h.check ? [[h.code, h.check.label]] : [])));
    let alive = true;
    (async () => {
      try {
        const stored = parseStoredChecks(await AsyncStorage.getItem(CHECKS_KEY));
        if (alive) setChanged(changedCodes(stored, labels));
        await AsyncStorage.setItem(CHECKS_KEY, JSON.stringify({ date: today, labels }));
      } catch (e) {
        console.warn('holding checks storage failed', e);
      }
    })();
    return () => { alive = false; };
  }, [data, today]);
  return changed;
}

function HoldingsToday({ data, changed }: { data: TradesResponse; changed: string[] }) {
  const { colors, s } = useTheme();
  const open = data.holdings.filter((h) => h.shares > 0);
  if (!open.length) return null;
  const t = holdingTotals(data.holdings);
  return (
    <Link href="/trades" asChild>
      <Pressable style={s.card} accessibilityRole="button" accessibilityHint="Opens the Trades tab">
        <SectionTitle icon="briefcase-outline" title="Your holdings today" />
        <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
          <Text style={s.price}>৳{fmtNum(t.value)}</Text>
          <Text style={{ color: changeColor(t.unrealised, colors), fontWeight: '700' }}>{fmtTakaSigned(t.unrealised)} unrealised</Text>
        </View>
        {open.map((h) => (
          <View key={h.code} style={[s.sectionRow, { flexWrap: 'wrap' }]}>
            <Text style={[s.code, { minWidth: 72 }]}>{h.code}</Text>
            {h.check && <CheckPill label={h.check.label} tone={h.check.tone} />}
            {changed.includes(h.code) && (
              <View style={s.sectionRow} accessibilityLabel="Changed since you last looked">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warn }} />
                <Text style={[s.muted, { fontSize: 12, color: colors.warn }]}>changed</Text>
              </View>
            )}
          </View>
        ))}
      </Pressable>
    </Link>
  );
}

function PlansToday({ data }: { data: PlansResponse }) {
  const { s } = useTheme();
  const open = data.plans.filter(isOpenPlan);
  if (!open.length) return null;
  return (
    <Link href="/plans" asChild>
      <Pressable style={s.card} accessibilityRole="button" accessibilityHint="Opens your buy plans">
        <SectionTitle icon="bookmark-outline" title="Your buy plans" />
        {open.slice(0, PLANS_PREVIEW).map((p) => (
          <View key={p.id} style={{ gap: 4 }}>
            <View style={[s.sectionRow, { flexWrap: 'wrap' }]}>
              <Text style={[s.code, { minWidth: 72 }]}>{p.code}</Text>
              <CheckPill label={STATUS_LOOK[p.live.status].label} tone={STATUS_LOOK[p.live.status].tone} />
            </View>
            <Text style={s.muted} numberOfLines={2}>{p.live.text}</Text>
          </View>
        ))}
        {open.length > PLANS_PREVIEW && <Text style={s.link}>See all {open.length}</Text>}
      </Pressable>
    </Link>
  );
}

// The budget is remembered on the phone; a storage failure only loses that convenience.
function TodaysPicks() {
  const { colors, s } = useTheme();
  const [raw, setRaw] = useState('');
  const [budget, setBudget] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(PICKS_KEY)
      .then((v) => { const b = parseBudget(v ?? ''); if (b != null) { setBudget(b); setRaw(String(b)); } })
      .catch((e: unknown) => console.warn('picks budget read failed', e));
  }, []);
  const commit = () => {
    const b = parseBudget(raw);
    setBudget(b);
    (b == null ? AsyncStorage.removeItem(PICKS_KEY) : AsyncStorage.setItem(PICKS_KEY, String(b)))
      .catch((e: unknown) => console.warn('picks budget save failed', e));
  };
  const { data, error } = useApi<PicksResponse>(picksPath(budget));
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle icon="sparkles-outline" title="Today's picks" />
      <Text style={s.muted}>Worth researching, no fraud flag, low in its 1-year range or under its 20-day average, not sliding.</Text>
      <TextInput
        accessibilityLabel="Budget in taka for today's picks"
        style={[s.searchBox, s.input, { flex: 0 }]}
        value={raw}
        onChangeText={setRaw}
        onEndEditing={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        placeholder="Budget in ৳ (optional)"
        placeholderTextColor={colors.muted}
      />
      <View style={[s.card, { padding: 0, gap: 0 }]}>
        {error && !data && <Text style={[s.muted, { padding: 16, color: colors.warn }]}>{error}</Text>}
        {data && !data.picks.length && <Text style={[s.muted, { padding: 16 }]}>No company fits today{budget != null ? ' within this budget' : ''}.</Text>}
        {data?.picks.slice(0, PICKS_PREVIEW).map((p) => (
          <Link key={p.code} href={`/c/${encodeURIComponent(p.code)}`} asChild>
            <Pressable style={s.row} accessibilityHint={`Opens ${p.name}`}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.code}>{p.code}</Text>
                <Text style={s.muted} numberOfLines={1}>{p.name}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={s.price}>৳{fmtNum(p.price)}</Text>
                {p.shares != null && p.cost != null && <Text style={s.muted}>{p.shares} for ৳{fmtNum(p.cost)}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ alignSelf: 'center', marginLeft: 8 }} />
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}

function MarketCard({ data }: { data: DashboardResponse }) {
  const { colors, s } = useTheme();
  const { width } = useWindowDimensions();
  const dsex = data.index.find((i) => i.key === 'DSEX');
  const { advanced, unchanged, declined } = data.breadth;
  const total = advanced + unchanged + declined || 1;
  const open = data.session?.isOpen;
  return (
    <View style={s.card}>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <View style={[s.pill, { borderColor: open ? colors.up : colors.muted }]}>
          <Text style={{ color: open ? colors.up : colors.muted, fontWeight: '700', fontSize: 12 }}>{open ? '● Market open' : 'Market closed'}</Text>
        </View>
        {!open && data.session?.next && <Text style={s.muted}>Opens {fmtDate(data.session.next)}</Text>}
      </View>
      <Text style={s.muted}>DSEX index</Text>
      <Text style={s.big}>{fmtNum(dsex?.value)}</Text>
      <Text style={{ color: changeColor(dsex?.change, colors), fontWeight: '700', fontSize: 16 }}>{fmtSigned(dsex?.change)} ({fmtPct(dsex?.percent)})</Text>
      <Sparkline values={data.intraday.map((p) => p.value)} width={width - 66} height={64} color={changeColor(dsex?.change, colors)} />
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }} accessibilityLabel={`${advanced} up, ${unchanged} unchanged, ${declined} down`}>
        <View style={{ flex: advanced / total, backgroundColor: colors.up }} />
        <View style={{ flex: unchanged / total, backgroundColor: colors.muted }} />
        <View style={{ flex: declined / total, backgroundColor: colors.down }} />
      </View>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.up }}>{advanced} up</Text>
        <Text style={s.muted}>{unchanged} same</Text>
        <Text style={{ color: colors.down }}>{declined} down</Text>
      </View>
      {data.session?.dataTime && <Text style={s.muted}>DSE data: {data.session.dataTime}</Text>}
    </View>
  );
}

function Movers({ data }: { data: DashboardResponse }) {
  const { colors, s } = useTheme();
  const [side, setSide] = useState<'gainers' | 'losers'>('gainers');
  const list: Mover[] = data[side];
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle icon="flash-outline" title={data.session?.isOpen ? "Today's movers" : "Last session's movers"} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Top gainers" active={side === 'gainers'} onPress={() => setSide('gainers')} color={colors.up} />
        <Chip label="Top losers" active={side === 'losers'} onPress={() => setSide('losers')} color={colors.down} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {list.map((m) => (
          <Link key={m.code} href={`/c/${encodeURIComponent(m.code)}`} asChild>
            <Pressable style={StyleSheet.flatten([s.card, { width: 130, padding: 12, gap: 4 }])}>
              <Text style={s.code} numberOfLines={1}>{m.code}</Text>
              <Text style={{ color: changeColor(m.percent, colors), fontSize: 20, fontWeight: '800' }}>{fmtPct(m.percent)}</Text>
              <Text style={s.muted}>৳{fmtNum(m.price)}</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}

function SignalCounts({ data }: { data: DashboardResponse }) {
  const { colors, s } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle icon="pulse-outline" title={`${Object.values(data.counts).reduce((a, b) => a + b, 0)} companies checked`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {SIGNAL_ORDER.map((k) => (
          <Link key={k} href={{ pathname: '/companies', params: { signal: k } }} asChild>
            <Pressable style={StyleSheet.flatten([s.card, { width: '48%', padding: 12, gap: 2, borderLeftWidth: 4, borderLeftColor: colors[SIGNAL[k].tone] }])}>
              <Text style={{ color: colors[SIGNAL[k].tone], fontSize: 24, fontWeight: '800' }}>{data.counts[k] ?? 0}</Text>
              <Text style={[s.text, { fontWeight: '700' }]}>{SIGNAL[k].label}</Text>
              <Text style={[s.muted, { fontSize: 12 }]} numberOfLines={2}>{SIGNAL[k].text}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </View>
  );
}

function DividendsSoon({ data }: { data: DashboardResponse }) {
  const { s } = useTheme();
  const items = catchableDividends(data.recordSoon, data.today);
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle icon="cash-outline" title="Dividends you can still catch" action={{ label: 'See all', href: '/dividends' }} />
      <Text style={s.muted}>Buy by the date shown to get the dividend. Clean companies first.</Text>
      <View style={[s.card, { padding: 0, gap: 0 }]}>
        {items.slice(0, DIVIDENDS_PREVIEW).map((x) => <DividendLine key={x.d.code} item={x} />)}
      </View>
    </View>
  );
}

function WatchlistToday({ rows }: { rows: CompanyRow[] }) {
  const { colors, s } = useTheme();
  if (!rows.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle icon="star" title="Your watchlist today" action={{ label: 'Open', href: '/watchlist' }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {rows.map((r) => (
          <Link key={r.code} href={`/c/${encodeURIComponent(r.code)}`} asChild>
            <Pressable style={StyleSheet.flatten([s.card, { width: 150, padding: 12, gap: 4 }])}>
              <Text style={s.code} numberOfLines={1}>{r.code}</Text>
              <Text style={{ color: changeColor(r.changePct, colors), fontSize: 18, fontWeight: '800' }}>{fmtPct(r.changePct)}</Text>
              <SignalPill signal={r.signal} small />
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}

export default function Home() {
  const { colors, s } = useTheme();
  const { data, error, loading, reload } = useApi<DashboardResponse>('/api/dashboard');
  const companies = useApi<CompaniesResponse>('/api/companies');
  const { codes, refresh } = useWatchlist();
  useFocusEffect(refresh);
  const watched = (companies.data?.rows ?? []).filter((r) => codes.includes(r.code));
  // Any trades error (no key, not set up, offline) hides the card; useApi already logs it with console.warn.
  const trades = useApi<TradesResponse>('/api/trades', loadTrades);
  // Any plans error (no key, not set up, offline) hides the card as well.
  const plans = useApi<PlansResponse>('/api/plans', loadPlans);
  const reloadPlans = plans.reload;
  const reloadTrades = trades.reload;
  const firstFocus = useRef(true);
  // Tabs stay mounted: refresh the holdings card when the user comes back from Trades, but not on the first focus.
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    reloadTrades();
    reloadPlans();
  }, [reloadTrades, reloadPlans]));
  const changed = useChangedChecks(trades.data, data?.today);
  return (
    <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
      <ScrollView keyboardShouldPersistTaps="handled" style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { reload(); trades.reload(); plans.reload(); }} tintColor={colors.link} />}>
        {data && (
          <>
            {trades.data && <HoldingsToday data={trades.data} changed={changed} />}
            {plans.data && !plans.error && <PlansToday data={plans.data} />}
            <MarketCard data={data} />
            <WatchlistToday rows={watched} />
            <TodaysPicks />
            <Movers data={data} />
            <SignalCounts data={data} />
            <DividendsSoon data={data} />
            <View style={{ gap: 10 }}>
              <SectionTitle icon="ribbon-outline" title="Shortlist" action={{ label: 'See all', href: { pathname: '/companies', params: { signal: 'research' } } }} />
              <Text style={s.muted}>Best scores among companies that pass every check.</Text>
              <View style={[s.card, { padding: 0, gap: 0 }]}>
                {data.shortlist.length
                  ? data.shortlist.slice(0, SHORTLIST_PREVIEW).map((r) => <CompanyLine key={r.code} row={r} />)
                  : <Text style={[s.muted, { padding: 16 }]}>No company passes every check today.</Text>}
              </View>
            </View>
            {error && <Text style={[s.muted, { color: colors.warn }]}>Showing older data: {error}</Text>}
            <View style={[s.sectionRow, { opacity: 0.8 }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
              <Text style={[s.muted, { flex: 1, fontSize: 12 }]}>Signals are learning aids from fixed rules, not investment advice.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </Status>
  );
}
