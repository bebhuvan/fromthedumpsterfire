// The Atlas's pieces, drawn with views as the website draws them in CSS ("Data stories: the Atlas" in
// apps/web/src/styles/global.css): crop marks at a proof's corners, the small caps, the plate number,
// the machine's words in machineText, a plate's picture, and a story's card in a Haul and on an item.
import { memo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { editionInk } from '@fdf/shared/tokens';
import type { DataIndexEntry, StoryPicture } from '@fdf/shared/stories/published';
import { fonts, usePalette, useScheme, useTextScale } from '@/theme';
import { go } from '@/nav';
import { useDataIndex, useStory } from '@/lib/data';
import { atlasNo, storiesForHaul, storiesForItem, thumbOf } from '@/lib/atlas';
import { pictureUri } from '@/lib/pictures';

/** Corner marks just outside a proof, each two short hairlines that stop short of the corner. */
export function CropMarks({ color, at = 16, size = 10 }: { color: string; at?: number; size?: number }) {
  const w = 0.75;
  const box = { position: 'absolute' as const, width: size, height: size, borderColor: color };
  return (
    <>
      <View pointerEvents="none" style={[box, { left: -at, top: -at, borderRightWidth: w, borderBottomWidth: w }]} />
      <View pointerEvents="none" style={[box, { right: -at, top: -at, borderLeftWidth: w, borderBottomWidth: w }]} />
      <View pointerEvents="none" style={[box, { left: -at, bottom: -at, borderRightWidth: w, borderTopWidth: w }]} />
      <View pointerEvents="none" style={[box, { right: -at, bottom: -at, borderLeftWidth: w, borderTopWidth: w }]} />
    </>
  );
}

/** The Atlas's small caps (the website's .st-caps). */
export function Caps({ children, color, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Text style={[st.caps, { color: color ?? p.ink2 }, style]}>{children}</Text>;
}

/** "ATLAS No. 1", "PLATE IV": the word in caps, the number in the display serif in the story's ink. */
export function SeriesNo({ word, n, ink }: { word: string; n: string; ink: string }) {
  const p = usePalette();
  return (
    <Text>
      <Text style={[st.caps, { color: p.ink2 }]}>{word.toUpperCase()}  </Text>
      <Text style={[st.pn, { color: ink }]}>{n}</Text>
    </Text>
  );
}

/** The machine's words in a story: its text ink (a shade of the blue), in the sans, at the reader's size. */
export function MachineText({ children, size, line, medium, header, style }: { children: ReactNode; size: number; line: number; medium?: boolean; header?: boolean; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  const k = useTextScale();
  return (
    <Text selectable accessibilityRole={header ? 'header' : undefined} style={[{ fontFamily: medium ? fonts.sansMedium : fonts.sans, fontSize: size * k, lineHeight: line * k, color: p.machineText, includeFontPadding: false }, style]}>
      {children}
    </Text>
  );
}

/** A dotted rule, as a dotted box clipped to its top edge (a dotted single edge is unreliable on Android). */
export function Dots({ color, style }: { color: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height: 1, overflow: 'hidden' }, style]} accessible={false}>
      <View style={{ height: 4, borderWidth: 1, borderStyle: 'dotted', borderColor: color }} />
    </View>
  );
}

/** A plate's published picture, the copy on the phone when there is one. `onFail` when it cannot load. */
export function PlatePicture({ pic, label, onFail, style }: { pic: StoryPicture; label: string; onFail?: () => void; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <Image
      source={{ uri: pictureUri(pic.url) }}
      onError={onFail}
      accessible={Boolean(label)}
      accessibilityRole="image"
      accessibilityLabel={label || undefined}
      resizeMode="contain"
      style={[{ width: '100%', aspectRatio: pic.width / pic.height, backgroundColor: p.bg }, style as object]}
    />
  );
}

/**
 * A story's card where the Haul carries it: after the contents ("card") and on the item it answers
 * ("link"). The series number, the editor's title, the key figure and the count of plates, and the
 * first plate small when the story is already on the phone (a card never downloads a whole story).
 */
