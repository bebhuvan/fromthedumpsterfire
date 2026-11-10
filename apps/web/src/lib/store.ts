// Published Hauls, read at request time from the R2 bucket the Desk publishes to.
//
// The index (hauls/index.json) is tiny and is re-read at most every INDEX_TTL_MS per isolate. Each
// bundle is validated with validateHaul once per path + etag and the result kept in memory. A
// bundle that fails is logged and never rendered: the newest earlier version that validates is
// used instead, and if there is none the Haul is listed in `failed` so its pages answer 503.
// Nothing here throws for bad data except an unreadable index with no good copy in memory.

import { BUNDLE_VERSION, tidyDates, type Haul, type HaulIndex, type Thread } from '@fdf/shared/haul';
import { validateHaul } from '@fdf/shared/validate';
import { SHELF_PATH, validateShelf, type Shelf } from '@fdf/shared/shelf';
import { DATA_INDEX_PATH, STORY_SLUG, validateDataIndex, validatePublishedStory, type DataIndex, type PublishedStory } from '@fdf/shared/stories/published';

/** The subset of an R2 bucket this module uses, so tests can pass a fake. */
export interface Bucket {
  get(key: string): Promise<{ etag: string; text(): Promise<string> } | null>;
  head(key: string): Promise<{ etag: string } | null>;
}

export const INDEX_PATH = 'hauls/index.json';
const BUNDLE_PATH = /^hauls\/(\d{3,})\/v(\d+)\/haul\.json$/;
export const INDEX_TTL_MS = 20_000;
/** How long a validated bundle is trusted before its etag is checked again. */
const BUNDLE_RECHECK_MS = 5 * 60_000;
/** How many earlier versions to try when the current one fails. */
const MAX_FALLBACK = 5;

export interface Archive {
  /** Newest first; only bundles that passed validation. */
  hauls: Haul[];
  index: HaulIndex;
  /** Haul numbers with no valid bundle, and why. Their pages answer 503. */
  failed: Map<number, string>;
}

export class IndexUnavailable extends Error {}

type Log = (msg: string) => void;
type BundleResult = { ok: true; haul: Haul } | { ok: false; error: string };

export function emptyIndex(): HaulIndex {
  return { bundleVersion: BUNDLE_VERSION, updatedAt: 'none', hauls: [] };
}

/** Shape-check the index; returns an error message or null. */
export function checkIndex(v: unknown): string | null {
  const ix = v as HaulIndex;
  if (!ix || typeof ix !== 'object' || Array.isArray(ix)) return 'not an object';
  if (ix.bundleVersion !== BUNDLE_VERSION) return `bundleVersion must be ${BUNDLE_VERSION}`;
  if (typeof ix.updatedAt !== 'string' || !ix.updatedAt) return 'updatedAt missing';
  if (!Array.isArray(ix.hauls)) return 'hauls must be an array';
  for (const h of ix.hauls) {
    if (!h || typeof h.number !== 'number' || !Number.isInteger(h.number) || h.number < 1) return 'every entry needs a positive integer number';
    if (typeof h.path !== 'string' || !BUNDLE_PATH.test(h.path)) return `Haul ${String(h.number)} has an unexpected path`;
  }
  return null;
}

