import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '../ui.tsx';
import { useTheme } from '../useTheme.tsx';

export default function NotFound() {
  const { colors, s } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={s.center}>
        <Ionicons name="compass-outline" size={56} color={colors.muted} />
        <Text style={s.title}>This page does not exist</Text>
        <Text style={[s.muted, { textAlign: 'center' }]}>The link may be old or mistyped.</Text>
        <Link href="/" asChild>
          <Button variant="primary" label="Go to Home" />
        </Link>
      </View>
    </>
  );
}
