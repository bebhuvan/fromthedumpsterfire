// Offline-first reading of published Hauls.
//
// Bundles are immutable static JSON on R2: a versioned path never changes, so once a Haul is on disk
// it is never fetched again. Only the small index is refreshed, once per launch, in the background.
// Screens render from memory or disk synchronously, so nothing waits on the network.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { BUNDLE_VERSION, tidyDates, type Haul, type HaulIndex, type HaulSummary } from '@fdf/shared/haul';
import { SHELF_PATH, validateShelf, type Shelf } from '@fdf/shared/shelf';
import { useReader } from './store';
import { INDEX_PATH, seedTable } from './seed';
import { DATA_INDEX_PATH, type DataIndex, type DataIndexEntry, type PublishedStory } from '@fdf/shared/stories/published';
import { keepPictures, keepStoryPictures } from './pictures';
import { goodIndex, goodStory, newestKept, storyPaths } from './atlas';

const BASE = process.env.EXPO_PUBLIC_FILES_BASE ?? 'https://files.fromthedumpsterfire.com';

// Sample Hauls ship in development builds until real Hauls are published, at seed/ paths a real
// Haul can never have (see seed.ts). Launch builds set EXPO_PUBLIC_USE_SEED=0; the flag is inlined
// at build time and the require below is folded away, so the samples are not in a launch bundle.
const SEEDS: Record<string, unknown> = seedTable(
  process.env.EXPO_PUBLIC_USE_SEED !== '0' ? (require('./seedData') as typeof import('./seedData')).seedData : null,
);

const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown | null>>();
const refreshed = new Set<string>();

const fileFor = (path: string) => new File(Paths.document, path.replaceAll('/', '__'));

function readDisk(path: string): unknown | null {
  try {
    const f = fileFor(path);
    return f.exists ? JSON.parse(f.textSync()) : null;
  } catch {
    return null;
  }
}

function writeDisk(path: string, text: string) {
  try {
    const f = fileFor(path);
    if (!f.exists) f.create();
    f.write(text);
  } catch {
    // A full disk should never break reading.
  }
}

/** A Haul's source dates as readers say them (bundles published before publish tidied them). */
const tidy = <T,>(path: string, v: T): T => (v && path !== INDEX_PATH && path.startsWith('hauls/') ? (tidyDates(v as unknown as Haul) as unknown as T) : v);

function peek<T>(path: string): T | null {
  if (memory.has(path)) return memory.get(path) as T;
  const v = tidy(path, readDisk(path) ?? SEEDS[path] ?? null);
  if (v) memory.set(path, v);
  return v as T | null;
}

async function fetchJson(path: string): Promise<unknown | null> {
  const existing = inflight.get(path);
  if (existing) return existing;
  const run = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${BASE}/${path}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const text = await res.text();
      const json = JSON.parse(text) as { bundleVersion?: number };
      if (json.bundleVersion !== BUNDLE_VERSION) return null; // a newer app is needed for this bundle
      // A build carrying the sample keeps it until a real Haul exists; an empty live index would hide it.
      if (path === INDEX_PATH && SEEDS[path] && !(json as HaulIndex).hauls?.length) return null;
      memory.set(path, tidy(path, json));
      writeDisk(path, text);
      // A Haul's chart pictures are part of it: keep them on the phone too.
      if (path !== INDEX_PATH && path.startsWith('hauls/')) keepPictures(json as Haul);
      return json;
    } catch {
      return null;
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, run);
  return run;
}

export type Load<T> = { data: T | null; status: 'ready' | 'loading' | 'offline' | 'empty' };

function useBundle<T>(path: string | null, { refresh }: { refresh: boolean }): Load<T> {
  const [data, setData] = useState<T | null>(() => (path ? peek<T>(path) : null));
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!path) return;
    const now = peek<T>(path);
    setData(now);
    const needed = refresh ? !refreshed.has(path) : !now;
    if (!needed) return setSettled(true);
    let live = true;
    fetchJson(path).then((fresh) => {
      if (refresh) refreshed.add(path);
      if (!live) return;
      if (fresh) setData(fresh as T);
      setSettled(true);
    });
    return () => {
      live = false;
    };
  }, [path, refresh]);

  return { data, status: data ? 'ready' : settled ? 'offline' : 'loading' };
}

export const useIndex = () => useBundle<HaulIndex>(INDEX_PATH, { refresh: true });

