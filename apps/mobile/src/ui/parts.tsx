import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { haulSlug, type Audio, type Haul } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { fonts, GUTTER, typeColor, useEdition, usePalette } from '@/theme';
import { Meta } from './type';
import { MiniFingerprint } from './Fingerprint';

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

/** The brand mark: one ember flame with the globe cut out of it (the internet, on fire). A white PNG tinted ember. */
const FLAME = require('../../assets/marks/flame.png');
export function Flame({ size = 10, color }: { size?: number; color?: string }) {
  const p = usePalette();
  const h = Math.round(size * 1.9);
  return <Image source={FLAME} accessible={false} resizeMode="contain" style={{ height: h, width: Math.round(h * (55 / 107)), tintColor: color ?? p.ember }} />;
}

const STRIKE = require('../../assets/marks/strike.png');
const CARET = require('../../assets/marks/caret.png');

/**
 * The masthead, set as an editor's correction on a proof: From the ~~Internet~~ Dumpster Fire, with
 * "Internet" struck through by hand and a proofreader's caret where "Dumpster Fire" goes in. The marks
 * are the website's (apps/web/public/marks), pre-rendered white and tinted ember, since the app has no
 * SVG runtime. Screen readers hear the real name.
 */
export function Masthead({ size = 17, flame = true }: { size?: number; flame?: boolean }) {
  const p = usePalette();
  const word = { fontSize: size, lineHeight: Math.round(size * 1.22) };
  // The strike is stretched over the word as drawn, so it needs the word's measured width (an Image
  // otherwise takes its file's size).
  const [w, setW] = useState(size * 3.9);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="From the Dumpster Fire" style={st.mast}>
      {flame ? (
        <View style={{ marginRight: size * 0.42, alignSelf: 'center' }}>
          <Flame size={size * 0.5} />
        </View>
      ) : null}
      <Text allowFontScaling={false} numberOfLines={1} style={[st.mastText, word, { color: p.ink, fontFamily: fonts.displayItalic, marginRight: size * 0.25 }]}>{'From\u00A0the'}</Text>
      <View style={st.mastWord}>
        <View>
          <Text allowFontScaling={false} numberOfLines={1} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[st.mastText, word, { color: p.ink2, fontFamily: fonts.displayRegular }]}>Internet</Text>
          <Image
            source={STRIKE}
            resizeMode="stretch"
            accessible={false}
            style={{ position: 'absolute', left: -size * 0.06, top: size * 0.43, width: w + size * 0.14, height: size * 0.3, tintColor: p.ember }}
          />
        </View>
        <Image
          source={CARET}
          resizeMode="contain"
          accessible={false}
          style={{ width: size * 0.32, height: size * 0.25, marginLeft: size * 0.02, marginRight: size * 0.04, marginBottom: size * 0.15, tintColor: p.ember }}
        />
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={[st.mastText, word, { color: p.ink, fontFamily: fonts.displayRegular }]}>{'Dumpster\u00A0Fire'}</Text>
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

/** Back, with where it goes back to; a quiet word on the right (the item's place in the Haul). */
export function TopBar({ label, right, onBack = go.back }: { label: string; right?: string; onBack?: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.top, { paddingTop: insets.top + 6 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label === 'Back' ? 'Back' : `Back to ${label}`} onPress={onBack} hitSlop={8} style={({ pressed }) => [st.back, { flexShrink: 1 }, pressed && { opacity: 0.6 }]}>
        <Arrow color={p.ink} back />
        <Text numberOfLines={1} style={[st.backText, { color: p.ink, flexShrink: 1 }]}>{label}</Text>
      </Pressable>
      {right ? <Meta style={{ color: p.ink2, fontVariant: ['tabular-nums'] }}>{right}</Meta> : null}
    </View>
  );
}

/** The page head of a top-level screen: the small masthead, as the website's header carries it. */
export function PageHead() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.pageHead, { paddingTop: insets.top + 14 }]}>
      <Masthead size={16} />
    </View>
  );
}

/**
 * The running head, as in a book: the Haul on the left in its edition ink, its fingerprint with this
 * item drawn tall, and the form the item is set in on the right. (The Haul's title rides in the bar
 * above, as the way back to its cover, so nothing here has to be cut short.)
 */
