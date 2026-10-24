// Settings controls, drawn with views in the house style: square corners, ink and hairlines, no
// platform widgets, no motion. Each carries its accessibility role and state.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palettes } from '@fdf/shared/tokens';
import { fonts, usePalette } from '@/theme';

/** A group of settings: a quiet sans label over an ink rule. */
export function Group({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  const p = usePalette();
  return (
    <View style={{ marginTop: 40 }}>
      <Text accessibilityRole="header" style={[st.groupLabel, { color: p.ink2 }]}>{label}</Text>
      <View style={[st.groupRule, { backgroundColor: p.ink }]} />
      {children}
      {note ? <Text style={[st.groupNote, { color: p.ink2 }]}>{note}</Text> : null}
    </View>
  );
}

/**
 * One setting: its name in sans, what it does in the serif under it, the control on the right or,
 * for a choice that needs the width, beneath. Rows after the first get a hairline above.
 */
export function Setting({ title, detail, right, below, onPress, first, accessibilityRole }: { title: string; detail?: string; right?: ReactNode; below?: ReactNode; onPress?: () => void; first?: boolean; accessibilityRole?: 'button' | 'link' | 'switch' }) {
  const p = usePalette();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? accessibilityRole ?? 'button' : undefined}
      style={({ pressed }) => [st.setting, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.rule }, pressed && { opacity: 0.6 }]}
    >
      <View style={st.settingHead}>
        <View style={{ flex: 1 }}>
          <Text style={[st.title, { color: p.ink }]}>{title}</Text>
          {detail ? <Text style={[st.detail, { color: p.ink2 }]}>{detail}</Text> : null}
        </View>
        {right}
      </View>
      {below ? <View style={{ marginTop: 16 }}>{below}</View> : null}
    </Pressable>
  );
}

/** An on/off switch: a square track, ink when on, with its knob at the end it points to. */
export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={10}
      style={[st.track, { borderColor: value ? p.ink : p.ink2, backgroundColor: value ? p.ink : 'transparent', opacity: disabled ? 0.4 : 1 }]}
    >
      <View style={[st.knob, { backgroundColor: value ? p.bg : p.ink2, alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

/** A text button for the right of a row (Remove, Open). */
export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={st.textBtn}>
      <Text style={[st.textBtnText, { color: p.ink }]}>{label}</Text>
    </Pressable>
  );
}

type Option<T> = { value: T; label: string };

/** A row of choices, each drawn as a small picture of what it does, the chosen one framed in ink. */
function Choices<T extends string>({ value, options, onChange, label, draw }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; draw: (o: Option<T>, on: boolean) => ReactNode }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={st.choices}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: on }} onPress={() => onChange(o.value)} style={({ pressed }) => [st.choice, pressed && { opacity: 0.7 }]}>
            {draw(o, on)}
            <Text style={[st.choiceLabel, { color: on ? p.ink : p.ink2, fontFamily: on ? fonts.sansBold : fonts.sansMedium }]}>{o.label}</Text>
            <View style={[st.choiceMark, { backgroundColor: on ? p.ink : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Appearance: each choice is a little page in its own scheme (System is split down the middle). */
export function AppearanceChoice<T extends string>(props: { value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  const p = usePalette();
  const page = (scheme: 'light' | 'dark') => {
    const s = palettes[scheme];
    return (
      <View style={[st.pageHalf, { backgroundColor: s.bg }]}>
        <View style={[st.pageLine, { backgroundColor: s.ink, width: '62%', height: 3 }]} />
        <View style={[st.pageLine, { backgroundColor: s.ink2, width: '78%' }]} />
        <View style={[st.pageLine, { backgroundColor: s.ink2, width: '70%' }]} />
        <View style={[st.pageFlame, { backgroundColor: s.ember }]} />
      </View>
    );
  };
  return (
    <Choices
      {...props}
      label="Appearance"
      draw={(o, on) => (
        <View style={[st.page, { borderColor: on ? p.ink : p.rule, borderWidth: on ? 1.5 : 1 }]}>
          {o.value === 'system' ? (
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <View style={{ flex: 1, overflow: 'hidden' }}>{page('light')}</View>
              <View style={{ flex: 1, overflow: 'hidden' }}>{page('dark')}</View>
            </View>
          ) : (
            page(o.value === 'dark' ? 'dark' : 'light')
          )}
        </View>
      )}
    />
  );
}

/** Text size: each choice is "Aa" set at that size in the reading face. */
export function SizeChoice<T extends string>(props: { value: T; options: (Option<T> & { scale: number })[]; onChange: (v: T) => void }) {
  const p = usePalette();
  return (
    <Choices
      {...props}
      label="Text size"
      draw={(o, on) => {
        const scale = props.options.find((x) => x.value === o.value)!.scale;
        return (
          <View style={st.aaBox}>
            <Text style={{ fontFamily: fonts.text, fontSize: 21 * scale, lineHeight: 30, color: on ? p.ink : p.ink2, includeFontPadding: false }}>Aa</Text>
          </View>
        );
      }}
    />
  );
}

const st = StyleSheet.create({
  groupLabel: { fontFamily: fonts.sansMedium, fontSize: 13.5, includeFontPadding: false },
  groupRule: { height: 1, marginTop: 9 },
  groupNote: { fontFamily: fonts.text, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  setting: { paddingVertical: 16 },
  settingHead: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  title: { fontFamily: fonts.sansMedium, fontSize: 16, lineHeight: 21, includeFontPadding: false },
  detail: { fontFamily: fonts.text, fontSize: 15.5, lineHeight: 22, marginTop: 3 },
  track: { width: 44, height: 24, borderWidth: 1.5, padding: 3, justifyContent: 'center' },
  knob: { width: 15, height: 15 },
  textBtn: { minHeight: 36, justifyContent: 'center' },
  textBtnText: { fontFamily: fonts.sansMedium, fontSize: 13.5, textDecorationLine: 'underline' },
  choices: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, alignItems: 'center', gap: 8 },
  choiceLabel: { fontSize: 13, includeFontPadding: false },
  choiceMark: { width: 16, height: 2 },
  page: { width: '100%', maxWidth: 92, aspectRatio: 1.35, overflow: 'hidden' },
  pageHalf: { flex: 1, paddingTop: 10, paddingLeft: 9, gap: 5, minWidth: 80 },
  pageLine: { height: 2 },
  pageFlame: { position: 'absolute', right: 9, bottom: 8, width: 6, height: 6, borderRadius: 3, borderTopRightRadius: 0, transform: [{ rotate: '-45deg' }] },
  aaBox: { height: 44, justifyContent: 'flex-end', alignItems: 'center' },
});
