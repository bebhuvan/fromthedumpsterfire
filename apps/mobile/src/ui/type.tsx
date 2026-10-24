import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import type { Title as TitleData } from '@fdf/shared/haul';
import { fonts, usePalette, useTextScale } from '@/theme';

type Props = { children: ReactNode; style?: StyleProp<TextStyle>; selectable?: boolean };

/** Applies the reader's text-size preference to a style's font size and line height. */
function useScaled(base: TextStyle, style?: StyleProp<TextStyle>): TextStyle {
  const k = useTextScale();
  const flat = StyleSheet.flatten([base, style]);
  if (k === 1) return flat;
  return { ...flat, fontSize: flat.fontSize && flat.fontSize * k, lineHeight: flat.lineHeight && flat.lineHeight * k };
}

/** Display heading; the italic tail is set in the display italic cut. */
export const Title = memo(function Title({ title, size, style, maxScale }: { title: TitleData; size: number; style?: StyleProp<TextStyle>; maxScale?: number }) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={maxScale}
      style={[s.base, { fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.04, letterSpacing: -size * 0.018, color: p.ink }, style]}
    >
      {title.text}
      {title.italic ? <Text style={{ fontFamily: fonts.displayItalic }}>{' ' + title.italic}</Text> : null}
    </Text>
  );
});

export function Body({ children, style, selectable }: Props) {
  const p = usePalette();
  return <Text selectable={selectable} style={useScaled({ ...s.base, ...s.body, color: p.ink }, style)}>{children}</Text>;
}

/** The editor's own words. */
export function Note({ children, style }: Props) {
  const p = usePalette();
  return <Text selectable style={useScaled({ ...s.base, ...s.note, color: p.ink }, style)}>{children}</Text>;
}

export function Label({ children, style, muted }: Props & { muted?: boolean }) {
  const p = usePalette();
  return <Text style={[s.base, s.label, { color: muted ? p.ink2 : p.ink }, style]}>{children}</Text>;
}

/** Anything written by the machine is set in the blue sans, and nothing else is. */
export function Machine({ children, style }: Props) {
  const p = usePalette();
  return <Text selectable style={useScaled({ ...s.base, ...s.machine, color: p.machine }, style)}>{children}</Text>;
}

export function Meta({ children, style }: Props) {
  const p = usePalette();
  return <Text style={[s.base, s.meta, { color: p.ink2 }, style]}>{children}</Text>;
}

/** Marks `highlight` inside `text` with a swipe of the given colour. */
export function Highlighted({ text, highlight, color, style }: { text: string; highlight?: string; color: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  const scaled = useScaled({ ...s.base, color: p.ink }, style);
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <Text selectable style={scaled}>{text}</Text>;
  return (
    <Text selectable style={scaled}>
      {text.slice(0, at)}
      <Text style={{ backgroundColor: color }}>{highlight}</Text>
      {text.slice(at + highlight.length)}
    </Text>
  );
}

export const s = StyleSheet.create({
  base: { includeFontPadding: false },
  body: { fontFamily: fonts.text, fontSize: 18, lineHeight: 27 },
  note: { fontFamily: fonts.textItalic, fontSize: 19, lineHeight: 28.5 },
  label: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  machine: { fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 22.5 },
  meta: { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 18 },
});
