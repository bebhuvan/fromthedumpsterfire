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

export type Tabs = {
  Latest: undefined;
  Threads: undefined;
  Search: { q?: string } | undefined;
  Saved: undefined;
};

/** Reading screens open full screen above the tabs. */
export type Routes = {
  Tabs: NavigatorScreenParams<Tabs> | undefined;
  Haul: { n: number };
  Note: { n: number };
  Item: { n: number; item: string };
  Thread: { n: number; id: string };
  Archive: undefined;
  About: undefined;
  Settings: undefined;
};

export const navRef = createNavigationContainerRef<Routes>();

const n = (v: string) => Number(v);

/** fromthedumpsterfire.com/haul/1/as-we-may-think opens the same screen as the website. */
export const linking: LinkingOptions<Routes> = {
  prefixes: ['dumpsterfire://', 'https://fromthedumpsterfire.com'],
  config: {
    screens: {
      Tabs: { screens: { Latest: '', Threads: 'threads', Search: 'search', Saved: 'saved' } },
      Archive: 'hauls',
      About: 'about',
      Settings: 'settings',
      Haul: { path: 'haul/:n', parse: { n } },
      Note: { path: 'haul/:n/note', parse: { n } },
      Thread: { path: 'haul/:n/thread/:id', parse: { n } },
      Item: { path: 'haul/:n/:item', parse: { n } },
    },
  },
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
  archive: () => push('Archive'),
  about: () => push('About'),
  settings: () => push('Settings'),
  search: (q?: string) => navRef.isReady() && navRef.navigate('Tabs', { screen: 'Search', params: { q } }),
  /** Swap the current item for the next, so Back returns to the cover, not through every item. */
  nextItem: (n: number, item: string) => navRef.isReady() && navRef.dispatch(StackActions.replace('Item', { n, item })),
  back: () => {
    if (!navRef.isReady()) return;
    if (navRef.canGoBack()) navRef.goBack();
    else go.cover();
  },
  cover: () =>
    navRef.isReady() &&
    navRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Latest' } }] })),
};
