import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { InterimFinancials, PeTrendPoint, SeriesPoint, YearRow } from '../../web/lib/types.ts';
import type { DividendView, PriceHistoryView as History, TodayView } from './api.ts';
import { changePct, crFromMn, dailyRows, type DetailRow, detailGroups, detailText, type ExDate, exLabel, fmtDay, fmtMonth, fmtUpTo2, interimTable, isSafeLink, todayTitle, yearFields } from './details.ts';
import { changeColor, fmtNum, fmtPct } from './format.ts';
import { Chip, SectionTitle } from './ui.tsx';
import { useTheme } from './useTheme.tsx';

const taka = (x: number | null | undefined) => (x == null ? '—' : `৳${fmtNum(x)}`);

function Line({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  const { s } = useTheme();
  return (
    <View style={[s.sectionRow, { justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 28 }]}>
      <View style={{ flexShrink: 0, maxWidth: '45%' }}>
        <Text style={s.muted}>{label}</Text>
        {hint ? <Text style={[s.muted, { fontSize: 12 }]}>{hint}</Text> : null}
      </View>
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

export function TodayCard({ today }: { today: TodayView | null | undefined }) {
  const { colors, s } = useTheme();
  if (!today) return null;
  const pct = changePct(today.prevClose, today.close);
  return (
    <View style={s.card}>
      <Text style={s.title}>{todayTitle(today)}</Text>
      <Line label="Last" value={`${taka(today.close)}  ${fmtPct(pct)}`} color={changeColor(pct, colors)} />
      <Line label="Open" value={taka(today.open)} />
      <Line label="Day high" value={taka(today.high)} />
      <Line label="Day low" value={taka(today.low)} />
      <Line label="Previous close" value={taka(today.prevClose)} />
      <Line label="Volume" value={fmtNum(today.volume, 0)} />
      <Line label="Value" value={crFromMn(today.valueMn)} />
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

const ADJUSTED_NOTE = 'Prices adjusted for dividends and bonus shares.';
const EX_HINT = 'Ex-date: from this day a buyer no longer gets the dividend or bonus. Record date: owners on that day get it.';

// shortcut: renders up to ~260 rows as plain views when opened; switch to a FlatList if series grow past a year.
function DailyList({ series, exDates, from }: { series: SeriesPoint[]; exDates: ExDate[]; from: string }) {
  const { colors, s } = useTheme();
  const [open, setOpen] = useState(false);
  const rows = dailyRows(series, from);
  if (!rows.length) return null;
  const ex = new Map(exDates.map((e) => [e.date, e]));
  return (
    <>
      <Toggle label={open ? 'Hide every day' : `Show every day (${rows.length})`} open={open} onPress={() => setOpen((o) => !o)} />
      {open && ex.size > 0 && <Text style={[s.muted, { fontSize: 12 }]}>{EX_HINT}</Text>}
      {open && rows.map((d) => {
        const e = ex.get(d.date);
        return (
          <View key={d.date} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Line label={fmtDay(d.date)} value={`${taka(d.close)}  ${fmtPct(d.changePct)}`} color={changeColor(d.changePct, colors)} />
            {e && <Text style={[s.text, { fontSize: 12, color: colors.warn, fontWeight: '700' }]}>{exLabel(e)}</Text>}
            <Text style={[s.muted, { fontSize: 12 }]}>O {fmtNum(d.open)} · H {fmtNum(d.high)} · L {fmtNum(d.low)} · Vol {fmtNum(d.volume, 0)}</Text>
          </View>
        );
      })}
    </>
  );
}

function Swings({ h, adjusted }: { h: History; adjusted: boolean }) {
  const { colors, s } = useTheme();
  const [small, setSmall] = useState(false);
  const hasSmall = Array.isArray(h.swingsSmall);
  const list = small && hasSmall ? h.swingsSmall! : h.swings;
  if (!h.swings.length && !h.swingsSmall?.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>When it rose and fell</Text>
      {hasSmall && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="5%" active={small} onPress={() => setSmall(true)} />
          <Chip label="10%" active={!small} onPress={() => setSmall(false)} />
        </View>
      )}
      <Text style={[s.muted, { fontSize: 12 }]}>Moves of {small && hasSmall ? 5 : 10}% or more in the closing price.</Text>
      {list.length === 0 && <Text style={s.muted}>No moves this large.</Text>}
      {list.map((w) => (
        <View key={`${w.from}-${w.to}`} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
          <Ionicons name={w.kind === 'rise' ? 'arrow-up' : 'arrow-down'} size={16} color={w.kind === 'rise' ? colors.up : colors.down} style={{ marginTop: 3 }} />
          <Text style={[s.text, { flex: 1 }]}>
            {w.kind === 'rise' ? 'Rose' : 'Fell'} <Text style={{ color: changeColor(w.pct, colors), fontWeight: '700' }}>{fmtPct(w.pct)}</Text> from {taka(w.fromPrice)} ({fmtDay(w.from)}) to {taka(w.toPrice)} ({fmtDay(w.to)}) in {w.days} trading days
          </Text>
        </View>
      ))}
      {adjusted && <Text style={[s.muted, { fontSize: 12 }]}>{ADJUSTED_NOTE}</Text>}
    </View>
  );
}

export function PriceHistory({ history, series }: { history: History | null | undefined; series: SeriesPoint[] }) {
  const { colors, s } = useTheme();
  if (!history) return null;
  const h = history;
  const title = <SectionTitle icon="pulse-outline" title="Price history (52 weeks)" />;
  if (h.illiquid) {
    return (
      <>
        {title}
        <View style={s.card}>
          <Text style={s.text}>No trades in 52 weeks (last trade: {h.lastTradeDate ? fmtDay(h.lastTradeDate) : '—'})</Text>
        </View>
      </>
    );
  }
  const adjusted = Array.isArray(h.exDates);
  return (
    <>
      {title}
      <View style={s.card}>
        <Text style={s.muted}>{fmtDay(h.from)} to {fmtDay(h.to)} · {h.days} trading days</Text>
        <Line label="Change" value={fmtPct(h.changePct)} color={changeColor(h.changePct, colors)} />
        {h.sinceJan != null && <Line label="Since 1 Jan" value={fmtPct(h.sinceJan)} color={changeColor(h.sinceJan, colors)} />}
        <Line label="Highest close" value={`${taka(h.high.price)} · ${fmtDay(h.high.date)}`} />
        <Line label="Lowest close" value={`${taka(h.low.price)} · ${fmtDay(h.low.date)}`} />
        <Line label="Highest day high" value={`${taka(h.dayHigh.price)} · ${fmtDay(h.dayHigh.date)}`} />
        <Line label="Lowest day low" value={`${taka(h.dayLow.price)} · ${fmtDay(h.dayLow.date)}`} />
        <Line label="Up / down days" value={`${h.upDays} up · ${h.downDays} down`} />
        {h.noTradeDays != null && <Line label="Days with no trades" value={fmtNum(h.noTradeDays, 0)} />}
        {h.longestUp && <Line label="Longest rise" value={`${h.longestUp.days} days, ${fmtDay(h.longestUp.from)} – ${fmtDay(h.longestUp.to)} (${fmtPct(h.longestUp.pct)})`} />}
        {h.longestDown && <Line label="Longest fall" value={`${h.longestDown.days} days, ${fmtDay(h.longestDown.from)} – ${fmtDay(h.longestDown.to)} (${fmtPct(h.longestDown.pct)})`} />}
      </View>
      <Swings h={h} adjusted={adjusted} />
      {h.months.length > 0 && (
        <View style={s.card}>
          <Text style={s.title}>Month by month</Text>
          {h.months.map((m) => (
            <View key={m.month} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Line label={`${fmtMonth(m.month)}${m.partial ? ' (partial)' : ''}`} value={`${taka(m.close)}  ${fmtPct(m.changePct)}`} color={changeColor(m.changePct, colors)} />
              <Text style={[s.muted, { fontSize: 12 }]}>Open {fmtNum(m.open)} · High {fmtNum(m.high)} · Low {fmtNum(m.low)} · Close {fmtNum(m.close)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={s.card}>
        <DaysList title="Best 5 days" days={h.bestDays} />
        <DaysList title="Worst 5 days" days={h.worstDays} />
        {adjusted && <Text style={[s.muted, { fontSize: 12 }]}>{ADJUSTED_NOTE}</Text>}
        <DailyList series={series} exDates={h.exDates ?? []} from={h.from} />
      </View>
    </>
  );
}

function openLink(url: string) {
  if (!isSafeLink(url)) return;
  Linking.openURL(url).catch((e: unknown) => console.warn('open link failed', e));
}

function DetailLine({ r }: { r: DetailRow }) {
  const { s } = useTheme();
  if (r.url) {
    return (
      <Pressable onPress={() => openLink(r.url!)} accessibilityRole="link" accessibilityHint="Opens in the browser" style={[s.sectionRow, { minHeight: 48 }]}>
        <Text style={s.link}>{r.label}</Text>
      </Pressable>
    );
  }
  if (!r.links?.length) return <Line label={r.label} value={r.value} hint={r.hint} />;
  return (
    <View>
      <Text style={s.muted}>{r.label}</Text>
      {r.links.map((l) => (
        <Pressable key={l.url} onPress={() => openLink(l.url)} accessibilityRole="link" accessibilityLabel={`${r.label} ${l.label}`} accessibilityHint={l.url.startsWith('tel:') ? 'Calls this number' : 'Writes an email'} style={[s.sectionRow, { minHeight: 48 }]}>
          <Text style={s.link}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DetailGroupView({ title, rows }: { title: string; rows: DetailRow[] }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: 4, paddingTop: 6 }}>
      <Text style={[s.text, { fontWeight: '700' }]}>{title}</Text>
      {rows.map((r, i) => <DetailLine key={`${r.label}-${i}`} r={r} />)}
    </View>
  );
}

export function CompanyDetails({ details }: { details: Record<string, unknown> }) {
  const { s } = useTheme();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const groups = detailGroups(details);
  const advanced = groups.find((g) => g.advanced);
  return (
    <View style={s.card}>
      <Text style={s.title}>Company details</Text>
      <Toggle label={open ? 'Hide details' : 'Show all details from DSE'} open={open} onPress={() => setOpen((o) => !o)} />
      {open && groups.filter((g) => !g.advanced).map((g) => <DetailGroupView key={g.title} title={g.title} rows={g.rows} />)}
      {open && advanced && (
        <>
          <Toggle label={advanced.title} open={raw} onPress={() => setRaw((o) => !o)} />
          {raw && <DetailGroupView title={advanced.title} rows={advanced.rows} />}
        </>
      )}
    </View>
  );
}

export function DividendHistory({ dividends }: { dividends: DividendView[] | undefined }) {
  const { s } = useTheme();
  if (!dividends?.length) return null;
  const rows = (Array.isArray(dividends) ? [...dividends] : []).sort((a, b) => b.year - a.year);
  return (
    <View style={s.card}>
      <Text style={s.title}>Dividend history (DSE)</Text>
      <Text style={[s.muted, { fontSize: 12 }]}>Cash and bonus as % of face value.</Text>
      {rows.map((d) => (
        <View key={d.year} style={{ gap: 2 }}>
          <Line label={String(d.year)} value={`${d.cash == null ? '—' : `${fmtUpTo2(d.cash)}%`} cash · ${d.stock == null ? '—' : `${fmtUpTo2(d.stock)}%`} bonus · yield ${d.yieldPct == null ? '—' : `${fmtNum(d.yieldPct)}%`}`} />
          {d.paid === false ? <Text style={[s.muted, { fontSize: 12 }]}>Declared, not paid yet</Text> : null}
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
          {f.hint ? <Text style={[s.muted, { fontSize: 12 }]}>{f.hint}</Text> : null}
          <Text style={s.muted}>{f.values.map((v) => `${v.year}: ${v.text}`).join(' · ')}</Text>
        </View>
      ))}
    </View>
  );
}
