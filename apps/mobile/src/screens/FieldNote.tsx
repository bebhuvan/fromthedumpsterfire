import { Pressable, StyleSheet, Text, View } from 'react-native';
import { go } from '@/nav';
import type { Haul } from '@fdf/shared/haul';
import { fonts, typeColor, usePalette } from '@/theme';
import { Highlighted, Label, Machine, Title } from '@/ui/type';
import { Chip, Divider, Pill, TopBar, VoiceNote, playable } from '@/ui/parts';
import { Screen } from '@/ui/screen';

export function FieldNote({ haul }: { haul: Haul }) {
  const p = usePalette();
  const note = haul.fieldNote;
  const typeOf = new Map(haul.items.map((i) => [i.id, i.type]));
  const thread = haul.threads[0];

  return (
    <Screen header={<TopBar label={`Haul ${haul.number}`} />}>
      <View style={{ marginTop: 16 }}>
        <Chip type="talk" label="Field note" />
      </View>
      <Title title={note.title} size={44} style={{ marginTop: 14 }} />

      {note.audio && playable(note.audio) ? (
        <View style={{ marginTop: 22 }}>
          <VoiceNote audio={note.audio} label="Hear it as I said it" />
        </View>
      ) : null}

      <View style={{ marginTop: 24, gap: 16 }}>
        {note.paragraphs.map((para, i) => (
          <Highlighted key={i} text={para} highlight={note.highlight} color={p.swatch.butter} style={styles.para} />
        ))}
        <Text style={[styles.sign, { color: p.ink }]}>B.</Text>
      </View>

      <View style={{ marginTop: 30 }}>
        <Divider />
        <View style={styles.routeHead}>
          <Text accessibilityRole="header" style={[styles.routeTitle, { color: p.ink }]}>The route</Text>
          <Label muted>How this Haul was found</Label>
        </View>
        <View>
          <View style={[styles.spine, { backgroundColor: p.rule }]} />
          {note.route.map((step, i) => {
            const t = step.itemId ? typeOf.get(step.itemId) : undefined;
            const machine = step.by === 'machine';
            const open = step.itemId ? () => go.item(haul.number, step.itemId!) : undefined;
            return (
              <Pressable key={i} disabled={!open} onPress={open} accessibilityRole={open ? 'link' : undefined} style={styles.step}>
                <Text style={[styles.day, { color: machine ? p.machine : p.ink2 }]}>{step.day}</Text>
                <View
                  style={[
                    styles.dot,
                    machine
                      ? { borderWidth: 1.5, borderColor: p.machine, backgroundColor: p.bg }
                      : { backgroundColor: t ? typeColor(p, t) : p.rule, borderWidth: 1, borderColor: p.ink2 },
                  ]}
                />
                {machine ? (
                  <Machine style={{ flex: 1, fontSize: 14 }}>{step.text}</Machine>
                ) : (
                  <Text style={[styles.stepText, { color: p.ink }]}>{step.text}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {thread ? (
        <Pill label="Follow the thread" onPress={() => go.thread(haul.number, thread.id)} style={{ marginTop: 30 }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  para: { fontFamily: fonts.text, fontSize: 18.5, lineHeight: 28, fontVariant: ['oldstyle-nums'] },
  sign: { fontFamily: fonts.displayItalic, fontSize: 21, textAlign: 'right' },
  routeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 10 },
  routeTitle: { fontFamily: fonts.display, fontSize: 24 },
  spine: { position: 'absolute', left: 50, top: 18, bottom: 18, width: StyleSheet.hairlineWidth * 2 },
  step: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9 },
  day: { width: 40, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 4 },
  dot: { width: 11, height: 11, borderRadius: 6, marginTop: 6, marginRight: 13 },
  stepText: { flex: 1, fontFamily: fonts.text, fontSize: 16.5, lineHeight: 23 },
});
