import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { fonts, usePalette } from '@/theme';
import { Meta } from './type';

/** A row of choices; the chosen one is an inverted pill. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.seg, { backgroundColor: p.plate }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on && { backgroundColor: p.invBg }]}
          >
            <Text style={[styles.segText, { color: on ? p.invInk : p.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ title, detail, right, onPress, disabled }: { title: string; detail?: string; right?: ReactNode; onPress?: () => void; disabled?: boolean }) {
  const p = usePalette();
  return (
    <Pressable
      disabled={!onPress || disabled}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, { borderColor: p.rule, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: p.ink }]}>{title}</Text>
        {detail ? <Meta style={{ marginTop: 3 }}>{detail}</Meta> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const p = usePalette();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      trackColor={{ false: p.rule, true: p.ink }}
      thumbColor={value ? p.bg : p.ink2}
      ios_backgroundColor={p.rule}
    />
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: 99, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fonts.sansBold, fontSize: 13, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 60, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontFamily: fonts.text, fontSize: 17.5, includeFontPadding: false },
});
