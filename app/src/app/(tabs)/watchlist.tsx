import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import type { CompaniesResponse } from '../../api.ts';
import { Button, CompanyLine, Status } from '../../ui.tsx';
import { useApi } from '../../useApi.ts';
import { useWatchlist } from '../../watchlist.ts';
import { useTheme } from '../../useTheme.tsx';

export default function Watchlist() {
  const { colors, s } = useTheme();
  const { data, error, loading, reload } = useApi<CompaniesResponse>('/api/companies');
  const { codes, refresh } = useWatchlist();
  useFocusEffect(refresh);
  const rows = (data?.rows ?? []).filter((r) => codes.includes(r.code));

  return (
    <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
      <FlatList
        style={s.screen}
        data={rows}
        keyExtractor={(r) => r.code}
        renderItem={({ item }) => <CompanyLine row={item} />}
        refreshing={loading}
        onRefresh={reload}
        ListHeaderComponent={rows.length ? (
          <View style={{ padding: 16, paddingBottom: 4, gap: 4 }}>
            <Text style={s.muted}>{rows.length} saved · open a company and tap ★ at the top to remove it</Text>
            <Text style={[s.muted, { fontSize: 12 }]}>Automatic rule results, not advice.</Text>
          </View>
        ) : undefined}
        ListEmptyComponent={
          <View style={[s.center, { paddingTop: 80 }]}>
            <Ionicons name="star-outline" size={56} color={colors.warn} />
            <Text style={s.title}>No companies saved yet</Text>
            <Text style={[s.muted, { textAlign: 'center' }]}>Tap the ☆ star on any company page to follow it here.</Text>
            <Link href={{ pathname: '/companies', params: { signal: 'research' } }} asChild>
              <Button variant="primary" label="Browse the shortlist" />
            </Link>
          </View>
        }
      />
    </Status>
  );
}
