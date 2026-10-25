// The rich media an editor adds to an item (Block in @fdf/shared/haul), in the order given, as the
// website sets them: pull quotes between rules, code on the plate with a numbered gutter and colours by
// role, a video as its poster with a link to watch it on its own site (no web view in the app), audio
// files in the editor's player and podcast episodes as a row that opens their app, pictures with their
// credit and licence, and charts (ui/Chart.tsx).
import { memo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { creditLine, videoHref, type Block } from '@fdf/shared/haul';
import type { CodeRole } from '@fdf/shared/tokens';
import { fonts, usePalette, useTextScale } from '@/theme';
import { clock, CODE_LANGS, codeLines } from '@/lib/code';
import { openSource } from '@/lib/open';
import { Meta } from './type';
import { PlayGlyph, VoiceNote } from './parts';
import { Chart } from './Chart';

export function Blocks({ blocks, source }: { blocks?: Block[]; source?: string }) {
  if (!blocks?.length) return null;
  return (
    <View style={{ marginTop: 34, gap: 34 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'quote':
            return <PullQuote key={i} text={b.text} cap={[b.locator, source].filter(Boolean).join(', ')} />;
          case 'code':
            return <Code key={i} block={b} />;
          case 'video':
            return <Video key={i} block={b} />;
          case 'audio':
            return <AudioBlock key={i} block={b} />;
          case 'image':
            return <Picture key={i} plate={b.plate} />;
          case 'chart':
            return <Chart key={i} block={b} />;
          default:
            return null;
        }
      })}
    </View>
  );
}

/** The source's words between two ink rules, the marks in grey. */
function PullQuote({ text, cap }: { text: string; cap: string }) {
  const p = usePalette();
  const k = useTextScale();
  return (
    <View>
      <View style={[st.pq, { borderColor: p.ink }]}>
        <Text selectable style={[st.pqText, { color: p.ink, fontSize: 25 * k, lineHeight: 31 * k }]}>
          <Text style={{ color: p.ink2 }}>“</Text>
          {text}
          <Text style={{ color: p.ink2 }}>”</Text>
        </Text>
      </View>
      <Meta style={{ marginTop: 8 }}>{cap ? `${cap} · ` : ''}matched word for word against the source</Meta>
    </View>
  );
}

const CODE_SIZE = 13;
const CODE_LINE = 22;

