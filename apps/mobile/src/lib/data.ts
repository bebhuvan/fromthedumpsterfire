// Offline-first reading of published Hauls.
//
// Bundles are immutable static JSON on R2: a versioned path never changes, so once a Haul is on disk
// it is never fetched again. Only the small index is refreshed, once per launch, in the background.
// Screens render from memory or disk synchronously, so nothing waits on the network.

import { useEffect, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { BUNDLE_VERSION, type Haul, type HaulIndex, type HaulSummary } from '@fdf/shared/haul';
import seedIndex from '@fdf/shared/fixtures/index.json';
import seedHaul from '@fdf/shared/fixtures/haul-001.json';
import { useReader } from './store';

const BASE = process.env.EXPO_PUBLIC_FILES_BASE ?? 'https://files.fromthedumpsterfire.com';
const INDEX_PATH = 'hauls/index.json';

// Sample content ships in the binary until the first real Haul is published. Set
// EXPO_PUBLIC_USE_SEED=0 for launch builds.
const SEEDS: Record<string, unknown> =
  process.env.EXPO_PUBLIC_USE_SEED === '0' ? {} : { [INDEX_PATH]: seedIndex, 'hauls/001/v1/haul.json': seedHaul };

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

function peek<T>(path: string): T | null {
  if (memory.has(path)) return memory.get(path) as T;
  const v = readDisk(path) ?? SEEDS[path] ?? null;
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
      memory.set(path, json);
      writeDisk(path, text);
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

/** Downloaded Haul files and their total size. */
export function storageUsed() {
  let bytes = 0;
  let count = 0;
  try {
    for (const entry of Paths.document.list()) {
      if (entry instanceof File && entry.name.startsWith('hauls__') && entry.name !== 'hauls__index.json') {
        bytes += entry.size ?? 0;
        count += 1;
      }
    }
  } catch {
    // Unreadable directory: report nothing rather than fail.
  }
  return { bytes, count };
}

/** Remove downloaded Hauls (the index and the reader's own data stay). */
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
