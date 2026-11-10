import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  CommonActions,
  createNavigationContainerRef,
  StackActions,
  type LinkingOptions,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { urlFrom } from './lib/push';
import { screens } from './lib/links';

/** The bar: the website's navigation words, in its order, with Menu in place of About. */
export type Tabs = {
  Latest: undefined;
  Threads: undefined;
  Archive: undefined;
  Search: { q?: string } | undefined;
  Menu: undefined;
};

/** Reading screens open full screen above the tabs. */
export type Routes = {
  Tabs: NavigatorScreenParams<Tabs> | undefined;
  Haul: { n: number };
  Note: { n: number };
  Item: { n: number; item: string };
  Thread: { n: number; id: string };
  Saved: undefined;
  About: undefined;
  Settings: undefined;
  Shelf: undefined;
  Book: { id: string };
  Atlas: undefined;
  Story: { slug: string };
};

export const navRef = createNavigationContainerRef<Routes>();

/** fromthedumpsterfire.com/haul/1/as-we-may-think opens the same screen as the website (paths in lib/links.ts). */
export const linking: LinkingOptions<Routes> = {
  prefixes: ['dumpsterfire://', 'https://fromthedumpsterfire.com'],
  config: { screens },
  // A tapped "new Haul" notification opens that Haul, cold start or not.
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) return url;
    return urlFrom(await Notifications.getLastNotificationResponseAsync());
  },
  subscribe(listener) {
    const links = Linking.addEventListener('url', ({ url }) => listener(url));
    const taps = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = urlFrom(r);
      if (url) listener(url);
    });
    return () => {
      links.remove();
      taps.remove();
    };
  },
};

function push<K extends Exclude<keyof Routes, 'Tabs'>>(name: K, params?: Routes[K]) {
  if (navRef.isReady()) navRef.dispatch(StackActions.push(name, params));
}

export const go = {
  note: (n: number) => push('Note', { n }),
  item: (n: number, item: string) => push('Item', { n, item }),
  thread: (n: number, id: string) => push('Thread', { n, id }),
  haul: (n: number) => push('Haul', { n }),
  archive: () => navRef.isReady() && navRef.navigate('Tabs', { screen: 'Archive' }),
  threads: () => navRef.isReady() && navRef.navigate('Tabs', { screen: 'Threads' }),
  menu: () => navRef.isReady() && navRef.navigate('Tabs', { screen: 'Menu' }),
  saved: () => push('Saved'),
  about: () => push('About'),
  settings: () => push('Settings'),
  shelf: () => push('Shelf'),
  book: (id: string) => push('Book', { id }),
  atlas: () => push('Atlas'),
  story: (slug: string) => push('Story', { slug }),
  search: (q?: string) => navRef.isReady() && navRef.navigate('Tabs', { screen: 'Search', params: { q } }),
  /** Swap the current item for the next, so Back returns to the cover, not through every item. */
  nextItem: (n: number, item: string) => navRef.isReady() && navRef.dispatch(StackActions.replace('Item', { n, item })),
  /** Back from a page the Menu opens; from a link opened cold, to the Menu itself. */
  backToMenu: () => {
    if (!navRef.isReady()) return;
    if (navRef.canGoBack()) navRef.goBack();
    else navRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Menu' } }] }));
  },
  back: () => {
    if (!navRef.isReady()) return;
    if (navRef.canGoBack()) navRef.goBack();
    else go.cover();
  },
  cover: () =>
    navRef.isReady() &&
    navRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Latest' } }] })),
};
