// Every Haul as a run of editions, newest first, as on the website: each in its own ink (a band down
// its edge, its number), its title and date, and its fingerprint once the Haul is on the phone. Set
// as a card drawer (2026-11-09, a signature): each Haul an index card with its tab (the date it went
// out) standing up in its ink at its own place along the drawer, a punch hole, a heavy ink front.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haulSlug, type Haul } from '@fdf/shared/haul';
import { editionInk, editionOf } from '@fdf/shared/tokens';
import { fonts, usePalette, useScheme } from '@/theme';
import { useAllHauls, useIndex } from '@/lib/data';
import { go } from '@/nav';
import { longDate, stampDate } from '@/lib/format';
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
      <View style={[styles.list, { borderBottomColor: p.ink }]}>
        {data.hauls.map((h, i) => {
          const ink = editionInk[scheme][editionOf(h.number, h.edition)];
          const full = onPhone.get(h.number);
          return (
            <Pressable
              key={h.number}
              accessibilityRole="link"
              accessibilityLabel={`Haul ${h.number}: ${h.title.text} ${h.title.italic ?? ''}, ${longDate(h.publishedAt)}`}
              onPress={() => go.haul(h.number)}
              style={({ pressed }) => [styles.row, { borderTopColor: p.ink, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.tab, { borderColor: p.ink, backgroundColor: p.bg, left: TAB_AT[i % TAB_AT.length] }]} accessible={false}>
                <Text style={[styles.tabT, { color: ink }]}>{stampDate(h.publishedAt).toUpperCase()}</Text>
              </View>
              <View style={[styles.hole, { borderColor: p.ink2 }]} accessible={false} />
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

/** Where each card's tab stands along the drawer, in turn. */
const TAB_AT = ['0%', '24%', '48%', '62%'] as const;

const styles = StyleSheet.create({
  list: { marginTop: 22, borderBottomWidth: 3, paddingBottom: 4 },
  row: { marginTop: 30, paddingTop: 22, paddingBottom: 24, paddingLeft: 18, paddingRight: 34, borderTopWidth: 1 },
  tab: { position: 'absolute', top: -23, height: 22, paddingHorizontal: 11, paddingTop: 4, borderWidth: 1, borderBottomWidth: 0 },
  tabT: { fontFamily: fonts.sansMedium, fontSize: 10.5, letterSpacing: 1.2, includeFontPadding: false },
  hole: { position: 'absolute', right: 12, top: 22, width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h: { fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 1.5, includeFontPadding: false },
  num: { fontFamily: fonts.displayRegular, fontSize: 52, lineHeight: 52, letterSpacing: -1.5, includeFontPadding: false, fontVariant: ['lining-nums'] },
});
