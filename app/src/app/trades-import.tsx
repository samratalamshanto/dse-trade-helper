import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { fmtNum } from '../format.ts';
import { Button } from '../ui.tsx';
import { importOrderSummary, type ImportResult, type PickedFile, type TradeInput } from '../trades.ts';
import { useTheme } from '../useTheme.tsx';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function Rows({ title, rows, color }: { title: string; rows: TradeInput[]; color: string }) {
  const { s } = useTheme();
  if (!rows.length) return null;
  return (
    <View style={s.card}>
      <Text style={[s.title, { color }]}>{title}</Text>
      {rows.map((t, i) => (
        <Text key={i} style={s.text}>{t.side} {t.quantity.toLocaleString('en-US')} {t.code} × ৳{fmtNum(t.price)}</Text>
      ))}
    </View>
  );
}

export default function ImportTrades() {
  const { colors, s } = useTheme();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');

  const upload = (picked: PickedFile, save: boolean) => {
    setBusy(true);
    setError(null);
    importOrderSummary({ blob: picked.file ?? new DeviceFile(picked.uri), name: picked.name }, save, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined)
      .then((r) => { if (save) router.back(); else setPreview(r); })
      .catch((e: unknown) => {
        console.warn('trades import failed', e instanceof Error ? String(e.cause) : '', e);
        setError(e instanceof Error ? e.message : 'Unexpected error');
      })
      .finally(() => setBusy(false));
  };

  const pick = async () => {
    try {
      // No cache copy: the picker's content:// URI keeps Android's read grant (a cache copy fails with a missing READ permission), and the asset keeps the real file name, which holds the trade date.
      const r = await DocumentPicker.getDocumentAsync({ type: [XLSX_TYPE, 'application/vnd.ms-excel', 'application/octet-stream'], copyToCacheDirectory: false });
      if (r.canceled) return;
      const a = r.assets[0];
      const picked = { uri: a.uri, name: a.name, file: a.file };
      setFile(picked);
      setPreview(null);
      upload(picked, false);
    } catch (e) {
      console.warn('document pick failed', e);
      setError('Could not open the file picker.');
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={s.text}>Pick the order summary .xlsx your broker sends after a trading day. You see the rows first; nothing is saved until you tap Save.</Text>
      <Button icon="document-attach-outline" label={file ? 'Pick another file' : 'Pick the Excel file'} onPress={pick} disabled={busy} />
      {file && <Text style={s.muted} numberOfLines={1}>{file.name}</Text>}
      <Text style={s.muted}>Trade date — only if the file name has no date (YYYY-MM-DD)</Text>
      <TextInput
        accessibilityLabel="Trade date, only if the file name has no date"
        value={date}
        onChangeText={setDate}
        placeholder="2026-11-19"
        placeholderTextColor={colors.muted}
        maxLength={10}
        autoCorrect={false}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.outline, borderRadius: 10, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.card, fontSize: 16 }}
      />
      {busy && <ActivityIndicator color={colors.link} />}
      {error && <Text style={[s.text, { color: colors.down }]} accessibilityLiveRegion="polite">{error}</Text>}
      {preview && (
        <>
          <Text style={s.title}>Trades for {preview.date}</Text>
          {preview.errors.length > 0 && (
            <View style={[s.card, { borderColor: colors.down }]}>
              <Text style={[s.title, { color: colors.down }]}>Rows with errors</Text>
              {preview.errors.map((e) => <Text key={e} style={s.text}>• {e}</Text>)}
            </View>
          )}
          <Rows title={`${preview.added.length} to add`} rows={preview.added} color={colors.up} />
          <Rows title={`${preview.skipped.length} skipped — already in your trades`} rows={preview.skipped} color={colors.muted} />
          {preview.added.length > 0
            ? (
              <Button variant="primary" label={`Save ${preview.added.length} trade${preview.added.length > 1 ? 's' : ''}`} onPress={() => file && upload(file, true)} disabled={busy} />
            )
            : <Text style={s.muted}>Nothing new to save from this file.</Text>}
        </>
      )}
    </ScrollView>
  );
}
