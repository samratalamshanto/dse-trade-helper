import { router, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { dhakaToday } from '../../../web/lib/dhaka.ts';
import { validateTrade } from '../../../web/lib/trades.ts';
import { Button } from '../ui.tsx';
import { deleteTrade, saveTrade } from '../trades.ts';
import { useTheme } from '../useTheme.tsx';

type Params = { id?: string; date?: string; code?: string; side?: string; quantity?: string; price?: string; commission?: string; note?: string };

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.muted}>{label}</Text>
      {children}
    </View>
  );
}

export default function TradeForm() {
  const { colors, s } = useTheme();
  const inputStyle = [s.searchBox, s.input, { flex: 0 }];
  const p = useLocalSearchParams<Params>();
  const id = p.id || null;
  const [form, setForm] = useState({
    date: p.date ?? dhakaToday(), code: p.code ?? '', side: p.side === 'SELL' ? 'SELL' : 'BUY',
    quantity: p.quantity ?? '', price: p.price ?? '', commission: p.commission ?? '', note: p.note ?? '',
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
        console.warn('trade save failed', e);
        setError(e instanceof Error ? e.message : 'Unexpected error');
      })
      .finally(() => setBusy(false));
  };

  const submit = () => {
    const v = validateTrade(form);
    if (!v.ok) { setError(v.error); return; }
    run(() => saveTrade(id, v.value));
  };

  const remove = () => {
    if (!id) return;
    Alert.alert('Delete this trade?', `${form.side} ${form.quantity} ${form.code} on ${form.date}. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => deleteTrade(id)) },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={s.screen}>
      <Stack.Screen options={{ title: id ? 'Edit trade' : 'Add trade' }} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Field label="Date (YYYY-MM-DD)">
          <TextInput accessibilityLabel="Trade date" style={inputStyle} value={form.date} onChangeText={set('date')} placeholder="2026-11-19" placeholderTextColor={colors.muted} autoCorrect={false} maxLength={10} />
        </Field>
        <Field label="Trade code">
          <TextInput accessibilityLabel="Trade code" style={inputStyle} value={form.code} onChangeText={(v) => set('code')(v.toUpperCase())} placeholder="GP" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} maxLength={20} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['BUY', 'SELL'] as const).map((side) => {
            const active = form.side === side;
            const color = side === 'BUY' ? colors.up : colors.down;
            return (
              <Pressable key={side} onPress={() => set('side')(side)} style={[s.button, { flex: 1, borderColor: active ? color : colors.border, backgroundColor: active ? color + '22' : undefined }]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <Text style={{ color: active ? color : colors.text, fontWeight: '700' }}>{side}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field label="Quantity (shares)">
          <TextInput accessibilityLabel="Quantity" style={inputStyle} value={form.quantity} onChangeText={set('quantity')} keyboardType="number-pad" placeholder="100" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Price per share (৳)">
          <TextInput accessibilityLabel="Price in taka" style={inputStyle} value={form.price} onChangeText={set('price')} keyboardType="decimal-pad" placeholder="226.70" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Commission (৳, optional)">
          <TextInput accessibilityLabel="Commission in taka" style={inputStyle} value={form.commission} onChangeText={set('commission')} keyboardType="decimal-pad" placeholderTextColor={colors.muted} />
        </Field>
        <Field label="Note (optional)">
          <TextInput accessibilityLabel="Note" style={inputStyle} value={form.note} onChangeText={set('note')} maxLength={200} placeholderTextColor={colors.muted} />
        </Field>
        {error && <Text style={[s.text, { color: colors.down }]} accessibilityLiveRegion="polite">{error}</Text>}
        <Button variant="primary" label={id ? 'Save changes' : 'Save trade'} onPress={submit} loading={busy} />
        {id && (
          <Button variant="danger" label="Delete trade" onPress={remove} disabled={busy} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
