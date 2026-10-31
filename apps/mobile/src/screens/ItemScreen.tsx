// One find, set in the printed form its type has always had: an essay opens like a magazine, a paper
// is an offprint, a talk or speech is a transcript, a poem is a broadside, rhymes are facing pages, a
// rabbit hole is a catalogue card, a passage is a page from the book, a quotation is an epigraph, a
// letter is the letter, a post is a clipping, a picture is a mounted print, a book is its jacket and
// a tool is a specimen label, and a chart-led item is the figure (lib/forms.ts, the website's choice).
// Rich media follows (ui/Blocks.tsx, charts in ui/Chart.tsx).
import { memo, useState, type ReactNode } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { go } from '@/nav';
import { curlQuotes, haulSlug, quoteLength, sourceAction, type Haul, type Item } from '@fdf/shared/haul';
import { useEditionInk } from '@/ui/edition';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, useEdition, usePalette, useScheme, useTextScale } from '@/theme';
import { formName, formOf, headword, hostOf, speaker, titleText, type Form } from '@/lib/forms';
import { joinMeta, minutes } from '@/lib/format';
import { openSource } from '@/lib/open';
import { shareUrl } from '@/lib/data';
import { reader, useReader } from '@/lib/store';
import { EditorNote, Highlighted, Machine, Meta, Note, Title } from '@/ui/type';
import { LeadQuotation, Quotation } from '@/ui/Quote';
import { Jacket as BookJacket } from '@/ui/Jacket';
import { useShelf } from '@/lib/data';
import { statusLine } from '@/lib/shelf';
import { spineColours, spineOf } from '@fdf/shared/shelf';
import { Action, Apparatus, Arrow, Folio, Key, RunHead, TopBar, VoiceNote } from '@/ui/parts';
import { Screen } from '@/ui/screen';
import { Blocks, Credit, Picture } from '@/ui/Blocks';
import { Chart } from '@/ui/Chart';
import { firstChart } from '@/lib/chart';
import { LifeForm } from '@/ui/Life';

/** Index form of a two-word name: "Joseph Bazalgette" becomes "Bazalgette, Joseph". */
const inverted = (n: string) => {
  const w = n.split(' ');
  return w.length === 2 && /^[A-Z]/.test(w[1]!) ? `${w[1]}, ${w[0]}` : n;
};

/** Forms that carry the editor's note under them as "Why it's here". */
const WHY_AFTER = new Set<Form>(['epigraph', 'letter', 'clipping', 'print', 'jacket', 'label']);

export function ItemScreen({ haul, item }: { haul: Haul; item: Item }) {
  const at = haul.items.indexOf(item);
  const next = haul.items[at + 1];
  const form = formOf(item);
  const ed = useEdition(haul);
  const header = (
    <View>
      <TopBar label={titleText(haul)} right={`${at + 1} of ${haul.items.length}`} />
      <RunHead haul={haul} current={item.id} right={formName[form]} />
    </View>
  );

  const body: Record<Form, ReactNode> = {
    opening: <Essay item={item} haul={haul} />,
    offprint: <Paper item={item} haul={haul} />,
    transcript: <Transcript item={item} haul={haul} />,
    broadside: <Poem item={item} />,
    facing: <Rhymes item={item} />,
    card: <Card item={item} haul={haul} n={at + 1} />,
    page: <Page item={item} haul={haul} />,
    epigraph: <Epigraph item={item} />,
    letter: <Letter item={item} />,
    clipping: <Clipping item={item} />,
    print: <Print item={item} />,
    jacket: <Jacket item={item} />,
    label: <Label item={item} haul={haul} n={at + 1} />,
    figure: <Figure item={item} />,
    life: item.life ? <LifeForm item={item} life={item.life} why={<Why item={item} />} /> : null,
  };
  // The figure form sets its first chart large itself; the rest follow as blocks.
  const lead = form === 'figure' ? firstChart(item.blocks) : undefined;
  const blocks = lead ? item.blocks?.filter((b) => b !== lead) : item.blocks;

  return (
    <Screen header={header} edition={ed}>
      {body[form]}
      {WHY_AFTER.has(form) ? (
        <>
          <Why item={item} />
          <Notes item={item} />
          {item.shelf ? <OnTheShelf item={item} /> : null}
        </>
      ) : null}
      <Blocks blocks={blocks} source={item.source.name} />
      <Ideas item={item} />
      {form === 'offprint' ? null : <SeeAlso haul={haul} item={item} />}
      <Source item={item} />
      <Actions haul={haul} item={item} />
      {next ? <NextItem n={haul.number} at={at + 2} item={next} /> : <Finished haul={haul} />}
      <Folio haul={`Haul ${haulSlug(haul.number)}`} n={at + 1} of={haul.items.length} />
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
      <EditorNote why={item.why} lead={heading === null} style={{ marginTop: heading ? 8 : 0 }} />
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
          <Machine>{curlQuotes(m.text)}</Machine>
          <Cite item={item} note={m} />
        </View>
      ))}
    </View>
  );
}

