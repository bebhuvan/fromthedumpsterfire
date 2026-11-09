// The field note on its own page (deep links to /haul/<n>/note). The cover carries it too.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { go } from '@/nav';
import { haulSlug, type Haul } from '@fdf/shared/haul';
import { editionOf } from '@fdf/shared/tokens';
import { fonts, typeColor, useEdition, usePalette } from '@/theme';
import { Machine, Title } from '@/ui/type';
import { NoteBody } from '@/ui/NoteBody';
import { Action, Apparatus, Folio, RunHead, Sign, TopBar, VoiceNote, playable } from '@/ui/parts';
import { Screen } from '@/ui/screen';

export function FieldNote({ haul }: { haul: Haul }) {
  const p = usePalette();
  const note = haul.fieldNote;
  const typeOf = new Map(haul.items.map((i) => [i.id, i.type]));
  const thread = haul.threads[0];

  const ed = useEdition(haul);

  return (
    <Screen
      edition={ed}
      header={
        <View>
          <TopBar label={haul.title.text + (haul.title.italic ? ' ' + haul.title.italic : '')} />
          <RunHead haul={haul} right="Field note" />
        </View>
      }
    >
      <Title title={note.title} size={44} style={{ marginTop: 24 }} />

      {note.audio && playable(note.audio) ? (
        <View style={{ marginTop: 22 }}>
          <VoiceNote audio={note.audio} label="Hear it as I said it" />
        </View>
      ) : null}

      <View style={{ marginTop: 22 }}>
        <NoteBody note={note} edition={editionOf(haul.number, haul.edition)} para={styles.para} gap={16} />
      </View>
      <Sign size={24} style={{ alignSelf: 'flex-end', marginTop: 6 }} />

      <View style={{ marginTop: 26 }}>
        <Apparatus style={{ marginBottom: 10 }}>The route</Apparatus>
        {note.route.map((step, i) => {
          const t = step.itemId ? typeOf.get(step.itemId) : undefined;
          const machine = step.by === 'machine';
          const open = step.itemId ? () => go.item(haul.number, step.itemId!) : undefined;
          return (
            <Pressable key={i} disabled={!open} onPress={open} accessibilityRole={open ? 'link' : undefined} style={styles.step}>
              <Text style={[styles.day, { color: machine ? p.machine : p.ink2 }]}>{step.day}</Text>
              <View style={[styles.key, { backgroundColor: t ? typeColor(p, t) : 'transparent', borderColor: t ? p.rule : 'transparent' }]} />
              {machine ? (
                <Machine style={{ flex: 1, fontSize: 14, lineHeight: 21 }}>{step.text}</Machine>
              ) : (
                <Text style={[styles.stepText, { color: p.ink }]}>{step.text}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {thread ? <Action label="Follow the thread" onPress={() => go.thread(haul.number, thread.id)} style={{ marginTop: 30 }} /> : null}
      <Folio haul={`Haul ${haulSlug(haul.number)}`} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  para: { fontFamily: fonts.text, fontSize: 18, lineHeight: 28.5 },
  step: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  day: { width: 40, fontFamily: fonts.sansMedium, fontSize: 12, marginTop: 4 },
  key: { width: 8, height: 8, marginTop: 8, marginRight: 10, borderWidth: StyleSheet.hairlineWidth },
  stepText: { flex: 1, fontFamily: fonts.text, fontSize: 16.5, lineHeight: 23 },
});
