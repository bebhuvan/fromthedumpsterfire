// The website's paths as the app's screens (React Navigation's linking config), apart from nav.ts so
// tests can parse links without a device: fromthedumpsterfire.com/haul/1/as-we-may-think opens the
// same screen as the website.

import type { PathConfigMap } from '@react-navigation/native';
import type { Routes } from '../nav';

const n = (v: string) => Number(v);
/** A link to one plate (/data/fertility#floor) opens its story. */
const slug = (v: string) => v.split('#')[0] ?? v;

export const screens: PathConfigMap<Routes> = {
  Tabs: { screens: { Latest: '', Threads: 'threads', Archive: 'hauls', Search: 'search', Menu: 'menu' } },
  Saved: 'saved',
  About: 'about',
  Settings: 'settings',
  Shelf: 'shelf',
  Book: 'shelf/:id',
  Atlas: 'data',
  Story: { path: 'data/:slug', parse: { slug } },
  Haul: { path: 'haul/:n', parse: { n } },
  Note: { path: 'haul/:n/note', parse: { n } },
  Thread: { path: 'haul/:n/thread/:id', parse: { n } },
  Item: { path: 'haul/:n/:item', parse: { n } },
};
