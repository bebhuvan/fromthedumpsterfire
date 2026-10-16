// Build-time data: the published Haul bundles, read once per build.
//
// Bundles are immutable JSON on R2 (files.fromthedumpsterfire.com). The index names the current
// version of each Haul; every bundle is checked with the same validator the Desk runs before it
// publishes, and the build fails on any error, so the site can never show a bundle the app would
// reject. In development, or with FDF_USE_SEED=1, the sample Haul in packages/shared is used.

import type { Haul, HaulIndex, HaulSummary, Thread } from '@fdf/shared/haul';
import { validateHaul } from '@fdf/shared/validate';
import seedIndex from '@fdf/shared/fixtures/index.json';
import seedHaul from '@fdf/shared/fixtures/haul-001.json';

export const DEFAULT_FILES_BASE = 'https://files.fromthedumpsterfire.com';
const INDEX_PATH = 'hauls/index.json';
const BUNDLE_PATH = /^hauls\/\d{3,}\/v\d+\/haul\.json$/;

export interface Archive {
  /** Newest first. */
  hauls: Haul[];
  index: HaulIndex;
  source: 'remote' | 'seed';
}

export interface LoadOptions {
  base?: string;
  useSeed?: boolean;
  /** In development a failed fetch falls back to the seed; in a build it fails. */
  dev?: boolean;
  fetchJson?: (url: string) => Promise<unknown>;
  log?: (msg: string) => void;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function seed(): { index: HaulIndex; bundles: unknown[] } {
  return { index: seedIndex as HaulIndex, bundles: [seedHaul] };
}

async function fetchRemote(base: string, fetchJson: (url: string) => Promise<unknown>) {
  const root = base.replace(/\/+$/, '') + '/';
  const index = (await fetchJson(new URL(INDEX_PATH, root).toString())) as HaulIndex;
  if (!index || !Array.isArray(index.hauls)) throw new Error(`${INDEX_PATH} is not a Haul index`);
  const bundles = await Promise.all(
    index.hauls.map((h: HaulSummary) => {
      if (typeof h?.path !== 'string' || !BUNDLE_PATH.test(h.path)) {
        throw new Error(`index entry for Haul ${String(h?.number)} has an unexpected path "${String(h?.path)}"`);
      }
      return fetchJson(new URL(h.path, root).toString());
    }),
  );
  return { index, bundles };
}

/** Validate every bundle against the index; the latest version of each Haul wins. */
export function assemble(index: HaulIndex, bundles: unknown[]): Haul[] {
  const problems: string[] = [];
  const byNumber = new Map<number, Haul>();
  for (const raw of bundles) {
    const haul = raw as Haul;
    const report = validateHaul(haul, index);
    const label = `Haul ${String(haul?.number)} v${String(haul?.version)}`;
    for (const e of report.errors) problems.push(`${label}: ${e.path}: ${e.message} [${e.rule}]`);
    if (!report.ok) continue;
    const prev = byNumber.get(haul.number);
    if (!prev || haul.version > prev.version) byNumber.set(haul.number, haul);
  }
  if (problems.length) throw new Error(`Haul bundles failed validation:\n  ${problems.join('\n  ')}`);
  // An empty index is the state before Haul 001: the site builds its waiting page.
  if (!byNumber.size && bundles.length) throw new Error('no Hauls to build');
  return [...byNumber.values()].sort((a, b) => b.number - a.number);
}

export async function loadArchive(opts: LoadOptions = {}): Promise<Archive> {
  const log = opts.log ?? (() => {});
  if (opts.useSeed) {
    const s = seed();
    log('Using the sample Haul (FDF_USE_SEED=1).');
    return { hauls: assemble(s.index, s.bundles), index: s.index, source: 'seed' };
  }
  const base = opts.base || DEFAULT_FILES_BASE;
  try {
    const r = await fetchRemote(base, opts.fetchJson ?? defaultFetchJson);
    log(`Read ${r.bundles.length} Haul bundle(s) from ${base}.`);
    return { hauls: assemble(r.index, r.bundles), index: r.index, source: 'remote' };
  } catch (err) {
    if (!opts.dev || (err instanceof Error && err.message.startsWith('Haul bundles failed validation'))) throw err;
    const s = seed();
    log(`Could not read ${base} (${err instanceof Error ? err.message : String(err)}); using the sample Haul.`);
    return { hauls: assemble(s.index, s.bundles), index: s.index, source: 'seed' };
  }
}

let cached: Promise<Archive> | undefined;

/** The archive for this build, loaded once and shared by every page. */
export function archive(): Promise<Archive> {
  cached ??= loadArchive({
    base: process.env.FILES_BASE,
    useSeed: process.env.FDF_USE_SEED === '1',
    dev: import.meta.env.DEV,
    log: (m) => console.log(`[fdf] ${m}`),
  });
  return cached;
}

/** Every thread across the archive; a thread can grow across Hauls, and the newest telling wins. */
export function collectThreads(hauls: Haul[]): { thread: Thread; n: number }[] {
  const byId = new Map<string, { thread: Thread; n: number }>();
  for (const h of [...hauls].sort((a, b) => a.number - b.number)) for (const t of h.threads) byId.set(t.id, { thread: t, n: h.number });
  return [...byId.values()].reverse();
}
