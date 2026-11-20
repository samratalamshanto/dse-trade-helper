import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { limitsFromForm, type LimitRow } from '../checks.ts';
import { loadTrades, saveLimits, type TradesResponse } from '../trades.ts';
import { Button, Chip, Status } from '../ui.tsx';
import { useApi } from '../useApi.ts';
import { useTheme } from '../useTheme.tsx';

const str = (x: number | undefined) => (x == null ? '' : String(x));

function PctInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { colors, s } = useTheme();
  return <TextInput style={[s.searchBox, s.input, { flex: 1 }]} value={value} onChangeText={onChange} keyboardType="decimal-pad" maxLength={5} placeholderTextColor={colors.muted} accessibilityLabel={label} />;
}

function Pair({ title, children }: { title: string; children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.muted}>{title}</Text>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>{children}</View>
    </View>
  );
}

function LimitsForm({ data }: { data: TradesResponse }) {
  const { colors, s } = useTheme();
  const settings = data.settings;
  const [def, setDef] = useState({ stopPct: str(settings?.default.stopPct), targetPct: str(settings?.default.targetPct) });
  const [rows, setRows] = useState<LimitRow[]>(() => Object.entries(settings?.perCode ?? {}).map(([code, l]) => ({ code, stopPct: str(l.stopPct), targetPct: str(l.targetPct) })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const held = data.holdings.filter((h) => h.shares > 0 && !rows.some((r) => r.code === h.code)).map((h) => h.code);
  const setRow = (code: string, key: 'stopPct' | 'targetPct') => (v: string) => setRows((rs) => rs.map((r) => (r.code === code ? { ...r, [key]: v } : r)));

  const submit = () => {
    const v = limitsFromForm(def, rows);
    if (!v.ok) { setError(v.error); return; }
    setBusy(true);
    setError(null);
    saveLimits(v.value)
      .then(() => router.back())
      .catch((e: unknown) => {
        console.warn('limits save failed', e);
        setError(e instanceof Error ? e.message : 'Unexpected error');
      })
      .finally(() => setBusy(false));
  };

  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.muted}>The checks on the Trades tab use these. Stop-loss: how far below your cost you accept. Target: how far above your cost you aim for.</Text>
      <Pair title="Default — stop-loss % and target %">
        <PctInput label="Default stop-loss percent" value={def.stopPct} onChange={(stopPct) => setDef((d) => ({ ...d, stopPct }))} />
        <PctInput label="Default target percent" value={def.targetPct} onChange={(targetPct) => setDef((d) => ({ ...d, targetPct }))} />
      </Pair>
      {rows.map((r) => (
        <Pair key={r.code} title={`${r.code} — stop-loss % and target %`}>
          <PctInput label={`${r.code} stop-loss percent`} value={r.stopPct} onChange={setRow(r.code, 'stopPct')} />
          <PctInput label={`${r.code} target percent`} value={r.targetPct} onChange={setRow(r.code, 'targetPct')} />
          <Pressable onPress={() => setRows((rs) => rs.filter((x) => x.code !== r.code))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove the ${r.code} override`}>
            <Ionicons name="close-circle-outline" size={26} color={colors.down} />
          </Pressable>
        </Pair>
      ))}
      {held.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={s.muted}>Set different limits for a holding</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {held.map((code) => <Chip key={code} label={`+ ${code}`} active={false} onPress={() => setRows((rs) => [...rs, { code, ...def }])} />)}
          </View>
        </View>
      )}
      {error && <Text style={[s.text, { color: colors.down }]} accessibilityLiveRegion="polite">{error}</Text>}
      <Button variant="primary" label="Save limits" onPress={submit} loading={busy} />
    </ScrollView>
  );
}

export default function Limits() {
  const { s } = useTheme();
  const { data, error, loading, reload } = useApi<TradesResponse>('/api/trades', loadTrades);
  return (
    <KeyboardAvoidingView behavior="padding" style={s.screen}>
      <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
        {data && <LimitsForm data={data} />}
      </Status>
    </KeyboardAvoidingView>
  );
}
