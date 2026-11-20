import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import type { Question } from '../../../../../web/lib/types.ts';
import type { CompanyResponse } from '../../../api.ts';
import { pieSlices, RANGES, type Range, seriesChange, sliceSeries } from '../../../chart.ts';
import { answerColor, changeColor, fmtNum, fmtPct, SIGNAL, TONE } from '../../../format.ts';
import { SERIES } from '../../../theme.ts';
import { financialTrends, type TrendKey } from '../../../trends.ts';
import { Button, Chip, ScoreBar, SectionTitle, SignalPill, Sparkline, Status } from '../../../ui.tsx';
import { useApi } from '../../../useApi.ts';
import { useWatchlist } from '../../../watchlist.ts';
import { useTheme } from '../../../useTheme.tsx';

const ANSWER_ICON: Record<string, 'checkmark-circle' | 'alert-circle' | 'close-circle' | 'help-circle'> = {
  yes: 'checkmark-circle', partly: 'alert-circle', no: 'close-circle', unknown: 'help-circle',
};

function AnswerTile({ q }: { q: Question }) {
  const { colors, s } = useTheme();
  const [open, setOpen] = useState(false);
  const color = answerColor(q, colors);
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={[s.card, { width: '48%', padding: 12, gap: 6 }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={[s.muted, { fontSize: 12 }]}>{q.q}</Text>
      <View style={s.sectionRow}>
        <Ionicons name={ANSWER_ICON[q.answer] ?? 'help-circle'} size={20} color={color} />
        <Text style={{ color, fontSize: 17, fontWeight: '800', flexShrink: 1 }}>{q.label ?? q.answer[0].toUpperCase() + q.answer.slice(1)}</Text>
      </View>
      <Text style={[s.text, { fontSize: 13, lineHeight: 18 }]} numberOfLines={open ? undefined : 3}>{q.text}</Text>
    </Pressable>
  );
}

function KeyNumber({ label, value }: { label: string; value: string }) {
  const { s } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[s.muted, { fontSize: 12 }]}>{label}</Text>
      <Text style={s.price}>{value}</Text>
    </View>
  );
}

type CompanyData = CompanyResponse['company'];

const crore = (x: number | null | undefined, digits = 0) => (x == null || !Number.isFinite(x) ? '—' : `৳${fmtNum(x / 1e7, digits)} cr`);

function WeekRange({ c }: { c: CompanyData }) {
  const { colors, s } = useTheme();
  const { weekLow52: low, weekHigh52: high, price } = c;
  if (low == null || high == null || price == null || high <= low) return null;
  const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  return (
    <View style={{ gap: 4 }} accessibilityLabel={`52-week range ৳${fmtNum(low)} to ৳${fmtNum(high)}, now ৳${fmtNum(price)}`}>
      <Text style={[s.muted, { fontSize: 12 }]}>52-week range</Text>
      <View style={s.barTrack}>
        <View style={{ position: 'absolute', left: `${pct}%`, marginLeft: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text }} />
      </View>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <Text style={s.muted}>Low ৳{fmtNum(low)}</Text>
        <Text style={s.muted}>High ৳{fmtNum(high)}</Text>
      </View>
    </View>
  );
}