export function createStore(bucket: Bucket, opts: { now?: () => number; log?: Log } = {}) {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.error(`[fdf] ${m}`));

  let index: { value: HaulIndex; at: number } | null = null;
  let inflightIndex: Promise<HaulIndex> | null = null;
  const bundles = new Map<string, { etag: string; result: BundleResult; checkedAt: number }>();

  async function readIndex(): Promise<HaulIndex> {
    try {
      const obj = await bucket.get(INDEX_PATH);
      // No index yet is the state before Haul 001.
      if (!obj) return emptyIndex();
      const parsed: unknown = JSON.parse(await obj.text());
      const problem = checkIndex(parsed);
      if (problem) throw new Error(`index rejected: ${problem}`);
      return parsed as HaulIndex;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (index) {
        log(`${INDEX_PATH}: ${msg}; keeping the last good index (${index.value.updatedAt})`);
        return index.value;
      }
      log(`${INDEX_PATH}: ${msg}; no good index in memory`);
      throw new IndexUnavailable(msg);
    }
  }

  /** The current index, re-read from R2 at most every INDEX_TTL_MS. */
  async function getIndex(): Promise<HaulIndex> {
    if (index && now() - index.at < INDEX_TTL_MS) return index.value;
    inflightIndex ??= readIndex()
      .then((value) => {
        index = { value, at: now() };
        return value;
      })
      .finally(() => {
        inflightIndex = null;
      });
    return inflightIndex;
  }

  async function readBundle(path: string, ix: HaulIndex | undefined): Promise<BundleResult | null> {
    const cached = bundles.get(path);
    if (cached && now() - cached.checkedAt < BUNDLE_RECHECK_MS) return cached.result;
    if (cached) {
      const head = await bucket.head(path);
      if (head && head.etag === cached.etag) {
        cached.checkedAt = now();
        return cached.result;
      }
    }
    const obj = await bucket.get(path);
    if (!obj) return null;
    let result: BundleResult;
    try {
      const haul = JSON.parse(await obj.text()) as Haul;
      const report = validateHaul(haul, ix);
      result = report.ok
        ? { ok: true, haul: tidyDates(haul) }
        : { ok: false, error: report.errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join('; ') };
    } catch (err) {
      result = { ok: false, error: `not JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!result.ok) log(`${path} failed validation: ${result.error}`);
    bundles.set(path, { etag: obj.etag, result, checkedAt: now() });
    return result;
  }

  /** The bundle the index names, or the newest earlier version that validates. */
  async function loadHaul(ix: HaulIndex, path: string): Promise<BundleResult> {
    const m = BUNDLE_PATH.exec(path)!;
    const [, num, ver] = m;
    const first = await readBundle(path, ix);
    if (first?.ok) return first;
    const why = first ? first.error : 'missing from the bucket';
    // Earlier versions are immutable and were valid when published; the index may have moved on
    // (a corrected title), so they are checked without it.
    for (let v = Number(ver) - 1; v >= 1 && v >= Number(ver) - MAX_FALLBACK; v--) {
      const older = await readBundle(`hauls/${num}/v${v}/haul.json`, undefined);
      if (older?.ok && older.haul.number === Number(num)) {
        log(`${path}: ${why}; serving v${v}`);
        return older;
      }
    }
    return { ok: false, error: why };
  }

  async function archive(): Promise<Archive> {
    const ix = await getIndex();
    const failed = new Map<number, string>();
    const results = await Promise.all(ix.hauls.map((h) => loadHaul(ix, h.path).then((r) => [h.number, r] as const)));
    const byNumber = new Map<number, Haul>();
    for (const [n, r] of results) {
      if (!r.ok) failed.set(n, r.error);
      else if (r.haul.number !== n) failed.set(n, `bundle says Haul ${r.haul.number}`);
      else if (!byNumber.has(n) || r.haul.version > byNumber.get(n)!.version) byNumber.set(n, r.haul);
    }
    for (const n of byNumber.keys()) failed.delete(n);
    return { hauls: [...byNumber.values()].sort((a, b) => b.number - a.number), index: ix, failed };
  }

  // The shelf (shelf/shelf.json): one file, re-read at most every INDEX_TTL_MS. A shelf that fails
  // validation is logged and the last good one kept; with none, the shelf page says it is empty.
  let shelf: { value: Shelf | null; at: number; etag?: string } | null = null;
  let inflightShelf: Promise<Shelf | null> | null = null;
  async function readShelf(): Promise<Shelf | null> {
    try {
      const obj = await bucket.get(SHELF_PATH);
      if (!obj) return null;
      if (shelf?.etag === obj.etag) return shelf.value;
      const parsed = JSON.parse(await obj.text()) as Shelf;
      const errs = validateShelf(parsed);
      if (errs.length) throw new Error(`shelf rejected: ${errs.slice(0, 5).join('; ')}`);
      shelf = { value: parsed, at: now(), etag: obj.etag };
      return parsed;
    } catch (err) {
      log(`${SHELF_PATH}: ${err instanceof Error ? err.message : String(err)}; keeping the last good shelf`);
      return shelf?.value ?? null;
    }
  }
  async function getShelf(): Promise<Shelf | null> {
    if (shelf && now() - shelf.at < INDEX_TTL_MS) return shelf.value;
    inflightShelf ??= readShelf()
      .then((value) => {
        shelf = { value, at: now(), etag: shelf?.etag };
        return value;
      })
      .finally(() => {
        inflightShelf = null;
      });
    return inflightShelf;
  }

  // Data stories (data/index.json and data/<slug>/v<N>/story.json). The index is re-read at most every
  // INDEX_TTL_MS; a story file is validated once per path and etag. An index or story that fails
  // validation is logged and never rendered: the last good index is kept, and a story falls back to its
  // newest earlier version that validates, else its page answers 404.
  let dataIx: { value: DataIndex | null; at: number; etag?: string } | null = null;
  let inflightData: Promise<DataIndex | null> | null = null;
  async function readDataIndex(): Promise<DataIndex | null> {
    try {
      const obj = await bucket.get(DATA_INDEX_PATH);
      if (!obj) return null;
      if (dataIx?.etag === obj.etag) return dataIx.value;
      const parsed = JSON.parse(await obj.text()) as DataIndex;
      const errs = validateDataIndex(parsed);
      if (errs.length) throw new Error(`data index rejected: ${errs.slice(0, 5).join('; ')}`);
      dataIx = { value: parsed, at: now(), etag: obj.etag };
      return parsed;
    } catch (err) {
      log(`${DATA_INDEX_PATH}: ${err instanceof Error ? err.message : String(err)}; keeping the last good data index`);
      return dataIx?.value ?? null;
    }
  }
  async function getDataIndex(): Promise<DataIndex | null> {
    if (dataIx && now() - dataIx.at < INDEX_TTL_MS) return dataIx.value;
    inflightData ??= readDataIndex()
      .then((value) => {
        dataIx = { value, at: now(), etag: dataIx?.etag };
        return value;
      })
      .finally(() => {
        inflightData = null;
      });
    return inflightData;
  }
  const stories = new Map<string, { etag: string; story: PublishedStory | null; error?: string }>();
  async function loadStoryFile(path: string): Promise<PublishedStory | null> {
    const obj = await bucket.get(path);
    if (!obj) return null;
    const hit = stories.get(path);
    if (hit && hit.etag === obj.etag) return hit.story;
    let story: PublishedStory | null = null;
    try {
      const parsed = JSON.parse(await obj.text()) as PublishedStory;
      const errs = validatePublishedStory(parsed);
      if (errs.length) throw new Error(errs.slice(0, 5).join('; '));
      story = parsed;
    } catch (err) {
      log(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    stories.set(path, { etag: obj.etag, story });
    return story;
  }
  /** A published story by slug: its current version, else the newest earlier one that validates. */
  async function getStory(slug: string): Promise<PublishedStory | null> {
    if (!STORY_SLUG.test(slug)) return null;
    const entry = (await getDataIndex())?.stories.find((s) => s.slug === slug);
    if (!entry) return null;
    for (let v = entry.version; v >= Math.max(1, entry.version - MAX_FALLBACK); v--) {
      const story = await loadStoryFile(`data/${slug}/v${v}/story.json`);
      if (story && story.slug === slug) return story;
    }
    return null;
  }

  return { getIndex, archive, getShelf, getDataIndex, getStory };
}

export type Store = ReturnType<typeof createStore>;

/** Every thread across the archive; a thread can grow across Hauls, and the newest telling wins. */
export function collectThreads(hauls: Haul[]): { thread: Thread; n: number }[] {
  const byId = new Map<string, { thread: Thread; n: number }>();
  for (const h of [...hauls].sort((a, b) => a.number - b.number)) for (const t of h.threads) byId.set(t.id, { thread: t, n: h.number });
  return [...byId.values()].reverse();
}

/** An in-memory bucket, for tests and for local development with the sample Haul. */
export function memoryBucket(files: Record<string, unknown>): Bucket {
  const etag = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h >>> 0);
  };
  return {
    async get(key) {
      if (!(key in files)) return null;
      const text = typeof files[key] === 'string' ? (files[key] as string) : JSON.stringify(files[key]);
      return { etag: etag(text), text: async () => text };
    },
    async head(key) {
      if (!(key in files)) return null;
      const text = typeof files[key] === 'string' ? (files[key] as string) : JSON.stringify(files[key]);
      return { etag: etag(text) };
    },
  };
}
