import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { GUTTER, usePalette } from '@/theme';
import { Body, Title } from './type';
import { Pill } from './parts';

export function Screen({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      showsVerticalScrollIndicator={false}
    >
      {header}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
}

/** Loading or offline with nothing on disk yet. */
export function Waiting({ status }: { status: 'loading' | 'offline' | 'ready' }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.waiting, { backgroundColor: p.bg, paddingTop: insets.top + 80 }]}>
      {status === 'loading' ? (
        <ActivityIndicator color={p.ink2} />
      ) : (
        <>
          <Title title={{ text: 'Nothing here', italic: 'yet' }} size={38} />
          <Body style={{ marginTop: 14, color: p.ink2 }}>
            This Haul hasn't reached your phone. Connect to the internet once and it will stay here for offline reading.
          </Body>
          <Pill label="Back to the latest Haul" onPress={go.cover} style={{ marginTop: 28 }} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: GUTTER },
  waiting: { flex: 1, paddingHorizontal: GUTTER },
});
