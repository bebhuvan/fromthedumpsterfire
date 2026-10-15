import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Haul, Thread } from '@fdf/shared/haul';
import { fonts, usePalette } from '@/theme';
import { useAllHauls } from '@/lib/data';
import { go } from '@/nav';
import { Body, Label, Meta, Title } from '@/ui/type';
import { Screen } from '@/ui/screen';

/** Every thread in the archive. A thread can grow across Hauls; the newest telling wins. */
function collect(hauls: Haul[]) {
  const byId = new Map<string, { thread: Thread; n: number }>();
  for (const h of [...hauls].sort((a, b) => a.number - b.number)) for (const t of h.threads) byId.set(t.id, { thread: t, n: h.number });
  return [...byId.values()].reverse();
}

export function Threads() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const threads = collect(useAllHauls());

  return (
    <Screen header={<View style={{ height: insets.top + 18 }} />}>
      <Title title={{ text: 'Threads' }} size={44} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17, lineHeight: 25 }}>
        Lines that run through the archive, across years and Hauls. Each link between pieces cites a passage at both ends.
      </Body>
      <View style={{ marginTop: 22, gap: 12 }}>
        {threads.map(({ thread, n }) => {
          const first = thread.points[0]?.year;
          const last = thread.points[thread.points.length - 1]?.year;
          return (
            <Pressable
              key={thread.id}
              accessibilityRole="link"
              onPress={() => go.thread(n, thread.id)}
              style={({ pressed }) => [styles.card, { backgroundColor: p.plate, opacity: pressed ? 0.85 : 1 }]}
            >
              <Label muted>{thread.points.length} points · {first}–{last}</Label>
              <Title title={thread.title} size={30} style={{ marginTop: 10 }} />
              <View style={styles.years}>
                {thread.points.map((pt, i) => (
                  <Text key={i} style={[styles.year, { color: pt.inHaul ? p.ink : p.ink2 }]}>{pt.year}</Text>
                ))}
              </View>
              <Body style={{ marginTop: 12, fontSize: 15.5, lineHeight: 22, color: p.ink2 }}>{thread.summary}</Body>
              <Meta style={{ marginTop: 10 }}>Latest in Haul {n}</Meta>
            </Pressable>
          );
        })}
        {!threads.length ? <Body style={{ color: p.ink2 }}>Threads appear as Hauls arrive.</Body> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20 },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  year: { fontFamily: fonts.display, fontSize: 17, fontVariant: ['lining-nums'] },
});
