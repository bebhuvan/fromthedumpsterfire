import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { Audio } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, usePalette } from '@/theme';
import { Label, Meta } from './type';

export const Chip = memo(function Chip({ type, label, onSwatch }: { type: ContentType; label?: string; onSwatch?: boolean }) {
  const p = usePalette();
  return (
    <View style={[st.chip, { backgroundColor: onSwatch ? p.bg : typeColor(p, type) }]}>
      <Text style={[st.chipText, { color: p.ink }]}>{label ?? typeLabel[type]}</Text>
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

/** The inverted pill used for the one primary action on a screen. */
export function Pill({ label, onPress, external, style }: { label: string; onPress: () => void; external?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      onPress={onPress}
      style={({ pressed }) => [st.pill, { backgroundColor: p.invBg, opacity: pressed ? 0.85 : 1 }, style]}
    >
      <Text style={[st.pillText, { color: p.invInk }]}>{label}</Text>
      {external ? <Text style={[st.pillExt, { color: p.invInk }]}>↗</Text> : <Arrow color={p.invInk} />}
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
        <Label>{label}</Label>
      </Pressable>
      {right ? <Meta style={{ color: p.ink, fontVariant: ['tabular-nums'] }}>{right}</Meta> : null}
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

export function Divider() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.rule }} />;
}

const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The editor's voice. The native player is only created on first tap, so a screen full of
 * voice notes costs nothing until someone listens.
 */
// iOS cannot play WebM or Ogg; the Desk marks such notes with their format, and on iOS they are left out.
export const playable = (a: Audio) => !(Platform.OS === 'ios' && (a.format === 'webm' || a.format === 'ogg'));

export function VoiceNote({ audio, label, compact }: { audio: Audio; label: string; compact?: boolean }) {
  const [active, setActive] = useState(false);
  if (!playable(audio)) return null;
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

function VoiceButton({ playing, label, seconds, compact, onPress, progress = 0 }: { playing: boolean; label: string; seconds: number; compact?: boolean; onPress: () => void; progress?: number }) {
  const p = usePalette();
  const a11y = `${playing ? 'Pause' : 'Play'} ${label}, ${mmss(seconds)}`;
  if (compact) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={10} style={st.voiceCompact}>
        <View style={[st.voiceDotSmall, { backgroundColor: p.plate }]}>{playing ? <PauseGlyph color={p.ink} size={8} /> : <PlayGlyph color={p.ink} size={8} />}</View>
        <Meta style={{ fontVariant: ['tabular-nums'] }}>{mmss(seconds)}</Meta>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={[st.voice, { backgroundColor: p.plate }]}>
      <View style={[st.voiceDot, { backgroundColor: p.invBg }]}>{playing ? <PauseGlyph color={p.invInk} /> : <PlayGlyph color={p.invInk} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={[st.voiceLabel, { color: p.ink }]}>{label}</Text>
        <View style={[st.track, { backgroundColor: p.rule }]}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 2, backgroundColor: p.ink }} />
        </View>
      </View>
      <Meta style={{ fontVariant: ['tabular-nums'] }}>{mmss(seconds)}</Meta>
    </Pressable>
  );
}

export const st = StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  chipText: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', includeFontPadding: false },
  arrow: { width: 20, height: 12, justifyContent: 'center' },
  arrowShaft: { height: 1.3, width: 19 },
  arrowHead: { position: 'absolute', right: 1, width: 8, height: 8, borderTopWidth: 1.3, borderRightWidth: 1.3, transform: [{ rotate: '45deg' }] },
  pill: { minHeight: 52, borderRadius: 99, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  pillText: { fontFamily: fonts.displayItalic, fontSize: 18, includeFontPadding: false },
  pillExt: { fontFamily: fonts.sansMedium, fontSize: 15 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingBottom: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 23, lineHeight: 28, includeFontPadding: false },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 99, paddingVertical: 6, paddingLeft: 6, paddingRight: 18 },
  voiceDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  voiceLabel: { fontFamily: fonts.textItalic, fontSize: 16, includeFontPadding: false },
  track: { height: 2, marginTop: 8, borderRadius: 1, overflow: 'hidden' },
  voiceCompact: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  voiceDotSmall: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
