// A quotation from a source, set by its length as the website sets it (Quote.astro): a line or two
// large, a paragraph as a pull quote, more as an extract in the reading type behind a rule in the
// edition's ink. One opening mark in that ink stands above the words; there is no closing mark, so
// marks inside the quotation never collide. The words are the stored, matched words; only straight
// marks are set curly. The credit says whose words they are and where they were found.
import { memo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { curlQuotes, leadLines, quoteLead, quoteLength } from '@fdf/shared/haul';
import { fonts, GUTTER, usePalette, useTextScale } from '@/theme';
import { useEditionInk } from './edition';
import { Meta } from './type';

/** Paragraphs as the source broke them (any new line). */
const paras = (text: string) => text.split(/\s*\n\s*/).filter(Boolean);

/** The marked phrase inside one paragraph, in the given colour. */
function Marked({ text, highlight, color }: { text: string; highlight?: string; color?: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <>{curlQuotes(text)}</>;
  return (
    <>
      {curlQuotes(text.slice(0, at))}
      <Text style={{ backgroundColor: color }}>{curlQuotes(highlight)}</Text>
      {curlQuotes(text.slice(at + highlight.length))}
    </>
  );
}

export const Quotation = memo(function Quotation({
  text,
  highlight,
  credit = [],
  extract = false,
  mark: markColour,
}: {
  text: string;
  highlight?: string;
  credit?: string[];
  /** Set as an extract whatever its length. */
  extract?: boolean;
  /** The highlighter's colour (the item type's swatch). */
  mark?: string;
}) {
  const p = usePalette();
  const k = useTextScale();
  const ink = useEditionInk() ?? p.ink2;
  const len = extract ? 'long' : quoteLength(text);
  const lines = credit.filter(Boolean);
  const size = len === 'short' ? 28 : len === 'medium' ? 22 : 18;
  const textStyle =
    len === 'long'
      ? { fontFamily: fonts.text, fontSize: 18 * k, lineHeight: 29 * k }
      : { fontFamily: fonts.displayRegular, fontSize: size * k, lineHeight: size * (len === 'short' ? 1.18 : 1.36) * k, letterSpacing: len === 'short' ? -0.3 : 0 };
  return (
    <View>
      <Text accessible={false} style={[st.mark, { color: ink, fontSize: len === 'long' ? 52 : 64, lineHeight: len === 'long' ? 52 : 64, height: len === 'long' ? 26 : 32 }]}>
        “
      </Text>
      <View style={len === 'long' ? [st.extract, { borderLeftColor: ink }] : null}>
        {paras(text).map((para, i) => (
          <Text key={i} selectable style={[textStyle, { color: p.ink, marginTop: i ? 12 * k : 0 }]}>
            <Marked text={para} highlight={highlight} color={markColour} />
          </Text>
        ))}
      </View>
      {lines.length ? (
        <View style={st.cap}>
          <View style={[st.capRule, { backgroundColor: p.ink }]} />
          <Meta style={{ fontFamily: fonts.sans }}>{lines.join(', ')}</Meta>
        </View>
      ) : null}
    </View>
  );
});

/** A long quotation that opens on its first clauses set large; the rest follows in the reading type. */
export function LeadQuotation({ text, highlight, mark }: { text: string; highlight?: string; mark?: string }) {
  const p = usePalette();
  const k = useTextScale();
  const ink = useEditionInk() ?? p.ink2;
  const { width } = useWindowDimensions();
  const lead = quoteLead(text, highlight);
  if (!lead) return <Quotation text={text} highlight={highlight} mark={mark} extract={quoteLength(text) === 'long'} />;
  // Short parallel clauses go one to a line, the type sized so the longest fills the measure.
  const lines = leadLines(lead.lead);
  const size = lines ? Math.min(40, (width - 2 * GUTTER) / (lines.longest * 0.43)) : 34 * Math.min(k, 1.1);
  return (
    <View>
      <Text accessible={false} style={[st.mark, { color: ink, fontSize: 64, lineHeight: 64, height: 32 }]}>
        “
      </Text>
      <Text selectable accessibilityRole="header" maxFontSizeMultiplier={lines ? 1 : undefined} style={{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.06, letterSpacing: -size * 0.02, color: p.ink }}>
        {lines ? lines.lines.map((l, i) => curlQuotes(l) + (i < lines.lines.length - 1 ? '\n' : '')).join('') : curlQuotes(lead.lead)}
      </Text>
      {paras(lead.rest.trim()).map((para, i) => (
        <Text key={i} selectable style={{ marginTop: (i ? 12 : 16) * k, fontFamily: fonts.text, fontSize: 19 * k, lineHeight: 30 * k, color: p.ink }}>
          <Marked text={para} highlight={highlight !== lead.lead ? highlight : undefined} color={mark} />
        </Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  mark: { fontFamily: fonts.displayRegular, includeFontPadding: false, overflow: 'visible' },
  extract: { paddingLeft: 16, borderLeftWidth: 2 },
  cap: { marginTop: 12, gap: 8 },
  capRule: { width: 36, height: StyleSheet.hairlineWidth * 2 },
});
