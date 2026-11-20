import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { changeColor, fmtDate, fmtNum, fmtPct, fmtTakaSigned } from '../../format.ts';
import { groupByDate, holdingTotals, loadTrades, type HoldingRow, type Trade, type TradesResponse } from '../../trades.ts';
import { Button, CheckPill, Status } from '../../ui.tsx';
import { useApi } from '../../useApi.ts';
import { useTheme } from '../../useTheme.tsx';

const SIDE_TONE = { BUY: 'up', SELL: 'down' } as const;

function Summary({ data }: { data: TradesResponse }) {
  const { colors, s } = useTheme();
  const t = holdingTotals(data.holdings);
  return (
    <View style={s.card}>
      <Text style={s.muted}>Holdings value</Text>
      <Text style={s.big}>৳{fmtNum(t.value)}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.muted, { fontSize: 12 }]}>Unrealised P/L</Text>
          <Text style={{ color: changeColor(t.unrealised, colors), fontWeight: '700' }}>{fmtTakaSigned(t.unrealised)} ({fmtPct(t.unrealisedPct)})</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.muted, { fontSize: 12 }]}>Realised P/L</Text>
          <Text style={{ color: changeColor(t.realised, colors), fontWeight: '700' }}>{fmtTakaSigned(t.realised)}</Text>
        </View>
      </View>
      {t.unpriced > 0 && <Text style={[s.muted, { color: colors.warn }]}>{t.unpriced} holding{t.unpriced > 1 ? 's have' : ' has'} no live price, so {t.unpriced > 1 ? 'they are' : 'it is'} left out of value and P/L.</Text>}
    </View>
  );
}

function HoldingLine({ h }: { h: HoldingRow }) {
  const { colors, s } = useTheme();
  const closed = h.shares === 0;
  const [open, setOpen] = useState(false);
  const check = closed ? null : h.check;
  const all = check?.reasons ?? [];
  const reasons = open ? all : all.slice(0, 1);
  const more = all.length > 1;
  return (
    <Pressable
      style={s.row}
      onPress={more ? () => setOpen((o) => !o) : undefined}
      disabled={!more}
      accessibilityRole={more ? 'button' : undefined}
      accessibilityState={more ? { expanded: open } : undefined}
      accessibilityHint={more ? (open ? 'Shows fewer reasons' : 'Shows all reasons') : undefined}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.code}>{h.code}</Text>
        <Text style={s.muted}>{closed ? 'Sold out' : `${h.shares.toLocaleString('en-US')} ${h.shares === 1 ? 'share' : 'shares'} · avg ৳${fmtNum(h.avgCost)}`}</Text>
        {check && <CheckPill label={check.label} tone={check.tone} />}
        {reasons.map((r) => <Text key={r} style={[s.muted, { fontSize: 12 }]}>• {r}</Text>)}
        {more && <Text style={[s.link, { fontSize: 12 }]}>{open ? 'Show less' : `Show ${all.length - 1} more`}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {closed
          ? <Text style={{ color: changeColor(h.realised, colors), fontWeight: '700' }}>{fmtTakaSigned(h.realised)} realised</Text>
          : <>
              <Text style={s.price}>{h.value == null ? 'No price' : `৳${fmtNum(h.value)}`}</Text>
              <Text style={{ color: changeColor(h.unrealised, colors), fontWeight: '600' }}>{h.unrealised == null ? '—' : `${fmtTakaSigned(h.unrealised)}`}</Text>
            </>}
      </View>
    </Pressable>
  );
}