export function useHaul(number?: number): Load<Haul> & { summary?: HaulSummary } {
  const index = useIndex();
  const summary = index.data?.hauls.find((h) => (number === undefined ? true : h.number === number));
  const haul = useBundle<Haul>(summary?.path ?? null, { refresh: false });
  // A bundle kept before its pictures finished downloading gets them on the next open.
  useEffect(() => keepPictures(haul.data), [haul.data]);
  if (!summary) {
    // Before Haul 001 the published index is real but empty.
    if (index.data && !index.data.hauls.length) return { data: null, status: 'empty' };
    return { data: null, status: index.status === 'ready' ? 'offline' : index.status };
  }
  return { ...haul, summary };
}

/** Download a Haul ahead of time so it opens instantly and offline. */
export function prefetchHaul(summary: HaulSummary) {
  if (!peek(summary.path)) void fetchJson(summary.path);
}

export const shareUrl = (haul: number, itemId?: string) =>
  `https://fromthedumpsterfire.com/haul/${haul}${itemId ? `/${itemId}` : ''}`;

/**
 * Every Haul the phone knows about, for search, Threads and Saved. Missing bundles are fetched in
 * the background when the reader keeps all Hauls offline (the default); bundles are small.
 */
export function useAllHauls(): Haul[] {
  const index = useIndex();
  const keepAll = useReader((s) => s.keepAllHauls);
  const [tick, setTick] = useState(0);
  const summaries = index.data?.hauls ?? [];

  useEffect(() => {
    if (!keepAll) return;
    let live = true;
    const missing = summaries.filter((s) => !peek(s.path));
    Promise.all(missing.map((s) => fetchJson(s.path))).then(() => live && missing.length && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [summaries, keepAll]);

  void tick;
  return summaries.map((s) => peek<Haul>(s.path)).filter((h): h is Haul => Boolean(h));
}

/** A downloaded file of a Haul or a data story (bundles and their pictures), never an index. */
const downloaded = (name: string) => (name.startsWith('hauls__') && name !== 'hauls__index.json') || (name.startsWith('data__') && name !== 'data__index.json');

/** Downloaded Hauls and data stories (with their pictures) and their total size. */
export function storageUsed() {
  let bytes = 0;
  let count = 0;
  let stories = 0;
  try {
    for (const entry of Paths.document.list()) {
      if (entry instanceof File && downloaded(entry.name)) {
        bytes += entry.size ?? 0;
        // Hauls and stories, not their pictures
        if (entry.name.endsWith('.json')) {
          if (entry.name.startsWith('data__')) stories += 1;
          else count += 1;
        }
      }
    }
  } catch {
    // Unreadable directory: report nothing rather than fail.
  }
  return { bytes, count, stories };
}

/** Remove downloaded Hauls and data stories with their pictures (the indexes and the reader's own data stay). */
export function clearDownloads() {
  try {
    for (const entry of Paths.document.list()) {
      if (entry instanceof File && downloaded(entry.name)) entry.delete();
    }
  } catch {
    // Best effort.
  }
  for (const key of [...memory.keys()]) if (key !== INDEX_PATH) memory.delete(key);
  storyKept.clear();
  storyTried.clear();
  storyFailed.clear();
  storiesChanged();
}

// ---------- the shelf ----------
//
// One small mutable file (shelf/shelf.json), unlike the immutable Haul bundles: the editor adds a note
// to a book any day. It is checked at most every SHELF_TTL while the app runs, with the ETag of the copy
// on disk, so an unchanged shelf costs a 304. A copy that fails validateShelf is never stored or shown.
// Offline, the copy on disk is shown; with none, the development sample (dev builds only), else nothing.

const SHELF_TTL = 20 * 60_000;
const shelfEtagFile = () => new File(Paths.document, 'shelf__shelf.etag');
const okShelf = (v: unknown): v is Shelf => Boolean(v) && validateShelf(v as Shelf).length === 0;

let shelfNow: Shelf | null | undefined; // undefined until first read from disk
/** What the last check learned: 'none' when the files host has no shelf yet (404). */
type Remote = 'unknown' | 'ok' | 'none' | 'offline';
let shelfRemote = 'unknown' as Remote;
let shelfCheckedAt = 0;
let shelfInflight: Promise<void> | null = null;
const shelfListeners = new Set<() => void>();
let shelfSnap: { data: Shelf | null; remote: Remote } = { data: null, remote: shelfRemote };

function shelfLocal(): Shelf | null {
  if (shelfNow === undefined) {
    const disk = readDisk(SHELF_PATH);
    const seed = SEEDS[SHELF_PATH];
    shelfNow = okShelf(disk) ? disk : okShelf(seed) ? seed : null;
    shelfSnap = { data: shelfNow, remote: shelfRemote };
  }
  return shelfNow;
}

function shelfChanged(data: Shelf | null) {
  shelfNow = data;
  shelfSnap = { data, remote: shelfRemote };
  shelfListeners.forEach((l) => l());
}

function readEtag(): string | null {
  try {
    const f = shelfEtagFile();
    return f.exists && fileFor(SHELF_PATH).exists ? f.textSync().trim() || null : null;
  } catch {
    return null;
  }
}

function refreshShelf(): Promise<void> {
  if (shelfInflight) return shelfInflight;
  shelfInflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const etag = readEtag();
      const res = await fetch(`${BASE}/${SHELF_PATH}`, { signal: ctrl.signal, headers: etag ? { 'If-None-Match': etag } : {} });
      clearTimeout(timer);
      shelfCheckedAt = Date.now();
      if (res.status === 304) {
        shelfRemote = 'ok';
        return shelfChanged(shelfLocal());
      }
      // No shelf published yet: a development build keeps its sample, a launch build shows none.
      if (res.status === 404) {
        shelfRemote = 'none';
        return shelfChanged(shelfLocal());
      }
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const json = JSON.parse(text) as unknown;
      if (!okShelf(json)) throw new Error('invalid shelf'); // a newer app, or a bad file: keep what we have
      writeDisk(SHELF_PATH, text);
      const tag = res.headers.get('etag');
      try {
        const f = shelfEtagFile();
        if (!f.exists) f.create();
        f.write(tag ?? '');
      } catch {
        // Without the tag the next check downloads the whole (small) file.
      }
      shelfRemote = 'ok';
      shelfChanged(json);
    } catch {
      if (shelfRemote === 'unknown') shelfRemote = 'offline';
      shelfChanged(shelfLocal());
    } finally {
      shelfInflight = null;
    }
  })();
  return shelfInflight;
}

