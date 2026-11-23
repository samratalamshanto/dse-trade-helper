import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, TextInput, View } from 'react-native';
import type { CompaniesResponse, Signal } from '../../api.ts';
import { isSignal, SIGNAL, SIGNAL_ORDER } from '../../format.ts';
import { filterSort, SORTS, type SortKey } from '../../list.ts';
import { Chip, CompanyLine, Status } from '../../ui.tsx';
import { useApi } from '../../useApi.ts';
import { useTheme } from '../../useTheme.tsx';

export default function Companies() {
  const { colors, s } = useTheme();
  const params = useLocalSearchParams<{ signal?: string }>();
  const { data, error, loading, reload } = useApi<CompaniesResponse>('/api/companies');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ value: Signal | null; from: string | undefined }>({ value: null, from: undefined });
  const [sort, setSort] = useState<SortKey>('score');
  // A tap on a Home count passes ?signal=…; it wins until the user picks another chip.
  const signal = picked.from === params.signal ? picked.value : isSignal(params.signal) ? params.signal : null;
  const pick = (value: Signal | null) => setPicked({ value, from: params.signal });
  const rows = useMemo(() => filterSort(data?.rows ?? [], { query, signal, sort }), [data, query, signal, sort]);

  return (
    <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
      <FlatList
        style={s.screen}
        data={rows}
        keyExtractor={(r) => r.code}
        renderItem={({ item }) => <CompanyLine row={item} />}
        refreshing={loading}
        onRefresh={reload}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <View style={s.searchBox}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                style={s.input}
                placeholder="Search code or name, e.g. GP"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
                accessibilityLabel="Search companies"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
              <Chip label="All" active={!signal} onPress={() => pick(null)} />
              {SIGNAL_ORDER.map((k) => <Chip key={k} label={SIGNAL[k].label} active={signal === k} onPress={() => pick(k)} color={colors[SIGNAL[k].tone]} />)}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={s.muted}>Sort:</Text>
              {SORTS.map((o) => <Chip key={o.key} label={o.label} active={sort === o.key} onPress={() => setSort(o.key)} />)}
            </View>
            <Text style={s.muted}>{rows.length} {rows.length === 1 ? 'company' : 'companies'}{signal ? ` · ${SIGNAL[signal].text}` : ''}</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>Automatic rule results, not advice.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[s.muted, { padding: 16 }]}>No company matches. Try another name or the “All” filter.</Text>}
      />
    </Status>
  );
}
