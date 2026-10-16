// The cover's contents as specimens: each find shown as a small piece of its own printed form, so a
// reader knows what they are holding before reading a word. Each keeps its own width and side.
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { go } from '@/nav';
import { haulSlug, type Item } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, typeColor, usePalette } from '@/theme';
import { readKey, useReader } from '@/lib/store';
import { Highlighted, Title } from './type';

const firstSentence = (s: string) => (/^.*?[.!?](\s|$)/.exec(s)?.[0] ?? s).trim();
const yearOf = (d: string) => /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(d)?.[1] ?? d;
const surname = (c: string) => c.split(' ').pop() ?? c;
const headword = (t: string) => {
  const m = /^(The|A|An) (.+)$/.exec(t);
  return m ? { word: m[2]![0]!.toUpperCase() + m[2]!.slice(1) + ',', article: m[1]! } : { word: t, article: '' };
};

type Shape = { width: DimensionValue; align: 'flex-start' | 'center' | 'flex-end' };
const SHAPE: Partial<Record<ContentType, Shape>> = {
  poem: { width: '72%', align: 'flex-end' },
  paper: { width: '84%', align: 'center' },
  'rabbit-hole': { width: '92%', align: 'flex-start' },
  passage: { width: '84%', align: 'flex-start' },
};

