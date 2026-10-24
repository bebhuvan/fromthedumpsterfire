// How it's made, in the magazine's own forms (as on the website): the title as a magazine opening,
// the two voices as a transcript with B. and MACHINE in the margin, the promises as numbered house
// rules each with the check that keeps it, and a key to the printed forms.
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { fonts, typeColor, usePalette } from '@/theme';
import { formGuide, formName } from '@/lib/forms';
import { Body, Machine, Meta, Note, Title } from '@/ui/type';
import { Flame, TopBar } from '@/ui/parts';
import { Screen } from '@/ui/screen';

const RULES = [
  { rule: 'Every quotation is matched word for word against its source.', how: 'Each excerpt is compared with the text of the source as fetched. If it does not match, it does not ship.' },
  { rule: 'Every link is fetched and working when a Haul ships.', how: 'Machines never write links. Code finds each one in a real source and fetches it before publishing.' },
  { rule: 'Every note from the machine names its source.', how: 'Each note is checked against the source it cites. A note that fails the check is dropped.' },
  { rule: "The editor's words are never rewritten.", how: 'Voice notes are cleaned only by deleting fillers and fixing punctuation. The code allows nothing else.' },
  { rule: 'No generated images.', how: 'Plates come from public-domain archives, with the licence printed under each one.' },
];

function Head({ children }: { children: string }) {
  const p = usePalette();
  return (
    <View style={{ marginTop: 44 }}>
      <Text accessibilityRole="header" style={[styles.head, { color: p.ink }]}>{children}</Text>
      <View style={{ height: 1, backgroundColor: p.ink, marginTop: 10 }} />
    </View>
  );
}

export function About() {
  const p = usePalette();
  return (
    <Screen header={<TopBar label="Back" />}>
      <Meta style={{ marginTop: 18 }}>About · Five house rules</Meta>
      <Title title={{ text: "How it's", italic: 'made' }} size={52} style={{ marginTop: 10, lineHeight: 52, letterSpacing: -1.4 }} />
      <Body style={{ marginTop: 16 }}>
        From the Dumpster Fire is a magazine of things worth pulling out of the internet and the archive before they burn: essays and talks, letters and speeches, poems, papers, podcasts, posts, pictures, passages from books, tools worth knowing and strange corners of Wikipedia. It arrives in Hauls, when there is enough worth sending.
      </Body>

      <Head>Two voices</Head>
      <View style={styles.turn}>
        <Text style={[styles.whoEd, { color: p.ember }]}>B.</Text>
        <Note style={{ flex: 1 }}>This is the editor. One person chooses everything, mostly by voice, and every word set like this is theirs.</Note>
      </View>
      <View style={[styles.turn, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.rule }]}>
        <Text style={[styles.who, { color: p.machine }]}>MACHINE</Text>
        <Machine style={{ flex: 1 }}>This is the machine. It reads each piece closely, finds connections across time, drafts context and checks facts. Anything it writes is set like this, and the editor checks it before it ships.</Machine>
      </View>

      <Head>What we promise</Head>
      {RULES.map((r, i) => (
        <View key={r.rule} style={[styles.rule, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.rule }]}>
          <Text style={[styles.num, { color: p.ember }]}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ruleText, { color: p.ink }]}>{r.rule}</Text>
            <Text style={[styles.how, { color: p.ink2 }]}>{r.how}</Text>
          </View>
        </View>
      ))}

      <Head>The forms</Head>
      <Body style={{ marginTop: 14, fontSize: 16.5, lineHeight: 24, color: p.ink2 }}>Each kind of thing is set in the printed form it has always had, so you know what you are holding before you read a word.</Body>
      {formGuide.map((f, i) => (
        <View key={f.type} style={[styles.form, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.rule }]}>
          <View style={[styles.swatch, { backgroundColor: typeColor(p, f.type), borderColor: p.rule }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.formName, { color: p.ink }]}>
              {f.name}
              <Text style={[styles.formAs, { color: p.ink2 }]}>{`  ${formName[f.form]}`}</Text>
            </Text>
            <Text style={[styles.how, { color: p.ink2 }]}>{f.detail}</Text>
          </View>
        </View>
      ))}

      <View style={[styles.foot, { borderTopColor: p.rule }]}>
        <Flame size={8} />
        <Meta>Version {Constants.expoConfig?.version ?? '0'} · fromthedumpsterfire.com</Meta>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, includeFontPadding: false },
  turn: { flexDirection: 'row', gap: 14, paddingVertical: 16 },
  whoEd: { width: 70, fontFamily: fonts.displayItalic, fontSize: 22, lineHeight: 28 },
  who: { width: 70, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.1, lineHeight: 22 },
  rule: { flexDirection: 'row', gap: 14, paddingVertical: 14 },
  num: { width: 18, fontFamily: fonts.displayRegular, fontSize: 22, lineHeight: 25, textAlign: 'right', fontVariant: ['lining-nums'] },
  ruleText: { fontFamily: fonts.text, fontSize: 17.5, lineHeight: 25 },
  how: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21.5, marginTop: 4 },
  form: { flexDirection: 'row', gap: 14, paddingVertical: 13 },
  swatch: { width: 14, height: 14, marginTop: 5, borderWidth: StyleSheet.hairlineWidth },
  formName: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24 },
  formAs: { fontFamily: fonts.sansMedium, fontSize: 12.5 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 44, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