function subscribeShelf(l: () => void) {
  shelfListeners.add(l);
  return () => shelfListeners.delete(l);
}

/**
 * The shelf, offline-first: the copy on disk renders at once and a check runs in the background when
 * the last one is older than SHELF_TTL. 'empty' means there is no shelf (or no books) to show yet.
 */
export function useShelf(): Load<Shelf> {
  shelfLocal();
  const snap = useSyncExternalStore(subscribeShelf, () => shelfSnap);
  useEffect(() => {
    if (Date.now() - shelfCheckedAt > SHELF_TTL) void refreshShelf();
  }, []);
  const { data, remote } = snap;
  if (data?.books.length) return { data, status: 'ready' };
  if (data || remote === 'none') return { data, status: 'empty' };
  return { data: null, status: remote === 'offline' ? 'offline' : 'loading' };
}

export const shelfUrl = (id?: string) => `https://fromthedumpsterfire.com/shelf${id ? `/${id}` : ''}`;

// ---------- data stories (the Atlas) ----------
//
// data/index.json is small and mutable (a story can be published any day): it is read from disk at
// once and checked once per launch. Each story is an immutable file per version
// (data/<slug>/v<N>/story.json), kept on disk once fetched, like a Haul. Nothing that fails
// validatePublishedStory / validateDataIndex is stored or shown: a bad index leaves the last good one,
// and a bad or missing version falls back to the newest earlier version that passes (on the phone, or
// fetched). The plates' pictures are downloaded next to the story (pictures.ts).

/** A story file is large (its rows travel with it), so it gets longer than a Haul to arrive. */
const STORY_TIMEOUT = 45_000;

const storyListeners = new Set<() => void>();
let storyTick = 0;
function storiesChanged() {
  storyTick += 1;
  storyListeners.forEach((l) => l());
}
function subscribeStories(l: () => void) {
  storyListeners.add(l);
  return () => storyListeners.delete(l);
}
const useStoryTick = () => useSyncExternalStore(subscribeStories, () => storyTick);

let dataIndexNow: DataIndex | null | undefined; // undefined until first read from disk
let dataIndexRemote = 'unknown' as Remote;
let dataIndexChecked = false;

function dataIndexLocal(): DataIndex | null {
  if (dataIndexNow === undefined) {
    const disk = readDisk(DATA_INDEX_PATH);
    dataIndexNow = goodIndex(disk) ? disk : null;
  }
  return dataIndexNow;
}