function TradeLine({ t }: { t: Trade }) {
  const { colors, s } = useTheme();
  const side = colors[SIDE_TONE[t.side]];
  const params = { id: t.id, date: t.date, code: t.code, side: t.side, quantity: String(t.quantity), price: String(t.price), commission: t.commission == null ? '' : String(t.commission), note: t.note };
  return (
    <Link href={{ pathname: '/trade', params }} asChild>
      <Pressable style={s.row} accessibilityHint="Opens the trade to edit or delete it">
        <View style={{ flex: 1, gap: 4 }}>
          <View style={s.sectionRow}>
            <Text style={s.code}>{t.code}</Text>
            <View style={[s.pill, { borderColor: side, backgroundColor: side + '22' }]}>
              <Text style={{ color: side, fontSize: 11, fontWeight: '700' }}>{t.side}</Text>
            </View>
          </View>
          {t.note ? <Text style={s.muted} numberOfLines={1}>{t.note}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={s.price}>{t.quantity.toLocaleString('en-US')} × ৳{fmtNum(t.price)}</Text>
          <Text style={s.muted}>{t.commission == null ? 'No commission' : `Commission ৳${fmtNum(t.commission)}`}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: 8 }} />
      </Pressable>
    </Link>
  );
}

function Header({ data }: { data: TradesResponse }) {
  const { colors, s } = useTheme();
  return (
    <View style={[s.pad, { paddingBottom: 0 }]}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Link href="/trade" asChild>
          <Button variant="primary" icon="add" label="Add trade" style={{ flex: 1 }} />
        </Link>
        <Link href="/trades-import" asChild>
          <Button icon="document-attach-outline" label="Import broker Excel" style={{ flex: 1 }} />
        </Link>
      </View>
      {data.trades.length > 0 && <Summary data={data} />}
      {data.warnings.map((w) => <Text key={w} style={[s.muted, { color: colors.warn }]}>⚠ {w}</Text>)}
      {data.badRows.length > 0 && <Text style={[s.muted, { color: colors.warn }]}>⚠ Sheet rows {data.badRows.join(', ')} could not be read and are left out.</Text>}
      {data.holdings.length > 0 && (
        <View style={[s.card, { padding: 0, gap: 0, overflow: 'hidden' }]}>
          <View style={[s.sectionRow, { padding: 16, paddingBottom: 4 }]}>
            <Text style={[s.title, { flex: 1 }]}>Holdings</Text>
            <Link href="/limits" asChild>
              <Button icon="options-outline" label="My limits" style={{ minHeight: 36, paddingHorizontal: 12 }} accessibilityHint="Opens your stop-loss and target settings" />
            </Link>
          </View>
          <Text style={[s.muted, { fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }]}>Checks use fixed rules on your numbers and public DSE data — a learning aid, not investment advice.</Text>
          {data.holdings.map((h) => <HoldingLine key={h.code} h={h} />)}
        </View>
      )}
      {data.trades.length > 0 && <Text style={s.title}>Trades</Text>}
    </View>
  );
}

export default function Trades() {
  const { colors, s } = useTheme();
  const { data, error, loading, reload } = useApi<TradesResponse>('/api/trades', loadTrades);
  // Reload when coming back from the add, edit or import screen; the first focus is the initial load.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) firstFocus.current = false;
    else reload();
  }, [reload]));

  return (
    <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
      {data && (
        <SectionList
          style={s.screen}
          sections={groupByDate(data.trades)}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TradeLine t={item} />}
          renderSectionHeader={({ section }) => <Text style={[s.muted, { backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, fontWeight: '700' }]}>{fmtDate(section.title)} {section.title.slice(0, 4)}</Text>}
          refreshing={loading}
          onRefresh={reload}
          ListHeaderComponent={<Header data={data} />}
          ListFooterComponent={error ? <Text style={[s.muted, { color: colors.warn, padding: 16 }]}>Showing older data: {error}</Text> : <View style={{ height: 32 }} />}
          ListEmptyComponent={
            <View style={[s.center, { paddingTop: 48 }]}>
              <Ionicons name="swap-horizontal-outline" size={56} color={colors.muted} />
              <Text style={s.title}>No trades yet</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>Add a trade by hand or import the order summary Excel from your broker.</Text>
            </View>
          }
        />
      )}
    </Status>
  );
}
