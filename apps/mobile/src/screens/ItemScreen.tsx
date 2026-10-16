// One find, set in the printed form its type has always had: an essay opens like a magazine, a paper
// is an offprint, a talk is a transcript, a poem is a broadside, rhymes are facing pages, a rabbit hole
// is a catalogue card and a passage is a page from the book.
import { memo, useState, type ReactNode } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { go } from '@/nav';
import { haulSlug, type Haul, type Item } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, typeColor, usePalette } from '@/theme';
import { joinMeta, minutes } from '@/lib/format';
import { openSource } from '@/lib/open';
import { shareUrl } from '@/lib/data';
import { reader, useReader } from '@/lib/store';
import { Highlighted, Machine, Meta, Note, Title } from '@/ui/type';
import { Action, Apparatus, Folio, Key, RunHead, Sign, TopBar, VoiceNote } from '@/ui/parts';
import { Screen } from '@/ui/screen';

type Form = 'essay' | 'paper' | 'transcript' | 'poem' | 'rhymes' | 'card' | 'page';

const FORM: Record<ContentType, Form> = {
  essay: 'essay',
  post: 'essay',
  paper: 'paper',
  talk: 'transcript',
  video: 'transcript',
  podcast: 'transcript',
  poem: 'poem',
  rhymes: 'rhymes',
  'rabbit-hole': 'card',
  passage: 'page',
};

/** Index form of a headword: "The Great Stink" becomes "Great Stink, The". */
const headword = (t: string) => {
  const m = /^(The|A|An) (.+)$/.exec(t);
  return m ? { word: m[2]![0]!.toUpperCase() + m[2]!.slice(1) + ',', article: m[1]! } : { word: t, article: '' };
};

/** Index form of a two-word name: "Joseph Bazalgette" becomes "Bazalgette, Joseph". */
const inverted = (n: string) => {
  const w = n.split(' ');
  return w.length === 2 && /^[A-Z]/.test(w[1]!) ? `${w[1]}, ${w[0]}` : n;
};

const titleText = (i: Item) => i.title.text + (i.title.italic ? ' ' + i.title.italic : '');

export function ItemScreen({ haul, item }: { haul: Haul; item: Item }) {
  const at = haul.items.indexOf(item);
  const next = haul.items[at + 1];
  const form = FORM[item.type];
  const header = (
    <View>
      <TopBar label={`Haul ${haul.number}`} right={`${at + 1} of ${haul.items.length}`} />
      <RunHead left={`Haul ${haulSlug(haul.number)} · ${haul.title.text}${haul.title.italic ? ' ' + haul.title.italic : ''}`} right={typeLabel[item.type]} />
    </View>
  );

  const body: Record<Form, ReactNode> = {
    essay: <Essay item={item} haul={haul} />,
    paper: <Paper item={item} haul={haul} />,
    transcript: <Transcript item={item} haul={haul} />,
    poem: <Poem item={item} />,
    rhymes: <Rhymes item={item} />,
    card: <Card item={item} haul={haul} n={at + 1} />,
    page: <Page item={item} haul={haul} />,
  };

  return (
    <Screen header={header}>
      {body[form]}
      {form === 'paper' ? null : <SeeAlso haul={haul} item={item} />}
      <Source item={item} />
      <Actions haul={haul} item={item} />
      {next ? <NextItem n={haul.number} at={at + 2} item={next} /> : <Finished haul={haul} />}
      <Folio haul={`Haul ${haulSlug(haul.number)}`} n={at + 1} />
    </Screen>
  );
}

// ---------- shared pieces ----------

function MetaLine({ item, extra }: { item: Item; extra?: string }) {
  return (
    <View style={styles.metaLine}>
      <Key type={item.type} />
      <Meta>{joinMeta(extra ?? `${item.source.name}, ${item.source.date}`, minutes(item.minutes))}</Meta>
    </View>
  );
}

/** The editor's note, with the voice if there is one, signed in ember. */
function Why({ item, heading = "Why it's here", style }: { item: Item; heading?: string | null; style?: object }) {
  return (
    <View style={[{ marginTop: 26 }, style]}>
      {heading || item.why.audio ? (
        <View style={styles.whyHead}>
          {heading ? <Apparatus>{heading}</Apparatus> : <View />}
          {item.why.audio ? <VoiceNote audio={item.why.audio} label="this note" compact /> : null}
        </View>
      ) : null}
      <Note style={{ marginTop: heading ? 8 : 0 }}>{item.why.text}</Note>
      <Sign style={{ marginTop: 6 }} />
    </View>
  );
}

