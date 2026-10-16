import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { fonts, usePalette } from '@/theme';
import { Meta } from './type';

/** A ruled row of choices; the chosen one is ink with a heavier rule beneath it. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.seg, { borderBottomColor: p.rule }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, { borderBottomColor: on ? p.ink : 'transparent' }]}
          >
            <Text style={[styles.segText, { color: on ? p.ink : p.ink2, fontFamily: on ? fonts.sansBold : fonts.sansMedium }]}>{o.label}</Text>
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
  seg: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  segItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, marginBottom: -StyleSheet.hairlineWidth },
  segText: { fontSize: 13.5, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 60, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontFamily: fonts.text, fontSize: 17.5, includeFontPadding: false },
});
