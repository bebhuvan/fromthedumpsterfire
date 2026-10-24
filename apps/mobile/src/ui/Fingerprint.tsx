// The Haul's fingerprint (@fdf/shared/fingerprint), drawn with views as the website draws it.
// Full, on the cover: every object on one line by the year it was made, a numbered square in its
// type's colour on a stem (taller stems lift labels that would touch), years under the line in the
// edition ink. Mini, in the running head: ticks only, the item being read drawn tall.
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fingerprint, spanLine } from '@fdf/shared/fingerprint';
import { haulSlug, type Haul } from '@fdf/shared/haul';
import { typeLabel } from '@fdf/shared/tokens';
import { go } from '@/nav';
import { fonts, typeColor, useEdition, usePalette } from '@/theme';
import { colX, FP, fpGeometry } from '@/lib/fpGeometry';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
export const objects = (n: number) => `${WORDS[n] ?? n} ${n === 1 ? 'object' : 'objects'}`;
const titleOf = (t: { text: string; italic?: string }) => t.text + (t.italic ? ' ' + t.italic : '');

export const Fingerprint = memo(function Fingerprint({ haul }: { haul: Haul }) {
  const p = usePalette();
  const ed = useEdition(haul);
  const fp = useMemo(() => fingerprint(haul), [haul]);
  const [width, setWidth] = useState(0);
  const g = useMemo(() => (width ? fpGeometry(fp, width) : null), [fp, width]);
  const line = spanLine(fp, haul.items.length, objects);

  return (
    <View accessibilityLabel={`Haul ${haulSlug(haul.number)}: ${line}, placed by when each was made`}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: g?.height ?? 40 }}>
        {g?.marks.map((m) => {
          const item = fp.marks.find((x) => x.n === m.n)!.item;
          const mark = fp.marks.find((x) => x.n === m.n)!;
          return (
            <Pressable
              key={m.n}
              accessibilityRole="link"
              accessibilityLabel={`${m.n}. ${typeLabel[item.type]}, ${titleOf(item.title)}, ${mark.year}`}
              onPress={() => go.item(haul.number, item.id)}
              hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
              style={[st.mark, { left: m.x - 10, height: m.height }]}
            >
              <Text style={[st.n, { color: p.ember, left: 10 - m.labelWidth * 0.35 }]}>{String(m.n).padStart(2, '0')}</Text>
              <View style={[st.sq, { top: FP.label + FP.labelGap, backgroundColor: typeColor(p, item.type), borderColor: p.ink2 }]} />
              <View style={[st.stem, { height: m.stem, backgroundColor: p.ink }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={[st.axis, { borderTopColor: ed }]}>
        {g?.ticks.map((t) => (
          <Text key={t.year} style={[st.tick, { left: t.left, textAlign: t.align, color: t.end ? ed : p.ink2, fontFamily: t.end ? fonts.sansMedium : fonts.sans }]}>
            {t.year}
          </Text>
        ))}
      </View>
      <Text style={[st.cap, { color: p.ink }]}>
        {line}
        <Text style={{ color: p.ink2 }}>, placed by when each was made</Text>
      </Text>
    </View>
  );
});

/** Ticks on a line in the edition ink; the item being read is drawn tall in its colour. */
export const MiniFingerprint = memo(function MiniFingerprint({ haul, current, width = 96 }: { haul: Haul; current?: string; width?: number }) {
  const p = usePalette();
  const ed = useEdition(haul);
  const fp = useMemo(() => fingerprint(haul), [haul]);
  return (
    <View accessible accessibilityLabel={`Haul ${haulSlug(haul.number)}: ${spanLine(fp, haul.items.length, objects).toLowerCase()}`} style={[st.mini, { width, borderBottomColor: ed }]}>
      {fp.marks.map((m) => {
        const here = m.item.id === current;
        return (
          <View
            key={m.n}
            style={
              here
                ? [st.miniHere, { left: colX(m.at, width) - 2, backgroundColor: typeColor(p, m.item.type), borderColor: p.ink }]
                : [st.miniTick, { left: colX(m.at, width), backgroundColor: p.ink2 }]
            }
          />
        );
      })}
    </View>
  );
});

const st = StyleSheet.create({
  mark: { position: 'absolute', bottom: 0, width: 20 },
  n: { position: 'absolute', top: 0, fontFamily: fonts.sansMedium, fontSize: FP.label, lineHeight: FP.label, includeFontPadding: false, fontVariant: ['tabular-nums'] },
  sq: { position: 'absolute', left: 10 - 6.5, width: FP.square, height: FP.square, borderWidth: StyleSheet.hairlineWidth },
  stem: { position: 'absolute', bottom: 0, left: 10, width: 1 },
  axis: { borderTopWidth: FP.axis, height: 26 },
  tick: { position: 'absolute', top: 8, width: FP.tickW, fontSize: 12.5, lineHeight: 14, includeFontPadding: false, fontVariant: ['tabular-nums', 'lining-nums'] },
  cap: { fontFamily: fonts.textItalic, fontSize: 16, lineHeight: 23, marginTop: 6 },
  mini: { height: 16, borderBottomWidth: 1 },
  miniTick: { position: 'absolute', bottom: 0, width: 1.5, height: 7 },
  miniHere: { position: 'absolute', bottom: 0, width: 6, height: 15, borderWidth: 1 },
});