export const StoryCard = memo(function StoryCard({ entry, as }: { entry: DataIndexEntry; as: 'card' | 'link' }) {
  const p = usePalette();
  const scheme = useScheme();
  const ink = editionInk[scheme][entry.edition];
  const { data } = useStory(entry.slug, { fetch: false });
  const thumb = thumbOf(data, scheme);
  const [failed, setFailed] = useState(false);
  const kind = as === 'link' ? 'The data story' : 'Data story';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${kind}, ${atlasNo(entry.number)}: ${entry.title}. ${entry.plates} plates`}
      onPress={() => go.story(entry.slug)}
      style={({ pressed }) => [st.card, { borderColor: p.ink2, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1, gap: 8 }}>
        <Caps color={ink}>{`${kind} · ${atlasNo(entry.number)}`}</Caps>
        <Text style={[st.cardTitle, { color: p.ink, fontSize: as === 'link' ? 23 : 27, lineHeight: as === 'link' ? 26 : 30 }]}>{entry.title}</Text>
        {entry.figure ? (
          <Text>
            <Text style={[st.cardValue, { color: ink }]}>{entry.figure.value}</Text>
            <Text style={[st.cardFigure, { color: p.machineText }]}>{'  '}{entry.figure.text}</Text>
          </Text>
        ) : null}
        <Text style={[st.cardMeta, { color: p.ink2 }]}>{`${entry.plates} plates${as === 'link' ? ', from the numbers behind this piece' : ''}`}</Text>
      </View>
      {thumb && !failed ? (
        <View style={[st.thumb, { borderColor: p.ink2 }]}>
          <PlatePicture pic={thumb} label="" onFail={() => setFailed(true)} />
        </View>
      ) : null}
    </Pressable>
  );
});

/** "In the Atlas": the Haul's data stories, after its contents (nothing when it has none). */
export function InTheAtlas({ haul, style }: { haul: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const stories = storiesForHaul(useDataIndex().data, haul);
  if (!stories.length) return null;
  return (
    <View style={style}>
      <View style={[st.head, { borderTopColor: p.ink }]}>
        <Text accessibilityRole="header" style={[st.headT, { color: p.ink2 }]}>In the Atlas</Text>
        <Text style={[st.headSub, { color: p.ink2 }]}>{stories.length === 1 ? 'A data story from this Haul' : `${stories.length} data stories from this Haul`}</Text>
      </View>
      <View style={{ gap: 18, marginTop: 18 }}>
        {stories.map((e) => (
          <StoryCard key={e.slug} entry={e} as="card" />
        ))}
      </View>
    </View>
  );
}

/** "The data story" on the item a story answers (nothing on other items). */
export function TheDataStory({ haul, item, style }: { haul: number; item: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const stories = storiesForItem(useDataIndex().data, haul, item);
  if (!stories.length) return null;
  return (
    <View style={[{ gap: 12 }, style]}>
      <Text accessibilityRole="header" style={[st.headT, { color: p.ink2 }]}>The data story</Text>
      {stories.map((e) => (
        <StoryCard key={e.slug} entry={e} as="link" />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  head: { borderTopWidth: 1, paddingTop: 10, gap: 4 },
  headT: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  headSub: { fontFamily: fonts.textItalic, fontSize: 15.5, lineHeight: 21 },
  caps: { fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 15, letterSpacing: 1.7, textTransform: 'uppercase', includeFontPadding: false },
  pn: { fontFamily: fonts.displayRegular, fontSize: 17, letterSpacing: 0.8, includeFontPadding: false },
  card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 14 },
  cardTitle: { fontFamily: fonts.display, letterSpacing: -0.3, includeFontPadding: false },
  cardValue: { fontFamily: fonts.displayRegular, fontSize: 26, fontVariant: ['lining-nums'] },
  cardFigure: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  cardMeta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  thumb: { width: 92, borderWidth: StyleSheet.hairlineWidth, padding: 4 },
});
