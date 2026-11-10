// The Atlas, as the website's /data sets it: every published data story, newest first, each with its
// number in its ink, the date, the Haul it came from and its plates, the editor's title and standfirst,
// and its first plate small once the story's pictures are on the phone. Opening the Atlas keeps its
// stories on the phone for offline reading, as the latest Hauls are kept.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haulSlug } from '@fdf/shared/haul';
import { editionInk } from '@fdf/shared/tokens';
import type { DataIndexEntry } from '@fdf/shared/stories/published';
import { fonts, usePalette, useScheme, useTextScale } from '@/theme';
import { go } from '@/nav';
import { useDataIndex, useStory } from '@/lib/data';
import { atlasNo, newestFirst, thumbOf } from '@/lib/atlas';
import { longDate } from '@/lib/format';
import { Body, Meta, Title } from '@/ui/type';
import { TopBar } from '@/ui/parts';
import { Screen } from '@/ui/screen';
import { PlatePicture } from '@/ui/Proof';

export function Atlas() {
  const p = usePalette();
  const { data, status } = useDataIndex();
  const entries = newestFirst(data);
  return (
    <Screen header={<TopBar label="Menu" onBack={go.backToMenu} />}>
      <Meta style={{ marginTop: 18 }}>{entries.length ? (entries.length === 1 ? 'One story' : `${entries.length} stories`) : 'The Atlas'}</Meta>
      <Title title={{ text: 'Atlas' }} size={48} style={{ marginTop: 6 }} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17, lineHeight: 25 }}>
        A data story most weeks, told in numbered plates. Every number on them is checked against the rows it came from.
      </Body>
      <View style={{ marginTop: 26 }}>
        {entries.length ? (
          entries.map((e) => <Entry key={e.slug} entry={e} />)
        ) : (
          <Body style={{ color: p.ink2 }}>
            {status === 'loading' ? 'Looking for stories…' : status === 'offline' ? 'The Atlas has not reached your phone. Connect to the internet once and it will stay here.' : 'No stories yet. The first is being drawn.'}
          </Body>
        )}
      </View>
    </Screen>
  );
}

function Entry({ entry: e }: { entry: DataIndexEntry }) {
  const p = usePalette();
  const scheme = useScheme();
  const k = useTextScale();
  const ink = editionInk[scheme][e.edition];
  const { data } = useStory(e.slug);
  const thumb = thumbOf(data, scheme);
  const [failed, setFailed] = useState(false);
  const meta = [longDate(e.publishedAt.slice(0, 10)), e.haul ? `From Haul ${haulSlug(e.haul.number)}` : null, `${e.plates} plates`].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${atlasNo(e.number)}: ${e.title}. ${meta}`}
      onPress={() => go.story(e.slug)}
      style={({ pressed }) => [styles.entry, { borderTopColor: p.ink, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.no, { color: ink }]}>{`No. ${e.number}`}</Text>
      <Meta style={{ marginTop: 6 }}>{meta}</Meta>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: p.ink }]}>{e.title}</Text>
          <Text style={[styles.stand, { color: p.ink, fontSize: 16 * k, lineHeight: 23.5 * k }]}>{e.standfirst}</Text>
        </View>
        {thumb && !failed ? (
          <View style={[styles.thumb, { borderColor: p.ink2 }]}>
            <PlatePicture pic={thumb} label="" onFail={() => setFailed(true)} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { borderTopWidth: 1, paddingTop: 16, paddingBottom: 26 },
  no: { fontFamily: fonts.displayRegular, fontSize: 30, lineHeight: 32, includeFontPadding: false, fontVariant: ['lining-nums'] },
  row: { flexDirection: 'row', gap: 14, marginTop: 12, alignItems: 'flex-start' },
  title: { fontFamily: fonts.display, fontSize: 29, lineHeight: 31, letterSpacing: -0.3, includeFontPadding: false },
  stand: { fontFamily: fonts.textItalic, marginTop: 10, includeFontPadding: false },
  thumb: { width: 96, borderWidth: StyleSheet.hairlineWidth, padding: 4, marginTop: 4 },
});
