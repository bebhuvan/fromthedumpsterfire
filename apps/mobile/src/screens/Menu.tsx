// The menu, set as a magazine's contents page: the struck masthead and its strap, then the reading
// (the latest Haul in its edition ink, every Haul, threads, the shelf (always listed; empty until the first books are published), search, saved) and the house (how it's
// made, settings, Hauls by email, a note to the editor), each a line in the display serif with what it holds in the
// text serif and a quiet figure on the right. One loud thing: the masthead.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { haulSlug } from '@fdf/shared/haul';
import { editionInk, editionOf } from '@fdf/shared/tokens';
import { fonts, GUTTER, usePalette, useScheme } from '@/theme';
import { useAllHauls, useIndex, useShelf } from '@/lib/data';
import { useReader } from '@/lib/store';
import { openSource } from '@/lib/open';
import { go } from '@/nav';
import { Flame, Masthead } from '@/ui/parts';
import { Meta } from '@/ui/type';
import { NEIGHBOURS, SLUG } from '@fdf/shared/about';
import { Screen } from '@/ui/screen';
import { EDITOR, mailEditor } from './Settings';

const SUBSCRIBE = 'https://fromthedumpsterfire.com/subscribe';

const titleText = (t: { text: string; italic?: string }) => t.text + (t.italic ? ' ' + t.italic : '');

export function Menu() {
  const p = usePalette();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const index = useIndex().data;
  const hauls = useAllHauls();
  const saved = useReader((s) => s.saved.length);
  const shelf = useShelf().data;
  const latest = index?.hauls[0];
  const threads = new Set(hauls.flatMap((h) => h.threads.map((t) => t.id))).size;
  const count = index?.hauls.length ?? 0;

  return (
    <Screen header={<View style={{ height: insets.top + 28 }} />}>
      <Masthead size={34} />
      <View style={[styles.strap, { borderTopColor: p.ink }]}>
        <Text style={[styles.strapText, { color: p.ink2 }]}>Irregular hauls of things worth salvaging from the internet and the archive, chosen by one editor.</Text>
      </View>

      <Part label="Reading">
        <Line
          first
          title="The latest Haul"
          detail={latest ? titleText(latest.title) : 'The first one is being gathered'}
          figure={latest ? haulSlug(latest.number) : undefined}
          ink={latest ? editionInk[scheme][editionOf(latest.number, latest.edition)] : undefined}
          onPress={go.cover}
        />
        <Line title="Every Haul" detail="Back issues, newest first, each in its own ink" figure={count ? String(count) : undefined} onPress={go.archive} />
        <Line title="Threads" detail="Lines that run across years and Hauls" figure={threads ? String(threads) : undefined} onPress={go.threads} />
        <Line
          title="The shelf"
          detail={shelf?.books.length ? 'The books on the editor’s desk, with a few dated lines on each' : 'The books on the editor’s desk. The first go up soon'}
          figure={shelf?.books.length ? String(shelf.books.length) : undefined}
          onPress={go.shelf}
        />
        <Line title="Search" detail="Every find, and an index of people, places and ideas" onPress={() => go.search()} />
        <Line title="Saved" detail={saved ? 'Kept on this phone, and nowhere else' : 'Nothing yet. Tap Save on any find'} figure={saved ? String(saved) : undefined} onPress={go.saved} />
      </Part>

      <Part label="The house">
        <Line first title="How it's made" detail="Two voices, the forms, and what we promise" onPress={go.about} />
        <Line title="Settings" detail="Appearance, text size, notifications, offline" onPress={go.settings} />
        <Line title="Hauls by email" detail="One email when a Haul is published" onPress={() => openSource(SUBSCRIBE, p)} external />
        <Line title="Send a find or a note" detail={EDITOR} onPress={mailEditor} external />
      </Part>

      {/* The slug and the neighbours (2026-11-09, a signature), as the website's footer sets them. */}
      <View style={[styles.slug, { borderTopColor: p.ink }]}>
        {[['Set in', SLUG.setIn], ['Chosen by', SLUG.chosenBy]].map(([k, v]) => (
          <View key={k} style={[styles.slugRow, { borderBottomColor: p.rule }]}>
            <Meta style={{ width: 76 }}>{k}</Meta>
            <Meta style={{ flex: 1, color: p.ink }}>{v}</Meta>
          </View>
        ))}
      </View>
      <Text style={[styles.nbH, { color: p.ink2 }]}>NEIGHBOURS</Text>
      <Text style={[styles.nb, { color: p.ink }]}>
        {NEIGHBOURS.map((h, i) => (
          <Text key={h}>
            <Text accessibilityRole="link" onPress={() => openSource(`https://${h}`, p)} style={{ textDecorationLine: 'underline', textDecorationColor: p.rule }}>
              {h}
            </Text>
            {i < NEIGHBOURS.length - 1 ? <Text style={{ color: p.ink2, fontFamily: fonts.text }}>{'  ·  '}</Text> : null}
          </Text>
        ))}
      </Text>

      <View style={[styles.foot, { borderTopColor: p.rule, marginTop: 28 }]}>
        <Flame size={8} />
        <Meta style={{ flex: 1 }}>Version {Constants.expoConfig?.version ?? '0'} · fromthedumpsterfire.com</Meta>
      </View>
      <Meta style={{ marginTop: 6 }}>No accounts. No tracking. What you read stays on this phone.</Meta>
    </Screen>
  );
}

function Part({ label, children }: { label: string; children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ marginTop: 38 }}>
      <Text accessibilityRole="header" style={[styles.part, { color: p.ink2 }]}>{label}</Text>
      <View style={{ height: 1, backgroundColor: p.ink, marginTop: 9 }} />
      {children}
    </View>
  );
}

/** One line of the contents. The figure on the right is what the line holds; the latest Haul's is in its edition ink. */
function Line({ title, detail, figure, ink, onPress, first, external }: { title: string; detail: string; figure?: string; ink?: string; onPress: () => void; first?: boolean; external?: boolean }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${detail}${figure ? `. ${figure}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.line, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.rule }, pressed && { opacity: 0.6 }]}
    >
      {ink ? <View style={[styles.inkBar, { backgroundColor: ink }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: p.ink }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.detail, { color: p.ink2 }]}>{detail}</Text>
      </View>
      {figure ? <Text style={[styles.figure, { color: ink ?? p.ink2 }]}>{figure}</Text> : null}
      {external ? <Text style={[styles.ext, { color: p.ink2 }]}>↗</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strap: { marginTop: 18, paddingTop: 12, borderTopWidth: 1 },
  strapText: { fontFamily: fonts.textItalic, fontSize: 17, lineHeight: 25 },
  part: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  line: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  inkBar: { position: 'absolute', left: -GUTTER, top: 15, bottom: 15, width: 4 },
  title: { fontFamily: fonts.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.3, includeFontPadding: false },
  detail: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, marginTop: 3 },
  figure: { fontFamily: fonts.displayRegular, fontSize: 24, lineHeight: 28, includeFontPadding: false, fontVariant: ['lining-nums', 'tabular-nums'] },
  ext: { fontFamily: fonts.sansMedium, fontSize: 16 },
  slug: { marginTop: 44, borderTopWidth: 1 },
  slugRow: { flexDirection: 'row', gap: 12, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  nbH: { fontFamily: fonts.sansMedium, fontSize: 10.5, letterSpacing: 1.5, marginTop: 18 },
  nb: { fontFamily: fonts.textItalic, fontSize: 16, lineHeight: 26, marginTop: 4 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 44, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
