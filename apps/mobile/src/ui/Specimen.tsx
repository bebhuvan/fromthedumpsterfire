// The cover's contents as specimens: each find shown as a small piece of its own printed form, so a
// reader knows what they are holding before reading a word. Each stands on the same left edge under its
// head (number, kind, name) on a hairline, with the editor's first line under it.
import { memo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { go } from '@/nav';
import { curlQuotes, haulSlug, leadLines, notePlain, quoteLead, quoteLength, quoteSample, type Item } from '@fdf/shared/haul';
import { useEditionInk } from './edition';
import { typeLabel } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, usePalette, useScheme } from '@/theme';
import { firstChart } from '@/lib/chart';
import { pictureUri } from '@/lib/pictures';
import { readKey, useReader } from '@/lib/store';
import { formOf, headword, speaker, titleText, type Form } from '@/lib/forms';
import { Highlighted, Title } from './type';
import { lifeYears } from '@fdf/shared/life';

const firstSentence = (s: string) => (/^.*?[.!?](\s|$)/.exec(s)?.[0] ?? s).trim();
const yearOf = (d: string) => /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(d)?.[1] ?? d;

/** Forms whose specimen does not show the title; the head names it. */
const TITLED_CAPTION = new Set<Form>(['transcript', 'facing', 'page', 'epigraph', 'letter', 'clipping', 'print', 'jacket']);

/** A preview's sample of a passage (quoteSample), with an ellipsis when it goes on. */
const sampleOf = (text: string) => {
  const s = quoteSample(text);
  return s.ellipsis ? `${s.text}…` : s.text;
};

