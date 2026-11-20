import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { checkColor } from '../../checks.ts';
import { fmtNum } from '../../format.ts';
import { deletePlan, formFromRow, inputFromRow, isOpenPlan, loadPlans, type PlanRow, type PlansResponse, savePlan, STATUS_LOOK } from '../../plans.ts';
import { Button, CheckPill, Status } from '../../ui.tsx';
import { useApi } from '../../useApi.ts';
import { useTheme } from '../../useTheme.tsx';

function PlanItem({ p, onChanged }: { p: PlanRow; onChanged: () => void }) {
  const { colors, s } = useTheme();
  const look = STATUS_LOOK[p.live.status];
  const act = (title: string, message: string, label: string, work: () => Promise<unknown>, destructive = false) =>
    Alert.alert(title, message, [
      { text: 'Back', style: 'cancel' },
      {
        text: label, style: destructive ? 'destructive' : 'default',
        onPress: () => work().then(onChanged).catch((e: unknown) => {
          console.warn('plan action failed', e);
          Alert.alert('Could not update the plan', e instanceof Error ? e.message : 'Unexpected error');
        }),
      },
    ]);
  return (
    <View style={[s.card, { marginHorizontal: 16, marginBottom: 10 }]}>
      <View style={[s.sectionRow, { justifyContent: 'space-between' }]}>
        <Link href={`/c/${encodeURIComponent(p.code)}`} style={s.code}>{p.code}</Link>
        <CheckPill label={look.label} tone={look.tone} />
      </View>
      <Text style={[s.text, { color: checkColor(look.tone, colors) }]}>{p.live.text}</Text>
      <Text style={s.muted}>
        {p.boughtNow} of {p.quantity} bought{p.targetPrice != null ? ` · target ৳${fmtNum(p.targetPrice)}` : ''}{p.price != null ? ` · now ৳${fmtNum(p.price)}` : ''}{p.until ? ` · until ${p.until}` : ''}
      </Text>
      {p.note ? <Text style={s.muted}>{p.note}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="Edit" icon="create-outline" onPress={() => router.push({ pathname: '/plan-edit', params: formFromRow(p) })} />
        {isOpenPlan(p) && (
          <>
            <Button label="Mark done" icon="checkmark-done-outline" onPress={() => act('Mark this plan done?', `${p.quantity} ${p.code}`, 'Mark done', () => savePlan(p.id, inputFromRow(p, 'done')))} />
            <Button label="Cancel" icon="close-outline" onPress={() => act('Cancel this plan?', `${p.quantity} ${p.code}. It stays in the list as cancelled.`, 'Cancel plan', () => savePlan(p.id, inputFromRow(p, 'cancelled')))} />
          </>
        )}
        <Button variant="danger" label="Delete" icon="trash-outline" onPress={() => act('Delete this plan?', `${p.quantity} ${p.code}. This cannot be undone.`, 'Delete', () => deletePlan(p.id), true)} />
      </View>
    </View>
  );
}

export default function Plans() {
  const { colors, s } = useTheme();
  const { data, error, loading, reload } = useApi<PlansResponse>('/api/plans', loadPlans);
  const firstFocus = useRef(true);
  // The tab stays mounted: reload after plan-edit closes, but not on the first focus.
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    reload();
  }, [reload]));
  const reached = (data?.plans ?? []).filter((p) => p.live.status === 'reached');

  return (
    <Status loading={loading && !data} error={data ? null : error} onRetry={reload}>
      <FlatList
        style={s.screen}
        data={data?.plans ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlanItem p={item} onChanged={reload} />}
        refreshing={loading}
        onRefresh={reload}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 10 }}>
            {reached.map((p) => (
              <View key={p.id} style={[s.card, { borderColor: colors.up, backgroundColor: colors.up + '22' }]} accessibilityRole="alert">
                <View style={s.sectionRow}>
                  <Ionicons name={STATUS_LOOK.reached.icon} size={20} color={colors.up} />
                  <Text style={[s.title, { flex: 1 }]}>{p.code}: buy the other {p.live.remaining} now</Text>
                </View>
                <Text style={s.text}>{p.live.text}</Text>
              </View>
            ))}
            <Text style={s.muted}>{"Your saved buy plans with today's price. Plans that reached their target come first."}</Text>
            {error && <Text style={[s.muted, { color: colors.warn }]}>Showing older data: {error}</Text>}
            {(data?.badRows.length ?? 0) > 0 && <Text style={[s.muted, { color: colors.warn }]}>{data?.badRows.length} rows in the sheet could not be read.</Text>}
          </View>
        }
        ListEmptyComponent={<Text style={[s.muted, { paddingHorizontal: 16 }]}>{'No buy plans yet. Open a company and use "Plan a buy" to save one.'}</Text>}
        ListFooterComponent={<Text style={[s.muted, { padding: 16, fontSize: 12 }]}>Plans use past prices and fixed rules — a learning aid, not investment advice.</Text>}
      />
    </Status>
  );
}