export function RunHead({ haul, right, current }: { haul: Haul; right?: string; current?: string }) {
  const p = usePalette();
  const ed = useEdition(haul);
  return (
    <View style={[st.runhead, { borderTopColor: p.rule }]}>
      <Text style={[st.runText, { color: ed, fontFamily: fonts.sansMedium }]}>Haul {haulSlug(haul.number)}</Text>
      <View style={{ flex: 1 }}>
        <MiniFingerprint haul={haul} current={current} width={88} />
      </View>
      {right ? <Text numberOfLines={1} style={[st.runText, { color: p.ink2 }]}>{right}</Text> : null}
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

// iOS cannot play WebM or Ogg; the Desk marks such notes with their format, and on iOS they are left out.
export const playable = (a: Audio) => !(Platform.OS === 'ios' && (a.format === 'webm' || a.format === 'ogg'));

/**
 * The editor's voice (and any audio file an item carries). The native player is only created on first
 * tap, so a screen full of voice notes costs nothing until someone listens.
 */
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
  const finished = status.didJustFinish || (!status.playing && duration > 0 && status.currentTime >= duration - 0.2);
  const at = finished ? 0 : Math.min(Math.max(status.currentTime, 0), duration);
  return <VoiceButton playing={status.playing} label={label} seconds={duration - at} compact={compact} onPress={toggle} progress={duration > 0 ? at / duration : 0} />;
}

/** A square ink key with the glyph, the label in the editor's italic, and a hairline that fills as it plays. */
function VoiceButton({ playing, label, seconds, compact, onPress, progress = 0 }: { playing: boolean; label: string; seconds: number; compact?: boolean; onPress: () => void; progress?: number }) {
  const p = usePalette();
  // Audio of unknown length shows no clock until the player knows it.
  const time = seconds > 0 ? mmss(seconds) : '';
  const a11y = `${playing ? 'Pause' : 'Play'} ${label}${time ? `, ${time}` : ''}`;
  if (compact) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={10} style={st.voiceCompact}>
        <View style={[st.voiceSqSmall, { borderColor: p.ink }]}>{playing ? <PauseGlyph color={p.ink} size={7} /> : <PlayGlyph color={p.ink} size={7} />}</View>
        {time ? <Meta style={{ fontVariant: ['tabular-nums'] }}>{time}</Meta> : null}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => [st.voice, pressed && { opacity: 0.7 }]}>
      <View style={[st.voiceSq, { backgroundColor: p.invBg }]}>{playing ? <PauseGlyph color={p.invInk} /> : <PlayGlyph color={p.invInk} />}</View>
      <View style={{ flex: 1 }}>
        <View style={st.voiceHead}>
          <Text style={[st.voiceLabel, { color: p.ink }]}>{label}</Text>
          {time ? <Meta style={{ fontVariant: ['tabular-nums'] }}>{time}</Meta> : null}
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
  mast: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' },
  // A logo: it never wraps or shrinks, and ignores the phone's text size (a larger setting once pushed
  // "the" onto a hidden second line).
  mastText: { includeFontPadding: false, flexShrink: 0, paddingRight: 1 },
  mastWord: { flexDirection: 'row', alignItems: 'flex-end' },
  arrow: { width: 20, height: 12, justifyContent: 'center' },
  arrowShaft: { height: 1.3, width: 19 },
  arrowHead: { position: 'absolute', right: 1, width: 8, height: 8, borderTopWidth: 1.3, borderRightWidth: 1.3, transform: [{ rotate: '45deg' }] },
  action: { minHeight: 56, borderTopWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  actionText: { flex: 1, fontFamily: fonts.displayItalic, fontSize: 20, lineHeight: 26, paddingVertical: 12, includeFontPadding: false },
  actionExt: { fontFamily: fonts.sansMedium, fontSize: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingBottom: 2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  backText: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  pageHead: { paddingHorizontal: GUTTER, paddingBottom: 4, minHeight: 36, justifyContent: 'center' },
  runhead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: GUTTER, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
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
