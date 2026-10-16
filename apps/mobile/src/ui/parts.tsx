import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { Audio } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, usePalette } from '@/theme';
import { Meta } from './type';

/** The type key: a small square of the type's colour and its name. Structure, not a badge. */
export const Key = memo(function Key({ type, label, style }: { type: ContentType; label?: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[st.key, style]}>
      <View style={[st.keySq, { backgroundColor: typeColor(p, type), borderColor: p.rule }]} />
      <Text style={[st.keyText, { color: p.ink2 }]}>{label ?? typeLabel[type]}</Text>
    </View>
  );
});

/** The brand flame: a teardrop made from one rotated, three-cornered square. */
export function Flame({ size = 10, color }: { size?: number; color?: string }) {
  const p = usePalette();
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, backgroundColor: color ?? p.ember, borderRadius: size / 2, borderTopRightRadius: 0, transform: [{ rotate: '-45deg' }], marginTop: size * 0.25 }}
    />
  );
}

/**
 * The masthead: From the ~~Internet~~ Dumpster Fire. The strike is an ember rule drawn over the word,
 * because Android ignores textDecorationColor.
 */
export function Masthead({ size = 17 }: { size?: number }) {
  const p = usePalette();
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="From the Dumpster Fire" style={st.mast}>
      <View style={{ marginRight: size * 0.45 }}>
        <Flame size={size * 0.5} />
      </View>
      <Text style={[st.mastText, { fontSize: size, color: p.ink, fontFamily: fonts.displayItalic }]}>From the </Text>
      <View>
        <Text style={[st.mastText, { fontSize: size, color: p.ink2, fontFamily: fonts.displayRegular }]}>Internet</Text>
        <View style={[st.strike, { backgroundColor: p.ember, height: Math.max(1.5, size * 0.09), top: size * 0.33 }]} />
      </View>
      <Text style={[st.mastText, { fontSize: size, color: p.ink, fontFamily: fonts.displayRegular }]}> Dumpster Fire</Text>
    </View>
  );
}

/** The editor's initial: display italic, in ember. The one mark of the hand. */
export function Sign({ size = 20, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={style} accessible accessibilityLabel="Bhuvanesh, the editor">
      <Text style={{ fontFamily: fonts.displayItalic, fontSize: size, color: p.ember, includeFontPadding: false }}>B.</Text>
    </View>
  );
}

/** Arrow drawn with views, so we ship no icon font or SVG runtime. */
export function Arrow({ color, back }: { color: string; back?: boolean }) {
  return (
    <View style={[st.arrow, back && { transform: [{ scaleX: -1 }] }]} accessible={false}>
      <View style={[st.arrowShaft, { backgroundColor: color }]} />
      <View style={[st.arrowHead, { borderColor: color }]} />
    </View>
  );
}

export function PlayGlyph({ color, size = 12 }: { color: string; size?: number }) {
  return <View style={{ width: 0, height: 0, marginLeft: size * 0.2, borderTopWidth: size * 0.6, borderBottomWidth: size * 0.6, borderLeftWidth: size, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color }} />;
}

export function PauseGlyph({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.3 }}>
      <View style={{ width: size * 0.32, height: size * 1.1, backgroundColor: color }} />
      <View style={{ width: size * 0.32, height: size * 1.1, backgroundColor: color }} />
    </View>
  );
}