/** A machine note's source, a link when it is a Wikipedia article (its own stored card, or one the item keeps). */
function Cite({ item, note }: { item: Item; note: Item['marginalia'][number] }) {
  const p = usePalette();
  const url = note.url ?? item.wiki.find((w) => note.cite === `Wikipedia: ${w.title}`)?.url;
  return (
    <Meta style={{ marginTop: 4, fontSize: 11.5 }}>
      {url ? (
        <Text accessibilityRole="link" onPress={() => openSource(url, p)} style={{ textDecorationLine: 'underline' }}>
          {note.cite}
        </Text>
      ) : (
        note.cite
      )}
    </Meta>
  );
}

/** The big ideas of a long item: numbered in ember, the machine's sentence, then the source's words. */
function Ideas({ item }: { item: Item }) {
  const p = usePalette();
  if (!item.ideas?.length) return null;
  return (
    <View style={{ marginTop: 32 }}>
      <Apparatus style={{ marginBottom: 10 }}>The big ideas</Apparatus>
      {item.ideas.map((m, i) => (
        <View key={i} style={[styles.idea, { borderTopColor: p.rule }, i === 0 && { borderTopWidth: 0, paddingTop: 0, marginTop: 0 }]}>
          <Text style={[styles.ideaN, { color: p.ember }]}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Machine>{curlQuotes(m.text)}</Machine>
            {m.quote ? <Text selectable style={[styles.ideaQ, { color: p.ink }]}>“{m.quote}”</Text> : null}
            {m.locator ? <Meta style={{ marginTop: 4, fontSize: 11.5 }}>{m.locator}</Meta> : null}
            {m.reaction ? (
              <Note style={{ marginTop: 8, fontSize: 17, lineHeight: 25 }}>
                {m.reaction} <Text style={{ color: p.ember }}>B.</Text>
              </Note>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The editor's "start here" for a long item: the moment (opens there when the platform allows) and their words. */
function StartHereLine({ item }: { item: Item }) {
  const p = usePalette();
  const s = item.startHere;
  if (!s) return null;
  return (
    <View style={{ marginTop: 22 }}>
      <Apparatus style={{ marginBottom: 4 }}>Start here</Apparatus>
      <Pressable accessibilityRole={s.url ? 'link' : undefined} disabled={!s.url} onPress={() => s.url && openSource(s.url, p)}>
        <Text style={[styles.startAt, { color: p.ink, textDecorationLine: s.url ? 'underline' : 'none', textDecorationColor: p.ember }]}>{s.at}</Text>
      </Pressable>
      {s.note ? (
        <Note style={{ marginTop: 4, fontSize: 17, lineHeight: 25 }}>
          {s.note} <Text style={{ color: p.ember }}>B.</Text>
        </Note>
      ) : null}
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
      <Credit plate={plate} />
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
      <Title title={item.title} size={size} style={{ marginTop: 14, lineHeight: size * 1.0, letterSpacing: -size * 0.03 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{item.creator}</Text>
      <Why item={item} heading={null} style={{ marginTop: 22 }} />
      <StartHereLine item={item} />
      {item.plate ? <PlateView item={item} /> : null}
      {item.excerpt ? (
        <View style={{ marginTop: 34 }}>
          <Apparatus style={{ marginBottom: 6 }}>From the piece</Apparatus>
          {item.excerpt.highlight && item.excerpt.highlight.split(/\s+/).length <= 40 ? (
            <View style={{ marginBottom: 26 }}>
              <Quotation text={item.excerpt.highlight} />
            </View>
          ) : null}
          <Quotation
            extract
            text={item.excerpt.text}
            highlight={item.excerpt.highlight}
            mark={typeColor(p, item.type)}
            credit={[item.creator, item.source.name, item.excerpt.locator, 'matched word for word against the source']}
          />
          <ShareQuote haul={haul} item={item} />
        </View>
      ) : null}
      <Notes item={item} />
    </View>
  );
}

/**
 * The figure: a chart-led item. The title and the editor's why open the page as a magazine opening
 * does, then the chart is the loud thing, set large, its own title read as the caption under it.
 */
function Figure({ item }: { item: Item }) {
  const p = usePalette();
  const lead = firstChart(item.blocks)!;
  const len = titleText(item).length;
  const size = len <= 24 ? 46 : len <= 44 ? 38 : 32;
  return (
    <View>
      <MetaLine item={item} />
      <Title title={item.title} size={size} style={{ marginTop: 14, lineHeight: size * 1.0, letterSpacing: -size * 0.025 }} />
      {item.creator ? <Text style={[styles.byline, { color: p.ink }]}>{item.creator}</Text> : null}
      <Why item={item} heading={null} style={{ marginTop: 20 }} />
      <View style={{ marginTop: 28 }}>
        <Chart block={lead} lead />
      </View>
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
      <StartHereLine item={item} />
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
  const who = speaker(item.creator);
  const label = item.type === 'talk' ? 'Transcript' : item.type === 'speech' ? 'Speech' : item.type === 'podcast' ? 'Podcast transcript' : 'Video transcript';
  const dateline = [item.place, item.source.date].filter(Boolean).join(', ');
  return (
    <View>
      <MetaLine item={item} extra={label} />
      <Title title={item.title} size={titleText(item).length > 26 ? 38 : 46} style={{ marginTop: 14 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{item.creator}, {item.source.name}</Text>
      <StartHereLine item={item} />
      <View style={{ marginTop: 26, gap: 20 }}>
        <View style={styles.tl}>
          <Text style={[styles.when, { color: p.ink2 }]}>{dateline}</Text>
        </View>
        {item.excerpt ? (
          <View style={styles.tl}>
            <Text style={[styles.who, { color: p.ink }]}>{who}</Text>
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
            <EditorNote why={item.why} sign={false} />
          </View>
        </View>
        {item.marginalia.map((m, i) => (
          <View key={i} style={styles.tl}>
            <Text style={[styles.who, { color: p.machine }]}>MACHINE</Text>
            <View style={{ flex: 1 }}>
              <Machine>{curlQuotes(m.text)}</Machine>
              <Cite item={item} note={m} />
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
  const k = useTextScale();
  // The poem in its stanzas (a blank line between), each line as the poet broke it.
  const stanzas = item.excerpt ? item.excerpt.text.split(/\n\s*\n/).map((st) => st.split('\n').filter((l) => l.trim())).filter((st) => st.length) : [];
  const where = item.source.name.startsWith(`${item.creator}, `) ? item.source.name.slice(item.creator.length + 2) : item.source.name;
  return (
    <View>
      <View style={[styles.sheet, styles.broadside, { backgroundColor: typeColor(p, item.type) }]}>
        <View style={[styles.bsHead, { borderBottomColor: p.rule }]}>
          <Title title={item.title} size={34} style={{ lineHeight: 36 }} />
          <Text style={[styles.bsBy, { color: p.ink }]}>{item.creator.toUpperCase()}</Text>
        </View>
        {stanzas.map((st, i) => (
          <Text key={i} selectable style={[styles.poemText, { color: p.ink, fontSize: 19 * k, lineHeight: 29 * k }]}>
            {st.join('\n')}
          </Text>
        ))}
        <View style={[styles.bsFoot, { borderTopColor: p.rule }]}>
          <Text style={[styles.bsWhat, { color: p.ink2 }]}>
            <Text style={{ fontFamily: fonts.textItalic }}>{where}</Text>
            {item.source.date && !where.includes(item.source.date) ? `, ${item.source.date}` : ''}
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
        <EditorNote why={item.why} style={{ marginTop: 4 }} />
        {item.marginalia.map((m, i) => (
          <View key={i} style={{ marginTop: 14 }}>
            <Machine>{curlQuotes(m.text)}</Machine>
            <Cite item={item} note={m} />
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
      <StartHereLine item={item} />
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

/** Epigraph: the words alone, set large, the marks hanging grey; who said them under an ink rule. */
function Epigraph({ item }: { item: Item }) {
  const p = usePalette();
  const ink = useEditionInk() ?? p.ink2;
  const k = useTextScale();
  const ex = item.excerpt!;
  const len = ex.text.length;
  const size = (len < 60 ? 40 : len < 140 ? 34 : 28) * Math.min(k, 1.1);
  const at = ex.highlight ? ex.text.indexOf(ex.highlight) : -1;
  const occasion = [item.source.name, item.source.date].filter(Boolean).join(', ');
  if (quoteLength(ex.text) !== 'short') {
    return (
      <View>
        <MetaLine item={item} extra={item.source.date} />
        <Text accessibilityRole="header" style={styles.sr}>{titleText(item)}, {item.creator}</Text>
        <View style={{ marginTop: 18 }}>
          <LeadQuotation text={ex.text} highlight={ex.highlight} mark={typeColor(p, item.type)} />
        </View>
        <View style={[styles.epiWho, { borderTopColor: p.ink }]}>
          <Text style={[styles.epiName, { color: p.ink }]}>{item.creator.toUpperCase()}</Text>
          <Text style={[styles.epiWhere, { color: p.ink2 }]}>{occasion}</Text>
        </View>
      </View>
    );
  }
  return (
    <View>
      <MetaLine item={item} extra={item.source.date} />
      <Text accessibilityRole="header" style={styles.sr}>{titleText(item)}, {item.creator}</Text>
      <Text selectable style={[styles.epiQ, { color: p.ink, fontSize: size, lineHeight: size * 1.06, letterSpacing: -size * 0.022 }]}>
        <Text style={{ color: ink, fontFamily: fonts.displayRegular }}>“</Text>
        {at >= 0 && ex.highlight ? (
          <>
            {ex.text.slice(0, at)}
            <Text style={{ backgroundColor: typeColor(p, item.type) }}>{ex.highlight}</Text>
            {ex.text.slice(at + ex.highlight.length)}
          </>
        ) : (
          ex.text
        )}
        <Text style={{ color: ink, fontFamily: fonts.displayRegular }}>”</Text>
      </Text>
      <View style={[styles.epiWho, { borderTopColor: p.ink }]}>
        <Text style={[styles.epiName, { color: p.ink }]}>{item.creator.toUpperCase()}</Text>
        <Text style={[styles.epiWhere, { color: p.ink2 }]}>{[item.source.name, item.source.date].filter(Boolean).join(', ')}</Text>
      </View>
    </View>
  );
}

/** The letter: a sheet in the letter's colour, the dateline right, the body, signed at the foot. */
function Letter({ item }: { item: Item }) {
  const p = usePalette();
  const ex = item.excerpt!;
  return (
    <View style={[styles.sheet, styles.letter, { backgroundColor: typeColor(p, item.type) }]}>
      <View style={styles.ltDate}>
        {item.place ? <Text style={[styles.ltDateText, { color: p.ink }]}>{item.place}</Text> : null}
        <Text style={[styles.ltDateText, { color: p.ink }]}>{item.source.date}</Text>
      </View>
      <Text accessibilityRole="header" style={[styles.ltTo, { color: p.ink2 }]}>
        From {item.creator}
        {item.recipient ? ` to ${item.recipient}` : ''}
      </Text>
      <Highlighted text={ex.text} highlight={ex.highlight} color={p.bg + '9E'} style={styles.ltBody} />
      <Text style={[styles.ltSign, { color: p.ink }]}>{item.creator}</Text>
      <Text style={[styles.ltHeld, { color: p.ink2, borderTopColor: p.rule }]}>
        {item.source.name}
        {ex.locator ? `, ${ex.locator}` : ''}
      </Text>
    </View>
  );
}

/** Clipping: who, where and when as fields under a rule, then the post's words. Never the platform's embed. */
function Clipping({ item }: { item: Item }) {
  const p = usePalette();
  const ex = item.excerpt!;
  const field = (k: string, v: ReactNode) => (
    <View style={styles.clipField}>
      <Text style={[styles.clipKey, { color: p.ink2 }]}>{k}</Text>
      {typeof v === 'string' ? <Text style={[styles.clipVal, { color: p.ink }]}>{v}</Text> : v}
    </View>
  );
  return (
    <View style={[styles.sheet, styles.clip, { backgroundColor: typeColor(p, item.type) }]}>
      <Text accessibilityRole="header" style={styles.sr}>{titleText(item)}, a post by {item.creator}</Text>
      <View style={[styles.clipHead, { borderBottomColor: p.ink }]}>
        {field(
          'FROM',
          <View>
            <Text style={[styles.clipVal, { color: p.ink, fontFamily: fonts.sansMedium }]}>{item.creator}</Text>
            {item.handle ? <Text style={[styles.clipVal, { color: p.ink2 }]}>{item.handle}</Text> : null}
          </View>,
        )}
        <View style={styles.clipPair}>
          {field('ON', item.source.name)}
          {field('DATE', item.source.date)}
        </View>
      </View>
      <Highlighted text={ex.text} highlight={ex.highlight} color={p.bg + '9E'} style={styles.clipText} />
    </View>
  );
}

/** A mounted print: the picture on its mount, then a museum label. */
function Print({ item }: { item: Item }) {
  const p = usePalette();
  const plate = item.plate!;
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ marginTop: 22 }}>
      <View style={[styles.mount, { backgroundColor: p.plate }]}>
        {failed ? (
          <View style={[styles.mountGone, { aspectRatio: plate.width / plate.height, borderColor: p.rule }]}>
            <Text style={[styles.caption, { color: p.ink2, textAlign: 'center', marginTop: 0 }]}>The picture could not load. It will appear when you are online.</Text>
          </View>
        ) : (
          <Image
            source={{ uri: plate.url }}
            onError={() => setFailed(true)}
            accessibilityLabel={plate.caption || titleText(item)}
            resizeMode="cover"
            style={{ width: '100%', aspectRatio: plate.width / plate.height }}
          />
        )}
      </View>
      <View style={[styles.prLabel, { borderTopColor: p.ink }]}>
        <Title title={item.title} size={30} style={{ lineHeight: 32 }} />
        <Text style={[styles.prBy, { color: p.ink }]}>
          {item.creator}
          {item.source.date ? `, ${item.source.date}` : ''}
        </Text>
        <Text style={[styles.prFrom, { color: p.ink2 }]}>{item.source.name}</Text>
        <Credit plate={plate} noBy />
      </View>
    </View>
  );
}

/** The jacket: the book set in type (or its own cover), then the line from inside. */
function Jacket({ item }: { item: Item }) {
  const p = usePalette();
  const ex = item.excerpt;
  return (
    <View>
      <View style={{ marginTop: 26 }}>
        <BookJacket title={item.title} author={item.creator} publisher={item.source.name} cover={item.plate} />
      </View>
      <MetaLine item={item} />
      <Title title={item.title} size={40} style={{ marginTop: 14 }} />
      <Text style={[styles.byline, { color: p.ink }]}>{item.creator}</Text>
      {ex ? (
        <View style={[styles.jkLine, { borderTopColor: p.ink }]}>
          <Highlighted text={ex.text} highlight={ex.highlight} color={typeColor(p, item.type)} style={styles.jkLineText} />
          {ex.locator ? <Meta style={{ marginTop: 8 }}>{ex.locator}</Meta> : null}
        </View>
      ) : null}
    </View>
  );
}

/** A Haul's book that is also on the shelf links to all the editor's notes on it there. */
function OnTheShelf({ item }: { item: Item }) {
  const p = usePalette();
  const sch = useScheme();
  const book = useShelf().data?.books.find((b) => b.id === item.shelf);
  if (!book) return null;
  const notes = book.notes.length;
  const detail = [statusLine(book), notes ? `${notes} ${notes === 1 ? 'note' : 'notes'}` : ''].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`All the editor’s notes on this book. ${detail}`}
      onPress={() => go.book(book.id)}
      style={({ pressed }) => [styles.shelfLink, { borderTopColor: p.rule, borderBottomColor: p.rule }, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.shelfSpine, { backgroundColor: spineColours(spineOf(book), sch).cloth }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.shelfTitle, { color: p.ink }]}>All the editor’s notes on this book</Text>
        <Text style={[styles.shelfDetail, { color: p.ink2 }]}>{detail}</Text>
      </View>
      <Arrow color={p.ink} />
    </Pressable>
  );
}

/** Specimen label: a ruled label with a band of the type's colour, the name large, fields in sans, its own words in serif. */
function Label({ item, haul, n }: { item: Item; haul: Haul; n: number }) {
  const p = usePalette();
  const host = hostOf(item.source.url);
  const long = titleText(item).length > 14;
  const rows: [string, ReactNode][] = [];
  if (item.creator) rows.push(['MADE BY', item.creator]);
  rows.push(['WHAT IT IS', item.source.name]);
  if (item.source.date) rows.push(['SINCE', item.source.date]);
  if (item.excerpt) rows.push(['IN ITS OWN WORDS', <Highlighted key="own" text={item.excerpt.text} highlight={item.excerpt.highlight} color={typeColor(p, item.type)} style={styles.labOwn} />]);
  if (host)
    rows.push([
      'WHERE',
      <Pressable key="where" accessibilityRole="link" onPress={() => openSource(item.source.url, p)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
        <Text style={[styles.labVal, { color: p.ink, textDecorationLine: 'underline' }]}>{host}</Text>
      </Pressable>,
    ]);
  return (
    <View style={[styles.sheet, styles.lab, { borderColor: p.ink }]}>
      <View style={[styles.labBand, { backgroundColor: typeColor(p, item.type) }]} />
      <View style={styles.labK}>
        <Key type={item.type} />
        <Text style={[styles.labCall, { color: p.ink2 }]}>
          FDF {haulSlug(haul.number)}.{n}
        </Text>
      </View>
      <Title title={item.title} size={long ? 40 : 52} style={{ marginTop: 14, marginBottom: 18, lineHeight: long ? 41 : 52, letterSpacing: long ? -1 : -1.5 }} />
      <View style={{ borderTopWidth: 1, borderTopColor: p.ink }}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[styles.labRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.rule }]}>
            <Text style={[styles.labKey, { color: p.ink2 }]}>{k}</Text>
            {typeof v === 'string' ? <Text style={[styles.labVal, { color: p.ink }]}>{v}</Text> : v}
          </View>
        ))}
      </View>
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
  const label = sourceAction(item);
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
  idea: { flexDirection: 'row', gap: 12, paddingTop: 16, marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  ideaN: { fontFamily: fonts.sansMedium, fontSize: 14.5, lineHeight: 22.5, minWidth: 14 },
  ideaQ: { fontFamily: fonts.text, fontSize: 16, lineHeight: 24, marginTop: 8 },
  startAt: { fontFamily: fonts.sansMedium, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },
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
  broadside: { marginHorizontal: -GUTTER, paddingHorizontal: 22, paddingTop: 36, paddingBottom: 22, gap: 22 },
  bsHead: { paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  bsBy: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.5 },
  poemText: { fontFamily: fonts.textItalic },
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

  epiQ: { fontFamily: fonts.display, marginTop: 30 },
  epiWho: { marginTop: 22, paddingTop: 12, borderTopWidth: 1, gap: 4, alignSelf: 'flex-start', minWidth: '70%' },
  epiName: { fontFamily: fonts.sansBold, fontSize: 12.5, letterSpacing: 1.5 },
  epiWhere: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 20 },

  letter: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 22 },
  ltDate: { alignItems: 'flex-end', marginBottom: 26 },
  ltDateText: { fontFamily: fonts.textItalic, fontSize: 16, lineHeight: 23, textAlign: 'right' },
  ltTo: { fontFamily: fonts.sansMedium, fontSize: 13, marginBottom: 16 },
  ltBody: { fontFamily: fonts.text, fontSize: 19, lineHeight: 30 },
  ltSign: { marginTop: 26, textAlign: 'right', fontFamily: fonts.displayItalic, fontSize: 28, lineHeight: 32 },
  ltHeld: { marginTop: 24, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },

  clip: { paddingHorizontal: 20, paddingBottom: 24 },
  clipHead: { paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, marginBottom: 18, gap: 10 },
  clipPair: { flexDirection: 'row', gap: 32 },
  clipField: { gap: 2 },
  clipKey: { fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.3 },
  clipVal: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 20 },
  clipText: { fontFamily: fonts.displayRegular, fontSize: 26, lineHeight: 34 },

  mount: { padding: 20 },
  mountGone: { width: '100%', borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', padding: 20 },
  prLabel: { marginTop: 20, paddingTop: 12, borderTopWidth: 1, gap: 3 },
  prBy: { fontFamily: fonts.text, fontSize: 18, lineHeight: 25, marginTop: 6 },
  prFrom: { fontFamily: fonts.textItalic, fontSize: 16, lineHeight: 22 },

  shelfLink: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 26, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  shelfSpine: { width: 9, alignSelf: 'stretch' },
  shelfTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, includeFontPadding: false },
  shelfDetail: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 3 },
  jkLine: { marginTop: 26, paddingTop: 16, borderTopWidth: 1 },
  jkLineText: { fontFamily: fonts.displayRegular, fontSize: 23, lineHeight: 31 },

  lab: { borderWidth: 1, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 6 },
  labBand: { position: 'absolute', left: 0, right: 0, top: 0, height: 8 },
  labK: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  labCall: { fontFamily: fonts.sansMedium, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  labRow: { paddingVertical: 11, gap: 4 },
  labKey: { fontFamily: fonts.sansMedium, fontSize: 11.5, letterSpacing: 1 },
  labVal: { fontFamily: fonts.text, fontSize: 18, lineHeight: 25 },
  labOwn: { fontFamily: fonts.displayRegular, fontSize: 21, lineHeight: 29 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 16 },
  save: { minHeight: 44, minWidth: 92, paddingHorizontal: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: fonts.sansBold, fontSize: 13 },
  next: { marginTop: 34, paddingTop: 14, borderTopWidth: 1 },
  colophon: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 23, marginTop: 10 },
});
