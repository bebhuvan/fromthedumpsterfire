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
import { keepPictures } from './pictures';

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

/** Downloaded Haul files (bundles and their chart pictures) and their total size. */
export function storageUsed() {
  let bytes = 0;
  let count = 0;
  try {
    for (const entry of Paths.document.list()) {
      if (entry instanceof File && entry.name.startsWith('hauls__') && entry.name !== 'hauls__index.json') {
        bytes += entry.size ?? 0;
        if (entry.name.endsWith('.json')) count += 1; // Hauls, not their pictures
      }
    }
  } catch {
    // Unreadable directory: report nothing rather than fail.
  }
  return { bytes, count };
}

/** Remove downloaded Hauls and their chart pictures (the index and the reader's own data stay). */
export function clearDownloads() {
  try {
    for (const entry of Paths.document.list()) {
      if (entry instanceof File && entry.name.startsWith('hauls__') && entry.name !== 'hauls__index.json') entry.delete();
    }
  } catch {
    // Best effort.
  }
  for (const key of [...memory.keys()]) if (key !== INDEX_PATH) memory.delete(key);
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
