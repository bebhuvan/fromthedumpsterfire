import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Title } from '@fdf/shared/haul';
import type { ContentType } from '@fdf/shared/tokens';
import { fonts, usePalette } from '@/theme';
import { go } from '@/nav';
import { Chip, Divider } from './parts';
import { Meta } from './type';

/** One find in a list (search, saved, topic): title, who, which Haul, and its type colour. */
export const FindRow = memo(function FindRow({ n, id, type, title, creator, snippet, right }: { n: number; id: string; type: ContentType; title: Title; creator: string; snippet?: string; right?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View>
      <Divider />
      <Pressable accessibilityRole="link" onPress={() => go.item(n, id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: p.ink, fontFamily: type === 'poem' ? fonts.textItalic : fonts.text }]}>
            {title.text}
            {title.italic ? ' ' + title.italic : ''}
          </Text>
          <Meta style={{ marginTop: 4 }}>{creator} · Haul {n}</Meta>
          {snippet ? <Text numberOfLines={2} style={[styles.snippet, { color: p.ink2 }]}>{snippet}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 10 }}>
          <Chip type={type} />
          {right}
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14 },
  title: { fontSize: 18, lineHeight: 23, includeFontPadding: false },
  snippet: { fontFamily: fonts.text, fontSize: 14.5, lineHeight: 20, marginTop: 6 },
});