export const Specimen = memo(function Specimen({ haul, item, n }: { haul: number; item: Item; n: number }) {
  const p = usePalette();
  const read = useReader((s) => s.read.includes(readKey(haul, item.id)));
  const shape = SHAPE[item.type] ?? { width: '100%', align: 'flex-start' };
  return (
    <View style={{ width: shape.width, alignSelf: shape.align }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${n}, ${typeLabel[item.type]}: ${item.title.text}${item.title.italic ? ' ' + item.title.italic : ''}, ${item.creator}${read ? ', read' : ''}`}
        onPress={() => go.item(haul, item.id)}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <Body item={item} haul={haul} n={n} />
      </Pressable>
      <View style={st.cap}>
        <Text style={[st.capN, { color: p.ember }]}>{String(n).padStart(2, '0')}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[st.capType, { color: p.ink2 }]}>
            {typeLabel[item.type]}
            {read ? '  ·  Read' : ''}
          </Text>
          <Text style={[st.capWhy, { color: p.ink2 }]}>{firstSentence(item.why.text)}</Text>
        </View>
      </View>
    </View>
  );
});

function Body({ item, haul, n }: { item: Item; haul: number; n: number }): ReactNode {
  const p = usePalette();
  const tint = typeColor(p, item.type);
  const ex = item.excerpt;
  switch (item.type) {
    case 'rhymes': {
      const r = item.rhyme;
      if (!r) break;
      return (
        <View style={[st.spread, { borderTopColor: p.ink, borderBottomColor: p.rule }]}>
          <View style={st.leaf}>
            <Text style={[st.spYear, { color: p.ink2 }]}>{r.then.year}</Text>
            <Text numberOfLines={5} style={[st.spQ, { color: p.ink }]}>{r.then.quote.split('. ')[0]}{r.then.quote.includes('. ') ? '.' : ''}</Text>
          </View>
          <View style={[st.leaf, st.leafR, { borderLeftColor: p.rule }]}>
            <Text style={[st.spYear, { color: p.ink }]}>{r.now.year}</Text>
            <Text numberOfLines={4} style={[st.spQ, { color: p.ink }]}>{r.now.quote}</Text>
          </View>
        </View>
      );
    }
    case 'talk':
    case 'video':
    case 'podcast':
      return (
        <View style={[st.strip, { borderColor: p.rule }]}>
          <Text style={[st.who, { color: p.ink }]}>{surname(item.creator).toUpperCase()}</Text>
          <View style={{ flex: 1 }}>
            {ex ? (
              <Highlighted text={ex.text} highlight={ex.highlight} color={tint} style={st.said} />
            ) : (
              <Title title={item.title} size={22} />
            )}
            <Text style={[st.small, { color: p.ink2, marginTop: 6 }]}>{item.source.name}, {item.source.date}</Text>
          </View>
        </View>
      );
    case 'paper':
      return (
        <View style={[st.frame, { borderColor: p.rule, paddingTop: 0, alignItems: 'center' }]}>
          <Text numberOfLines={1} style={[st.small, st.runcite, { color: p.ink2, borderBottomColor: p.rule }]}>{item.source.name} · {yearOf(item.source.date)}</Text>
          <Title title={item.title} size={22} style={{ textAlign: 'center', marginTop: 14 }} />
          <Text style={[st.by, { color: p.ink, textAlign: 'center', fontSize: 14 }]}>{item.creator}</Text>
          {ex ? (
            <>
              <Text style={[st.abHead, { color: p.ink }]}>Abstract</Text>
              <Highlighted text={ex.text} highlight={ex.highlight} color={tint} style={st.abText} />
            </>
          ) : null}
        </View>
      );
    case 'poem':
      return (
        <View style={[st.poem, { backgroundColor: tint }]}>
          {ex ? <Text style={[st.poemText, { color: p.ink }]}>{ex.text}</Text> : <Title title={item.title} size={24} />}
          <Text style={[st.poemFoot, { color: p.ink, borderTopColor: p.rule }]}>{item.creator}</Text>
        </View>
      );
    case 'rabbit-hole': {
      const hw = headword(item.title.text);
      return (
        <View style={[st.card, { backgroundColor: tint }]}>
          <View style={st.call}>
            <Text style={[st.small, { color: p.ink2 }]}>FDF {haulSlug(haul)}.{n}</Text>
            <Text style={[st.small, { color: p.ink2 }]}>{item.source.date.split(', ')[0]}</Text>
          </View>
          <Text style={[st.hw, { color: p.ink }]}>
            {hw.word}
            {hw.article ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + hw.article}</Text> : null}
          </Text>
          <Text style={[st.cardDate, { color: p.ink2, borderBottomColor: p.rule }]}>{item.source.date}</Text>
          <View style={[st.punch, { backgroundColor: p.bg }]} />
        </View>
      );
    }
    case 'passage':
      return (
        <View style={[st.page, { backgroundColor: p.plate }]}>
          <Text style={[st.pageHead, { color: p.ink2 }]}>{item.source.name.toUpperCase()}</Text>
          {ex ? (
            <Highlighted text={ex.text} highlight={ex.highlight} color={tint} style={st.pageText} />
          ) : (
            <Title title={item.title} size={22} />
          )}
          {ex ? <Text style={[st.pageFoot, { color: p.ink2 }]}>{ex.locator}</Text> : null}
        </View>
      );
  }
  // Essay, post, and anything else: a cropped magazine opening.
  const len = item.title.text.length + (item.title.italic?.length ?? 0);
  const size = len <= 16 ? 46 : len <= 30 ? 36 : 30;
  return (
    <View style={[st.frame, { borderColor: p.rule }]}>
      <Text style={[st.small, { color: p.ink2 }]}>{item.source.name} · {item.source.date}</Text>
      <Title title={item.title} size={size} style={{ marginTop: 8, lineHeight: size * 0.92, letterSpacing: -size * 0.035 }} />
      <Text style={[st.by, { color: p.ink }]}>{item.creator}</Text>
      {ex ? (
        <Text style={[st.essayMk, { color: p.ink }]}>
          <Text style={{ backgroundColor: tint }}>{ex.highlight ?? ex.text}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const hair = StyleSheet.hairlineWidth;
const st = StyleSheet.create({
  cap: { flexDirection: 'row', gap: 10, marginTop: 10 },
  capN: { fontFamily: fonts.displayRegular, fontSize: 18, lineHeight: 21, includeFontPadding: false, fontVariant: ['lining-nums'] },
  capType: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 19 },
  capWhy: { fontFamily: fonts.textItalic, fontSize: 15, lineHeight: 21, marginTop: 1 },
  small: { fontFamily: fonts.sans, fontSize: 11.5, includeFontPadding: false },
  by: { fontFamily: fonts.textItalic, fontSize: 15.5, marginTop: 6 },

  frame: { borderWidth: hair, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  essayMk: { fontFamily: fonts.displayRegular, fontSize: 16.5, lineHeight: 23.5, marginTop: 10 },

  spread: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: hair },
  leaf: { flex: 1, paddingTop: 12, paddingBottom: 14, paddingRight: 12, gap: 8 },
  leafR: { paddingLeft: 12, paddingRight: 0, borderLeftWidth: hair },
  spYear: { fontFamily: fonts.displayRegular, fontSize: 36, lineHeight: 36, letterSpacing: -0.8, includeFontPadding: false, fontVariant: ['lining-nums'] },
  spQ: { fontFamily: fonts.displayRegular, fontSize: 14.5, lineHeight: 20 },

  strip: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: hair, borderBottomWidth: hair },
  who: { width: 64, fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1, lineHeight: 22 },
  said: { fontFamily: fonts.displayRegular, fontSize: 20, lineHeight: 26 },

  runcite: { alignSelf: 'stretch', paddingVertical: 7, borderBottomWidth: hair, marginHorizontal: -18, paddingHorizontal: 18 },
  abHead: { fontFamily: fonts.sansMedium, fontSize: 11, marginTop: 12, marginBottom: 4 },
  abText: { fontFamily: fonts.text, fontSize: 13.5, lineHeight: 19.5, alignSelf: 'stretch' },

  poem: { minHeight: 260, paddingHorizontal: 18, paddingTop: 30, paddingBottom: 14, justifyContent: 'space-between', gap: 24 },
  poemText: { fontFamily: fonts.textItalic, fontSize: 21, lineHeight: 29 },
  poemFoot: { fontFamily: fonts.display, fontSize: 13.5, paddingTop: 8, borderTopWidth: hair },

  card: { aspectRatio: 5 / 3, paddingHorizontal: 18, paddingTop: 14 },
  call: { flexDirection: 'row', justifyContent: 'space-between' },
  hw: { fontFamily: fonts.display, fontSize: 27, lineHeight: 30, marginTop: 10 },
  cardDate: { fontFamily: fonts.textItalic, fontSize: 13.5, marginTop: 4, paddingBottom: 8, borderBottomWidth: hair },
  punch: { position: 'absolute', bottom: 12, left: '50%', marginLeft: -7, width: 14, height: 14, borderRadius: 7 },

  page: { paddingHorizontal: 18, paddingVertical: 16 },
  pageHead: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1.4, textAlign: 'center', marginBottom: 10 },
  pageText: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22 },
  pageFoot: { fontFamily: fonts.textItalic, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
