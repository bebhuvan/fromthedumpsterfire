// Route components: resolve params to data, then hand off to a screen.

import { useEffect } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { Routes, Tabs } from './nav';
import { StackActions } from '@react-navigation/native';
import { haulSlug } from '@fdf/shared/haul';
import { prefetchHaul, useHaul, useIndex, useShelf, useStory } from './lib/data';
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
import { Shelf } from './screens/Shelf';
import { Book } from './screens/Book';
import { Atlas } from './screens/Atlas';
import { Story } from './screens/Story';
import { NotInAtlas, NotOnShelf, Waiting } from './ui/screen';

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
export const ShelfRoute = Shelf;
export const AtlasRoute = Atlas;

/** A book on the shelf. Back names where it goes: the find it was opened from, else the shelf (also for a link opened cold). */
export function BookRoute({ route, navigation }: P<'Book'>) {
  const { data, status } = useShelf();
  const state = navigation.getState();
  const prev = state.routes[state.routes.findIndex((r) => r.key === route.key) - 1];
  const fromItem = prev?.name === 'Item' ? (prev.params as Routes['Item']) : undefined;
  const back = fromItem ? `Haul ${haulSlug(fromItem.n)}` : prev?.name === 'Shelf' || !prev || prev.name === 'Tabs' ? 'The shelf' : 'Back';
  const onBack = () => (prev && prev.name !== 'Tabs' ? navigation.goBack() : navigation.dispatch(StackActions.replace('Shelf')));
  const book = data?.books.find((b) => b.id === route.params.id);
  if (book) return <Book book={book} back={back} onBack={onBack} />;
  return status === 'loading' ? <Waiting status="loading" /> : <NotOnShelf onBack={onBack} />;
}

/** A data story. Back names where it goes: the Haul or find it was opened from, else the Atlas (also for a link opened cold). */
export function StoryRoute({ route, navigation }: P<'Story'>) {
  const { data, status } = useStory(route.params.slug);
  const state = navigation.getState();
  const prev = state.routes[state.routes.findIndex((r) => r.key === route.key) - 1];
  const fromHaul = prev?.name === 'Item' || prev?.name === 'Haul' ? (prev.params as Routes['Haul']) : undefined;
  const back = fromHaul ? `Haul ${haulSlug(fromHaul.n)}` : !prev || prev.name === 'Atlas' ? 'The Atlas' : 'Back';
  const onBack = () => (prev ? navigation.goBack() : navigation.dispatch(StackActions.replace('Atlas')));
  if (data) return <Story story={data} back={back} onBack={onBack} />;
  if (status === 'loading') return <Waiting status="loading" />;
  return <NotInAtlas missing={status === 'empty'} onBack={() => navigation.dispatch(StackActions.replace('Atlas'))} />;
}
