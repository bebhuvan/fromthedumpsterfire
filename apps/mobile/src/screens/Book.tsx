// A book on the shelf: its jacket (the book form's, with the spine edge in the book's cloth), the
// title, author, year and publisher, where the editor is with it, then the notes as a dated journal
// (the date in quiet sans, the note in the editor's italic serif, the ember B. after the newest), the
// lines copied out of it with where they are, the Hauls it was in, and a link to the book.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haulSlug } from '@fdf/shared/haul';
import { spineColours, spineOf, type ShelfBook } from '@fdf/shared/shelf';
import { fonts, useEdition, usePalette, useScheme } from '@/theme';
import { useHaul } from '@/lib/data';
import { hostOf, titleText } from '@/lib/forms';
import { openSource } from '@/lib/open';
import { dayMonth, statusLine } from '@/lib/shelf';
import { go } from '@/nav';
import { Highlighted, Meta, Note, Title } from '@/ui/type';
import { Action, Apparatus, Arrow, Sign, TopBar, VoiceNote } from '@/ui/parts';
import { Credit } from '@/ui/Blocks';
import { Jacket } from '@/ui/Jacket';
import { Screen } from '@/ui/screen';

export function Book({ book, back, onBack }: { book: ShelfBook; back: string; onBack: () => void }) {
  const p = usePalette();
  const scheme = useScheme();
  const { cloth } = spineColours(spineOf(book), scheme);
  const host = book.url ? hostOf(book.url) : '';
  return (
    <Screen header={<TopBar label={back} onBack={onBack} />}>
      <View style={{ marginTop: 22 }}>
        <Jacket title={book.title} author={book.author} publisher={book.publisher} cover={book.cover} spine={cloth} />
        {book.cover ? <Credit plate={book.cover} noBy /> : null}
      </View>

      <View style={styles.status}>
        <View style={[styles.statusSq, { backgroundColor: cloth, borderColor: p.rule }]} />
        <Text style={[styles.statusText, { color: p.ink2 }]}>{statusLine(book)}</Text>
      </View>
      <Title title={book.title} size={40} style={{ marginTop: 12 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{book.author}</Text>
      {book.year || book.publisher ? (
        <Meta style={{ marginTop: 8 }}>{[book.publisher, book.year].filter(Boolean).join(', ')}</Meta>
      ) : null}

      {book.notes.length ? (
        <View style={{ marginTop: 34 }}>
          <Apparatus>Notes</Apparatus>
          <View style={{ height: 1, backgroundColor: p.ink, marginTop: 9 }} />
          {book.notes.map((n, i) => (
            <View key={`${n.date}-${i}`} style={[styles.entry, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.rule }]}>
              <View style={styles.entryHead}>
                <Meta>{[dayMonth(n.date), n.at].filter(Boolean).join(' · ')}</Meta>
                {n.audio ? <VoiceNote audio={n.audio} label="this note" compact /> : null}
              </View>
              <Note style={{ marginTop: 6 }}>{n.text}</Note>
              {i === 0 ? <Sign style={{ marginTop: 6 }} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {book.lines.length ? (
        <View style={{ marginTop: 34 }}>
          <Apparatus>Lines from the book</Apparatus>
          {book.lines.map((l, i) => (
            <View key={i} style={[styles.line, { borderTopColor: p.ink }]}>
              <Highlighted text={`“${l.text}”`} color="transparent" style={styles.lineText} />
              {l.locator ? <Meta style={{ marginTop: 8 }}>{l.locator}</Meta> : null}
            </View>
          ))}
        </View>
      ) : null}

      {book.hauls?.length ? (
        <View style={{ marginTop: 34 }}>
          {book.hauls.map((h) => (
            <InHaul key={`${h.number}-${h.itemId}`} n={h.number} itemId={h.itemId} />
          ))}
        </View>
      ) : null}

      {book.url ? <Action label={host ? `The book, at ${host}` : 'The book'} external onPress={() => openSource(book.url!, p)} style={{ marginTop: 34 }} /> : null}
    </Screen>
  );
}

/** "In Haul 002", in its edition ink, with the find's title; opens the find. */
function InHaul({ n, itemId }: { n: number; itemId: string }) {
  const p = usePalette();
  const haul = useHaul(n).data;
  const ink = useEdition(haul ?? { number: n });
  const item = haul?.items.find((i) => i.id === itemId);
  const detail = item ? titleText(item) : 'Open the find';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`In Haul ${haulSlug(n)}. ${detail}`}
      onPress={() => go.item(n, itemId)}
      style={({ pressed }) => [styles.haul, { borderTopColor: p.rule, borderBottomColor: p.rule }, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.haulBar, { backgroundColor: ink }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.haulLabel, { color: ink }]}>In Haul {haulSlug(n)}</Text>
        <Text style={[styles.haulTitle, { color: p.ink }]}>
          {item ? item.title.text : detail}
          {item?.title.italic ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + item.title.italic}</Text> : null}
        </Text>
      </View>
      <Arrow color={p.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  statusSq: { width: 9, height: 9, borderWidth: StyleSheet.hairlineWidth },
  statusText: { fontFamily: fonts.sansMedium, fontSize: 13.5, lineHeight: 18, includeFontPadding: false, flexShrink: 1 },
  byline: { fontFamily: fonts.textItalic, fontSize: 19, lineHeight: 25, marginTop: 10, includeFontPadding: false },
  entry: { paddingVertical: 16 },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 20 },
  line: { marginTop: 12, paddingTop: 16, borderTopWidth: 1 },
  lineText: { fontFamily: fonts.displayRegular, fontSize: 23, lineHeight: 31 },
  haul: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: -StyleSheet.hairlineWidth },
  haulBar: { width: 4, alignSelf: 'stretch' },
  haulLabel: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  haulTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, marginTop: 4, includeFontPadding: false },
});