/** Machine notes: blue sans with their source, no box. */
function Notes({ item, style }: { item: Item; style?: object }) {
  const p = usePalette();
  if (!item.marginalia.length) return null;
  return (
    <View style={[{ marginTop: 26 }, style]}>
      {item.marginalia.map((m, i) => (
        <View key={i} style={[styles.note, { borderTopColor: p.rule }, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
          <Machine>{m.text}</Machine>
          <Meta style={{ marginTop: 4, fontSize: 11.5 }}>{m.cite}</Meta>
        </View>
      ))}
    </View>
  );
}

function ShareQuote({ haul, item }: { haul: Haul; item: Item }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Share.share({ message: `“${item.excerpt!.text}”\n${item.creator}, ${item.source.name}\n\nvia From the Dumpster Fire ${shareUrl(haul.number, item.id)}` })}
      style={styles.textBtn}
    >
      <Text style={[styles.textBtnText, { color: p.ink2 }]}>Share this quote</Text>
    </Pressable>
  );
}

function PlateView({ item, style }: { item: Item; style?: object }) {
  const p = usePalette();
  const plate = item.plate!;
  const [failed, setFailed] = useState(false);
  // A plate that cannot load (offline, gone, refused) leaves no empty frame behind.
  if (failed) return null;
  return (
    <View style={[{ marginTop: 28 }, style]}>
      <Image
        source={{ uri: plate.url }}
        onError={(e) => {
          console.warn(`plate failed: ${plate.url} ${e.nativeEvent.error}`);
          setFailed(true);
        }}
        accessibilityLabel={plate.caption}
        resizeMode="cover"
        style={{ width: '100%', aspectRatio: plate.width / plate.height, backgroundColor: p.plate }}
      />
      <Text style={[styles.caption, { color: p.ink }]}>{plate.caption}</Text>
      <Meta style={{ marginTop: 3 }}>{plate.credit}. {plate.licence[0]!.toUpperCase() + plate.licence.slice(1)}.</Meta>
    </View>
  );
}

// ---------- forms ----------

