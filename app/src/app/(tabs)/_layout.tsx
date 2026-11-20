import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import type { IconName } from '../../ui.tsx';
import { useTheme } from '../../useTheme.tsx';

const tab = (title: string, icon: IconName, headerTitle = title) => ({
  title,
  headerTitle,
  tabBarIcon: ({ color, size }: { color: unknown; size: number }) => <Ionicons name={icon} size={size} color={typeof color === 'string' ? color : undefined} />,
});

export default function TabLayout() {
  const { colors } = useTheme();
  // Detail pages live inside the tabs so the bottom menu stays visible; they are hidden from the bar and get a back arrow.
  const detail = (title: string) => ({
    // Hide only the bar button: in SDK 58 `href: null` marks the screen hidden and redirects away from it.
    tabBarButton: () => null,
    tabBarItemStyle: { display: "none" as const },
    title,
    headerLeft: () => (
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} accessibilityRole="button" accessibilityLabel="Back" style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
    ),
  });
  return (
    <Tabs
      backBehavior="fullHistory"
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home-outline', 'DSE Trade Helper')} />
      <Tabs.Screen name="companies" options={tab('Companies', 'search-outline')} />
      <Tabs.Screen name="watchlist" options={tab('Watchlist', 'star-outline')} />
      <Tabs.Screen name="trades" options={tab('Trades', 'swap-horizontal-outline', 'My trades')} />
      <Tabs.Screen name="learn" options={tab('More', 'settings-outline', 'Settings and help')} />
      <Tabs.Screen name="c/[code]" options={detail('Company')} />
      <Tabs.Screen name="dividends" options={detail('Dividends you can still catch')} />
    </Tabs>
  );
}
