import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, usePalette } from '@/theme';
import { useAllHauls } from '@/lib/data';
import { itemsForTopic, randomFind, search, topicIndex } from '@/lib/search';
import { go } from '@/nav';
import { Body, Label, Meta, Title } from '@/ui/type';
import { Divider, Pill } from '@/ui/parts';
import { FindRow } from '@/ui/FindRow';

export function Search({ initial }: { initial?: string }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const hauls = useAllHauls();
  const [q, setQ] = useState(initial ?? '');
  const [type, setType] = useState<ContentType | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  useEffect(() => {
    if (initial !== undefined) setQ(initial);
  }, [initial]);

  const hits = useMemo(() => {
    const all = search(hauls, q);
    return type ? all.filter((h) => h.item.type === type) : all;
  }, [hauls, q, type]);
  const types = useMemo(() => [...new Set(search(hauls, q).map((h) => h.item.type))], [hauls, q]);
  const topics = useMemo(() => topicIndex(hauls), [hauls]);
  const topicItems = useMemo(() => (topic ? itemsForTopic(hauls, topic) : []), [hauls, topic]);
  const query = q.trim();

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top }}>
      <View style={styles.head}>
        <TextInput
          value={q}
          onChangeText={(t) => {
            setQ(t);
            setTopic(null);
          }}
          placeholder="Search every Haul"
          placeholderTextColor={p.ink2}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search every Haul"
          style={[styles.input, { color: p.ink, borderBottomColor: p.ink }]}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40 }}>
        {query ? (
          <>
            {types.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                <FilterChip label="All" on={!type} color={p.plate} onPress={() => setType(null)} />
                {types.map((t) => (
                  <FilterChip key={t} label={typeLabel[t]} on={type === t} color={typeColor(p, t)} onPress={() => setType(type === t ? null : t)} />
                ))}
              </ScrollView>
            ) : null}
            <Meta style={{ marginTop: 14, marginBottom: 6 }}>{hits.length ? `${hits.length} ${hits.length === 1 ? 'find' : 'finds'}` : 'Nothing matches yet'}</Meta>
            {hits.map((h) => (
              <FindRow key={`${h.n}:${h.item.id}`} n={h.n} id={h.item.id} type={h.item.type} title={h.item.title} creator={h.item.creator} snippet={h.snippet} />
            ))}
            {hits.length ? <Divider /> : <Body style={{ color: p.ink2, marginTop: 8 }}>Try a person, a place, a year or an idea.</Body>}
          </>
        ) : topic ? (
          <>
            <Pressable onPress={() => setTopic(null)} style={{ minHeight: 44, justifyContent: 'center', marginTop: 8 }} accessibilityRole="button">
              <Label muted>All topics</Label>
            </Pressable>
            <Title title={{ text: topic }} size={34} />
            <Meta style={{ marginTop: 8, marginBottom: 12 }}>{topicItems.length} {topicItems.length === 1 ? 'find touches' : 'finds touch'} this</Meta>
            {topicItems.map(({ n, item }) => (
              <FindRow key={`${n}:${item.id}`} n={n} id={item.id} type={item.type} title={item.title} creator={item.creator} />
            ))}
            <Divider />
          </>
        ) : (
          <>
            <Pill
              label="Surprise me"
              onPress={() => {
                const f = randomFind(hauls);
                if (f) go.item(f.n, f.item.id);
              }}
              style={{ marginTop: 22 }}
            />
            <Text accessibilityRole="header" style={[styles.indexTitle, { color: p.ink }]}>The index</Text>
            <Meta style={{ marginBottom: 10 }}>People, places and ideas across every Haul</Meta>
            {topics.map((t) => (
              <View key={t.title}>
                <Divider />
                <Pressable accessibilityRole="button" onPress={() => setTopic(t.title)} style={({ pressed }) => [styles.topic, pressed && { opacity: 0.6 }]}>
                  <Text style={[styles.topicText, { color: p.ink }]}>{t.title}</Text>
                  <Meta style={{ fontVariant: ['tabular-nums'] }}>{t.count}</Meta>
                </Pressable>
              </View>
            ))}
            <Divider />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function FilterChip({ label, on, color, onPress }: { label: string; on: boolean; color: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.filter, { backgroundColor: on ? p.invBg : color }]}
    >
      <Text style={[styles.filterText, { color: on ? p.invInk : p.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: GUTTER, paddingTop: 18 },
  input: { fontFamily: fonts.display, fontSize: 30, paddingVertical: 10, borderBottomWidth: 1.5, includeFontPadding: false },
  filters: { gap: 8, paddingTop: 16 },
  filter: { minHeight: 36, paddingHorizontal: 14, borderRadius: 99, justifyContent: 'center' },
  filterText: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  indexTitle: { fontFamily: fonts.display, fontSize: 26, marginTop: 34, marginBottom: 4 },
  topic: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50 },
  topicText: { fontFamily: fonts.text, fontSize: 17.5, flex: 1 },
});
