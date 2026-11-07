// The field note as the editor set it out (FieldNote.body), as the website sets it: paragraphs with
// their links (opened like any source) and italic titles, section headings, quotations with a rule
// in the edition ink, and videos, podcasts and X posts between the paragraphs (ui/Blocks.tsx). The
// highlighted line is marked; straight marks are set curly for display. Without a body, the plain
// paragraphs as before.
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { curlQuotes, type FieldNote, type NoteBlock, type NoteRun } from '@fdf/shared/haul';
import { linkGroups, markRuns } from '@fdf/shared/fieldnote';
import { fonts, usePalette, useTextScale } from '@/theme';
import { openSource } from '@/lib/open';
import { useEditionInk } from './edition';
import { AudioBlock, Post, Video } from './Blocks';

export function NoteBody({ note, para, gap }: { note: FieldNote; para: TextStyle; gap: number }) {
  const p = usePalette();
  const k = useTextScale();
  const ink = useEditionInk() ?? p.ink2;
  const body: NoteBlock[] = note.body ?? note.paragraphs.map((t) => ({ kind: 'paragraph', runs: [{ text: t }] }));
  const size = { fontSize: (para.fontSize ?? 18) * k, lineHeight: (para.lineHeight ?? 27) * k };

  const words = (runs: NoteRun[]) =>
    linkGroups(markRuns(runs, note.highlight)).map((g, i) => {
      const inner = g.runs.map((r, j) => (
        <Text key={j} style={[r.em ? { fontFamily: fonts.textItalic } : null, r.mark ? { backgroundColor: p.swatch.butter } : null]}>
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
    <View style={{ gap }}>
      {body.map((b, i) => {
        if (b.kind === 'paragraph')
          return (
            <Text key={i} selectable style={[s.base, para, size, { color: p.ink }]}>
              {words(b.runs)}
            </Text>
          );
        if (b.kind === 'heading')
          return (
            <Text key={i} accessibilityRole="header" style={[s.base, s.heading, { color: p.ink, fontSize: 21 * k, lineHeight: 26 * k }]}>
              {curlQuotes(b.text)}
            </Text>
          );
        if (b.kind === 'quotation')
          return (
            <View key={i} style={[s.quote, { borderLeftColor: ink, gap: gap * 0.7 }]}>
              {b.paragraphs.map((runs, j) => (
                <Text key={j} selectable style={[s.base, para, size, { color: p.ink }]}>
                  {words(runs)}
                </Text>
              ))}
            </View>
          );
        return (
          <View key={i} style={{ marginVertical: 8 }}>
            {b.kind === 'video' ? <Video block={b} /> : b.kind === 'audio' ? <AudioBlock block={b} /> : <Post block={b} />}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  base: { includeFontPadding: false },
  heading: { fontFamily: fonts.display, marginTop: 14 },
  quote: { borderLeftWidth: 2, paddingLeft: 14 },
});
