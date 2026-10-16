import { useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { GUTTER, usePalette } from '@/theme';
import { Body, Title } from './type';
import { Action } from './parts';

/**
 * A scrolling page. The app draws edge to edge, so a scrim fades in under the status bar once
 * content scrolls beneath it. The fade runs on the native driver; JS does no work per frame.
 */
export function Screen({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;
  const scrim = y.interpolate({ inputRange: [0, insets.top + 24], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
      >
        {header}
        <View style={styles.body}>{children}</View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: p.bg, opacity: scrim }]} />
    </View>
  );
}

/** Loading or offline with nothing on disk yet. */
export function Waiting({ status }: { status: 'loading' | 'offline' | 'ready' | 'empty' }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.waiting, { backgroundColor: p.bg, paddingTop: insets.top + 80 }]}>
      {status === 'loading' ? (
        <ActivityIndicator color={p.ink2} />
      ) : status === 'empty' ? (
        <>
          <Title title={{ text: 'Haul 001 is being', italic: 'gathered' }} size={38} />
          <Body style={{ marginTop: 14, color: p.ink2 }}>
            The first one is not out yet. When it lands it will appear here, and stay on your phone for offline reading.
          </Body>
        </>
      ) : (
        <>
          <Title title={{ text: 'Nothing here', italic: 'yet' }} size={38} />
          <Body style={{ marginTop: 14, color: p.ink2 }}>
            This Haul hasn't reached your phone. Connect to the internet once and it will stay here for offline reading.
          </Body>
          <Action label="Back to the latest Haul" onPress={go.cover} style={{ marginTop: 28 }} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: GUTTER },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  waiting: { flex: 1, paddingHorizontal: GUTTER },
});