export const Specimen = memo(function Specimen({ haul, item, n }: { haul: number; item: Item; n: number }) {
  const p = usePalette();
  const read = useReader((s) => s.read.includes(readKey(haul, item.id)));
  const form = formOf(item);
  const ink = useEditionInk() ?? p.ember;
  return (
    <View>
      <View style={[st.cap, { borderTopColor: p.rule }]}>
        <Text style={[st.capN, { color: ink }]}>{String(n).padStart(2, '0')}</Text>
        <Text style={[st.capType, { color: p.ink2, flex: 1 }]}>
          {typeLabel[item.type]}
          {TITLED_CAPTION.has(form) ? <Text style={{ color: p.ink }}>{`  ·  ${curlQuotes(titleText(item))}`}</Text> : null}
          {read ? '  ·  Read' : ''}
        </Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${n}, ${typeLabel[item.type]}: ${titleText(item)}, ${item.creator}${read ? ', read' : ''}`}
        onPress={() => go.item(haul, item.id)}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <Body item={item} form={form} haul={haul} n={n} />
      </Pressable>
      <Text style={[st.capWhy, { color: p.ink2 }]}>{curlQuotes(firstSentence(notePlain(item.why)))}</Text>
    </View>
  );
});

/** A small picture that leaves a quiet plate behind if it cannot load (offline, refused). */
function SmallPlate({ uri, ratio, label }: { uri: string; ratio: number; label: string }) {
  const p = usePalette();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[st.platePlaceholder, { aspectRatio: ratio, borderColor: p.rule }]}>
        <Text style={[st.placeholderText, { color: p.ink2 }]}>{label}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} resizeMode="cover" accessible={false} style={{ width: '100%', aspectRatio: ratio, backgroundColor: p.bg }} />;
}

/**
 * The figure's specimen: the chart's own picture under a "Fig." line, cropped to a strip, or, without
 * a picture (offline, or a bundle without them), the figure set in type in a ruled frame.
 */
function FigureSpecimen({ item, n }: { item: Item; n: number }) {
  const p = usePalette();
  const scheme = useScheme();
  const [failed, setFailed] = useState(false);
  const block = firstChart(item.blocks);
  const image = block?.images?.[scheme];
  return (
    <View style={[st.fig, { borderTopColor: p.ink, borderBottomColor: p.rule }]}>
      <Text style={[st.small, { color: p.ink2 }]}>{`Fig. ${n}`}</Text>
      {image && !failed ? (
        <View style={st.figCrop}>
          <Image source={{ uri: pictureUri(image.url) }} onError={() => setFailed(true)} resizeMode="cover" accessible={false} style={{ width: '100%', aspectRatio: image.width / image.height, backgroundColor: p.bg }} />
        </View>
      ) : (
        <View style={[st.figBlank, { borderColor: p.rule }]}>
          <Text style={[st.placeholderText, { color: p.ink2 }]}>{block?.chart.title ?? titleText(item)}</Text>
        </View>
      )}
      <Title title={item.title} size={22} style={{ marginTop: 10, lineHeight: 24 }} />
    </View>
  );
}

function Body({ item, form, haul, n }: { item: Item; form: Form; haul: number; n: number }): ReactNode {
  const p = usePalette();
  const ink = useEditionInk() ?? p.ink2;
  const { width } = useWindowDimensions();
  const tint = typeColor(p, item.type);
  const ex = item.excerpt;
  switch (form) {
    case 'figure':
      return <FigureSpecimen item={item} n={n} />;
    case 'life': {
      // A Life: the name set large, the years, the epithet in the machine's blue.
      const life = item.life!;
      return (
        <View style={{ borderTopWidth: 2, borderTopColor: p.ink, paddingTop: 10 }}>
          <Text maxFontSizeMultiplier={1} style={[st.lifeName, { color: p.ink }]}>{life.name}</Text>
          {lifeYears(life) ? <Text style={[st.lifeYears, { color: p.ink2 }]}>{lifeYears(life)}</Text> : null}
          <Text numberOfLines={3} style={[st.small, { color: p.machine, marginTop: 6, fontFamily: fonts.sansMedium }]}>{life.epithet.text}</Text>
        </View>
      );
    }
    case 'facing': {
      const r = item.rhyme!;
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
    case 'transcript':
      return (
        <View style={[st.strip, { borderColor: p.rule }]}>
          <Text style={[st.who, { color: p.ink }]}>{speaker(item.creator)}</Text>
          <View style={{ flex: 1 }}>
            {/* A line or two of the speaker's words, as the website's cover sets it (2026-11-10). */}
            {ex ? (
              <Text style={[st.said, { color: p.ink }]}>
                <Text style={{ color: ink }}>“</Text>
                {curlQuotes(sampleOf(ex.text))}
              </Text>
            ) : (
              <Title title={item.title} size={22} />
            )}
            <Text style={[st.small, { color: p.ink2, marginTop: 6 }]}>{item.source.name}{item.source.date ? `, ${item.source.date}` : ''}</Text>
          </View>
        </View>
      );
    case 'offprint':
      return (
        <View style={[st.frame, { borderColor: p.rule, paddingTop: 0, alignItems: 'center' }]}>
          <Text numberOfLines={1} style={[st.small, st.runcite, { color: p.ink2, borderBottomColor: p.rule }]}>{item.source.name} · {yearOf(item.source.date)}</Text>
          {/* Stretched, not shrink-wrapped, so Android never measures a centred line too narrow and clips it. */}
          <Title title={item.title} size={22} style={{ alignSelf: 'stretch', textAlign: 'center', marginTop: 14 }} />
          <Text style={[st.by, { alignSelf: 'stretch', color: p.ink, textAlign: 'center', fontSize: 14 }]}>{item.creator}</Text>
          {ex ? (
            <>
              <Text style={[st.abHead, { color: p.ink }]}>{ex.locator || 'From the paper'}</Text>
              <Highlighted text={ex.text} highlight={ex.highlight} color={tint} style={st.abText} />
            </>
          ) : null}
        </View>
      );
    case 'broadside': {
      // The first stanza (or eight lines), each line as the poet broke it.
      const lines = (ex!.text.split(/\n\s*\n/)[0] ?? '').split('\n').slice(0, 8);
      const more = ex!.text.trim().split('\n').filter((l) => l.trim()).length > lines.length;
      return (
        <View style={[st.poem, { backgroundColor: tint }]}>
          <View style={[st.poemHead, { borderBottomColor: p.rule }]}>
            <Title title={item.title} size={26} style={{ lineHeight: 28 }} />
            <Text style={[st.poemBy, { color: p.ink }]}>{item.creator.toUpperCase()}</Text>
          </View>
          <View>
            {lines.map((l, i) => (
              <Text key={i} style={[st.poemLine, { color: p.ink }]}>{l}</Text>
            ))}
          </View>
          {more ? <Text style={[st.poemMore, { color: p.ink }]}>The whole poem</Text> : null}
        </View>
      );
    }
    case 'card': {
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
    case 'page':
      return (
        <View style={[st.page, { backgroundColor: p.plate }]}>
          <Text style={[st.pageHead, { color: p.ink2 }]}>{item.source.name.toUpperCase()}</Text>
          {ex ? <Highlighted text={ex.text} highlight={ex.highlight} color={tint} style={st.pageText} /> : <Title title={item.title} size={22} />}
          {ex ? <Text style={[st.pageFoot, { color: p.ink2 }]}>{ex.locator}</Text> : null}
        </View>
      );
    case 'epigraph': {
      // A line or two set large; anything longer opens on its first clauses, the rest cut short.
      const lead = quoteLength(ex!.text) === 'short' ? null : quoteLead(ex!.text, ex!.highlight);
      const occasion = (ex!.locator || item.source.name).replace(`${item.creator}, `, '');
      return (
        <View style={st.epi}>
          {lead ? (
            <View>
              <Text accessible={false} style={[st.epiMark, { color: ink }]}>“</Text>
              {(() => {
                // Short parallel clauses go one to a line, sized so the longest fills the measure.
                const ll = leadLines(lead.lead);
                if (!ll) return <Text style={[st.epiQ, { color: p.ink }]}>{curlQuotes(lead.lead)}</Text>;
                const size = Math.min(30, (width - 2 * GUTTER) / (ll.longest * 0.43));
                return (
                  <Text maxFontSizeMultiplier={1} style={[st.epiQ, { color: p.ink, fontSize: size, lineHeight: size * 1.1, letterSpacing: -size * 0.02 }]}>
                    {ll.lines.map(curlQuotes).join('\n')}
                  </Text>
                );
              })()}
              <Text numberOfLines={4} style={[st.epiRest, { color: p.ink2 }]}>{curlQuotes(lead.rest.trim())}</Text>
            </View>
          ) : (
            <Text style={[st.epiQ, { color: p.ink }]}>
              <Text style={{ color: ink, fontFamily: fonts.displayRegular }}>“</Text>
              {curlQuotes(ex!.text)}
              <Text style={{ color: ink, fontFamily: fonts.displayRegular }}>”</Text>
            </Text>
          )}
          <View style={[st.epiWhoBox, { borderTopColor: p.ink }]}>
            <Text style={[st.epiWho, { color: p.ink }]}>{item.creator.toUpperCase()}</Text>
            {occasion ? <Text style={[st.epiWhere, { color: p.ink2 }]}>{occasion}</Text> : null}
          </View>
        </View>
      );
    }
    case 'letter':
      return (
        <View style={[st.letter, { backgroundColor: tint }]}>
          <Text style={[st.ltDate, { color: p.ink }]}>{item.place ? `${item.place}, ` : ''}{item.source.date}</Text>
          <Text numberOfLines={6} style={[st.ltText, { color: p.ink }]}>{ex!.text}</Text>
          <Text style={[st.ltSign, { color: p.ink }]}>{item.creator}</Text>
        </View>
      );
    case 'clipping':
      return (
        <View style={[st.clip, { backgroundColor: tint }]}>
          <View style={[st.clipHead, { borderBottomColor: p.ink }]}>
            <Text numberOfLines={1} style={[st.clipWho, { color: p.ink }]}>{item.creator}{item.handle ? <Text style={{ color: p.ink2, fontFamily: fonts.sans }}>{` ${item.handle}`}</Text> : null}</Text>
            <Text style={[st.clipWhere, { color: p.ink2 }]}>{item.source.name}</Text>
          </View>
          <Text numberOfLines={5} style={[st.clipText, { color: p.ink }]}>{ex!.text}</Text>
        </View>
      );
    case 'print': {
      const pl = item.plate!;
      return (
        <View style={[st.mount, { backgroundColor: p.plate }]}>
          <SmallPlate uri={pl.url} ratio={pl.width / pl.height} label={pl.caption} />
        </View>
      );
    }
    case 'jacket':
      return (
        <View style={[st.jacket, { backgroundColor: tint, borderColor: p.rule }]}>
          <View style={[st.spine, { backgroundColor: p.ink }]} />
          <Title title={item.title} size={23} style={{ lineHeight: 24 }} />
          <Text style={[st.jkAuthor, { color: p.ink, borderTopColor: p.rule }]}>{item.creator}</Text>
        </View>
      );
    case 'label':
      return (
        <View style={[st.label, { borderColor: p.ink, borderTopColor: tint }]}>
          <Text style={[st.lbTitle, { color: p.ink, borderBottomColor: p.ink }]}>{curlQuotes(titleText(item))}</Text>
          {item.creator ? (
            <View style={[st.lbRow, { borderBottomColor: p.rule }]}>
              <Text style={[st.lbKey, { color: p.ink2 }]}>MADE BY</Text>
              <Text style={[st.lbVal, { color: p.ink }]}>{item.creator}</Text>
            </View>
          ) : null}
          <View style={[st.lbRow, { borderBottomColor: p.rule }]}>
            <Text style={[st.lbKey, { color: p.ink2 }]}>WHAT IT IS</Text>
            <Text style={[st.lbVal, { color: p.ink }]}>{item.source.name}</Text>
          </View>
          {ex ? <Text style={[st.lbQ, { color: p.ink }]}>{curlQuotes(sampleOf(ex.text))}</Text> : null}
        </View>
      );
  }
  // Essay, post, and anything without its form's material: a cropped magazine opening.
  const len = item.title.text.length + (item.title.italic?.length ?? 0);
  const size = len <= 16 ? 46 : len <= 30 ? 36 : 30;
  return (
    <View style={[st.frame, { borderColor: p.rule }]}>
      <Text style={[st.small, { color: p.ink2 }]}>{[item.source.name, item.source.date].filter(Boolean).join(' · ')}</Text>
      <Title title={item.title} size={size} style={{ marginTop: 8, lineHeight: size * 0.98, letterSpacing: -size * 0.035 }} />
      <Text style={[st.by, { color: p.ink }]}>{item.creator}</Text>
      {ex ? (
        <View style={[st.essayEx, { borderLeftColor: ink }]}>
          <Text numberOfLines={ex.highlight ? undefined : 4} style={[st.essayExText, { color: p.ink2 }]}>{curlQuotes(ex.highlight ?? ex.text)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const hair = StyleSheet.hairlineWidth;
const st = StyleSheet.create({
  lifeName: { fontFamily: fonts.display, fontSize: 44, lineHeight: 44, letterSpacing: -1.4 },
  lifeYears: { fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 26 },
  cap: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingTop: 10, marginBottom: 14, borderTopWidth: hair },
  capN: { fontFamily: fonts.displayRegular, fontSize: 20, lineHeight: 22, includeFontPadding: false, fontVariant: ['lining-nums'] },
  capType: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 19 },
  capWhy: { fontFamily: fonts.textItalic, fontSize: 16, lineHeight: 24, marginTop: 14 },
  small: { fontFamily: fonts.sans, fontSize: 11.5, includeFontPadding: false },
  by: { fontFamily: fonts.textItalic, fontSize: 15.5, marginTop: 6 },

  frame: { borderWidth: hair, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  essayEx: { marginTop: 12, paddingLeft: 12, borderLeftWidth: 2 },
  essayExText: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 24 },

  spread: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: hair },
  leaf: { flex: 1, paddingTop: 12, paddingBottom: 14, paddingRight: 12, gap: 8 },
  leafR: { paddingLeft: 12, paddingRight: 0, borderLeftWidth: hair },
  spYear: { fontFamily: fonts.displayRegular, fontSize: 36, lineHeight: 36, letterSpacing: -0.8, includeFontPadding: false, fontVariant: ['lining-nums'] },
  spQ: { fontFamily: fonts.displayRegular, fontSize: 14.5, lineHeight: 20 },

  strip: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderTopWidth: hair, borderBottomWidth: hair },
  who: { width: 64, fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1, lineHeight: 22 },
  said: { fontFamily: fonts.displayRegular, fontSize: 19, lineHeight: 25 },

  runcite: { alignSelf: 'stretch', paddingVertical: 7, borderBottomWidth: hair, marginHorizontal: -18, paddingHorizontal: 18 },
  abHead: { fontFamily: fonts.sansMedium, fontSize: 11, marginTop: 12, marginBottom: 4 },
  abText: { fontFamily: fonts.text, fontSize: 13.5, lineHeight: 19.5, alignSelf: 'stretch' },

  poem: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, gap: 16 },
  poemHead: { paddingBottom: 12, borderBottomWidth: hair, gap: 6 },
  poemBy: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.3 },
  poemLine: { fontFamily: fonts.textItalic, fontSize: 18, lineHeight: 27 },
  poemMore: { fontFamily: fonts.sansMedium, fontSize: 13, textDecorationLine: 'underline' },

  card: { aspectRatio: 5 / 3, paddingHorizontal: 18, paddingTop: 14 },
  call: { flexDirection: 'row', justifyContent: 'space-between' },
  hw: { fontFamily: fonts.display, fontSize: 27, lineHeight: 30, marginTop: 10 },
  cardDate: { fontFamily: fonts.textItalic, fontSize: 13.5, marginTop: 4, paddingBottom: 8, borderBottomWidth: hair },
  punch: { position: 'absolute', bottom: 12, left: '50%', marginLeft: -7, width: 14, height: 14, borderRadius: 7 },

  page: { paddingHorizontal: 18, paddingVertical: 16 },
  pageHead: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1.4, textAlign: 'center', marginBottom: 10 },
  pageText: { fontFamily: fonts.text, fontSize: 15, lineHeight: 22 },
  pageFoot: { fontFamily: fonts.textItalic, fontSize: 12, textAlign: 'center', marginTop: 10 },

  epi: { paddingTop: 4, paddingBottom: 6, gap: 12 },
  epiQ: { fontFamily: fonts.display, fontSize: 30, lineHeight: 33, letterSpacing: -0.6 },
  epiMark: { fontFamily: fonts.displayRegular, fontSize: 60, lineHeight: 60, height: 30, includeFontPadding: false },
  epiRest: { fontFamily: fonts.text, fontSize: 16, lineHeight: 24, marginTop: 12 },
  epiWhoBox: { paddingTop: 8, borderTopWidth: 1, alignSelf: 'flex-start', minWidth: '60%', gap: 2 },
  epiWho: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.3 },
  epiWhere: { fontFamily: fonts.textItalic, fontSize: 14, lineHeight: 19 },

  letter: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 18, gap: 12 },
  ltDate: { alignSelf: 'flex-end', fontFamily: fonts.textItalic, fontSize: 13, lineHeight: 18, textAlign: 'right' },
  ltText: { fontFamily: fonts.text, fontSize: 15, lineHeight: 23 },
  ltSign: { alignSelf: 'flex-end', fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 24 },

  clip: { paddingHorizontal: 18, paddingBottom: 18, gap: 12 },
  clipHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1 },
  clipWho: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 12, includeFontPadding: false },
  clipWhere: { fontFamily: fonts.sans, fontSize: 12, includeFontPadding: false },
  clipText: { fontFamily: fonts.displayRegular, fontSize: 20, lineHeight: 26 },

  mount: { padding: 18 },
  platePlaceholder: { width: '100%', borderWidth: hair, justifyContent: 'center', alignItems: 'center', padding: 16 },
  placeholderText: { fontFamily: fonts.textItalic, fontSize: 15, lineHeight: 21, textAlign: 'center' },

  jacket: { width: 176, aspectRatio: 2 / 3, paddingLeft: 22, paddingRight: 14, paddingTop: 18, paddingBottom: 12, borderWidth: hair, justifyContent: 'space-between' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, opacity: 0.09 },
  jkAuthor: { fontFamily: fonts.textItalic, fontSize: 13, lineHeight: 17, paddingTop: 8, borderTopWidth: hair },

  label: { borderWidth: 1, borderTopWidth: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  lbTitle: { fontFamily: fonts.display, fontSize: 34, lineHeight: 34, letterSpacing: -0.8, paddingBottom: 12, borderBottomWidth: 1, includeFontPadding: false },
  lbRow: { flexDirection: 'row', gap: 10, paddingVertical: 7, borderBottomWidth: hair, alignItems: 'baseline' },
  lbKey: { width: 84, fontFamily: fonts.sansMedium, fontSize: 10.5, letterSpacing: 0.8 },
  lbVal: { flex: 1, fontFamily: fonts.text, fontSize: 14 },
  lbQ: { paddingTop: 8, fontFamily: fonts.displayRegular, fontSize: 15, lineHeight: 21 },

  fig: { borderTopWidth: 1, borderBottomWidth: hair, paddingTop: 8, paddingBottom: 14 },
  figCrop: { marginTop: 8, maxHeight: 190, overflow: 'hidden' },
  figBlank: { marginTop: 8, aspectRatio: 16 / 9, borderWidth: hair, justifyContent: 'center', alignItems: 'center', padding: 16 },
});