function KeyFacts({ data }: { data: CompanyResponse }) {
  const { colors, s } = useTheme();
  const c = data.company;
  const shares = c.paidUpCapital != null && c.faceValue ? c.paidUpCapital / c.faceValue : null;
  const yieldPct = data.analysis.metrics.latestYield;
  const facts: [string, string][] = [
    ['Sector', c.sector || '—'],
    ['Category', c.category || '—'],
    ['Listed', c.listingYear ? String(c.listingYear) : '—'],
    ['NAV per share', c.nav == null ? '—' : `৳${fmtNum(c.nav)}`],
    ['EPS', c.eps == null ? '—' : `৳${fmtNum(c.eps)}`],
    ['P/E', fmtNum(c.pe, 1)],
    ['Sector P/E', fmtNum(data.sectorPe, 1)],
    ['12-month cash yield', yieldPct == null ? '—' : `${fmtNum(yieldPct, 1)}%`],
    ['Shares outstanding', shares == null ? '—' : `${fmtNum(shares / 1e7, 2)} cr`],
    ['Paid-up capital', crore(c.paidUpCapital)],
    ['Market cap', crore(c.marketCap)],
  ];
  return (
    <View style={s.card}>
      <Text style={s.title}>Key facts</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
        {facts.map(([label, value]) => (
          <View key={label} style={{ width: '48%', backgroundColor: colors.cardHi, borderRadius: 10, padding: 10, gap: 2 }}>
            <Text style={[s.muted, { fontSize: 12 }]}>{label}</Text>
            <Text style={s.price} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PriceChart({ data }: { data: CompanyResponse }) {
  const { colors, s } = useTheme();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<Range>('1Y');
  const series = sliceSeries(data.company.series ?? [], range);
  if ((data.company.series ?? []).length < 2) return null;
  const change = seriesChange(series);
  const color = changeColor(change?.abs, colors);
  return (
    <View style={s.card}>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <Text style={s.title}>Price</Text>
        {change && (
          <Text style={{ color, fontWeight: '700' }}>
            {change.abs > 0 ? '+' : change.abs < 0 ? '−' : ''}৳{fmtNum(Math.abs(change.abs))} ({fmtPct(change.pct)})
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {RANGES.map((r) => <Chip key={r} label={r} active={r === range} onPress={() => setRange(r)} />)}
      </View>
      {series.length >= 2
        ? <Sparkline values={series.map((p) => p.price)} width={width - 66} height={120} color={color} fill />
        : <Text style={s.muted}>Not enough prices in this range.</Text>}
      {data.position?.verdict && (
        <Text style={[s.text, { color: colors[TONE[data.position.verdict.tone] ?? 'text'] }]}>
          {data.position.verdict.label}: <Text style={s.text}>{data.position.verdict.text}</Text>
        </Text>
      )}
    </View>
  );
}

const HOLDERS: [keyof NonNullable<CompanyData['sharePattern']>[number], string][] = [
  ['sponsor', 'Sponsor / director'], ['government', 'Government'], ['institution', 'Institutions'], ['foreign', 'Foreign'], ['public', 'Public'],
];

const PIE_SIZE = 180;
const PIE_LABEL_MIN_PCT = 6;
const PIE_LABEL_SIZE = 14;

// Shares of a whole as a full pie, each group in its own colour with its % on the slice; slices too thin for a number rely on the legend.
function ShareHolding({ c }: { c: CompanyData }) {
  const { colors, s, scheme } = useTheme();
  const latest = c.sharePattern?.[c.sharePattern.length - 1];
  if (!latest) return null;
  const values = HOLDERS.map(([key]) => (typeof latest[key] === 'number' ? (latest[key] as number) : null));
  const half = PIE_SIZE / 2;
  const slices = pieSlices(values, half, half, half - 2);
  const palette = SERIES[scheme];
  const summary = HOLDERS.map(([, label], i) => `${label} ${values[i] == null ? 'unknown' : `${fmtNum(values[i])}%`}`).join(', ');
  return (
    <View style={s.card}>
      <Text style={s.title}>Who owns the shares</Text>
      {latest.date ? <Text style={s.muted}>As of {String(latest.date)}</Text> : null}
      <View style={{ alignItems: 'center', paddingVertical: 8 }} accessible accessibilityRole="image" accessibilityLabel={`Share holding: ${summary}`}>
        <Svg width={PIE_SIZE} height={PIE_SIZE}>
          {slices.map((sl) => <Path key={sl.index} d={sl.path} fill={palette[sl.index]} stroke={colors.card} strokeWidth={2} />)}
          {slices.filter((sl) => sl.pct >= PIE_LABEL_MIN_PCT).map((sl) => (
            <SvgText key={`t${sl.index}`} x={sl.labelX} y={sl.labelY + PIE_LABEL_SIZE * 0.35} fill={colors.onLink} fontSize={PIE_LABEL_SIZE} fontWeight="bold" textAnchor="middle">
              {`${fmtNum(values[sl.index], 0)}%`}
            </SvgText>
          ))}
        </Svg>
      </View>
      {HOLDERS.map(([key, label], i) => (
        <View key={String(key)} style={[s.sectionRow, { justifyContent: 'space-between', minHeight: 32 }]}>
          <View style={[s.sectionRow, { gap: 10 }]}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: palette[i] }} />
            <Text style={s.text}>{label}</Text>
          </View>
          <Text style={s.price}>{values[i] == null ? '—' : `${fmtNum(values[i])}%`}</Text>
        </View>
      ))}
    </View>
  );
}

// Net profit comes from DSE in ৳ million; ÷ 10 gives crore.
const TREND_UNIT: Record<TrendKey, (v: number) => string> = {
  profit: (v) => `৳${fmtNum(v / 10, 0)} cr`,
  eps: (v) => `৳${fmtNum(v)}`,
  nav: (v) => `৳${fmtNum(v)}`,
  roe: (v) => `${fmtNum(v, 1)}%`,
  payout: (v) => `${fmtNum(v, 0)}%`,
};

function FinancialTrends({ c }: { c: CompanyData }) {
  const { colors, s } = useTheme();
  const { width } = useWindowDimensions();
  const trends = financialTrends(c.years ?? [], c.faceValue);
  if (!trends.some((t) => t.points.length)) return null;
  return (
    <>
      <SectionTitle icon="trending-up-outline" title="Financial trends" />
      <Text style={s.muted}>Audited yearly results from DSE. Revenue, assets and cash flow are not published there.</Text>
      {trends.map((t) => {
        const last = t.points[t.points.length - 1];
        return (
          <View key={t.key} style={s.card}>
            <Text style={[s.muted, { fontSize: 12 }]}>{t.label}{last ? ` · ${last.year}` : ''}</Text>
            <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
              <Text style={[s.title, { fontSize: 20 }]}>{last ? TREND_UNIT[t.key](last.value) : '—'}</Text>
              {t.cagr != null && (
                <View style={[s.pill, { borderColor: changeColor(t.cagr, colors), backgroundColor: changeColor(t.cagr, colors) + '22' }]}>
                  <Text style={{ color: changeColor(t.cagr, colors), fontWeight: '700', fontSize: 12 }}>{fmtPct(t.cagr)} · {t.span}-year CAGR</Text>
                </View>
              )}
            </View>
            {t.points.length > 1
              ? <Sparkline values={t.points.map((p) => p.value)} width={width - 66} height={48} color={colors.link} fill />
              : <Text style={s.muted}>{t.points.length ? 'One year of data only.' : 'No data on DSE.'}</Text>}
          </View>
        );
      })}
    </>
  );
}

export default function Company() {
  const { colors, s } = useTheme();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '').toUpperCase();
  const { data, error, loading, reload } = useApi<CompanyResponse>(`/api/company/${encodeURIComponent(code)}`);
  const { codes, toggle } = useWatchlist();
  const saved = codes.includes(code);
  const star = () => (
    <Pressable onPress={() => toggle(code)} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from watchlist' : 'Save to watchlist'}>
      <Ionicons name={saved ? 'star' : 'star-outline'} size={24} color={saved ? colors.warn : colors.text} />
    </Pressable>
  );

  return (
    <>
      <Tabs.Screen options={{ title: code, headerRight: star }} />
      <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
        <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.link} />}>
          {data && (
            <>
              <View style={s.card}>
                <Text style={s.title}>{data.company.name}</Text>
                <Text style={s.muted}>{data.company.sector} · Category {data.company.category}</Text>
                <View style={[s.sectionRow, { alignItems: 'flex-end' }]}>
                  <Text style={s.big}>৳{fmtNum(data.company.price)}</Text>
                  <Text style={{ color: changeColor(data.company.changePct, colors), fontWeight: '700', marginBottom: 6 }}>{fmtPct(data.company.changePct)}</Text>
                </View>
                <WeekRange c={data.company} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <KeyNumber label="Market cap" value={crore(data.company.marketCap)} />
                  <KeyNumber label="P/E" value={fmtNum(data.company.pe, 1)} />
                  <KeyNumber label="EPS" value={data.company.eps == null ? '—' : `৳${fmtNum(data.company.eps)}`} />
                </View>
                <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
                  {data.analysis.notRated ? <View style={[s.pill, { borderColor: colors.muted }]}><Text style={[s.muted, { fontWeight: "700" }]}>Not rated — no EPS published</Text></View> : <SignalPill signal={data.analysis.signal} />}
                  <Text style={s.muted}>Score {data.analysis.score}/100</Text>
                </View>
                <ScoreBar score={data.analysis.score} color={colors[SIGNAL[data.analysis.signal].tone]} />
                <Text style={[s.text, { fontWeight: '600' }]}>{data.analysis.suggestion}</Text>
                <Button variant="primary" label={saved ? '★ In your watchlist' : '☆ Add to watchlist'} onPress={() => toggle(code)} />
              </View>

              <SectionTitle icon="help-buoy-outline" title="Four questions before you buy" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                {data.questions.map((q) => <AnswerTile key={q.q} q={q} />)}
              </View>

              <PriceChart data={data} />

              <KeyFacts data={data} />

              <View style={s.card}>
                <Text style={s.title}>Why this signal</Text>
                {data.analysis.reasons.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Ionicons name={r.tone === 'good' ? 'checkmark' : 'alert'} size={16} color={colors[TONE[r.tone] ?? 'muted']} style={{ marginTop: 3 }} />
                    <Text style={[s.text, { flex: 1 }]}>{r.text}</Text>
                  </View>
                ))}
              </View>

              <FinancialTrends c={data.company} />

              <ShareHolding c={data.company} />

              {data.analysis.fraud.flags.length > 0 && (
                <View style={[s.card, { borderColor: colors.down }]}>
                  <Text style={[s.title, { color: colors.down }]}>⚠ Fraud warning signs</Text>
                  {data.analysis.fraud.flags.map((f) => <Text key={f.title} style={s.text}>• <Text style={{ fontWeight: '700' }}>{f.title}:</Text> {f.detail}</Text>)}
                </View>
              )}
              {error && <Text style={[s.muted, { color: colors.warn }]}>Showing older data: {error}</Text>}
              <Text style={[s.muted, { fontSize: 12 }]}>
                Source: public DSE data{data.session?.dataTime ? ` · prices as of ${data.session.dataTime}` : ''}. Signals are learning aids, not investment advice.
              </Text>
            </>
          )}
        </ScrollView>
      </Status>
    </>
  );
}
