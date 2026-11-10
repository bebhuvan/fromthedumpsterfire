// A data story (docs/DATA-STORIES.md), as the website sets it (apps/web/src/pages/data/[slug].astro):
// a title page framed as a proof with crop marks (the series number, the Haul and date, the editor's
// title and standfirst, the byline, the plates' contents with dotted leaders and a seal saying how
// many facts were checked), the principal figures, the plates in their movements, and the colophon.
// The app has no SVG, so each plate is the picture drawn at publish (light and dark), kept on the
// phone with the story; before a story has pictures, a quiet line links to the plate on the website.
import { Fragment, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { haulSlug } from '@fdf/shared/haul';
import type { PublishedStory } from '@fdf/shared/stories/published';
import { fonts, useEdition, usePalette, useScheme, useTextScale } from '@/theme';
import { go } from '@/nav';
import { longDate } from '@/lib/format';
import { openSource } from '@/lib/open';
import { atlasNo, factValue, plateOrder, plateSourceLine, ROMAN, storySources, storyUrl, type Plate } from '@/lib/atlas';
import { Screen, useScrollToBody } from '@/ui/screen';
import { TopBar } from '@/ui/parts';
import { Quotation } from '@/ui/Quote';
import { Caps, CropMarks, Dots, MachineText, PlatePicture, SeriesNo } from '@/ui/Proof';

const CARET = require('../../assets/marks/caret.png');

const day = (iso: string) => longDate(iso.slice(0, 10));

export function Story({ story: s, back, onBack }: { story: PublishedStory; back: string; onBack: () => void }) {
  const p = usePalette();
  const k = useTextScale();
  const ink = useEdition({ number: s.number, edition: s.story.edition });
  const st = s.story;
  const order = plateOrder(st);
  const num = new Map(order.map((pl, i) => [pl.key, i + 1]));
  const byKey = new Map(st.plates.map((pl) => [pl.key, pl]));
  // Where each plate sits in the page's body, for the contents to scroll to.
  const plateY = useRef(new Map<string, number>());
  const H = s.haul ? `Haul ${haulSlug(s.haul.number)}` : null;

  const plate = (pl: Plate) => <PlateSection key={pl.key} story={s} plate={pl} n={num.get(pl.key) ?? 1} ink={ink} onY={(y) => plateY.current.set(pl.key, y)} />;

  return (
    <Screen header={<TopBar label={back} onBack={onBack} />} edition={ink}>
      {/* The title page, a proof. */}
      <View style={[styles.proof, { borderColor: p.ink2 }]}>
        <CropMarks color={p.ink} />
        <View style={[styles.series, { borderBottomColor: p.ink2 }]}>
          <SeriesNo word="Atlas" n={`No. ${s.number}`} ink={ink} />
          <Caps>
            {H && s.haul ? (
              <Text accessibilityRole="link" onPress={() => go.item(s.haul!.number, s.haul!.itemSlug)} style={{ textDecorationLine: 'underline', textDecorationColor: p.rule }}>
                {H}
              </Text>
            ) : null}
            {H ? ' · ' : ''}
            {day(s.publishedAt)}
          </Caps>
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: p.ink, fontSize: 40 * Math.min(k, 1.1), lineHeight: 41 * Math.min(k, 1.1) }]}>
          {st.title}
        </Text>
        <Text selectable style={[styles.stand, { color: p.ink, fontSize: 17 * k, lineHeight: 25.5 * k }]}>{st.standfirst}</Text>
        <Text style={[styles.by, { color: p.ink2, fontSize: 13 * k, lineHeight: 19.5 * k }]}>
          Chosen and annotated by Bhuvanesh ·{' '}
          <Text style={{ color: p.machine }}>words and plates by the machine, from the sources named; every figure in the words is one of the story’s facts, each listed with its method</Text>
        </Text>
        <Contents order={order} ink={ink} plateY={plateY} />
        <Seal n={st.facts.length} ink={ink} />
      </View>

      {/* The principal figures. */}
      <View style={{ marginTop: 44 }}>
        <Caps>The principal figures</Caps>
        <View style={{ marginTop: 10, borderTopWidth: 2, borderTopColor: p.ink }}>
          {st.ledger.map((l, i) => (
            <View key={i} style={[styles.ledgerRow, { borderBottomColor: p.rule }]}>
              <Text style={[styles.ledgerValue, { color: l.loud ? ink : p.ink, fontSize: 38 * Math.min(k, 1.1), lineHeight: 40 * Math.min(k, 1.1) }]}>{l.value}</Text>
              <MachineText size={15} line={21} style={{ flex: 1 }}>
                {l.text}
              </MachineText>
            </View>
          ))}
        </View>
      </View>

      {st.movements.length
        ? st.movements.map((m) => (
            <Fragment key={m.numeral}>
              <View style={[styles.movement, { borderTopColor: p.ink }]}>
                <Caps>{`Movement ${m.numeral}`}</Caps>
                <Text accessibilityRole="header" style={[styles.movementName, { color: p.ink }]}>
                  <Text style={{ fontFamily: fonts.displayItalic, color: ink }}>{m.numeral}</Text>
                  {'  '}
                  {m.name}
                </Text>
              </View>
              {m.plates.map((key) => byKey.get(key)).filter((pl): pl is Plate => Boolean(pl)).map(plate)}
            </Fragment>
          ))
        : order.map(plate)}

      <Colophon story={s} />
    </Screen>
  );
}

