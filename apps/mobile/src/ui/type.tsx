import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { curlQuotes, noteBlocks, type Item, type NoteRun, type Title as TitleData } from '@fdf/shared/haul';
import { linkGroups } from '@fdf/shared/fieldnote';
import { fonts, usePalette, useTextScale } from '@/theme';
import { openSource } from '@/lib/open';
import { useEditionInk } from './edition';

/** A quotation inside the editor's words is set this much smaller than them (web: 0.9375em). */
export const QUOTE_STEP = 0.9375;

type Props = { children: ReactNode; style?: StyleProp<TextStyle>; selectable?: boolean };

/** Applies the reader's text-size preference to a style's font size and line height. */
function useScaled(base: TextStyle, style?: StyleProp<TextStyle>): TextStyle {
  const k = useTextScale();
  const flat = StyleSheet.flatten([base, style]);
  if (k === 1) return flat;
  return { ...flat, fontSize: flat.fontSize && flat.fontSize * k, lineHeight: flat.lineHeight && flat.lineHeight * k };
}

/** Display heading; the italic tail is set in the display italic cut. */
export const Title = memo(function Title({ title, size, style, maxScale }: { title: TitleData; size: number; style?: StyleProp<TextStyle>; maxScale?: number }) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={maxScale}
      style={[s.base, { fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.06, letterSpacing: -size * 0.018, color: p.ink }, style]}
    >
      {curlQuotes(title.text)}
      {title.italic ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + curlQuotes(title.italic)}</Text> : null}
    </Text>
  );
});

export function Body({ children, style, selectable }: Props) {
  const p = usePalette();
  return <Text selectable={selectable} style={useScaled({ ...s.base, ...s.body, color: p.ink }, style)}>{children}</Text>;
}

/** The editor's own words. */
export function Note({ children, style }: Props) {
  const p = usePalette();
  return <Text selectable style={useScaled({ ...s.base, ...s.note, color: p.ink }, style)}>{children}</Text>;
}

/**
 * The editor's note as they wrote it: their paragraphs, their links on their own words (opened like
 * any source), italic titles, quotations from the source indented under a hanging mark in the edition ink, signed "B." in
 * ember at the end (under a closing quotation). A line or two is set larger (`lead`); a long note (an
 * essay of their own) is set upright, as prose is read. Straight marks are set curly for display.
 */
export function EditorNote({ why, lead = false, sign = true, style }: { why: Item['why']; lead?: boolean; sign?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const k = useTextScale();
  const ink = useEditionInk() ?? p.ink2;
  const words = why.text.split(/\s+/).length;
  const long = words > 120;
  // 18 at reading size (2026-11-09): 19 left about 35 characters to a line on a phone.
  const size = lead && words <= 45 ? 21 : 18;
  const gap = size * 0.9 * k;
  const text = { fontFamily: long ? fonts.text : fonts.textItalic, fontSize: size * k, lineHeight: size * (long ? 1.62 : 1.55) * k, color: p.ink };
  // A quotation is upright and a step smaller than the editor's words, as the website sets it, so a
  // quotation inside a long upright note never reads as more of the note.
  const quoted = { fontFamily: fonts.text, fontSize: text.fontSize * QUOTE_STEP, lineHeight: size * QUOTE_STEP * 1.6 * k };
  const blocks = noteBlocks(why);
  const last = blocks.length - 1;
  const signMark = (
    <Text accessibilityLabel="Bhuvanesh, the editor" style={{ fontFamily: fonts.displayItalic, color: p.ember }}>
      {' B.'}
    </Text>
  );
  // An italic title turns upright inside italic words; in upright words (a quotation, a long note) it is italic.
  const runs = (rs: NoteRun[], upright: boolean) =>
    linkGroups(rs).map((g, i) => {
      const inner = g.runs.map((r, j) => (
        <Text key={j} style={r.em ? { fontFamily: upright ? fonts.textItalic : fonts.text } : null}>
          {curlQuotes(r.text)}
        </Text>
      ));
      return g.url ? (
        <Text key={i} accessibilityRole="link" onPress={() => openSource(g.url!, p)} style={{ textDecorationLine: 'underline', textDecorationColor: ink }}>
          {inner}
        </Text>
      ) : (
        <Text key={i}>{inner}</Text>
      );
    });
  return (
    <View style={[{ gap }, style]}>
      {blocks.map((b, i) =>
        b.kind === 'quotation' ? (
          <View key={i} style={[s.bookQuote, { gap: gap * 0.7 }]}>
            <Text accessible={false} importantForAccessibility="no" style={[s.bookMark, { color: ink }]}>
              “
            </Text>
            {b.paragraphs.map((rs, j) => (
              <Text key={j} selectable style={[s.base, text, quoted]}>
                {runs(rs, true)}
              </Text>
            ))}
          </View>
        ) : (
          <Text key={i} selectable style={[s.base, text]}>
            {runs(b.runs, long)}
            {sign && i === last ? signMark : null}
          </Text>
        ),
      )}
      {sign && blocks[last]?.kind === 'quotation' ? <Text style={[s.base, text, { marginTop: -gap * 0.5 }]}>{signMark}</Text> : null}
    </View>
  );
}

export function Label({ children, style, muted }: Props & { muted?: boolean }) {
  const p = usePalette();
  return <Text style={[s.base, s.label, { color: muted ? p.ink2 : p.ink }, style]}>{children}</Text>;
}

/** Anything written by the machine is set in the blue sans, and nothing else is. */
export function Machine({ children, style }: Props) {
  const p = usePalette();
  return <Text selectable style={useScaled({ ...s.base, ...s.machine, color: p.machine }, style)}>{children}</Text>;
}

export function Meta({ children, style }: Props) {
  const p = usePalette();
  return <Text style={[s.base, s.meta, { color: p.ink2 }, style]}>{children}</Text>;
}

/** Marks `highlight` inside `text` with a swipe of the given colour. */
export function Highlighted({ text, highlight, color, style, numberOfLines }: { text: string; highlight?: string; color: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const p = usePalette();
  const scaled = useScaled({ ...s.base, color: p.ink }, style);
  const at = highlight ? text.indexOf(highlight) : -1;
  // Straight quotation marks are set curly for display; the stored words are untouched.
  if (!highlight || at < 0) return <Text selectable numberOfLines={numberOfLines} style={scaled}>{curlQuotes(text)}</Text>;
  return (
    <Text selectable numberOfLines={numberOfLines} style={scaled}>
      {curlQuotes(text.slice(0, at))}
      <Text style={{ backgroundColor: color }}>{curlQuotes(highlight)}</Text>
      {curlQuotes(text.slice(at + highlight.length))}
    </Text>
  );
}

export const s = StyleSheet.create({
  base: { includeFontPadding: false },
  body: { fontFamily: fonts.text, fontSize: 18, lineHeight: 28.5 },
  note: { fontFamily: fonts.textItalic, fontSize: 20, lineHeight: 30 },
  label: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  machine: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 22.5 },
  meta: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 18 },
  // A quotation inside the editor's words, as a book sets one (2026-11-09, as the website does):
  // indented both sides, no rule, one opening mark in the Haul's ink hanging in the indent.
  bookQuote: { paddingLeft: 26, paddingRight: 10, marginVertical: 4 },
  bookMark: { position: 'absolute', left: -1, top: -10, fontFamily: fonts.displayRegular, fontSize: 46, lineHeight: 52, includeFontPadding: false },
});
