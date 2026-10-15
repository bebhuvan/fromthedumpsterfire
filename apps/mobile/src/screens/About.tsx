import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { usePalette } from '@/theme';
import { Body, Machine, Meta, Note, Title } from '@/ui/type';
import { Section, TopBar } from '@/ui/parts';
import { Screen } from '@/ui/screen';

export function About() {
  const p = usePalette();
  return (
    <Screen header={<TopBar label="Latest" />}>
      <Title title={{ text: "How it's", italic: 'made' }} size={44} style={{ marginTop: 16 }} />
      <Body style={{ marginTop: 14 }}>
        From the Dumpster Fire is a magazine of things worth pulling out of the internet and the archive before they burn: essays, talks, papers, poems, podcasts, passages and strange corners of Wikipedia. It arrives in Hauls, when there is enough worth sending.
      </Body>

      <Section title="Two voices">
        <View style={[styles.voices, { borderColor: p.rule }]}>
          <View style={styles.voice}>
            <Note>This is the editor. One person chooses everything, mostly by voice, and every word set like this is theirs.</Note>
          </View>
          <View style={[styles.voice, { backgroundColor: p.plate }]}>
            <Machine>This is the machine. It reads each piece closely, finds connections across time, drafts context and checks facts. Anything it writes is set like this, and the editor checks it before it ships.</Machine>
          </View>
        </View>
      </Section>

      <Section title="What we promise">
        <View style={{ marginTop: 10, gap: 10 }}>
          {[
            'Every quotation is matched word for word against its source.',
            'Every link is fetched and working when a Haul ships.',
            'Every note from the machine names its source.',
            "The editor's words are never rewritten.",
            'No generated images. Plates come from the public domain.',
          ].map((line) => (
            <View key={line} style={styles.promise}>
              <View style={[styles.bullet, { backgroundColor: p.machine }]} />
              <Body style={{ flex: 1, fontSize: 17, lineHeight: 25 }}>{line}</Body>
            </View>
          ))}
        </View>
      </Section>

      <Meta style={{ marginTop: 40 }}>Version {Constants.expoConfig?.version ?? '0'} · fromthedumpsterfire.com</Meta>
    </Screen>
  );
}

const styles = StyleSheet.create({
  voices: { marginTop: 12, gap: 10 },
  voice: { borderRadius: 16, padding: 18 },
  promise: { flexDirection: 'row', gap: 12 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 10 },
});
