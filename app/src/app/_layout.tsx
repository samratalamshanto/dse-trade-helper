import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '../useTheme.tsx';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootStack />
    </ThemeProvider>
  );
}

function RootStack() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trade" options={{ title: 'Trade', presentation: 'modal' }} />
        <Stack.Screen name="limits" options={{ title: 'My limits', presentation: 'modal' }} />
        <Stack.Screen name="trades-import" options={{ title: 'Import broker Excel', presentation: 'modal' }} />
        <Stack.Screen name="plan-edit" options={{ title: 'Buy plan', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
