import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { fonts, usePalette } from '@/theme';

const LABELS: Record<string, string> = { Latest: 'Latest', Threads: 'Threads', Archive: 'Archive', Search: 'Search', Menu: 'Menu' };

/**
 * The website's navigation, at the thumb: five small sans words, no icons. The current one is ink
 * with a short ember rule under it, as the website underlines the page you are on.
 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const p = usePalette();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: p.bg, borderTopColor: p.rule, paddingBottom: insets.bottom }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={onPress} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.label, { color: focused ? p.ink : p.ink2, fontFamily: focused ? fonts.sansBold : fonts.sansMedium }]}>{LABELS[route.name] ?? route.name}</Text>
            <View style={[styles.mark, { backgroundColor: focused ? p.ember : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, gap: 7, paddingTop: 9 },
  label: { fontSize: 13, includeFontPadding: false },
  mark: { width: 18, height: 2 },
});
