import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Haul, Thread } from '@fdf/shared/haul';
import { fonts, usePalette } from '@/theme';
import { useAllHauls } from '@/lib/data';
import { go } from '@/nav';
import { Body, Meta, Title } from '@/ui/type';
import { Divider, PageHead } from '@/ui/parts';
import { Screen } from '@/ui/screen';

/** Every thread in the archive. A thread can grow across Hauls; the newest telling wins. */
function collect(hauls: Haul[]) {
  const byId = new Map<string, { thread: Thread; n: number }>();
  for (const h of [...hauls].sort((a, b) => a.number - b.number)) for (const t of h.threads) byId.set(t.id, { thread: t, n: h.number });
  return [...byId.values()].reverse();
}

export function Threads() {
  const p = usePalette();
  const threads = collect(useAllHauls());

  return (
    <Screen header={<PageHead />}>
      <Title title={{ text: 'Threads' }} size={44} style={{ marginTop: 18 }} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17, lineHeight: 25 }}>
        Lines that run through the archive, across years and Hauls. Each link between pieces cites a passage at both ends.
      </Body>
      <View style={{ marginTop: 24 }}>
        <Divider strong />
        {threads.map(({ thread, n }) => {
          const first = thread.points[0]?.year;
          const last = thread.points[thread.points.length - 1]?.year;
          return (
            <View key={thread.id}>
              <Pressable accessibilityRole="link" onPress={() => go.thread(n, thread.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <Meta>{thread.points.length} points · {first} to {last} · latest in Haul {n}</Meta>
                <Title title={thread.title} size={30} style={{ marginTop: 8 }} />
                <View style={styles.years}>
                  {thread.points.map((pt, i) => (
                    <Text key={i} style={[styles.year, { color: pt.inHaul ? p.ink : p.ink2 }]}>{pt.year}</Text>
                  ))}
                </View>
                <Body style={{ marginTop: 10, fontSize: 15.5, lineHeight: 22, color: p.ink2 }}>{thread.summary}</Body>
              </Pressable>
              <Divider />
            </View>
          );
        })}
        {!threads.length ? <Body style={{ color: p.ink2, marginTop: 14 }}>Threads appear as Hauls arrive.</Body> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 18 },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  year: { fontFamily: fonts.displayRegular, fontSize: 17, fontVariant: ['lining-nums', 'tabular-nums'] },
});
