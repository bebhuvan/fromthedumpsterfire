import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { haulSlug, type Haul, type Item } from '@fdf/shared/haul';
import { fonts, GUTTER, usePalette } from '@/theme';
import { longDate } from '@/lib/format';
import { Body, Label, Title } from '@/ui/type';
import { Chip, Divider, Flame, Pill } from '@/ui/parts';
import { Screen } from '@/ui/screen';

export function Cover({ haul }: { haul: Haul }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const header = (
    <View style={{ backgroundColor: p.swatch[haul.swatch], paddingTop: insets.top + 18, paddingHorizontal: GUTTER, paddingBottom: 26 }}>
      <View style={styles.row}>
        <Label>Haul</Label>
        <Label muted>{longDate(haul.publishedAt)}</Label>
      </View>
      <Text
        accessibilityLabel={`Haul number ${haul.number}`}
        style={[styles.numeral, { color: p.ink, fontSize: Math.min(210, width * 0.5), lineHeight: Math.min(210, width * 0.5) * 0.9 }]}
      >
        {haulSlug(haul.number)}
      </Text>
    </View>
  );

  return (
    <Screen header={header}>
      <View style={styles.mastRow}>
        <Flame size={9} />
        <Text style={[styles.masthead, { color: p.ink2 }]}>From the Dumpster Fire</Text>
      </View>
      <Title title={haul.title} size={42} style={{ marginTop: 8 }} />
      <Body style={{ marginTop: 12, color: p.ink2, fontSize: 17, lineHeight: 25 }}>{haul.deck}</Body>

      <View style={{ marginTop: 24 }}>
        {haul.items.map((item) => (
          <ContentsRow key={item.id} haul={haul.number} item={item} />
        ))}
        <Divider />
      </View>

      <Pill label="Begin with the field note" onPress={() => go.note(haul.number)} style={{ marginTop: 28 }} />

      <View style={styles.footer}>
        <Pressable accessibilityRole="link" onPress={go.archive}><Text style={[styles.footLink, { color: p.ink2 }]}>Every Haul</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={go.about}><Text style={[styles.footLink, { color: p.ink2 }]}>How it's made</Text></Pressable>
      </View>
    </Screen>
  );
}

const ContentsRow = memo(function ContentsRow({ haul, item }: { haul: number; item: Item }) {
  const p = usePalette();
  return (
    <>
      <Divider />
      <Pressable
        accessibilityRole="link"
        onPress={() => go.item(haul, item.id)}
        style={({ pressed }) => [styles.contents, pressed && { opacity: 0.6 }]}
      >
        <Text numberOfLines={2} style={[styles.contentsTitle, { color: p.ink, fontFamily: item.type === 'poem' ? fonts.textItalic : fonts.text }]}>
          {item.title.text}
          {item.title.italic ? ' ' + item.title.italic : ''}
        </Text>
        <Chip type={item.type} />
      </Pressable>
    </>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  numeral: { fontFamily: fonts.displayRegular, letterSpacing: -6, marginTop: 18, includeFontPadding: false, fontVariant: ['lining-nums'] },
  mastRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 22 },
  masthead: { fontFamily: fonts.displayItalic, fontSize: 16 },
  contents: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  contentsTitle: { flex: 1, fontSize: 18, lineHeight: 23, includeFontPadding: false },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  footLink: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', paddingVertical: 14 },
});
