import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { fonts, usePalette } from '@/theme';

const LABELS: Record<string, string> = { Latest: 'Latest', Threads: 'Threads', Search: 'Search', Saved: 'Saved' };

/** Four words, no icons. The current one is ink with a small rule beneath it. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const p = usePalette();
  return (
    <View style={[styles.bar, { backgroundColor: p.bg, borderTopColor: p.rule, paddingBottom: insets.bottom }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={onPress} style={styles.tab}>
            <Text style={[styles.label, { color: focused ? p.ink : p.ink2 }]}>{LABELS[route.name] ?? route.name}</Text>
            <View style={[styles.mark, { backgroundColor: focused ? p.ink : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, gap: 6, paddingTop: 4 },
  label: { fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 1.1, textTransform: 'uppercase', includeFontPadding: false },
  mark: { width: 16, height: 2 },
});
