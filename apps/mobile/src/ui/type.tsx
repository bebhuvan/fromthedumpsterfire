import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import type { Title as TitleData } from '@fdf/shared/haul';
import { fonts, usePalette } from '@/theme';

type Props = { children: ReactNode; style?: StyleProp<TextStyle>; selectable?: boolean };

/** Display heading; the italic tail is set in the display italic cut. */
export const Title = memo(function Title({ title, size, style }: { title: TitleData; size: number; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="header"
      style={[s.base, { fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.02, letterSpacing: -size * 0.018, color: p.ink }, style]}
    >
      {title.text}
      {title.italic ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + title.italic}</Text> : null}
    </Text>
  );
});

export function Heading({ children, style }: Props) {
  const p = usePalette();
  return <Text accessibilityRole="header" style={[s.base, s.heading, { color: p.ink }, style]}>{children}</Text>;
}

export function Body({ children, style, selectable }: Props) {
  const p = usePalette();
  return <Text selectable={selectable} style={[s.base, s.body, { color: p.ink }, style]}>{children}</Text>;
}

/** The editor's own words. */
export function Note({ children, style }: Props) {
  const p = usePalette();
  return <Text selectable style={[s.base, s.note, { color: p.ink }, style]}>{children}</Text>;
}

export function Label({ children, style, muted }: Props & { muted?: boolean }) {
  const p = usePalette();
  return <Text style={[s.base, s.label, { color: muted ? p.ink2 : p.ink }, style]}>{children}</Text>;
}

/** Anything written by the machine is set in the blue sans, and nothing else is. */
export function Machine({ children, style }: Props) {
  const p = usePalette();
  return <Text selectable style={[s.base, s.machine, { color: p.machine }, style]}>{children}</Text>;
}

export function Meta({ children, style }: Props) {
  const p = usePalette();
  return <Text style={[s.base, s.meta, { color: p.ink2 }, style]}>{children}</Text>;
}

/** Marks `highlight` inside `text` with a swipe of the given colour. */
export function Highlighted({ text, highlight, color, style }: { text: string; highlight?: string; color: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <Text selectable style={[s.base, { color: p.ink }, style]}>{text}</Text>;
  return (
    <Text selectable style={[s.base, { color: p.ink }, style]}>
      {text.slice(0, at)}
      <Text style={{ backgroundColor: color }}>{highlight}</Text>
      {text.slice(at + highlight.length)}
    </Text>
  );
}

export const s = StyleSheet.create({
  base: { includeFontPadding: false },
  heading: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  body: { fontFamily: fonts.text, fontSize: 18, lineHeight: 27, fontVariant: ['oldstyle-nums'] },
  note: { fontFamily: fonts.textItalic, fontSize: 19, lineHeight: 28.5, fontVariant: ['oldstyle-nums'] },
  label: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  machine: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 22.5 },
  meta: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 18 },
});
