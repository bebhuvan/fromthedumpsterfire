import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, usePalette } from '@/theme';
import { useAllHauls } from '@/lib/data';
import { itemsForTopic, randomFind, search, topicIndex } from '@/lib/search';
import { go } from '@/nav';
import { Body, Meta, Title } from '@/ui/type';
import { Action, Divider, PageHead } from '@/ui/parts';
import { FindRow } from '@/ui/FindRow';

export function Search({ initial }: { initial?: string }) {
  const p = usePalette();
  const hauls = useAllHauls();
  const [q, setQ] = useState(initial ?? '');
  const [type, setType] = useState<ContentType | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

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
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <PageHead />
      {/* A page title like every other section's, then a field that looks like one: set on the plate
          with an ink rule under it (ember while typing), the hint in the editor's italic. */}
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.pageTitle, { color: p.ink }]}>Search</Text>
        <View style={[styles.field, { backgroundColor: p.plate, borderBottomColor: focused ? p.ember : p.ink }]}>
          <TextInput
            value={q}
            onChangeText={(t) => {
              setQ(t);
              setTopic(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="A person, a place, a year, an idea"
            placeholderTextColor={p.ink2}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search every Haul"
            style={[styles.input, { color: p.ink, fontFamily: q ? fonts.displayRegular : fonts.textItalic }]}
          />
          {q ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={10} onPress={() => setQ('')} style={styles.clear}>
              <Meta style={{ color: p.ink }}>Clear</Meta>
            </Pressable>
          ) : null}
        </View>
        <Meta style={{ marginTop: 8 }}>Every Haul, every find, every note.</Meta>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40 }}>
        {query ? (
          <>
            {types.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                <FilterChip label="All" on={!type} onPress={() => setType(null)} />
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
              <Meta>All topics</Meta>
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
            <Action
              label="Surprise me"
              onPress={() => {
                const f = randomFind(hauls);
                if (f) go.item(f.n, f.item.id);
              }}
              style={{ marginTop: 26, borderTopWidth: 0 }}
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

/** A filter is a word with the type's key; the chosen one is ink and underlined. */
function FilterChip({ label, on, color, onPress }: { label: string; on: boolean; color?: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.filter, { borderBottomColor: on ? p.ink : 'transparent' }]}
    >
      {color ? <View style={[styles.filterKey, { backgroundColor: color, borderColor: p.rule }]} /> : null}
      <Text style={[styles.filterText, { color: on ? p.ink : p.ink2, fontFamily: on ? fonts.sansBold : fonts.sansMedium }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: GUTTER, paddingTop: 12 },
  pageTitle: { fontFamily: fonts.display, fontSize: 38, lineHeight: 44, marginBottom: 14 },
  field: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 21, paddingVertical: 14, includeFontPadding: false },
  clear: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  filters: { gap: 18, paddingTop: 14 },
  filter: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2 },
  filterKey: { width: 8, height: 8, borderWidth: StyleSheet.hairlineWidth },
  filterText: { fontSize: 13.5 },
  indexTitle: { fontFamily: fonts.display, fontSize: 26, marginTop: 34, marginBottom: 4 },
  topic: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50 },
  topicText: { fontFamily: fonts.text, fontSize: 17.5, flex: 1 },
});
