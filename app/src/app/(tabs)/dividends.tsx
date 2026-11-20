import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { DividendsResponse } from '../../api.ts';
import { catchableDividends } from '../../list.ts';
import { DividendLine, Status } from '../../ui.tsx';
import { useApi } from '../../useApi.ts';
import { useTheme } from '../../useTheme.tsx';

export default function Dividends() {
  const { s } = useTheme();
  const { data, error, loading, reload } = useApi<DividendsResponse>('/api/dividends');
  const items = useMemo(() => (data ? catchableDividends(data.upcoming, data.today) : []), [data]);

  return (
    <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
      <FlatList
        style={s.screen}
        data={items}
        keyExtractor={(x) => x.d.code}
        renderItem={({ item }) => <DividendLine item={item} />}
        refreshing={loading}
        onRefresh={reload}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={s.text}>Own the share at the end of the last day to buy, and you get the dividend. Buying on the record date itself is too late.</Text>
            <Text style={s.muted}>{items.length} dividends you can still catch · ⚠ marks companies with fraud warning signs.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[s.muted, { padding: 16 }]}>No upcoming dividend can still be bought. Check again after new announcements.</Text>}
      />
    </Status>
  );
}
