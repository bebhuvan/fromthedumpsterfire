// The Haul cover, as the website sets it: the edition band on the top edge, the Haul's number in its
// edition ink, the title (the loud thing), the deck, and the fingerprint: every object on one line by
// the year it was made. Then the field note and its route, and the contents as specimens of each
// find's own form.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { haulSlug, type Haul } from '@fdf/shared/haul';
import { editionOf } from '@fdf/shared/tokens';
import { fonts, GUTTER, useEdition, usePalette } from '@/theme';
import { longDate, stampDate } from '@/lib/format';
import { useReader } from '@/lib/store';
import { Body, Machine, Meta, Title } from '@/ui/type';
import { Action, Apparatus, Divider, Masthead, Ornament, Sign, TopBar, VoiceNote } from '@/ui/parts';
import { Screen } from '@/ui/screen';
import { Specimen } from '@/ui/Specimen';
import { NoteBody } from '@/ui/NoteBody';
import { Fingerprint, objects } from '@/ui/Fingerprint';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()] ?? '';

/** `back`: opened from the archive, so the head carries the way back instead of the masthead. */
export function Cover({ haul, back }: { haul: Haul; back?: boolean }) {
  const p = usePalette();
  const ed = useEdition(haul);
  const insets = useSafeAreaInsets();
  const place = useReader((s) => s.place);
  const resume = place && place.n === haul.number && place.item ? haul.items.find((i) => i.id === place.item) : undefined;
  const isLatestRead = resume ? haul.items.indexOf(resume) === haul.items.length - 1 : false;
  const note = haul.fieldNote;
  const thread = haul.threads[0];
  const numberOf = new Map(haul.items.map((i, k) => [i.id, k + 1]));
  const len = haul.title.text.length + (haul.title.italic?.length ?? 0);
  const size = len <= 22 ? 54 : len <= 34 ? 48 : 42;

  const header = (
    <View>
      {back ? (
        <TopBar label="Every Haul" />
      ) : (
        <View style={[styles.topRow, { paddingTop: insets.top + 14 }]}>
          <Masthead size={16} />
        </View>
      )}
      <View style={styles.head} accessible accessibilityLabel={`Haul ${haul.number}, ${longDate(haul.publishedAt)}, ${objects(haul.items.length).toLowerCase()}`}>
        <View style={styles.noRow}>
          <Text style={[styles.noH, { color: ed }]}>HAUL</Text>
          <Text style={[styles.noN, { color: ed }]}>{haulSlug(haul.number)}</Text>
        </View>
        <Text style={[styles.noMeta, { color: p.ink2 }]}>
          {weekday(haul.publishedAt)} {longDate(haul.publishedAt)}
          {'\n'}
          {objects(haul.items.length)}
        </Text>
        {/* The date stamp (2026-11-09, a signature), as the website sets it. Decorative: the date and
            corrections are given in words on the cover. */}
        <View style={styles.stamps} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
          <Stamp ink={ed} top="SALVAGED" date={stampDate(haul.publishedAt)} foot={`HAUL ${haulSlug(haul.number)}`} turn="-6deg" />
          {haul.corrections?.length ? <Stamp ink={ed} top="CORRECTED" date={stampDate(haul.corrections.at(-1)!.date)} foot={`VERSION ${haul.version}`} turn="4deg" double /> : null}
        </View>
      </View>
      <View style={{ paddingHorizontal: GUTTER }}>
        <Title title={haul.title} size={size} style={{ marginTop: 14, lineHeight: size * 1.0, letterSpacing: -size * 0.028 }} />
        <Body style={{ marginTop: 16, fontSize: 18.5, lineHeight: 27 }}>{haul.deck}</Body>
        <View style={{ marginTop: 34 }}>
          <Fingerprint haul={haul} />
        </View>
      </View>
    </View>
  );

  return (
    <Screen header={header} edition={ed}>
      {resume && !isLatestRead ? (
        <Pressable accessibilityRole="link" onPress={() => go.item(haul.number, resume.id)} style={({ pressed }) => [styles.resume, { borderColor: p.rule, opacity: pressed ? 0.6 : 1 }]}>
          <Meta>Continue reading, {numberOf.get(resume.id)} of {haul.items.length}</Meta>
          <Text numberOfLines={1} style={[styles.resumeTitle, { color: p.ink }]}>{resume.title.text}{resume.title.italic ? ' ' + resume.title.italic : ''}</Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 44 }}>
        <Title title={note.title} size={32} />
        {note.audio ? (
          <View style={{ marginTop: 18 }}>
            <VoiceNote audio={note.audio} label="Hear it as I said it" />
          </View>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <NoteBody note={note} edition={editionOf(haul.number, haul.edition)} para={styles.para} gap={14} />
        </View>
        <Sign size={24} style={{ alignSelf: 'flex-end', marginTop: 6 }} />
      </View>

      {note.route.length ? (
        <View style={{ marginTop: 26 }}>
          <Apparatus style={{ marginBottom: 10 }}>The route</Apparatus>
          {note.route.map((step, i) => {
            const n = step.itemId ? numberOf.get(step.itemId) : undefined;
            const machine = step.by === 'machine';
            const open = step.itemId ? () => go.item(haul.number, step.itemId!) : undefined;
            return (
              <Pressable key={i} disabled={!open} onPress={open} accessibilityRole={open ? 'link' : undefined} style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}>
                <Text style={[styles.day, { color: machine ? p.machine : p.ink2 }]}>{step.day}</Text>
                {machine ? (
                  <Machine style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>{step.text}</Machine>
                ) : (
                  <Text style={[styles.stepText, { color: p.ink }]}>
                    {step.text}
                    {n ? <Text style={[styles.cite, { color: p.ember }]}>{'  '}{String(n).padStart(2, '0')}</Text> : null}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Ornament style={{ marginTop: 40 }} />
      <View style={{ marginTop: 36 }}>
        <View style={[styles.contentsHead, { borderTopColor: p.ink }]}>
          <Apparatus>In this Haul</Apparatus>
          <Text style={[styles.contentsSub, { color: p.ink2 }]}>{objects(haul.items.length)}, each set in its own printed form</Text>
        </View>
        <View style={{ gap: 48, marginTop: 22 }}>
          {haul.items.map((item, i) => (
            <Specimen key={item.id} haul={haul.number} item={item} n={i + 1} />
          ))}
        </View>
      </View>

      {thread ? (
        <Action label={`Follow the thread: ${thread.title.text}${thread.title.italic ? ' ' + thread.title.italic : ''}`} onPress={() => go.thread(haul.number, thread.id)} style={{ marginTop: 40 }} />
      ) : null}

      <View style={{ marginTop: 36 }}>
        <Apparatus style={{ marginBottom: 8 }}>Colophon</Apparatus>
        <Text style={[styles.colophon, { color: p.ink2 }]}>{haul.colophon}</Text>
      </View>

      {haul.corrections?.length ? (
        <View style={{ marginTop: 22 }}>
          <Apparatus style={{ marginBottom: 6 }}>Corrections</Apparatus>
          {haul.corrections.map((c, i) => (
            <Meta key={i} style={{ marginTop: 6, color: p.ink }}>{longDate(c.date)}: {c.text}</Meta>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 30 }}>
        <Divider />
        <View style={styles.footer}>
          <Pressable accessibilityRole="link" onPress={go.archive} hitSlop={6}><Text style={[styles.footLink, { color: p.ink2 }]}>Every Haul</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={go.about} hitSlop={6}><Text style={[styles.footLink, { color: p.ink2 }]}>How it's made</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={go.menu} hitSlop={6}><Text style={[styles.footLink, { color: p.ink2 }]}>Menu</Text></Pressable>
        </View>
      </View>
    </Screen>
  );
}

/** A library date stamp in the Haul's ink, a few degrees off true. */
function Stamp({ ink, top, date, foot, turn, double }: { ink: string; top: string; date: string; foot: string; turn: string; double?: boolean }) {
  const face = (
    <>
      <Text style={[styles.stampK, { color: ink }]}>{top}</Text>
      <Text style={[styles.stampD, { color: ink }]}>{date}</Text>
      <Text style={[styles.stampK, { color: ink }]}>{foot}</Text>
    </>
  );
  // React Native has no double border: the corrected stamp is a ruled box inside a ruled box.
  return double ? (
    <View style={[styles.stampOuter, { borderColor: ink, transform: [{ rotate: turn }] }]}>
      <View style={[styles.stamp, { borderColor: ink, borderWidth: 1, opacity: 1 }]}>{face}</View>
    </View>
  ) : (
    <View style={[styles.stamp, { borderColor: ink, transform: [{ rotate: turn }] }]}>{face}</View>
  );
}

const styles = StyleSheet.create({
  topRow: { paddingHorizontal: GUTTER, minHeight: 36, justifyContent: 'center' },
  head: { paddingHorizontal: GUTTER, marginTop: 26 },
  stamps: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, marginLeft: 3 },
  stamp: { borderWidth: 2, paddingHorizontal: 9, paddingTop: 4, paddingBottom: 3, alignItems: 'center', opacity: 0.85 },
  stampOuter: { borderWidth: 1, padding: 2, opacity: 0.85 },
  stampK: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.4 },
  stampD: { fontFamily: fonts.displayRegular, fontSize: 19, lineHeight: 22, marginVertical: 1 },
  noRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  noH: { fontFamily: fonts.sansMedium, fontSize: 13, letterSpacing: 1.6, includeFontPadding: false },
  noN: { fontFamily: fonts.displayRegular, fontSize: 54, lineHeight: 54, letterSpacing: -1.6, includeFontPadding: false, fontVariant: ['lining-nums'] },
  noMeta: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, marginTop: 6 },
  resume: { marginTop: 30, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  resumeTitle: { fontFamily: fonts.displayItalic, fontSize: 19 },
  para: { fontFamily: fonts.text, fontSize: 18, lineHeight: 27.5 },
  step: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  day: { width: 44, fontFamily: fonts.sansMedium, fontSize: 12, marginTop: 4 },
  stepText: { flex: 1, fontFamily: fonts.text, fontSize: 16, lineHeight: 23 },
  cite: { fontFamily: fonts.sansMedium, fontSize: 11, fontVariant: ['tabular-nums'] },
  contentsHead: { borderTopWidth: 1, paddingTop: 10, gap: 4 },
  contentsSub: { fontFamily: fonts.textItalic, fontSize: 15.5, lineHeight: 21 },
  colophon: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 23 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  footLink: { fontFamily: fonts.sansMedium, fontSize: 13, paddingVertical: 14 },
});