/** The plates' contents: numeral, name, a dotted leader, "Plate N"; each scrolls to its plate. */
function Contents({ order, ink, plateY }: { order: Plate[]; ink: string; plateY: { current: Map<string, number> } }) {
  const p = usePalette();
  const scrollToBody = useScrollToBody();
  return (
    <View style={[styles.toc, { borderTopColor: p.ink }]}>
      {order.map((pl, i) => (
        <Pressable
          key={pl.key}
          accessibilityRole="link"
          accessibilityLabel={`Plate ${i + 1}, ${pl.name}`}
          onPress={() => {
            const y = plateY.current.get(pl.key);
            if (y !== undefined) scrollToBody(y);
          }}
          style={({ pressed }) => [styles.tocRow, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.tocN, { color: ink }]}>{ROMAN[i]}</Text>
          <Text style={[styles.tocT, { color: p.ink }]}>{pl.name}</Text>
          <Dots color={p.ink2} style={styles.leader} />
          <Text style={[styles.tocP, { color: p.ink2 }]}>{`Plate ${ROMAN[i]}`}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A round seal in the story's ink, a little off true: what was checked. */
function Seal({ n, ink }: { n: number; ink: string }) {
  return (
    <View accessible accessibilityLabel={`${n} facts, each with its method, listed at the end`} style={[styles.seal, { borderColor: ink }]}>
      <View style={[styles.sealInner, { borderColor: ink }]} />
      <Text style={[styles.sealK, { color: ink }]}>CHECKED</Text>
      <Text style={[styles.sealN, { color: ink }]}>{n}</Text>
      <Text style={[styles.sealK, { color: ink }]}>FACTS</Text>
      <Text style={[styles.sealK, { color: ink }]}>{'EACH WITH\nITS METHOD'}</Text>
    </View>
  );
}

/** One plate: its number and name, the editor's margin note, the machine's words, the source's slip, the plate as a proof, the coda. */
function PlateSection({ story, plate: pl, n, ink, onY }: { story: PublishedStory; plate: Plate; n: number; ink: string; onY: (y: number) => void }) {
  const p = usePalette();
  const scheme = useScheme();
  const k = useTextScale();
  const pic = story.pictures?.[pl.key]?.[scheme];
  const [failed, setFailed] = useState(false);
  const web = storyUrl(story.slug, pl.key);
  return (
    <View style={{ marginTop: 48 }} onLayout={(e) => onY(e.nativeEvent.layout.y)}>
      <View style={styles.plateHead}>
        <Text style={[styles.plateNo, { color: ink }]}>{ROMAN[n - 1]}</Text>
        <Caps style={{ flex: 1 }}>{`Plate ${ROMAN[n - 1]} · ${pl.name}`}</Caps>
      </View>

      {pl.editorNote ? (
        <View style={[styles.his, { borderLeftColor: p.rule }]}>
          <Image source={CARET} accessible={false} resizeMode="contain" style={[styles.caret, { tintColor: p.ember }]} />
          <Text selectable style={{ fontFamily: fonts.textItalic, fontSize: 17 * k, lineHeight: 25 * k, color: p.ink }}>
            {pl.editorNote}
          </Text>
          <Text style={[styles.hisBy, { color: p.ink2 }]}>
            <Text accessibilityLabel="Bhuvanesh, the editor" style={{ fontFamily: fonts.displayItalic, color: p.ember, fontSize: 15 }}>B.</Text>
            {' on the paper'}
          </Text>
        </View>
      ) : null}

      <MachineText header medium size={21} line={27} style={{ marginTop: 16, letterSpacing: -0.2 }}>
        {pl.headline}
      </MachineText>
      <MachineText size={16.5} line={26} style={{ marginTop: 10 }}>
        {pl.body}
      </MachineText>

      {pl.quote ? (
        <View style={{ marginTop: 24 }}>
          <Quotation text={pl.quote.text} credit={[pl.quote.credit]} extract checked />
        </View>
      ) : null}

      <View style={[styles.plate, { borderColor: p.ink2 }]}>
        <CropMarks color={p.ink} at={12} size={8} />
        <View style={[styles.plateBar, { borderBottomColor: p.ink2 }]}>
          <SeriesNo word="Plate" n={ROMAN[n - 1] ?? String(n)} ink={ink} />
          <Caps style={{ flexShrink: 1, textAlign: 'right' }}>{pl.name}</Caps>
        </View>
        {pic && !failed ? (
          <PlatePicture pic={pic} label={pl.caption} onFail={() => setFailed(true)} style={{ marginTop: 12 }} />
        ) : (
          <Text style={[styles.undrawn, { color: p.ink2 }]}>
            {pic ? 'This plate could not be loaded here. ' : 'This plate is drawn on the website. '}
            <Text accessibilityRole="link" onPress={() => void openSource(web, p)} style={{ color: p.ink, textDecorationLine: 'underline', textDecorationColor: ink }}>
              See it there
            </Text>
          </Text>
        )}
        <Text style={[styles.cap, { color: p.ink2, fontSize: 13 * k, lineHeight: 19.5 * k }]}>
          <Text style={{ color: p.machine }}>{pl.caption}</Text> {plateSourceLine(pl)}.
        </Text>
      </View>

      {pl.coda ? (
        <View style={[styles.coda, { borderTopColor: p.rule }]}>
          <Caps>{pl.coda.label}</Caps>
          <View style={styles.codaRow}>
            {pl.coda.figures.map((f, i) => (
              <View key={i}>
                <Text style={[styles.codaN, { color: i ? ink : p.ink }]}>{f.value}</Text>
                <Text style={[styles.codaT, { color: p.ink2 }]}>{f.text}</Text>
              </View>
            ))}
          </View>
          <MachineText size={16.5} line={26} style={{ marginTop: 12 }}>
            {pl.coda.text}
          </MachineText>
        </View>
      ) : null}
    </View>
  );
}

/** How it was made: the sources, the machine's account, the facts with their methods, the editor's part. */
function Colophon({ story: s }: { story: PublishedStory }) {
  const p = usePalette();
  const k = useTextScale();
  const [open, setOpen] = useState(false);
  const st = s.story;
  const text = { fontFamily: fonts.sans, fontSize: 14 * k, lineHeight: 22 * k, color: p.ink2 };
  const link = { color: p.ink, textDecorationLine: 'underline' as const, textDecorationColor: p.rule };
  return (
    <View style={[styles.colophon, { borderTopColor: p.ink }]}>
      <Caps color={p.ink}>How this was made</Caps>
      <Text style={[text, { marginTop: 10 }]}>Sources:</Text>
      {storySources(st).map((x, i) => (
        <Text key={i} style={[text, { marginTop: 4, paddingLeft: 14 }]}>
          {'·  '}
          <Text accessibilityRole="link" onPress={() => void openSource(x.url, p)} style={link}>
            {`${x.maker}, ${x.dataset}`}
          </Text>
          {` (${x.licence})`}
          {x.via ? (
            <>
              {', via '}
              <Text accessibilityRole="link" onPress={() => void openSource(x.via!.url, p)} style={link}>
                {x.via.name}
              </Text>
              {` (${x.via.licence})`}
            </>
          ) : null}
          {`; retrieved ${day(x.retrieved)}.`}
        </Text>
      ))}
      <Text style={[text, { color: p.machine, marginTop: 12 }]}>
        The machine wrote the words and drew the plates from the rows published with the story, prepared by code from the sources above. Every number in the words is one of the facts below, worked out from those rows by the method given, or a year the plates show; the story is refused at publish if one is not.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={6}
        style={({ pressed }) => [styles.factsRow, { borderTopColor: p.rule, borderBottomColor: open ? p.ink : p.rule, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.factsLabel, { color: p.ink }]}>{`The ${st.facts.length} facts and how each was worked out`}</Text>
        <Text style={[styles.factsMeta, { color: p.ink2 }]}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open
        ? st.facts.map((f) => (
            <View key={f.key} style={[styles.fact, { borderBottomColor: p.rule }]}>
              <Text selectable style={[styles.factV, { color: p.ink, fontSize: 14 * k }]}>{factValue(f.value)}</Text>
              <Text selectable style={[text, { flex: 1 }]}>{f.method}</Text>
            </View>
          ))
        : null}

      <Text style={[text, { marginTop: 14 }]}>
        The editor’s notes in the margin and the standfirst are his own words, checked unchanged against his note
        {s.haul ? (
          <>
            {' on '}
            <Text accessibilityRole="link" onPress={() => go.item(s.haul!.number, s.haul!.itemSlug)} style={link}>
              {s.haul.itemTitle}
            </Text>
          </>
        ) : null}
        . Quotations are matched word for word against the stored source.
      </Text>
      <Text style={[text, { marginTop: 12 }]}>
        {atlasNo(s.number)}
        {s.version > 1 ? `, version ${s.version}, corrected ${day(s.updatedAt)}` : ''}.{' '}
        <Text accessibilityRole="link" onPress={go.atlas} style={link}>
          Every story in the Atlas
        </Text>
        .
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  proof: { marginTop: 30, marginHorizontal: 2, borderWidth: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22 },
  series: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingBottom: 9, borderBottomWidth: 0.5, marginBottom: 22 },
  title: { fontFamily: fonts.display, letterSpacing: -0.8, includeFontPadding: false },
  stand: { fontFamily: fonts.textItalic, marginTop: 16, includeFontPadding: false },
  by: { fontFamily: fonts.sans, marginTop: 14, includeFontPadding: false },
  toc: { marginTop: 26, borderTopWidth: 1 },
  tocRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: 40, paddingVertical: 8 },
  tocN: { width: 34, fontFamily: fonts.displayRegular, fontSize: 16, includeFontPadding: false },
  tocT: { flexShrink: 1, fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 20, includeFontPadding: false },
  leader: { flex: 1, minWidth: 16, alignSelf: 'flex-end', marginBottom: 6 },
  tocP: { fontFamily: fonts.sans, fontSize: 12.5, includeFontPadding: false },
  seal: { width: 124, height: 124, borderRadius: 62, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 26, transform: [{ rotate: '-8deg' }] },
  sealInner: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 56, borderWidth: 1 },
  sealK: { fontFamily: fonts.sansBold, fontSize: 8.5, lineHeight: 11.5, letterSpacing: 1.3, textAlign: 'center', includeFontPadding: false },
  sealN: { fontFamily: fonts.displayRegular, fontSize: 30, lineHeight: 32, marginVertical: 1, includeFontPadding: false, fontVariant: ['lining-nums'] },
  ledgerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 16, paddingTop: 12, paddingBottom: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  ledgerValue: { width: 104, textAlign: 'right', fontFamily: fonts.displayRegular, letterSpacing: -0.5, includeFontPadding: false, fontVariant: ['lining-nums'] },
  movement: { marginTop: 64, borderTopWidth: 2, paddingTop: 12, gap: 6 },
  movementName: { fontFamily: fonts.displayRegular, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, includeFontPadding: false },
  plateHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  plateNo: { fontFamily: fonts.displayRegular, fontSize: 30, lineHeight: 32, includeFontPadding: false },
  his: { marginTop: 18, paddingLeft: 16, borderLeftWidth: StyleSheet.hairlineWidth },
  caret: { position: 'absolute', left: -6, top: -2, width: 11, height: 9 },
  hisBy: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, marginTop: 7 },
  plate: { marginTop: 30, borderWidth: 0.5, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  plateBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingBottom: 8, borderBottomWidth: 0.5 },
  undrawn: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, marginTop: 16, marginBottom: 6 },
  cap: { fontFamily: fonts.sans, marginTop: 12 },
  coda: { marginTop: 30, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  codaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 26, marginTop: 10 },
  codaN: { fontFamily: fonts.displayRegular, fontSize: 46, lineHeight: 48, includeFontPadding: false, fontVariant: ['lining-nums'] },
  codaT: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 18 },
  colophon: { marginTop: 72, borderTopWidth: 2, paddingTop: 14 },
  factsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  factsLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 19, includeFontPadding: false },
  factsMeta: { fontFamily: fonts.sans, fontSize: 12.5, includeFontPadding: false },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  factV: { width: 72, textAlign: 'right', fontFamily: fonts.sansMedium, lineHeight: 22, fontVariant: ['tabular-nums'] },
});