/** The text of a published file, 'missing' for a 404, null when offline or refused. */
async function getText(path: string, timeout: number): Promise<string | 'missing' | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${BASE}/${path}`, { signal: ctrl.signal });
    if (res.status === 404) return 'missing';
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function refreshDataIndex() {
  if (dataIndexChecked) return;
  dataIndexChecked = true;
  void (async () => {
    const text = await getText(DATA_INDEX_PATH, 10_000);
    if (text === 'missing') dataIndexRemote = 'none';
    else if (text === null) dataIndexRemote = 'offline';
    else {
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // A damaged file: keep what we have.
      }
      // A newer app, or a bad file: keep the last good index.
      if (goodIndex(json)) {
        writeDisk(DATA_INDEX_PATH, text);
        dataIndexNow = json;
        dataIndexRemote = 'ok';
      } else dataIndexRemote = dataIndexLocal() ? 'ok' : 'offline';
    }
    storiesChanged();
  })();
}

/** The Atlas's index, offline-first. 'empty' means no story is published yet. */
export function useDataIndex(): Load<DataIndex> {
  useStoryTick();
  const data = dataIndexLocal();
  useEffect(refreshDataIndex, []);
  if (data?.stories.length) return { data, status: 'ready' };
  if (data || dataIndexRemote === 'none') return { data, status: 'empty' };
  return { data: null, status: dataIndexRemote === 'offline' ? 'offline' : 'loading' };
}

/** Checked copies on the phone by path (null: none, or one that fails), so each is parsed and checked once. */
const storyKept = new Map<string, PublishedStory | null>();
/** Paths fetched this launch that gave nothing usable, so a bad file is not fetched again and again. */
const storyTried = new Set<string>();
/** Slugs whose fetch settled with nothing to show. */
const storyFailed = new Set<string>();
const storyInflight = new Map<string, Promise<void>>();

function keptStory(path: string, slug: string): PublishedStory | null {
  if (!storyKept.has(path)) {
    const disk = readDisk(path);
    storyKept.set(path, disk && goodStory(disk, slug, BASE) ? disk : null);
  }
  return storyKept.get(path) ?? null;
}

const storyOnPhone = (e: DataIndexEntry) => newestKept(e, (path) => keptStory(path, e.slug));

/** Fetch a story's current version; if it is missing or fails, the newest earlier one that passes. */
function fetchStory(e: DataIndexEntry): Promise<void> {
  const key = `${e.slug}@${e.version}`;
  const running = storyInflight.get(key);
  if (running) return running;
  const run = (async () => {
    for (const path of storyPaths(e)) {
      if (keptStory(path, e.slug)) break;
      if (storyTried.has(path)) continue;
      const text = await getText(path, STORY_TIMEOUT);
      if (text === null) break; // offline: what is on the phone stands
      storyTried.add(path);
      if (text === 'missing') continue;
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // A damaged file: try the version before it.
      }
      if (goodStory(json, e.slug, BASE)) {
        writeDisk(path, text);
        storyKept.set(path, json);
        keepStoryPictures(json);
        break;
      }
    }
    if (!storyOnPhone(e)) storyFailed.add(e.slug);
    else storyFailed.delete(e.slug);
    storyInflight.delete(key);
    storiesChanged();
  })();
  storyInflight.set(key, run);
  return run;
}

/**
 * A published story by slug, offline-first: the newest good copy on the phone renders at once, and the
 * current version is fetched when it is not on the phone. `fetch: false` only looks (a card that should
 * not download a whole story to show itself). 'empty' means the Atlas has no story by that name.
 */
export function useStory(slug: string, { fetch = true }: { fetch?: boolean } = {}): Load<PublishedStory> & { entry?: DataIndexEntry } {
  const index = useDataIndex();
  useStoryTick();
  const entry = index.data?.stories.find((s) => s.slug === slug);
  const story = entry ? storyOnPhone(entry) : null;
  const current = Boolean(entry && story && story.version === entry.version);
  useEffect(() => {
    if (entry && fetch && !current) void fetchStory(entry);
  }, [entry, fetch, current]);
  // A story kept before its pictures finished downloading gets them on the next open.
  useEffect(() => keepStoryPictures(story), [story]);
  if (story) return { data: story, status: 'ready', entry };
  if (!entry) return { data: null, status: index.status === 'loading' ? 'loading' : index.status === 'ready' || index.status === 'empty' ? 'empty' : 'offline' };
  return { data: null, status: !fetch || storyFailed.has(slug) ? 'offline' : 'loading', entry };
}