/** The one action on a screen: italic display words between an ink rule and a hairline, an arrow at the end. */
export function Action({ label, onPress, external, style }: { label: string; onPress: () => void; external?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      onPress={onPress}
      style={({ pressed }) => [st.action, { borderTopColor: p.ink, borderBottomColor: p.rule, opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Text style={[st.actionText, { color: p.ink }]}>{label}</Text>
      {external ? <Text style={[st.actionExt, { color: p.ink }]}>↗</Text> : <Arrow color={p.ink} />}
    </Pressable>
  );
}

export function TopBar({ label, right, tint }: { label: string; right?: string; tint?: string }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.top, { paddingTop: insets.top + 6, backgroundColor: tint }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={go.back} hitSlop={8} style={st.back}>
        <Arrow color={p.ink} back />
        <Text style={[st.backText, { color: p.ink }]}>{label}</Text>
      </Pressable>
      {right ? <Meta style={{ color: p.ink2, fontVariant: ['tabular-nums'] }}>{right}</Meta> : null}
    </View>
  );
}

/** The running head, as in a book: where you are on the left, what you are holding on the right. */
export function RunHead({ left, right }: { left: string; right?: string }) {
  const p = usePalette();
  return (
    <View style={[st.runhead, { borderTopColor: p.rule }]}>
      <Text numberOfLines={1} style={[st.runText, { color: p.ink2, flex: 1 }]}>{left}</Text>
      {right ? <Text style={[st.runText, { color: p.ink2 }]}>{right}</Text> : null}
    </View>
  );
}

/** The foot of a page: the Haul on the left, the folio in ember on the right. */
export function Folio({ haul, n }: { haul: string; n?: number }) {
  const p = usePalette();
  return (
    <View style={st.folio}>
      <Meta>{haul}</Meta>
      {n ? <Text style={[st.folioN, { color: p.ember }]}>{n}</Text> : null}
    </View>
  );
}

export function Section({ title, children, style }: { title: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[{ marginTop: 34 }, style]}>
      <Text accessibilityRole="header" style={[st.sectionTitle, { color: p.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

/** A small sans heading for apparatus (Why it's here, See also). */
export function Apparatus({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={style}>
      <Text accessibilityRole="header" style={[st.apparatus, { color: p.ink2 }]}>{children}</Text>
    </View>
  );
}

export function Divider({ strong }: { strong?: boolean }) {
  const p = usePalette();
  return <View style={{ height: strong ? 1 : StyleSheet.hairlineWidth, backgroundColor: strong ? p.ink : p.rule }} />;
}

const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The editor's voice. The native player is only created on first tap, so a screen full of
 * voice notes costs nothing until someone listens.
 */
export function VoiceNote({ audio, label, compact }: { audio: Audio; label: string; compact?: boolean }) {
  const [active, setActive] = useState(false);
  if (active) return <ActiveVoice audio={audio} label={label} compact={compact} />;
  return <VoiceButton playing={false} label={label} seconds={audio.seconds} compact={compact} onPress={() => setActive(true)} />;
}

function ActiveVoice({ audio, label, compact }: { audio: Audio; label: string; compact?: boolean }) {
  const player = useAudioPlayer(audio.url);
  const status = useAudioPlayerStatus(player);
  const started = useRef(false);
  useEffect(() => {
    if (status.isLoaded && !started.current) {
      started.current = true;
      player.play();
    }
  }, [status.isLoaded, player]);
  const toggle = () => {
    if (status.playing) return player.pause();
    if (status.didJustFinish || status.currentTime >= status.duration - 0.2) player.seekTo(0);
    player.play();
  };
  // At the end the player can report a position just past the duration; a finished note shows its full length again.
  const duration = status.duration > 0 ? status.duration : audio.seconds;
  const finished = status.didJustFinish || (!status.playing && status.currentTime >= duration - 0.2);
  const at = finished ? 0 : Math.min(Math.max(status.currentTime, 0), duration);
  return <VoiceButton playing={status.playing} label={label} seconds={duration - at} compact={compact} onPress={toggle} progress={at / duration} />;
}

/** A square ink key with the glyph, the label in the editor's italic, and a hairline that fills as it plays. */
function VoiceButton({ playing, label, seconds, compact, onPress, progress = 0 }: { playing: boolean; label: string; seconds: number; compact?: boolean; onPress: () => void; progress?: number }) {
  const p = usePalette();
  const a11y = `${playing ? 'Pause' : 'Play'} ${label}, ${mmss(seconds)}`;
  if (compact) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={10} style={st.voiceCompact}>
        <View style={[st.voiceSqSmall, { borderColor: p.ink }]}>{playing ? <PauseGlyph color={p.ink} size={7} /> : <PlayGlyph color={p.ink} size={7} />}</View>
        <Meta style={{ fontVariant: ['tabular-nums'] }}>{mmss(seconds)}</Meta>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => [st.voice, pressed && { opacity: 0.7 }]}>
      <View style={[st.voiceSq, { backgroundColor: p.invBg }]}>{playing ? <PauseGlyph color={p.invInk} /> : <PlayGlyph color={p.invInk} />}</View>
      <View style={{ flex: 1 }}>
        <View style={st.voiceHead}>
          <Text style={[st.voiceLabel, { color: p.ink }]}>{label}</Text>
          <Meta style={{ fontVariant: ['tabular-nums'] }}>{mmss(seconds)}</Meta>
        </View>
        <View style={[st.track, { backgroundColor: p.rule }]}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 1.5, backgroundColor: p.ink }} />
        </View>
      </View>
    </Pressable>
  );
}

export const st = StyleSheet.create({
  key: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  keySq: { width: 9, height: 9, borderWidth: StyleSheet.hairlineWidth },
  keyText: { fontFamily: fonts.sansMedium, fontSize: 12.5, includeFontPadding: false },
  mast: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  mastText: { includeFontPadding: false },
  strike: { position: 'absolute', left: -1, right: -1 },
  arrow: { width: 20, height: 12, justifyContent: 'center' },
  arrowShaft: { height: 1.3, width: 19 },
  arrowHead: { position: 'absolute', right: 1, width: 8, height: 8, borderTopWidth: 1.3, borderRightWidth: 1.3, transform: [{ rotate: '45deg' }] },
  action: { minHeight: 56, borderTopWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  actionText: { flex: 1, fontFamily: fonts.displayItalic, fontSize: 20, includeFontPadding: false },
  actionExt: { fontFamily: fonts.sansMedium, fontSize: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingBottom: 2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  backText: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  runhead: { flexDirection: 'row', gap: 16, marginHorizontal: GUTTER, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  runText: { fontFamily: fonts.sans, fontSize: 12.5, includeFontPadding: false },
  folio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 44 },
  folioN: { fontFamily: fonts.displayRegular, fontSize: 26, includeFontPadding: false, fontVariant: ['lining-nums'] },
  sectionTitle: { fontFamily: fonts.display, fontSize: 23, lineHeight: 28, includeFontPadding: false },
  apparatus: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 },
  voiceSq: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  voiceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  voiceLabel: { fontFamily: fonts.textItalic, fontSize: 17, includeFontPadding: false },
  track: { height: 1.5, marginTop: 10, overflow: 'hidden' },
  voiceCompact: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  voiceSqSmall: { width: 28, height: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
