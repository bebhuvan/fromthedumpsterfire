// Route components: resolve params to data, then hand off to a screen.

import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { Routes, Tabs } from './nav';
import { prefetchHaul, useHaul, useIndex } from './lib/data';
import { reader } from './lib/store';
import { Cover } from './screens/Cover';
import { FieldNote } from './screens/FieldNote';
import { ItemScreen } from './screens/ItemScreen';
import { ThreadScreen } from './screens/ThreadScreen';
import { Archive } from './screens/Archive';
import { About } from './screens/About';
import { Search } from './screens/Search';
import { Saved } from './screens/Saved';
import { Threads } from './screens/Threads';
import { Settings } from './screens/Settings';
import { Menu } from './screens/Menu';
import { Waiting } from './ui/screen';

type P<K extends keyof Routes> = NativeStackScreenProps<Routes, K>;

/** The newest Haul's cover. */
export function LatestRoute() {
  const { data, status } = useHaul();
  const index = useIndex();
  // Keep the two most recent Hauls on the phone for offline reading.
  useEffect(() => {
    index.data?.hauls.slice(0, 2).forEach(prefetchHaul);
  }, [index.data]);
  return data ? <Cover haul={data} /> : <Waiting status={status} />;
}

export function HaulRoute({ route }: P<'Haul'>) {
  const { data, status } = useHaul(route.params.n);
  return data ? <Cover haul={data} back /> : <Waiting status={status} />;
}

export function NoteRoute({ route }: P<'Note'>) {
  const { n } = route.params;
  const { data, status } = useHaul(n);
  useEffect(() => {
    if (data) reader.setPlace(n);
  }, [data, n]);
  return data ? <FieldNote haul={data} /> : <Waiting status={status} />;
}

export function ItemRoute({ route }: P<'Item'>) {
  const { n, item: id } = route.params;
  const { data, status } = useHaul(n);
  const item = data?.items.find((i) => i.id === id);
  useEffect(() => {
    if (!item) return;
    reader.markRead(n, item.id);
    reader.setPlace(n, item.id);
  }, [item, n]);
  if (!data) return <Waiting status={status} />;
  return item ? <ItemScreen key={item.id} haul={data} item={item} /> : <Waiting status="offline" />;
}

export function ThreadRoute({ route }: P<'Thread'>) {
  const { data, status } = useHaul(route.params.n);
  if (!data) return <Waiting status={status} />;
  const thread = data.threads.find((t) => t.id === route.params.id);
  return thread ? <ThreadScreen haul={data} thread={thread} /> : <Waiting status="offline" />;
}

export function SearchRoute({ route }: BottomTabScreenProps<Tabs, 'Search'>) {
  return <Search initial={route.params?.q} />;
}

export const ThreadsRoute = Threads;
export const SavedRoute = Saved;
export const ArchiveRoute = Archive;
export const AboutRoute = About;
export const SettingsRoute = Settings;
export const MenuRoute = Menu;
