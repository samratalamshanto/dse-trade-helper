import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FLAGS, TERMS } from '../../../../web/lib/glossary.ts';
import { SIGNAL, SIGNAL_ORDER } from '../../format.ts';
import type { ThemePreference } from '../../theme.ts';
import { type IconName, SectionTitle, SignalPill } from '../../ui.tsx';
import { useTheme } from '../../useTheme.tsx';

function Term({ term, text }: { term: string; text: string }) {
  const { colors, s } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((o) => !o)} style={[s.row, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <View style={s.sectionRow}>
        <Text style={[s.text, { flex: 1, fontWeight: '700' }]}>{term}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </View>
      {open && <Text style={s.text}>{text}</Text>}
    </Pressable>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName; selectedIcon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline', selectedIcon: 'phone-portrait' },
  { value: 'light', label: 'Light', icon: 'sunny-outline', selectedIcon: 'sunny' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline', selectedIcon: 'moon' },
];

function ThemeControl() {
  const { colors, s, preference, setPreference } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Theme">
      {THEME_OPTIONS.map((o) => {
        const selected = preference === o.value;
        const color = selected ? colors.link : colors.text;
        return (
          <Pressable
            key={o.value}
            onPress={() => setPreference(o.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${o.label} theme`}
            accessibilityState={{ selected, checked: selected }}
            style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.link : colors.outline, backgroundColor: selected ? colors.link + '22' : colors.card }}
          >
            <Ionicons name={selected ? o.selectedIcon : o.icon} size={18} color={color} />
            <Text style={[s.text, { color, fontWeight: selected ? '800' : '500' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Learn() {
  const { s } = useTheme();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <SectionTitle icon="color-palette-outline" title="Theme" />
      <ThemeControl />
      <Text style={s.muted}>System follows your phone’s light or dark setting.</Text>
      <SectionTitle icon="school-outline" title="How it works" />
      <Text style={s.text}>Every signal comes from fixed rules on public DSE data. Nothing is guessed. Use it to choose what to research, then read the company’s disclosures before you trade.</Text>
      <SectionTitle icon="pulse-outline" title="The four signals" />
      <View style={[s.card, { gap: 14 }]}>
        {SIGNAL_ORDER.map((k) => (
          <View key={k} style={{ gap: 4 }}>
            <SignalPill signal={k} />
            <Text style={s.text}>{SIGNAL[k].text}</Text>
          </View>
        ))}
      </View>
      <SectionTitle icon="book-outline" title="Words you will see" />
      <Text style={s.muted}>Tap a word to see what it means.</Text>
      <View style={[s.card, { padding: 0, gap: 0 }]}>{TERMS.map(([t, d]) => <Term key={t} term={t} text={d} />)}</View>
      <SectionTitle icon="warning-outline" title="Warning-sign patterns" />
      <View style={[s.card, { padding: 0, gap: 0 }]}>{FLAGS.map(([t, d]) => <Term key={t} term={t} text={d} />)}</View>
      <Text style={[s.muted, { fontSize: 12 }]}>These rules do not see news, auditor opinions or bank loan quality. A flag is a pattern, not proof.</Text>
    </ScrollView>
  );
}