const Code = memo(function Code({ block }: { block: Extract<Block, { kind: 'code' }> }) {
  const p = usePalette();
  const lines = codeLines(block.code, block.tokens);
  const lang = (block.lang && CODE_LANGS[block.lang]) || block.lang || 'Code';
  const color = (r: CodeRole | '') => (r ? p.code[r] : p.ink);
  return (
    <View>
      <View style={[st.codeCap, { borderBottomColor: p.ink }]}>
        <Text style={[st.codeLang, { color: p.ink }]}>{lang.toUpperCase()}</Text>
        {block.caption ? <Text style={[st.codeWhat, { color: p.ink2 }]}>{block.caption}</Text> : null}
      </View>
      {/* The plate runs to the screen's edges, as the website's does on a phone. */}
      <View style={[st.codeWrap, { backgroundColor: p.plate }]} accessible accessibilityLabel={`${lang} code${block.caption ? `: ${block.caption}` : ''}`}>
        <View style={[st.gutter, { borderRightColor: p.rule }]}>
          {lines.map((_, i) => (
            <Text key={i} style={[st.gutN, { color: p.ink2 }]}>{i + 1}</Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.codeScroll}>
          <View>
            {lines.map((line, i) => (
              <Text key={i} selectable style={[st.codeLine, { color: p.ink }]}>
                {line.length ? line.map(([r, t], j) => (r ? <Text key={j} style={{ color: color(r) }}>{t}</Text> : t)) : ' '}
              </Text>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
});

/** The poster in a 16:9 frame with a play key; tapping it, or the line under it, opens the video on its own site. */
function Video({ block }: { block: Extract<Block, { kind: 'video' }> }) {
  const p = usePalette();
  const [failed, setFailed] = useState(false);
  const site = block.provider === 'youtube' ? 'YouTube' : 'Vimeo';
  const open = () => openSource(videoHref(block), p);
  return (
    <View>
      <Pressable accessibilityRole="link" accessibilityLabel={`Watch ${block.title} on ${site}`} onPress={open} style={({ pressed }) => [st.frame, { backgroundColor: p.plate, opacity: pressed ? 0.85 : 1 }]}>
        {block.poster && !failed ? (
          <Image source={{ uri: block.poster.url }} onError={() => setFailed(true)} resizeMode="cover" style={StyleSheet.absoluteFill} accessible={false} />
        ) : (
          <Text style={[st.posterTitle, { color: p.ink2 }]}>{block.title}</Text>
        )}
        <View style={[st.playKey, { backgroundColor: p.invBg }]}>
          <PlayGlyph color={p.invInk} size={13} />
        </View>
      </Pressable>
      <View style={st.playerCap}>
        <Text style={[st.playerT, { color: p.ink }]}>{block.title}</Text>
        <Pressable accessibilityRole="link" onPress={open} hitSlop={8} style={st.linkRow}>
          <Text style={[st.link, { color: p.ink2 }]}>
            Watch on {site}
            {block.start ? ` from ${clock(block.start)}` : ''} ↗
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** An audio file plays in the editor's player; a Spotify or Apple episode is a row that opens its app. */
function AudioBlock({ block }: { block: Extract<Block, { kind: 'audio' }> }) {
  const p = usePalette();
  const app = block.provider === 'spotify' ? 'Spotify' : block.provider === 'apple' ? 'Apple Podcasts' : '';
  const meta = [block.seconds ? clock(block.seconds) : '', block.start ? `start at ${clock(block.start)}` : ''].filter(Boolean).join(' · ');
  return (
    <View>
      <View style={[st.audioCap, { borderBottomColor: p.ink }]}>
        <Text style={[st.playerT, { color: p.ink, flex: 1 }]}>{block.title}</Text>
        {meta ? <Meta>{meta}</Meta> : null}
      </View>
      {block.provider === 'file' ? (
        <View style={{ marginTop: 12 }}>
          <VoiceNote audio={{ url: block.url, seconds: block.seconds ?? 0 }} label="Listen" />
        </View>
      ) : (
        <Pressable accessibilityRole="link" onPress={() => openSource(block.url, p)} style={({ pressed }) => [st.episode, { borderBottomColor: p.rule, opacity: pressed ? 0.6 : 1 }]}>
          <View style={[st.epKey, { borderColor: p.ink }]}>
            <PlayGlyph color={p.ink} size={8} />
          </View>
          <Text style={[st.epText, { color: p.ink }]}>Open in {app}</Text>
          <Text style={[st.ext, { color: p.ink2 }]}>↗</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A picture with its caption, then who holds it and the licence they state. */
export function Picture({ plate, style }: { plate: Extract<Block, { kind: 'image' }>['plate']; style?: object }) {
  const p = usePalette();
  const [failed, setFailed] = useState(false);
  return (
    <View style={style}>
      {failed ? null : (
        <Image
          source={{ uri: plate.url }}
          onError={() => setFailed(true)}
          accessibilityLabel={plate.caption}
          resizeMode="cover"
          style={{ width: '100%', aspectRatio: plate.width / plate.height, backgroundColor: p.plate }}
        />
      )}
      <Text style={[st.caption, { color: p.ink }]}>{plate.caption}</Text>
      <Credit plate={plate} />
    </View>
  );
}

/** Who made a picture, who holds it, the licence, and a link back to where it came from. */
export function Credit({ plate, maker, noBy }: { plate: Extract<Block, { kind: 'image' }>['plate']; maker?: string; noBy?: boolean }) {
  const p = usePalette();
  const from = plate.sourceUrl;
  return (
    <Meta style={{ marginTop: 3 }}>
      {creditLine(plate, { maker, noBy })}
      {from ? (
        <Text accessibilityRole="link" onPress={() => void openSource(from, p)} style={{ textDecorationLine: 'underline' }}>
          {' '}Where it’s from
        </Text>
      ) : null}
    </Meta>
  );
}

const st = StyleSheet.create({
  pq: { paddingTop: 16, paddingBottom: 15, borderTopWidth: 1, borderBottomWidth: 1 },
  pqText: { fontFamily: fonts.displayRegular, letterSpacing: -0.2, includeFontPadding: false },

  codeCap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2, paddingBottom: 8, borderBottomWidth: 1 },
  codeLang: { fontFamily: fonts.sansMedium, fontSize: 11.5, letterSpacing: 1.1, includeFontPadding: false },
  codeWhat: { fontFamily: fonts.textItalic, fontSize: 15.5, includeFontPadding: false },
  codeWrap: { flexDirection: 'row', marginHorizontal: -24 },
  gutter: { paddingVertical: 14, paddingLeft: 16, paddingRight: 9, borderRightWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end' },
  gutN: { fontFamily: fonts.mono, fontSize: 12, lineHeight: CODE_LINE, includeFontPadding: false, opacity: 0.8 },
  codeScroll: { paddingVertical: 14, paddingLeft: 12, paddingRight: 24 },
  codeLine: { fontFamily: fonts.mono, fontSize: CODE_SIZE, lineHeight: CODE_LINE, includeFontPadding: false },

  frame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  posterTitle: { fontFamily: fonts.displayItalic, fontSize: 20, textAlign: 'center', paddingHorizontal: 24 },
  playKey: { position: 'absolute', left: 0, bottom: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  playerCap: { marginTop: 10, gap: 2 },
  playerT: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, includeFontPadding: false },
  linkRow: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },

  audioCap: { flexDirection: 'row', alignItems: 'baseline', gap: 14, paddingBottom: 8, borderBottomWidth: 1 },
  episode: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  epKey: { width: 28, height: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  epText: { flex: 1, fontFamily: fonts.textItalic, fontSize: 17, includeFontPadding: false },
  ext: { fontFamily: fonts.sansMedium, fontSize: 15 },

  caption: { fontFamily: fonts.textItalic, fontSize: 15, lineHeight: 21, marginTop: 10 },
});
