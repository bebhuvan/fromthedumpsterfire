import { Pressable, StyleSheet, Text, View } from 'react-native';
import { go } from '@/nav';
import type { Haul, Thread } from '@fdf/shared/haul';
import { fonts, usePalette } from '@/theme';
import { Body, Machine, Meta, Title } from '@/ui/type';
import { Action, Divider, TopBar } from '@/ui/parts';
import { Screen } from '@/ui/screen';

export function ThreadScreen({ haul, thread }: { haul: Haul; thread: Thread }) {
  const p = usePalette();
  const first = thread.points[0]?.year;
  const last = thread.points[thread.points.length - 1]?.year;
  const span = first && last ? Number(last) - Number(first) : 0;

  return (
    <Screen header={<TopBar label={`Haul ${haul.number}`} />}>
      <Meta style={{ marginTop: 18 }}>Thread · {thread.points.length} points{span ? ` · ${span} years` : ''}</Meta>
      <Title title={thread.title} size={44} style={{ marginTop: 10 }} />
      <Body style={{ marginTop: 12, color: p.ink2, fontSize: 17, lineHeight: 25 }}>{thread.summary}</Body>

      <View style={styles.legend}>
        <View style={styles.key}><View style={[styles.dot, { backgroundColor: p.ink, borderColor: p.ink }]} /><Meta>In this Haul</Meta></View>
        <View style={styles.key}><View style={[styles.dot, { borderColor: p.ink }]} /><Meta>From the archive</Meta></View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Divider />
        <View style={[styles.spine, { backgroundColor: p.rule }]} />
        {thread.points.map((pt, i) => {
          const open = pt.itemId ? () => go.item(haul.number, pt.itemId!) : undefined;
          return (
            <Pressable key={i} disabled={!open} onPress={open} accessibilityRole={open ? 'link' : undefined} style={({ pressed }) => [styles.point, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.year, { color: p.ink }]}>{pt.year}</Text>
              <View style={[styles.dot, { marginTop: 6, borderColor: p.ink, backgroundColor: pt.inHaul ? p.ink : p.bg }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: p.ink }]}>{pt.title}</Text>
                <Text style={[styles.gist, { color: p.ink2 }]}>{pt.gist}</Text>
                <Text style={[styles.edge, { color: p.machine }]}>{pt.edge}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.prov}>
        <Machine style={{ fontSize: 14 }}>{thread.provenance}</Machine>
      </View>

      <Action label="Back to the field note" onPress={() => go.note(haul.number)} style={{ marginTop: 26 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 18, marginTop: 16 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderWidth: 1.5 },
  spine: { position: 'absolute', left: 68, top: 26, bottom: 26, width: StyleSheet.hairlineWidth * 2 },
  point: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 13 },
  year: { width: 64, fontFamily: fonts.display, fontSize: 24, lineHeight: 26, letterSpacing: -0.5, fontVariant: ['lining-nums'] },
  title: { fontFamily: fonts.text, fontSize: 17.5, lineHeight: 22, marginLeft: 14 },
  gist: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 4, marginLeft: 14 },
  edge: { fontFamily: fonts.sans, fontSize: 13, marginTop: 6, marginLeft: 14 },
  prov: { marginTop: 18 },
});
