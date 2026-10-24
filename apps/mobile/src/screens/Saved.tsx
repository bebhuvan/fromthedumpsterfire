import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, usePalette } from '@/theme';
import { reader, useReader } from '@/lib/store';
import { go } from '@/nav';
import { Body, Title } from '@/ui/type';
import { Action, Divider, TopBar } from '@/ui/parts';
import { FindRow } from '@/ui/FindRow';
import { Screen } from '@/ui/screen';

export function Saved() {
  const p = usePalette();
  const saved = useReader((s) => s.saved);

  return (
    <Screen header={<TopBar label="Menu" />}>
      <Title title={{ text: 'Saved' }} size={44} style={{ marginTop: 18 }} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17 }}>Kept on this phone, and nowhere else.</Body>
      {saved.length ? (
        <View style={{ marginTop: 18 }}>
          {saved.map((s) => (
            <FindRow
              key={`${s.n}:${s.id}`}
              n={s.n}
              id={s.id}
              type={s.type}
              title={s.title}
              creator={s.creator}
              right={
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${s.title.text}`} hitSlop={10} onPress={() => reader.toggleSave(s)}>
                  <Text style={[styles.remove, { color: p.ink2 }]}>Remove</Text>
                </Pressable>
              }
            />
          ))}
          <Divider />
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: p.ink }]}>Nothing saved yet</Text>
          <Body style={{ marginTop: 8, fontSize: 16.5, lineHeight: 24 }}>Tap Save on any find to keep it here. It works offline.</Body>
          <Action label="Open the latest Haul" onPress={go.cover} style={{ marginTop: 22 }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 28 },
  remove: { fontFamily: fonts.sansMedium, fontSize: 12.5, textDecorationLine: 'underline' },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22 },
});
