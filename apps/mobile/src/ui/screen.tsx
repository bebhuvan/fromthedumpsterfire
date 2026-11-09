import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { ScrollView } from 'react-native';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '@/nav';
import { GUTTER, usePalette } from '@/theme';
import { useReader } from '@/lib/store';
import { enablePush } from '@/lib/push';
import { Body, Meta, Title } from './type';
import { EditionInk } from './edition';
import { Action, PageHead } from './parts';

/** Height of the edition band on the top edge of every page of a Haul. */
export const BAND = 4;

/**
 * A scrolling page. The app draws edge to edge, so a scrim fades in under the status bar once
 * content scrolls beneath it. The fade runs on the native driver; JS does no work per frame.
 * Pages of a Haul pass its edition ink: a band across the top edge, as on the website, so a reader
 * knows which Haul they are in before reading a word. It stays put while the page scrolls.
 */
/** Scroll the page to a point in its body (a y from onLayout of one of the page's own blocks). */
const ScrollToBody = createContext<(y: number) => void>(() => {});
export const useScrollToBody = () => useContext(ScrollToBody);

export function Screen({ children, header, edition }: { children: ReactNode; header?: ReactNode; edition?: string }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;
  const scroller = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const scrollToBody = useCallback((at: number) => scroller.current?.scrollTo({ y: Math.max(0, bodyY.current + at - insets.top - 8), animated: true }), [insets.top]);
  const scrim = y.interpolate({ inputRange: [0, insets.top + 24], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Animated.ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
      >
        <ScrollToBody.Provider value={scrollToBody}>
          {header}
          <EditionInk.Provider value={edition}>
            <View style={styles.body} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
              {children}
            </View>
          </EditionInk.Provider>
        </ScrollToBody.Provider>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: p.bg, opacity: scrim }]} />
      {edition ? <View pointerEvents="none" accessible={false} style={[styles.band, { backgroundColor: edition }]} /> : null}
    </View>
  );
}

/** Loading or offline with nothing on disk yet. Before the first Haul this is where a reader turns on
 * the one notification that says it has landed; the menu stays a tap away in the bar below. */
export function Waiting({ status }: { status: 'loading' | 'offline' | 'ready' | 'empty' }) {
  const p = usePalette();
  return (
    <View style={[styles.waiting, { backgroundColor: p.bg }]}>
      <PageHead />
      <View style={{ marginTop: 56, paddingHorizontal: GUTTER }}>
        {status === 'loading' ? (
          <ActivityIndicator color={p.ink2} />
        ) : status === 'empty' ? (
          <>
            <Title title={{ text: 'Haul 001 is being', italic: 'gathered' }} size={38} />
            <Body style={{ marginTop: 14, color: p.ink2 }}>
              The first one is not out yet. When it lands it will appear here, and stay on your phone for offline reading.
            </Body>
            <NotifyWhenItLands />
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
    </View>
  );
}

/** A shelf link to a book that is not on this phone's shelf (taken down, or not here yet). */
export function NotOnShelf({ onBack }: { onBack: () => void }) {
  const p = usePalette();
  return (
    <View style={[styles.waiting, { backgroundColor: p.bg }]}>
      <PageHead />
      <View style={{ marginTop: 56, paddingHorizontal: GUTTER }}>
        <Title title={{ text: 'Not on the', italic: 'shelf' }} size={38} />
        <Body style={{ marginTop: 14, color: p.ink2 }}>This book is not on the shelf on your phone. Connect to the internet once and the shelf will catch up.</Body>
        <Action label="To the shelf" onPress={onBack} style={{ marginTop: 28 }} />
      </View>
    </View>
  );
}

function NotifyWhenItLands() {
  const on = useReader((s) => s.push.on);
  const [note, setNote] = useState<string | null>(null);
  if (on) return <Meta style={{ marginTop: 28 }}>You'll get one notification when it lands. Change this in Settings.</Meta>;
  const ask = async () => {
    setNote(null);
    const r = await enablePush();
    if (r === 'denied') setNote('Notifications are off for this app in your phone settings.');
    if (r === 'unavailable') setNote('Notifications are not set up in this build yet.');
  };
  return (
    <>
      <Action label="Tell me when it lands" onPress={ask} style={{ marginTop: 28 }} />
      {note ? <Meta style={{ marginTop: 8 }}>{note}</Meta> : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: GUTTER },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND },
  waiting: { flex: 1 },
});
