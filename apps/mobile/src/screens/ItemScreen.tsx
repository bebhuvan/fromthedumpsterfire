import { memo } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { go } from '@/nav';
import type { Haul, Item } from '@fdf/shared/haul';
import { typeLabel } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, usePalette } from '@/theme';
import { joinMeta, minutes } from '@/lib/format';
import { openSource } from '@/lib/open';
import { shareUrl } from '@/lib/data';
import { Highlighted, Label, Machine, Meta, Note, Title } from '@/ui/type';
import { Chip, Divider, Pill, Section, TopBar, VoiceNote } from '@/ui/parts';
import { Screen } from '@/ui/screen';

export function ItemScreen({ haul, item }: { haul: Haul; item: Item }) {
  const p = usePalette();
  const tint = typeColor(p, item.type);
  const at = haul.items.indexOf(item);
  const next = haul.items[at + 1];
  const sourceLabel = item.media ? item.media.label : item.type === 'rabbit-hole' ? 'Go down the hole' : 'Read the original';

  const header = (
    <View style={{ backgroundColor: item.type === 'rhymes' ? p.bg : tint }}>
      <TopBar label={`Haul ${haul.number}`} right={`${at + 1} of ${haul.items.length}`} />
      <View style={styles.head}>
        {item.type === 'rhymes' ? <Chip type="rhymes" /> : <Label>{joinMeta(typeLabel[item.type], item.source.name, item.source.date, minutes(item.minutes))}</Label>}
        <Title title={item.title} size={item.title.text.length > 26 ? 40 : 48} style={{ marginTop: 12 }} />
        {item.type !== 'rhymes' ? <Text style={[styles.creator, { color: p.ink }]}>{item.creator}</Text> : null}
      </View>
    </View>
  );

  return (
    <Screen header={header}>
      {item.plate ? <PlateView item={item} /> : null}

      {item.type === 'rhymes' && item.rhyme ? <RhymeBody item={item} /> : null}

      {item.type === 'poem' && item.excerpt ? (
        <View style={[styles.poem, { backgroundColor: tint }]}>
          <Text selectable style={[styles.poemText, { color: p.ink }]}>{item.excerpt.text}</Text>
          <Meta style={{ color: p.ink, marginTop: 14 }}>{item.creator}, {item.source.name}</Meta>
        </View>
      ) : null}

      <Why item={item} />

      {item.excerpt && item.type !== 'poem' ? (
        <View style={{ marginTop: 30 }}>
          <Text style={[styles.quoteMark, { color: p.ink }]} accessible={false}>“</Text>
          <Highlighted text={item.excerpt.text} highlight={item.excerpt.highlight} color={tint} style={styles.excerpt} />
          <Meta style={{ marginTop: 12 }}>{item.excerpt.locator} · matched word for word against the source</Meta>
        </View>
      ) : null}

      {item.marginalia.length ? (
        <View style={[styles.margin, { backgroundColor: p.plate }]}>
          <View style={styles.marginHead}>
            <Label style={{ color: p.machine }}>Marginalia</Label>
            <Meta>Machine-read, editor-checked</Meta>
          </View>
          {item.marginalia.map((m, i) => (
            <View key={i} style={{ marginTop: 12 }}>
              <Machine>{m.text}</Machine>
              <Meta style={{ marginTop: 3, fontSize: 11.5 }}>{m.cite}</Meta>
            </View>
          ))}
        </View>
      ) : null}

      {item.wiki.length ? (
        <Section title="Further, via Wikipedia">
          <View style={{ marginTop: 10 }}>
            {item.wiki.map((w) => (
              <View key={w.url}>
                <Divider />
                <Pressable accessibilityRole="link" onPress={() => openSource(w.url, p)} style={({ pressed }) => [styles.wiki, pressed && { opacity: 0.6 }]}>
                  <View style={styles.wikiHead}>
                    <Text style={[styles.wikiTitle, { color: p.ink }]}>{w.title}</Text>
                    <Text style={[styles.ext, { color: p.ink2 }]}>↗</Text>
                  </View>
                  <Text style={[styles.wikiSummary, { color: p.ink2 }]}>{w.summary}</Text>
                </Pressable>
              </View>
            ))}
            <Divider />
          </View>
        </Section>
      ) : null}

      {item.connections.length ? (
        <Section title="Where it connects">
          <View style={{ marginTop: 12, gap: 10 }}>
            {item.connections.map((c, i) => {
              const target = c.itemId ? haul.items.find((x) => x.id === c.itemId) : undefined;
              const bg = target ? typeColor(p, target.type) : p.swatch.peach;
              const open = () => (c.itemId ? go.item(haul.number, c.itemId) : c.threadId ? go.thread(haul.number, c.threadId) : undefined);
              return (
                <Pressable key={i} accessibilityRole="link" onPress={open} style={({ pressed }) => [styles.edge, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}>
                  <Label>{c.type}</Label>
                  <Text style={[styles.edgeTitle, { color: p.ink }]}>{c.title}</Text>
                  <Text style={[styles.edgeNote, { color: p.ink }]}>{c.note}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>
      ) : null}

      <Pill label={sourceLabel} external onPress={() => openSource(item.media?.url ?? item.source.url, p)} style={{ marginTop: 34 }} />
      <Pressable
        accessibilityRole="button"
        onPress={() => Share.share({ message: `${item.title.text}${item.title.italic ? ' ' + item.title.italic : ''}, in From the Dumpster Fire\n${shareUrl(haul.number, item.id)}` })}
        style={styles.share}
      >
        <Label muted>Share this find</Label>
      </Pressable>

      {next ? <NextItem n={haul.number} item={next} /> : <Finished haul={haul} />}
    </Screen>
  );
}

function Why({ item }: { item: Item }) {
  const p = usePalette();
  const heading = item.type === 'rhymes' ? 'My two bits' : "Why it's here";
  return (
    <View style={{ marginTop: item.type === 'rhymes' ? 30 : 28 }}>
      <View style={styles.whyHead}>
        <Text accessibilityRole="header" style={[styles.whyTitle, { color: p.ink }]}>{heading}</Text>
        {item.why.audio ? <VoiceNote audio={item.why.audio} label="this note" compact /> : null}
      </View>
      <Note style={{ marginTop: 8 }}>{item.why.text}</Note>
      <Text style={[styles.sign, { color: p.ink }]}>B.</Text>
    </View>
  );
}

function RhymeBody({ item }: { item: Item }) {
  const p = usePalette();
  const r = item.rhyme!;
  return (
    <View style={{ marginTop: 18 }}>
      <Era year={r.then.year} quote={r.then.quote} cite={r.then.cite} bg={p.swatch.sky} />
      <View style={styles.bridge}>
        <View style={[styles.bridgeLine, { backgroundColor: p.machine }]} />
        <Machine style={{ flex: 1, fontSize: 14 }}>{r.bridge}</Machine>
      </View>
      <Era year={r.now.year} quote={r.now.quote} cite={r.now.cite} bg={p.plate} />
    </View>
  );
}

const Era = memo(function Era({ year, quote, cite, bg }: { year: string; quote: string; cite: string; bg: string }) {
  const p = usePalette();
  return (
    <View style={[styles.era, { backgroundColor: bg }]}>
      <Text style={[styles.eraYear, { color: p.ink }]}>{year}</Text>
      <Text selectable style={[styles.eraQuote, { color: p.ink }]}>“{quote}”</Text>
      <Text style={[styles.eraCite, { color: p.ink }]}>{cite}</Text>
    </View>
  );
});

function PlateView({ item }: { item: Item }) {
  const p = usePalette();
  const plate = item.plate!;
  return (
    <View style={{ marginTop: 24 }}>
      <Image
        source={{ uri: plate.url }}
        accessibilityLabel={plate.caption}
        resizeMode="cover"
        style={{ width: '100%', aspectRatio: plate.width / plate.height, borderRadius: 14, backgroundColor: p.plate }}
      />
      <Text style={[styles.caption, { color: p.ink2 }]}>{plate.caption} {plate.credit}, {plate.licence}.</Text>
    </View>
  );
}

function NextItem({ n, item }: { n: number; item: Item }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => go.nextItem(n, item.id)}
      style={({ pressed }) => [styles.next, { backgroundColor: typeColor(p, item.type), opacity: pressed ? 0.85 : 1 }]}
    >
      <Label>Next · {typeLabel[item.type]}</Label>
      <Title title={item.title} size={28} style={{ marginTop: 8 }} />
      <Text style={[styles.creator, { color: p.ink, fontSize: 16 }]}>{item.creator}</Text>
    </Pressable>
  );
}

function Finished({ haul }: { haul: Haul }) {
  const p = usePalette();
  return (
    <View style={[styles.next, { backgroundColor: p.plate }]}>
      <Label>End of Haul {haul.number}</Label>
      <Text style={[styles.colophon, { color: p.ink2 }]}>{haul.colophon}</Text>
      <Pressable accessibilityRole="link" onPress={go.cover} style={{ marginTop: 14, minHeight: 44, justifyContent: 'center' }}>
        <Text style={[styles.creator, { color: p.ink, marginTop: 0 }]}>Back to the cover</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: GUTTER, paddingTop: 18, paddingBottom: 26 },
  creator: { fontFamily: fonts.textItalic, fontSize: 18, marginTop: 10, includeFontPadding: false },
  whyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  whyTitle: { fontFamily: fonts.display, fontSize: 23 },
  sign: { fontFamily: fonts.displayItalic, fontSize: 19, textAlign: 'right', marginTop: 4 },
  quoteMark: { fontFamily: fonts.display, fontSize: 64, lineHeight: 50, height: 32, includeFontPadding: false },
  excerpt: { fontFamily: fonts.text, fontSize: 23, lineHeight: 32 },
  margin: { marginTop: 32, borderRadius: 16, padding: 18 },
  marginHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  wiki: { paddingVertical: 13 },
  wikiHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  wikiTitle: { fontFamily: fonts.text, fontSize: 18, flex: 1 },
  ext: { fontFamily: fonts.sansMedium, fontSize: 13 },
  wikiSummary: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 3 },
  edge: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  edgeTitle: { fontFamily: fonts.text, fontSize: 17.5, marginTop: 5 },
  edgeNote: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 3 },
  share: { alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, marginTop: 6 },
  next: { marginTop: 22, borderRadius: 20, padding: 20 },
  colophon: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 23, marginTop: 10 },
  poem: { marginTop: 24, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 30 },
  poemText: { fontFamily: fonts.displayItalic, fontSize: 32, lineHeight: 39 },
  era: { borderRadius: 18, padding: 20 },
  eraYear: { fontFamily: fonts.displayRegular, fontSize: 88, lineHeight: 84, letterSpacing: -3, includeFontPadding: false, fontVariant: ['lining-nums'] },
  eraQuote: { fontFamily: fonts.text, fontSize: 20.5, lineHeight: 28.5, marginTop: 14 },
  eraCite: { fontFamily: fonts.textItalic, fontSize: 14.5, lineHeight: 20, marginTop: 10 },
  bridge: { flexDirection: 'row', gap: 14, paddingVertical: 18, paddingHorizontal: 8 },
  bridgeLine: { width: 1.5, borderRadius: 1 },
  caption: { fontFamily: fonts.textItalic, fontSize: 13.5, lineHeight: 19, marginTop: 8 },
});
