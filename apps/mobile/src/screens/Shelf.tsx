// The shelf: the books the editor is reading and has read, with a little dated commentary of his own.
// Not reviews. Each group (Reading now, Read, Put down) stands its books as cloth spines on a shelf
// rule, the title along the spine; the drawing is an object, so its type is fixed in size and hidden
// from screen readers, and under it every book is a text row (title, author, the first words of its
// latest note) that follows the reader's text size. The loud thing is the spines.
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { spineColours, spineOf, type Shelf as ShelfData, type ShelfBook } from '@fdf/shared/shelf';
import type { Scheme } from '@fdf/shared/tokens';
import { fonts, GUTTER, usePalette, useScheme, useTextScale } from '@/theme';
import { useShelf } from '@/lib/data';
import { bookTitle, dayMonth, firstWords, packShelves, shelfGroups, spineAuthor, spineSize, type SpineSize } from '@/lib/shelf';
import { go } from '@/nav';
import { Body, Meta, Title } from '@/ui/type';
import { TopBar } from '@/ui/parts';
import { Screen } from '@/ui/screen';

const GAP = 3;
const PLANK = 2;

export const SHELF_DECK = 'Books I am reading, and what I made of them. Not reviews.';

export function Shelf() {
  const p = usePalette();
  const { data, status } = useShelf();
  return (
    <Screen header={<TopBar label="Menu" onBack={go.backToMenu} />}>
      <Title title={{ text: 'The shelf' }} size={44} style={{ marginTop: 18 }} />
      <Text style={[styles.deck, { color: p.ink2 }]}>{SHELF_DECK}</Text>
      {status === 'ready' && data ? (
        <Books shelf={data} />
      ) : status === 'loading' ? (
        <ActivityIndicator color={p.ink2} style={{ marginTop: 48 }} />
      ) : (
        <View style={{ marginTop: 34 }}>
          <Text style={[styles.emptyTitle, { color: p.ink }]}>{status === 'empty' ? 'The shelf is empty for now' : 'The shelf has not reached this phone'}</Text>
          <Body style={{ marginTop: 8, fontSize: 16.5, lineHeight: 24, color: p.ink2 }}>
            {status === 'empty' ? 'The first books go up soon.' : 'Connect to the internet once and it will stay here for offline reading.'}
          </Body>
        </View>
      )}
    </Screen>
  );
}

function Books({ shelf }: { shelf: ShelfData }) {
  const p = usePalette();
  return (
    <>
      {shelfGroups(shelf.books).map((g) => (
        <View key={g.status} style={{ marginTop: 40 }}>
          <View style={styles.groupHead}>
            <Text accessibilityRole="header" style={[styles.group, { color: p.ink2 }]}>{g.label}</Text>
            <Text style={[styles.count, { color: p.ink2 }]}>{g.books.length}</Text>
          </View>
          <Spines books={g.books} />
          <View>
            {g.books.map((b, i) => (
              <Row key={b.id} book={b} first={i === 0} />
            ))}
          </View>
        </View>
      ))}
      <Meta style={{ marginTop: 34 }}>The shelf, updated {dayMonth(shelf.updatedAt)}</Meta>
    </>
  );
}

/** The books of one group standing on as many shelves as the phone's width needs. */
function Spines({ books }: { books: ShelfBook[] }) {
  const p = usePalette();
  const scheme = useScheme();
  const { width } = useWindowDimensions();
  const sized = books.map((book) => ({ book, size: spineSize(book) }));
  const rows = packShelves(sized, (s) => s.size.width, width - GUTTER * 2, GAP);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginTop: 18 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ marginTop: i ? 22 : 0 }}>
          <View style={styles.row}>
            {row.map(({ book, size }) => (
              <Spine key={book.id} book={book} size={size} scheme={scheme} />
            ))}
          </View>
          <View style={{ height: PLANK, backgroundColor: p.ink }} />
        </View>
      ))}
    </View>
  );
}

/**
 * One spine: the cloth, a band at head and foot, and the title running down it (as English spines
 * read) with the author's surname at the foot. The text sits in a box the length of the spine, rotated
 * a quarter turn about its centre; the type does not follow the phone's text size, so it never clips.
 */
const Spine = memo(function Spine({ book, size, scheme }: { book: ShelfBook; size: SpineSize; scheme: Scheme }) {
  const p = usePalette();
  const { cloth, type } = spineColours(spineOf(book), scheme);
  const len = size.height - 26;
  return (
    <Pressable
      onPress={() => go.book(book.id)}
      style={({ pressed }) => [{ width: size.width, height: size.height, backgroundColor: cloth, borderColor: p.rule }, styles.spine, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.band, { top: 6, backgroundColor: type }]} />
      <View style={[styles.band, { bottom: 6, backgroundColor: type }]} />
      <View
        style={[
          styles.along,
          { width: len, height: size.width, left: (size.width - len) / 2, top: (size.height - size.width) / 2 },
        ]}
      >
        <Text allowFontScaling={false} numberOfLines={size.lines} style={[styles.spineTitle, { color: type }]}>
          {book.title.text}
          {book.title.italic ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + book.title.italic}</Text> : null}
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.spineAuthor, { color: type }]}>
          {spineAuthor(book.author).toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
});

/** A book as a line: its cloth at the edge, the title, the author, and the first words of the latest note. */
function Row({ book, first }: { book: ShelfBook; first: boolean }) {
  const p = usePalette();
  const scheme = useScheme();
  const k = useTextScale();
  const latest = book.notes[0];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${bookTitle(book)}, by ${book.author}.${latest ? ` ${dayMonth(latest.date)}: ${latest.text}` : ''}`}
      onPress={() => go.book(book.id)}
      style={({ pressed }) => [styles.line, { borderTopColor: p.rule, marginTop: first ? 16 : 0 }, !first && { borderTopWidth: StyleSheet.hairlineWidth }, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.cloth, { backgroundColor: spineColours(spineOf(book), scheme).cloth, borderColor: p.rule }]} />
      <View style={{ flex: 1 }}>
        <Title title={book.title} size={22} style={{ lineHeight: 26 }} />
        <Text style={[styles.author, { color: p.ink2 }]}>
          {book.author}
          {book.year ? `, ${book.year}` : ''}
        </Text>
        {latest ? (
          <Text numberOfLines={3} style={[styles.first, { color: p.ink, fontSize: 16 * k, lineHeight: 23 * k }]}>
            <Text style={[styles.firstDate, { color: p.ink2 }]}>{dayMonth(latest.date)}  </Text>
            {firstWords(latest.text)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deck: { fontFamily: fonts.textItalic, fontSize: 17, lineHeight: 25, marginTop: 10 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  group: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  count: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: GAP },
  spine: { borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, opacity: 0.45 },
  along: { position: 'absolute', transform: [{ rotate: '90deg' }], justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  spineTitle: { fontFamily: fonts.display, fontSize: 13.5, lineHeight: 15.5, includeFontPadding: false },
  spineAuthor: { fontFamily: fonts.sansMedium, fontSize: 7.5, lineHeight: 9.5, letterSpacing: 0.9, textAlign: 'right', includeFontPadding: false, opacity: 0.85 },
  line: { flexDirection: 'row', gap: 14, paddingVertical: 15 },
  cloth: { width: 9, alignSelf: 'stretch', borderWidth: StyleSheet.hairlineWidth },
  author: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 3 },
  first: { fontFamily: fonts.textItalic, marginTop: 6 },
  firstDate: { fontFamily: fonts.sansMedium, fontSize: 12.5 },
});
