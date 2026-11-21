import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { PriceHistory as History } from '../../web/lib/price-history.ts';
import type { TodayTrading } from '../../web/lib/service.ts';
import type { Dividend, InterimFinancials, PeTrendPoint, SeriesPoint, YearRow } from '../../web/lib/types.ts';
import { changePct, dailyRows, detailGroups, detailText, fmtDay, fmtMonth, interimTable, isHttpUrl, yearFields } from './details.ts';
import { changeColor, fmtNum, fmtPct } from './format.ts';
import { SectionTitle } from './ui.tsx';
import { useTheme } from './useTheme.tsx';

const taka = (x: number | null | undefined) => (x == null ? '—' : `৳${fmtNum(x)}`);

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  const { s } = useTheme();
  return (
    <View style={[s.sectionRow, { justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 28 }]}>
      <Text style={[s.muted, { flexShrink: 0, maxWidth: '45%' }]}>{label}</Text>
      <Text style={[s.text, { flex: 1, textAlign: 'right', fontWeight: '600' }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Toggle({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  const { colors, s } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[s.sectionRow, { minHeight: 48 }]}>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.link} />
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

export function TodayCard({ today }: { today: TodayTrading | null | undefined }) {
  const { colors, s } = useTheme();
  if (!today) return null;
  const pct = changePct(today.prevClose, today.close);
  return (
    <View style={s.card}>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <Text style={s.title}>Today&apos;s trading</Text>
        <Text style={[s.muted, { fontSize: 12 }]}>{today.live ? 'Live' : 'Saved from last session'}</Text>
      </View>
      <Line label="Last" value={`${taka(today.close)}  ${fmtPct(pct)}`} color={changeColor(pct, colors)} />
      <Line label="Open" value={taka(today.open)} />
      <Line label="Day high" value={taka(today.high)} />
      <Line label="Day low" value={taka(today.low)} />
      <Line label="Previous close" value={taka(today.prevClose)} />
      <Line label="Volume" value={fmtNum(today.volume, 0)} />
      <Line label="Value" value={today.valueMn == null ? '—' : `৳${fmtNum(today.valueMn)} mn`} />
      <Line label="Trades" value={fmtNum(today.trades, 0)} />
    </View>
  );
}

function DaysList({ title, days }: { title: string; days: History['bestDays'] }) {
  const { colors, s } = useTheme();
  if (!days.length) return null;
  return (
    <>
      <Text style={[s.text, { fontWeight: '700' }]}>{title}</Text>
      {days.map((d) => <Line key={d.date} label={fmtDay(d.date)} value={`${taka(d.close)}  ${fmtPct(d.pct)}`} color={changeColor(d.pct, colors)} />)}
    </>
  );
}

// shortcut: renders up to ~260 rows as plain views when opened; switch to a FlatList if series grow past a year.
function DailyList({ series }: { series: SeriesPoint[] }) {
  const { colors, s } = useTheme();
  const [open, setOpen] = useState(false);
  if (!series.length) return null;
  return (
    <>
      <Toggle label={open ? 'Hide every day' : `Show every day (${series.length})`} open={open} onPress={() => setOpen((o) => !o)} />
      {open && dailyRows(series).map((d) => (
        <View key={d.date} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Line label={fmtDay(d.date)} value={`${taka(d.close)}  ${fmtPct(d.changePct)}`} color={changeColor(d.changePct, colors)} />
          <Text style={[s.muted, { fontSize: 12 }]}>O {fmtNum(d.open)} · H {fmtNum(d.high)} · L {fmtNum(d.low)} · Vol {fmtNum(d.volume, 0)}</Text>
        </View>
      ))}
    </>
  );
}

export function PriceHistory({ history, series }: { history: History | null | undefined; series: SeriesPoint[] }) {
  const { colors, s } = useTheme();
  if (!history) return null;
  const h = history;
  return (
    <>
      <SectionTitle icon="pulse-outline" title="Price history (52 weeks)" />
      <View style={s.card}>
        <Text style={s.muted}>{fmtDay(h.from)} to {fmtDay(h.to)} · {h.days} trading days</Text>
        <Line label="Change" value={fmtPct(h.changePct)} color={changeColor(h.changePct, colors)} />
        <Line label="Highest close" value={`${taka(h.high.price)} · ${fmtDay(h.high.date)}`} />
        <Line label="Lowest close" value={`${taka(h.low.price)} · ${fmtDay(h.low.date)}`} />
        <Line label="Highest day high" value={`${taka(h.dayHigh.price)} · ${fmtDay(h.dayHigh.date)}`} />
        <Line label="Lowest day low" value={`${taka(h.dayLow.price)} · ${fmtDay(h.dayLow.date)}`} />
        <Line label="Up / down days" value={`${h.upDays} up · ${h.downDays} down`} />
        {h.longestUp && <Line label="Longest rise" value={`${h.longestUp.days} days, ${fmtDay(h.longestUp.from)} – ${fmtDay(h.longestUp.to)} (${fmtPct(h.longestUp.pct)})`} />}
        {h.longestDown && <Line label="Longest fall" value={`${h.longestDown.days} days, ${fmtDay(h.longestDown.from)} – ${fmtDay(h.longestDown.to)} (${fmtPct(h.longestDown.pct)})`} />}
      </View>
      {h.swings.length > 0 && (
        <View style={s.card}>
          <Text style={s.title}>When it rose and fell</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>Moves of 10% or more in the closing price.</Text>
          {h.swings.map((w) => (
            <View key={`${w.from}-${w.to}`} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              <Ionicons name={w.kind === 'rise' ? 'arrow-up' : 'arrow-down'} size={16} color={w.kind === 'rise' ? colors.up : colors.down} style={{ marginTop: 3 }} />
              <Text style={[s.text, { flex: 1 }]}>
                {w.kind === 'rise' ? 'Rose' : 'Fell'} <Text style={{ color: changeColor(w.pct, colors), fontWeight: '700' }}>{fmtPct(w.pct)}</Text> from {taka(w.fromPrice)} ({fmtDay(w.from)}) to {taka(w.toPrice)} ({fmtDay(w.to)}) in {w.days} trading days
              </Text>
            </View>
          ))}
        </View>
      )}
      {h.months.length > 0 && (
        <View style={s.card}>
          <Text style={s.title}>Month by month</Text>
          {h.months.map((m) => (
            <View key={m.month} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Line label={fmtMonth(m.month)} value={`${taka(m.close)}  ${fmtPct(m.changePct)}`} color={changeColor(m.changePct, colors)} />
              <Text style={[s.muted, { fontSize: 12 }]}>Open {fmtNum(m.open)} · High {fmtNum(m.high)} · Low {fmtNum(m.low)} · Close {fmtNum(m.close)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={s.card}>
        <DaysList title="Best 5 days" days={h.bestDays} />
        <DaysList title="Worst 5 days" days={h.worstDays} />
        <DailyList series={series} />
      </View>
    </>
  );
}

function openLink(url: string) {
  if (!isHttpUrl(url)) return;
  Linking.openURL(url).catch((e: unknown) => console.warn('open link failed', e));
}

export function CompanyDetails({ details }: { details: Record<string, unknown> }) {
  const { s } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.title}>Company details</Text>
      <Toggle label={open ? 'Hide details' : 'Show all details from DSE'} open={open} onPress={() => setOpen((o) => !o)} />
      {open && detailGroups(details).map((g) => (
        <View key={g.title} style={{ gap: 4, paddingTop: 6 }}>
          <Text style={[s.text, { fontWeight: '700' }]}>{g.title}</Text>
          {g.rows.map((r, i) => (r.url
            ? (
              <Pressable key={`${r.label}-${i}`} onPress={() => openLink(r.url!)} accessibilityRole="link" accessibilityHint="Opens in the browser" style={[s.sectionRow, { minHeight: 48 }]}>
                <Text style={s.link}>{r.label}</Text>
              </Pressable>
            )
            : <Line key={`${r.label}-${i}`} label={r.label} value={r.value} />))}
        </View>
      ))}
    </View>
  );
}

export function DividendHistory({ dividends }: { dividends: Dividend[] | undefined }) {
  const { s } = useTheme();
  if (!dividends?.length) return null;
  const rows = (Array.isArray(dividends) ? [...dividends] : []).sort((a, b) => b.year - a.year);
  return (
    <View style={s.card}>
      <Text style={s.title}>Dividend history (DSE)</Text>
      <Text style={[s.muted, { fontSize: 12 }]}>Cash and bonus as % of face value.</Text>
      {rows.map((d) => (
        <View key={d.year} style={{ gap: 2 }}>
          <Line label={String(d.year)} value={`${d.cash == null ? '—' : `${fmtNum(d.cash, 0)}%`} cash · ${d.stock == null ? '—' : `${fmtNum(d.stock, 0)}%`} bonus · yield ${d.yieldPct == null ? '—' : `${fmtNum(d.yieldPct)}%`}`} />
          {d.rights ? <Text style={[s.muted, { fontSize: 12 }]}>Rights: {detailText(d.rights)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function InterimResults({ interim }: { interim: InterimFinancials | null | undefined }) {
  const { colors, s } = useTheme();
  const table = interimTable(interim);
  if (!table) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>Quarterly results (unaudited)</Text>
      {table.rows.map((r, i) => (
        <View key={`${r.metric}-${i}`} style={{ gap: 2, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
          <Text style={[s.text, { fontWeight: '700' }]}>{r.metric}</Text>
          {table.columns.map((c, j) => <Line key={c.key} label={c.label} value={r.values[j]} />)}
        </View>
      ))}
    </View>
  );
}

const PE_DAYS = 30;

export function PeTrend({ points }: { points: PeTrendPoint[] | undefined }) {
  const { s } = useTheme();
  if (!points?.length) return null;
  const recent = (Array.isArray(points) ? points : []).slice(-PE_DAYS).reverse();
  return (
    <View style={s.card}>
      <Text style={s.title}>P/E, last {recent.length} days</Text>
      <Text style={[s.muted, { fontSize: 12 }]}>From DSE: on the audited yearly EPS and on the latest unaudited EPS.</Text>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <Text style={[s.muted, { flex: 1 }]}>Date</Text>
        <Text style={[s.muted, { width: 80, textAlign: 'right' }]}>Audited</Text>
        <Text style={[s.muted, { width: 90, textAlign: 'right' }]}>Unaudited</Text>
      </View>
      {recent.map((p, i) => (
        <View key={`${p.date}-${i}`} style={[s.sectionRow, { justifyContent: 'space-between', minHeight: 28 }]}>
          <Text style={[s.text, { flex: 1 }]}>{detailText(p.date)}</Text>
          <Text style={[s.text, { width: 80, textAlign: 'right' }]}>{fmtNum(p.audited)}</Text>
          <Text style={[s.text, { width: 90, textAlign: 'right' }]}>{fmtNum(p.unaudited)}</Text>
        </View>
      ))}
    </View>
  );
}

export function YearlyFigures({ years }: { years: YearRow[] | undefined }) {
  const { colors, s } = useTheme();
  const [open, setOpen] = useState(false);
  const fields = yearFields(Array.isArray(years) ? years : []);
  if (!fields.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>All yearly figures from DSE</Text>
      <Toggle label={open ? 'Hide yearly figures' : `Show ${fields.length} yearly figures`} open={open} onPress={() => setOpen((o) => !o)} />
      {open && fields.map((f) => (
        <View key={f.key} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={[s.text, { fontWeight: '700' }]}>{f.label}</Text>
          <Text style={s.muted}>{f.values.map((v) => `${v.year}: ${v.text}`).join(' · ')}</Text>
        </View>
      ))}
    </View>
  );
}
