import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haulSlug } from '@fdf/shared/haul';
import { fonts, usePalette } from '@/theme';
import { useIndex } from '@/lib/data';
import { go } from '@/nav';
import { longDate } from '@/lib/format';
import { Body, Meta, Title } from '@/ui/type';
import { TopBar } from '@/ui/parts';
import { Screen, Waiting } from '@/ui/screen';

/** Every Haul as a stack of its coloured sheets, newest on top, the number set large on each. */
export function Archive() {
  const p = usePalette();
  const { data, status } = useIndex();
  if (!data) return <Waiting status={status} />;

  return (
    <Screen header={<TopBar label="Latest" />}>
      <Title title={{ text: 'Every', italic: 'Haul' }} size={44} style={{ marginTop: 16 }} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17 }}>Each Haul keeps its own colour, so the archive reads like a shelf.</Body>
      <View style={{ marginTop: 24 }}>
        {data.hauls.map((h) => (
          <Pressable
            key={h.number}
            accessibilityRole="link"
            accessibilityLabel={`Haul ${h.number}: ${h.title.text} ${h.title.italic ?? ''}`}
            onPress={() => go.haul(h.number)}
            style={({ pressed }) => [styles.sheet, { backgroundColor: p.swatch[h.swatch], opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.head}>
              <Text style={[styles.num, { color: p.ink }]}>{haulSlug(h.number)}</Text>
              <Meta style={{ color: p.ink }}>{longDate(h.publishedAt)}</Meta>
            </View>
            <Title title={h.title} size={28} style={{ marginTop: 8 }} />
            <Meta style={{ marginTop: 10 }}>{h.itemCount} objects</Meta>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  num: { fontFamily: fonts.displayRegular, fontSize: 64, lineHeight: 62, letterSpacing: -2.5, includeFontPadding: false, fontVariant: ['lining-nums'] },
});