/** Magazine opening: the title is the moment, then the standfirst, then the excerpt pulled in. */
function Essay({ item, haul }: { item: Item; haul: Haul }) {
  const p = usePalette();
  const len = titleText(item).length;
  const size = len <= 18 ? 62 : len <= 32 ? 48 : 38;
  return (
    <View>
      <MetaLine item={item} />
      <Title title={item.title} size={size} style={{ marginTop: 14, lineHeight: size * 0.94, letterSpacing: -size * 0.03 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{item.creator}</Text>
      <Why item={item} heading={null} style={{ marginTop: 22 }} />
      {item.plate ? <PlateView item={item} /> : null}
      {item.excerpt ? (
        <View style={{ marginTop: 30 }}>
          <Meta>{item.excerpt.locator}</Meta>
          <Highlighted text={item.excerpt.text} highlight={item.excerpt.highlight} color={typeColor(p, item.type)} style={styles.pull} />
          <ShareQuote haul={haul} item={item} />
        </View>
      ) : null}
      <Notes item={item} />
    </View>
  );
}

/** Journal offprint: running citation, centred title, abstract, numbered sections. */
function Paper({ item, haul }: { item: Item; haul: Haul }) {
  const p = usePalette();
  const sections: { h: string; body: ReactNode }[] = [{ h: "Why it's here", body: <Why item={item} heading={null} style={{ marginTop: 0 }} /> }];
  if (item.plate) sections.push({ h: 'Figure', body: <PlateView item={item} style={{ marginTop: 0 }} /> });
  if (item.marginalia.length) sections.push({ h: 'Notes', body: <Notes item={item} style={{ marginTop: 0 }} /> });
  if (item.wiki.length || item.connections.length) sections.push({ h: 'References', body: <SeeAlso haul={haul} item={item} bare /> });
  return (
    <View>
      <View style={[styles.runcite, { borderColor: p.rule }]}>
        <Meta>{item.creator}. {titleText(item)}. {item.source.name}, {item.source.date}.</Meta>
      </View>
      <View style={{ alignItems: 'center', marginTop: 26 }}>
        <MetaLine item={item} extra="Offprint" />
        <Title title={item.title} size={titleText(item).length > 30 ? 30 : 36} style={{ textAlign: 'center', marginTop: 14 }} />
        <Text style={[styles.byline, { color: p.ink, textAlign: 'center' }]}>{item.creator}</Text>
      </View>
      {item.excerpt ? (
        <View style={{ marginTop: 26, paddingHorizontal: 8 }}>
          <Text accessibilityRole="header" style={[styles.abstractHead, { color: p.ink }]}>{item.excerpt.locator === 'Abstract' ? 'Abstract' : item.excerpt.locator}</Text>
          <Highlighted text={item.excerpt.text} highlight={item.excerpt.highlight} color={typeColor(p, item.type)} style={styles.abstract} />
        </View>
      ) : null}
      {sections.map((s, i) => (
        <View key={s.h} style={styles.sec}>
          <Text style={[styles.secN, { color: p.ink2 }]} accessible={false}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[styles.secH, { color: p.ink }]}>{s.h}</Text>
            {s.body}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Transcript: the speaker in a column on the left, the moment as a line of speech. */
function Transcript({ item, haul }: { item: Item; haul: Haul }) {
  const p = usePalette();
  const speaker = (item.creator.split(' ').pop() ?? item.creator).toUpperCase();
  const label = item.type === 'talk' ? 'Transcript' : item.type === 'podcast' ? 'Podcast transcript' : 'Video transcript';
  return (
    <View>
      <MetaLine item={item} extra={label} />
      <Title title={item.title} size={titleText(item).length > 26 ? 38 : 46} style={{ marginTop: 14 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{item.creator}, {item.source.name}</Text>
      <View style={{ marginTop: 26, gap: 20 }}>
        <View style={styles.tl}>
          <Text style={[styles.when, { color: p.ink2 }]}>{item.source.date}</Text>
        </View>
        {item.excerpt ? (
          <View style={styles.tl}>
            <Text style={[styles.who, { color: p.ink }]}>{speaker}</Text>
            <View style={{ flex: 1 }}>
              <Highlighted text={item.excerpt.text} highlight={item.excerpt.highlight} color={typeColor(p, item.type)} style={styles.said} />
              <ShareQuote haul={haul} item={item} />
            </View>
          </View>
        ) : null}
        <View style={styles.tl}>
          <Text style={[styles.whoEd, { color: p.ember }]}>B.</Text>
          <View style={{ flex: 1 }}>
            {item.why.audio ? <VoiceNote audio={item.why.audio} label="this note" compact /> : null}
            <Note>{item.why.text}</Note>
          </View>
        </View>
        {item.marginalia.map((m, i) => (
          <View key={i} style={styles.tl}>
            <Text style={[styles.who, { color: p.machine }]}>MACHINE</Text>
            <View style={{ flex: 1 }}>
              <Machine>{m.text}</Machine>
              <Meta style={{ marginTop: 4, fontSize: 11.5 }}>{m.cite}</Meta>
            </View>
          </View>
        ))}
      </View>
      {item.plate ? <PlateView item={item} /> : null}
    </View>
  );
}

/** Broadside: one coral sheet, the poem alone on it. */
function Poem({ item }: { item: Item }) {
  const p = usePalette();
  return (
    <View>
      <View style={[styles.sheet, styles.broadside, { backgroundColor: typeColor(p, item.type) }]}>
        <Text accessibilityRole="header" style={styles.sr}>{titleText(item)}, {item.creator}</Text>
        {item.excerpt ? (
          <Text selectable style={[styles.poemText, { color: p.ink }]}>{item.excerpt.text}</Text>
        ) : (
          <Title title={item.title} size={40} />
        )}
        <View style={[styles.bsFoot, { borderTopColor: p.rule }]}>
          <Text style={[styles.bsWho, { color: p.ink }]}>{item.creator}</Text>
          <Text style={[styles.bsWhat, { color: p.ink2 }]}>
            <Text style={{ fontFamily: fonts.textItalic }}>{titleText(item)}</Text>, {item.source.date}
          </Text>
        </View>
      </View>
      <Why item={item} />
      {item.plate ? <PlateView item={item} /> : null}
      <Notes item={item} />
    </View>
  );
}

/** Facing pages: then, the machine's bridge between rules, now. Stacked on a phone. */
function Rhymes({ item }: { item: Item }) {
  const p = usePalette();
  const r = item.rhyme;
  return (
    <View>
      <MetaLine item={item} extra={r ? `${r.then.year} and ${r.now.year}` : undefined} />
      <Title title={item.title} size={40} style={{ marginTop: 14 }} />
      <Why item={item} heading={null} style={{ marginTop: 16 }} />
      {r ? (
        <View style={{ marginTop: 26 }}>
          <Leaf k="then" side={r.then} />
          <View style={[styles.bridge, { borderColor: p.rule }]} accessible accessibilityLabel={`The machine's bridge: ${r.bridge}`}>
            <Machine style={{ fontSize: 14.5, lineHeight: 22 }}>{r.bridge}</Machine>
          </View>
          <Leaf k="now" side={r.now} />
        </View>
      ) : null}
      {item.plate ? <PlateView item={item} /> : null}
      <Notes item={item} />
    </View>
  );
}

const Leaf = memo(function Leaf({ k, side }: { k: 'then' | 'now'; side: { year: string; quote: string; cite: string } }) {
  const p = usePalette();
  return (
    <View style={[styles.leaf, { borderTopColor: p.ink }]}>
      <Text style={[styles.leafYear, { color: k === 'then' ? p.ink2 : p.ink }]}>{side.year}</Text>
      <Text selectable style={[styles.leafQuote, { color: p.ink }]}>{side.quote}</Text>
      <Text style={[styles.leafCite, { color: p.ink2 }]}>{side.cite}</Text>
      <Text style={[styles.leafF, { color: p.ink2, textAlign: k === 'now' ? 'right' : 'left' }]}>{k}</Text>
    </View>
  );
});

/** Catalogue card: call number, headword, the entry, cross-references, a punch hole. Plate below. */
function Card({ item, haul, n }: { item: Item; haul: Haul; n: number }) {
  const p = usePalette();
  const hw = headword(item.title.text);
  const place = item.source.date.split(', ')[0] ?? item.source.date;
  return (
    <View>
      <View style={[styles.sheet, styles.card, { backgroundColor: typeColor(p, item.type) }]}>
        <View style={styles.call}>
          <Meta style={{ fontVariant: ['tabular-nums'] }}>FDF {haulSlug(haul.number)}.{n}</Meta>
          <Meta>{place}</Meta>
        </View>
        <Text accessibilityRole="header" style={[styles.headword, { color: p.ink }]}>
          {hw.word}
          {hw.article ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + hw.article}</Text> : null}
          {item.title.italic ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + item.title.italic}</Text> : null}
        </Text>
        <Text style={[styles.cardDates, { color: p.ink2, borderBottomColor: p.rule }]}>{item.source.date}</Text>
        {item.why.audio ? <VoiceNote audio={item.why.audio} label="this note" compact /> : null}
        <Text selectable style={[styles.cardText, { color: p.ink }]}>
          {item.why.text} <Text style={{ fontFamily: fonts.displayItalic, color: p.ember }}>B.</Text>
        </Text>
        {item.marginalia.map((m, i) => (
          <View key={i} style={{ marginTop: 14 }}>
            <Machine>{m.text}</Machine>
            <Meta style={{ marginTop: 3, fontSize: 11.5 }}>{m.cite}</Meta>
          </View>
        ))}
        {item.wiki.length || item.connections.length ? (
          <Text style={[styles.cardSee, { color: p.ink }]}>
            <Text style={{ fontFamily: fonts.textItalic }}>See also </Text>
            {[...item.wiki.map((w) => inverted(w.title)), ...item.connections.map((c) => headword(c.title).word.replace(/,$/, '') + (headword(c.title).article ? `, ${headword(c.title).article}` : ''))].join('; ')}.
          </Text>
        ) : null}
        <View style={[styles.punch, { backgroundColor: p.bg }]} accessible={false} />
      </View>
      {item.plate ? <PlateView item={item} /> : null}
    </View>
  );
}

/** A page from the book: running head of the book's title, the passage as the page, the locator at the foot. */
function Page({ item, haul }: { item: Item; haul: Haul }) {
  const p = usePalette();
  return (
    <View>
      <MetaLine item={item} />
      <Title title={item.title} size={36} style={{ marginTop: 14 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{item.creator}</Text>
      {item.excerpt ? (
        <View style={[styles.bookPage, { borderColor: p.rule }]}>
          <Text style={[styles.bookHead, { color: p.ink2 }]}>{item.source.name.toUpperCase()}</Text>
          <Highlighted text={item.excerpt.text} highlight={item.excerpt.highlight} color={typeColor(p, item.type)} style={styles.bookText} />
          <Text style={[styles.bookFoot, { color: p.ink2 }]}>{item.excerpt.locator}</Text>
          <ShareQuote haul={haul} item={item} />
        </View>
      ) : null}
      <Why item={item} />
      {item.plate ? <PlateView item={item} /> : null}
      <Notes item={item} />
    </View>
  );
}

// ---------- the apparatus at the end of every page ----------

/**
 * See also as reference slips: square plate-grey slips joined by thin gaps, each with a small kind
 * line (where it points), the title, and its gloss. Connection notes are the editor's, in italic ink.
 */
function SeeAlso({ haul, item, bare }: { haul: Haul; item: Item; bare?: boolean }) {
  const p = usePalette();
  if (!item.wiki.length && !item.connections.length) return null;
  const slips = [
    ...item.connections.map((c, i) => {
      const at = c.itemId ? haul.items.findIndex((x) => x.id === c.itemId) : -1;
      const target = at >= 0 ? haul.items[at] : undefined;
      return {
        key: `c${i}`,
        type: target?.type,
        kind: target ? `${at + 1} · ${typeLabel[target.type]} · ${c.type}` : c.threadId ? `A thread · ${c.type}` : c.type,
        title: c.title,
        gloss: <Text style={[styles.slipGloss, { color: p.ink, fontFamily: fonts.textItalic }]}>{c.note}</Text>,
        open: () => (c.itemId ? go.item(haul.number, c.itemId) : c.threadId ? go.thread(haul.number, c.threadId) : undefined),
      };
    }),
    ...item.wiki.map((w) => ({
      key: w.url,
      type: undefined as ContentType | undefined,
      kind: 'Wikipedia',
      title: w.title,
      gloss: <Text style={[styles.slipGloss, { color: p.ink2 }]}>{w.summary}</Text>,
      open: () => openSource(w.url, p),
    })),
  ];
  return (
    <View style={bare ? undefined : { marginTop: 36 }}>
      {bare ? null : <Apparatus style={{ marginBottom: 10 }}>See also</Apparatus>}
      <View style={{ gap: 1, backgroundColor: p.rule }}>
        {slips.map((r) => (
          <Pressable key={r.key} accessibilityRole="link" onPress={r.open} style={({ pressed }) => [styles.slip, { backgroundColor: p.plate, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.slipKind}>
              {r.type ? <View style={[styles.slipKey, { backgroundColor: typeColor(p, r.type), borderColor: p.rule }]} /> : null}
              <Text style={[styles.slipKindText, { color: p.ink2 }]}>{r.kind}</Text>
            </View>
            <Text style={[styles.slipTitle, { color: p.ink }]}>{r.title}</Text>
            {r.gloss}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Source({ item }: { item: Item }) {
  const p = usePalette();
  const label = item.media ? item.media.label : item.type === 'rabbit-hole' ? 'Go down the hole' : 'Read the original';
  return <Action label={label} external onPress={() => openSource(item.media?.url ?? item.source.url, p)} style={{ marginTop: 34 }} />;
}

function Actions({ haul, item }: { haul: Haul; item: Item }) {
  const p = usePalette();
  const saved = useReader((s) => s.saved.some((x) => x.n === haul.number && x.id === item.id));
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        onPress={() => reader.toggleSave({ n: haul.number, id: item.id, type: item.type, title: item.title, creator: item.creator })}
        style={[styles.save, { borderColor: p.ink, backgroundColor: saved ? p.invBg : 'transparent' }]}
      >
        <Text style={[styles.saveText, { color: saved ? p.invInk : p.ink }]}>{saved ? 'Saved' : 'Save'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => Share.share({ message: `${titleText(item)}, in From the Dumpster Fire\n${shareUrl(haul.number, item.id)}` })}
        style={styles.textBtn}
      >
        <Text style={[styles.textBtnText, { color: p.ink2 }]}>Share</Text>
      </Pressable>
    </View>
  );
}

function NextItem({ n, at, item }: { n: number; at: number; item: Item }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="link" onPress={() => go.nextItem(n, item.id)} style={({ pressed }) => [styles.next, { borderTopColor: p.ink, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.metaLine}>
        <Meta>Next, {at}</Meta>
        <Key type={item.type} />
      </View>
      <Title title={item.title} size={28} style={{ marginTop: 8 }} />
      <Text style={[styles.byline, { color: p.ink2, fontSize: 16, marginTop: 6 }]}>{item.creator}</Text>
    </Pressable>
  );
}

function Finished({ haul }: { haul: Haul }) {
  const p = usePalette();
  return (
    <View style={[styles.next, { borderTopColor: p.ink }]}>
      <Meta>End of Haul {haulSlug(haul.number)}</Meta>
      <Text style={[styles.colophon, { color: p.ink2 }]}>{haul.colophon}</Text>
      <Pressable accessibilityRole="link" onPress={go.cover} style={{ marginTop: 10, minHeight: 44, justifyContent: 'center' }}>
        <Text style={[styles.byline, { color: p.ink, marginTop: 0 }]}>Back to the cover</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sr: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 22 },
  byline: { fontFamily: fonts.textItalic, fontSize: 19, marginTop: 12, includeFontPadding: false },
  whyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pull: { fontFamily: fonts.displayRegular, fontSize: 25, lineHeight: 34, marginTop: 8 },
  note: { paddingTop: 12, marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  textBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  textBtnText: { fontFamily: fonts.sansMedium, fontSize: 13, textDecorationLine: 'underline' },
  caption: { fontFamily: fonts.textItalic, fontSize: 15, lineHeight: 21, marginTop: 10 },

  runcite: { marginTop: 18, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  abstractHead: { fontFamily: fonts.sansBold, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  abstract: { fontFamily: fonts.text, fontSize: 17, lineHeight: 26 },
  sec: { flexDirection: 'row', gap: 14, marginTop: 30 },
  secN: { width: 22, fontFamily: fonts.displayRegular, fontSize: 26, lineHeight: 28, textAlign: 'right', includeFontPadding: false },
  secH: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, marginBottom: 10, includeFontPadding: false },

  tl: { flexDirection: 'row', gap: 14 },
  when: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, marginLeft: 82 },
  who: { width: 68, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.1, lineHeight: 22 },
  whoEd: { width: 68, fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 26 },
  said: { fontFamily: fonts.displayRegular, fontSize: 24, lineHeight: 31 },

  sheet: { marginTop: 22 },
  broadside: { minHeight: 440, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 22, justifyContent: 'space-between', gap: 56 },
  poemText: { fontFamily: fonts.textItalic, fontSize: 30, lineHeight: 41.5 },
  bsFoot: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 2 },
  bsWho: { fontFamily: fonts.display, fontSize: 18 },
  bsWhat: { fontFamily: fonts.text, fontSize: 16 },

  leaf: { borderTopWidth: 1, paddingTop: 18, paddingBottom: 14 },
  leafYear: { fontFamily: fonts.displayRegular, fontSize: 80, lineHeight: 78, letterSpacing: -2.5, includeFontPadding: false, fontVariant: ['lining-nums'] },
  leafQuote: { fontFamily: fonts.displayRegular, fontSize: 21, lineHeight: 29, marginTop: 14 },
  leafCite: { fontFamily: fonts.textItalic, fontSize: 14.5, lineHeight: 20, marginTop: 10 },
  leafF: { fontFamily: fonts.textItalic, fontSize: 14, marginTop: 14 },
  bridge: { paddingVertical: 14, marginBottom: 22, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },

  card: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 64 },
  call: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  headword: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -0.6 },
  cardDates: { fontFamily: fonts.textItalic, fontSize: 16.5, marginTop: 8, paddingBottom: 12, marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  cardText: { fontFamily: fonts.text, fontSize: 18.5, lineHeight: 28 },
  cardSee: { fontFamily: fonts.text, fontSize: 16, lineHeight: 24, marginTop: 18 },
  punch: { position: 'absolute', bottom: 20, left: '50%', marginLeft: -10, width: 20, height: 20, borderRadius: 10 },

  bookPage: { marginTop: 26, paddingVertical: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  bookHead: { fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.6, textAlign: 'center', marginBottom: 16 },
  bookText: { fontFamily: fonts.text, fontSize: 19, lineHeight: 30 },
  bookFoot: { fontFamily: fonts.textItalic, fontSize: 14, textAlign: 'center', marginTop: 16 },

  slip: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 15 },
  slipKind: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  slipKey: { width: 8, height: 8, borderWidth: StyleSheet.hairlineWidth },
  slipKindText: { fontFamily: fonts.sansMedium, fontSize: 12, includeFontPadding: false },
  slipTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 25, marginTop: 6 },
  slipGloss: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 5 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 16 },
  save: { minHeight: 44, minWidth: 92, paddingHorizontal: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: fonts.sansBold, fontSize: 13 },
  next: { marginTop: 34, paddingTop: 14, borderTopWidth: 1 },
  colophon: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 23, marginTop: 10 },
});
