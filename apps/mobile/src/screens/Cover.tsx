// The Haul cover. One loud thing: the Haul number, huge in the Haul's colour, running off the right
// edge. Then the field note and its route, and the contents as specimens of each find's own form.
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { haulSlug, type Haul } from '@fdf/shared/haul';
import { fonts, GUTTER, typeColor, usePalette } from '@/theme';
import { longDate } from '@/lib/format';
import { useReader } from '@/lib/store';
import { Body, Highlighted, Machine, Meta, Title } from '@/ui/type';
import { Action, Apparatus, Divider, Masthead, SettingsLink, Sign, VoiceNote } from '@/ui/parts';
import { Screen } from '@/ui/screen';
import { Specimen } from '@/ui/Specimen';

export function Cover({ haul }: { haul: Haul }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const place = useReader((s) => s.place);
  const resume = place && place.n === haul.number && place.item ? haul.items.find((i) => i.id === place.item) : undefined;
  const isLatestRead = resume ? haul.items.indexOf(resume) === haul.items.length - 1 : false;
  const note = haul.fieldNote;
  const thread = haul.threads[0];
  const typeOf = new Map(haul.items.map((i) => [i.id, i.type]));
  const N = Math.round(width * 0.54);

  const header = (
    <View style={{ paddingTop: insets.top + 12, overflow: 'hidden' }}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Masthead size={16} />
        </View>
        <SettingsLink />
      </View>
      <View style={{ height: N * 0.84, marginTop: 4 }} accessible accessibilityLabel={`Haul number ${haul.number}`}>
        <Text numberOfLines={1} style={[styles.numeral, { color: p.swatch[haul.swatch], fontSize: N, lineHeight: N * 0.86, width: N * 2.2, right: -N * 0.16 }]}>
          {haulSlug(haul.number)}
        </Text>
      </View>
      <View style={{ paddingHorizontal: GUTTER, marginTop: -N * 0.18 }}>
        <Meta>Haul {haulSlug(haul.number)} · {longDate(haul.publishedAt)} · {haul.items.length} objects</Meta>
        <Title title={haul.title} size={52} style={{ marginTop: 10, lineHeight: 52 * 0.98, letterSpacing: -1.4 }} />
        <Body style={{ marginTop: 14, fontSize: 18, lineHeight: 26 }}>{haul.deck}</Body>
      </View>
    </View>
  );

  return (
    <Screen header={header}>
      {resume && !isLatestRead ? (
        <Pressable accessibilityRole="link" onPress={() => go.item(haul.number, resume.id)} style={({ pressed }) => [styles.resume, { borderColor: p.rule, opacity: pressed ? 0.6 : 1 }]}>
          <Meta>Continue reading</Meta>
          <Text numberOfLines={1} style={[styles.resumeTitle, { color: p.ink }]}>{resume.title.text}{resume.title.italic ? ' ' + resume.title.italic : ''}</Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 40 }}>
        <Title title={note.title} size={32} />
        {note.audio ? (
          <View style={{ marginTop: 18 }}>
            <VoiceNote audio={note.audio} label="Hear it as I said it" />
          </View>
        ) : null}
        <View style={{ marginTop: 16, gap: 14 }}>
          {note.paragraphs.map((para, i) => (
            <Highlighted key={i} text={para} highlight={note.highlight} color={p.swatch.butter} style={styles.para} />
          ))}
        </View>
        <Sign size={24} style={{ alignSelf: 'flex-end', marginTop: 6 }} />
      </View>

      <View style={{ marginTop: 26 }}>
        <Apparatus style={{ marginBottom: 10 }}>The route</Apparatus>
        {note.route.map((step, i) => {
          const t = step.itemId ? typeOf.get(step.itemId) : undefined;
          const machine = step.by === 'machine';
          const open = step.itemId ? () => go.item(haul.number, step.itemId!) : undefined;
          return (
            <Pressable key={i} disabled={!open} onPress={open} accessibilityRole={open ? 'link' : undefined} style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.day, { color: machine ? p.machine : p.ink2 }]}>{step.day}</Text>
              <View style={[styles.stepKey, { backgroundColor: t ? typeColor(p, t) : 'transparent', borderColor: t ? p.rule : 'transparent' }]} />
              {machine ? (
                <Machine style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>{step.text}</Machine>
              ) : (
                <Text style={[styles.stepText, { color: p.ink }]}>{step.text}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 40 }}>
        <Apparatus style={{ marginBottom: 14 }}>In this Haul</Apparatus>
        <View style={{ gap: 34 }}>
          {haul.items.map((item, i) => (
            <Specimen key={item.id} haul={haul.number} item={item} n={i + 1} />
          ))}
        </View>
      </View>

      {thread ? (
        <Action label={`Follow the thread: ${thread.title.text}${thread.title.italic ? ' ' + thread.title.italic : ''}`} onPress={() => go.thread(haul.number, thread.id)} style={{ marginTop: 36 }} />
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
          <Pressable accessibilityRole="link" onPress={go.archive}><Text style={[styles.footLink, { color: p.ink2 }]}>Every Haul</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={go.about}><Text style={[styles.footLink, { color: p.ink2 }]}>How it's made</Text></Pressable>
          <Pressable accessibilityRole="link" onPress={go.settings}><Text style={[styles.footLink, { color: p.ink2 }]}>Settings</Text></Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { paddingHorizontal: GUTTER, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 12 },
  numeral: { position: 'absolute', top: 0, fontFamily: fonts.display, textAlign: 'right', letterSpacing: -8, includeFontPadding: false, fontVariant: ['lining-nums'] },
  resume: { marginTop: 26, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  resumeTitle: { fontFamily: fonts.displayItalic, fontSize: 19 },
  para: { fontFamily: fonts.text, fontSize: 18, lineHeight: 27.5 },
  step: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  day: { width: 40, fontFamily: fonts.sansMedium, fontSize: 12, marginTop: 4 },
  stepKey: { width: 8, height: 8, marginTop: 8, marginRight: 10, borderWidth: StyleSheet.hairlineWidth },
  stepText: { flex: 1, fontFamily: fonts.text, fontSize: 16, lineHeight: 23 },
  colophon: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 23 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  footLink: { fontFamily: fonts.sansMedium, fontSize: 13, paddingVertical: 14 },
});
