// Every Haul as a run of editions, newest first, as on the website: each in its own ink (a band down
// its edge, its number), its title and date, and its fingerprint once the Haul is on the phone.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haulSlug, type Haul } from '@fdf/shared/haul';
import { editionInk, editionOf } from '@fdf/shared/tokens';
import { fonts, usePalette, useScheme } from '@/theme';
import { useAllHauls, useIndex } from '@/lib/data';
import { go } from '@/nav';
import { longDate } from '@/lib/format';
import { Body, Meta, Title } from '@/ui/type';
import { PageHead } from '@/ui/parts';
import { Screen, Waiting } from '@/ui/screen';
import { MiniFingerprint, objects } from '@/ui/Fingerprint';

export function Archive() {
  const p = usePalette();
  const scheme = useScheme();
  const { data, status } = useIndex();
  const onPhone = new Map(useAllHauls().map((h) => [h.number, h] as [number, Haul]));
  if (!data) return <Waiting status={status} />;

  return (
    <Screen header={<PageHead />}>
      <Title title={{ text: 'Every', italic: 'Haul' }} size={44} style={{ marginTop: 18 }} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17, lineHeight: 25 }}>
        Newest first. Each Haul keeps its own ink and its own fingerprint: its objects on a line by the year each was made.
      </Body>
      <View style={[styles.list, { borderTopColor: p.ink }]}>
        {data.hauls.map((h) => {
          const ink = editionInk[scheme][editionOf(h.number, h.edition)];
          const full = onPhone.get(h.number);
          return (
            <Pressable
              key={h.number}
              accessibilityRole="link"
              accessibilityLabel={`Haul ${h.number}: ${h.title.text} ${h.title.italic ?? ''}, ${longDate(h.publishedAt)}`}
              onPress={() => go.haul(h.number)}
              style={({ pressed }) => [styles.row, { borderBottomColor: p.rule, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.band, { backgroundColor: ink }]} />
              <View style={styles.numRow}>
                <Text style={[styles.h, { color: ink }]}>HAUL</Text>
                <Text style={[styles.num, { color: ink }]}>{haulSlug(h.number)}</Text>
              </View>
              <Title title={h.title} size={30} style={{ marginTop: 12 }} />
              <Body style={{ marginTop: 8, fontSize: 16, lineHeight: 23, color: p.ink2 }}>{h.deck}</Body>
              <Meta style={{ marginTop: 10 }}>{longDate(h.publishedAt)} · {objects(h.itemCount).toLowerCase()}</Meta>
              {full ? (
                <View style={{ marginTop: 14 }}>
                  <MiniFingerprint haul={full} width={220} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 26, borderTopWidth: 1 },
  row: { paddingTop: 22, paddingBottom: 24, paddingLeft: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h: { fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 1.5, includeFontPadding: false },
  num: { fontFamily: fonts.displayRegular, fontSize: 52, lineHeight: 52, letterSpacing: -1.5, includeFontPadding: false, fontVariant: ['lining-nums'] },
});
