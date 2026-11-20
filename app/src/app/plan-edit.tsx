import { router, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { validatePlan } from '../../../web/lib/plans.ts';
import { deletePlan, savePlan } from '../plans.ts';
import { Button } from '../ui.tsx';
import { useTheme } from '../useTheme.tsx';

type Params = { id?: string; code?: string; quantity?: string; boughtNow?: string; targetPrice?: string; until?: string; note?: string; status?: string };

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.muted}>{label}</Text>
      {children}
    </View>
  );
}

export default function PlanForm() {
  const { colors, s } = useTheme();
  const inputStyle = [s.searchBox, s.input, { flex: 0 }];
  const p = useLocalSearchParams<Params>();
  const id = p.id || null;
  const [form, setForm] = useState({
    code: p.code ?? '', quantity: p.quantity ?? '', boughtNow: p.boughtNow ?? '', targetPrice: p.targetPrice ?? '',
    until: p.until ?? '', note: p.note ?? '', status: p.status || 'active',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    work()
      .then(() => router.back())
      .catch((e: unknown) => {
        console.warn('plan save failed', e);
        setError(e instanceof Error ? e.message : 'Unexpected error');
      })
      .finally(() => setBusy(false));
  };

  const submit = () => {
    const v = validatePlan(form);
    if (!v.ok) { setError(v.error); return; }
    run(() => savePlan(id, v.value));
  };

  const remove = () => {
    if (!id) return;
    Alert.alert('Delete this plan?', `${form.quantity} ${form.code}. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => deletePlan(id)) },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={s.screen}>
      <Stack.Screen options={{ title: id ? 'Edit buy plan' : 'Save buy plan' }} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Field label="Trade code">
          <TextInput accessibilityLabel="Trade code" style={inputStyle} value={form.code} onChangeText={(v) => set('code')(v.toUpperCase())} placeholder="GP" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} maxLength={20} />
        </Field>
        <Field label="Total shares you plan to buy">
          <TextInput accessibilityLabel="Total shares" style={inputStyle} value={form.quantity} onChangeText={set('quantity')} keyboardType="number-pad" placeholder="100" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Shares bought now">
          <TextInput accessibilityLabel="Shares bought now" style={inputStyle} value={form.boughtNow} onChangeText={set('boughtNow')} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Target price for the rest (৳)">
          <TextInput accessibilityLabel="Target price in taka" style={inputStyle} value={form.targetPrice} onChangeText={set('targetPrice')} keyboardType="decimal-pad" placeholder="226.70" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Until (YYYY-MM-DD, optional)">
          <TextInput accessibilityLabel="End date" style={inputStyle} value={form.until} onChangeText={set('until')} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCorrect={false} maxLength={10} />
        </Field>
        <Field label="Note (optional)">
          <TextInput accessibilityLabel="Note" style={inputStyle} value={form.note} onChangeText={set('note')} maxLength={200} placeholderTextColor={colors.muted} />
        </Field>
        {error && <Text style={[s.text, { color: colors.down }]} accessibilityLiveRegion="polite">{error}</Text>}
        <Text style={[s.muted, { fontSize: 12 }]}>A plan is your own reminder. It uses past prices and fixed rules — a learning aid, not investment advice.</Text>
        <Button variant="primary" label={id ? 'Save changes' : 'Save plan'} onPress={submit} loading={busy} />
        {id && <Button variant="danger" label="Delete plan" onPress={remove} disabled={busy} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
