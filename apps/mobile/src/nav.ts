import { createNavigationContainerRef, StackActions, type LinkingOptions } from '@react-navigation/native';

export type Routes = {
  Latest: undefined;
  Haul: { n: number };
  Note: { n: number };
  Item: { n: number; item: string };
  Thread: { n: number; id: string };
  Archive: undefined;
  About: undefined;
};

export const navRef = createNavigationContainerRef<Routes>();

const n = (v: string) => Number(v);

/** fromthedumpsterfire.com/haul/1/as-we-may-think opens the same screen as the website. */
export const linking: LinkingOptions<Routes> = {
  prefixes: ['dumpsterfire://', 'https://fromthedumpsterfire.com'],
  config: {
    screens: {
      Latest: '',
      Archive: 'hauls',
      About: 'about',
      Haul: { path: 'haul/:n', parse: { n } },
      Note: { path: 'haul/:n/note', parse: { n } },
      Thread: { path: 'haul/:n/thread/:id', parse: { n } },
      Item: { path: 'haul/:n/:item', parse: { n } },
    },
  },
};

function push<K extends keyof Routes>(...args: undefined extends Routes[K] ? [K] | [K, Routes[K]] : [K, Routes[K]]) {
  if (navRef.isReady()) navRef.dispatch(StackActions.push(args[0], args[1]));
}

export const go = {
  note: (n: number) => push('Note', { n }),
  item: (n: number, item: string) => push('Item', { n, item }),
  thread: (n: number, id: string) => push('Thread', { n, id }),
  haul: (n: number) => push('Haul', { n }),
  archive: () => push('Archive'),
  about: () => push('About'),
  /** Swap the current item for the next, so Back returns to the cover, not through every item. */
  nextItem: (n: number, item: string) => navRef.isReady() && navRef.dispatch(StackActions.replace('Item', { n, item })),
  back: () => {
    if (!navRef.isReady()) return;
    if (navRef.canGoBack()) navRef.goBack();
    else navRef.dispatch(StackActions.replace('Latest'));
  },
  cover: () => navRef.isReady() && navRef.dispatch(StackActions.popToTop()),
};
