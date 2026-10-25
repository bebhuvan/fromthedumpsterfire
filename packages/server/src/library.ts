// The editor's own reading library: Readwise Reader and Instapaper. When a piece is paywalled, the
// editor has often already saved the whole text there; this reads that copy instead of asking for a
// paste. Only the editor's own saved copy is used (DECISIONS, "Free content only"): never another
// person's copy, a mirror or a scraper. The text stays private like every source (D1 and MEDIA,
// never FILES), and Instapaper's terms allow it only for display to the user who saved it.
//
// Neither API looks a document up by its link, so a small index in D1 (library_docs) maps each
// saved link to its id, kept current incrementally: Readwise by `updatedAfter`, Instapaper by
// `since`. A long first sync is done a bounded number of pages at a time and resumes on the next
// lookup. Tokens are sent only in the Authorization header and never logged or returned.

import type { Env } from './env';
import type { FetchOutcome } from './ingest';
import { fragmentText } from './extract/html';
import { readJsonCapped } from './extract/stream';
import { PaywalledError } from './extract/platforms';
import { nowIso, readingMinutes, wordCount } from './util';

export type LibraryProvider = 'readwise' | 'instapaper';

const READWISE = 'https://readwise.io/api/v3/list/';
const INSTAPAPER = 'https://www.instapaper.com/api/2/';
const LABEL: Record<LibraryProvider, string> = { readwise: 'Readwise Reader', instapaper: 'Instapaper' };

/** Below this much text, a saved copy is a preview or a stub, not the piece. */
export const MIN_LIBRARY_TEXT = 400;
/** Pages of the library index read per lookup (Readwise allows 20 list requests a minute). */
export const SYNC_PAGES: Record<LibraryProvider, number> = { readwise: 12, instapaper: 10 };
/** Tests replace the wait between retries. */
export const LIBRARY_TIMING = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

export class LibraryError extends Error {}

export const libraryProviders = (env: Env): LibraryProvider[] =>
  [env.READWISE_TOKEN?.trim() ? 'readwise' : null, env.INSTAPAPER_TOKEN?.trim() ? 'instapaper' : null].filter(Boolean) as LibraryProvider[];

// Parameters that track a click, not the piece. Removing them makes the same article match however it was shared.
const TRACKING = /^(utm_\w+|ref|ref_src|ref_url|source|src|s|r|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|si|mkt_tok|_hsenc|_hsmi|cmpid|smid|sh|giftcopy|gift|share|publication_id|post_id|isfreemail|triedredirect|showwelcome|showwelcomeonshare|access_token|token)$/i;

/** One key per article: no scheme, no www, no fragment, no tracking parameters, no trailing slash. */
export function normaliseLibraryUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? '?' + new URLSearchParams(params).toString() : '';
  const path = u.pathname.replace(/\/+$/, '') || '';
  return `${u.hostname.toLowerCase().replace(/^www\./, '')}${path}${query}`;
}

const token = (env: Env, p: LibraryProvider) => (p === 'readwise' ? env.READWISE_TOKEN : env.INSTAPAPER_TOKEN)!.trim();
const authHeader = (env: Env, p: LibraryProvider) => (p === 'readwise' ? `Token ${token(env, p)}` : `Bearer ${token(env, p)}`);

/**
 * One GET to a library API, its JSON read with a byte cap. Retries a rate limit (honouring
 * Retry-After, at most 20 s) and a server error twice; the error never carries the token.
 */
async function apiGet<T>(env: Env, p: LibraryProvider, url: string, maxBytes: number): Promise<{ status: number; body: T | null }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { authorization: authHeader(env, p), accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    } catch {
      if (attempt < 2) {
        await LIBRARY_TIMING.sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new LibraryError(`${LABEL[p]} did not answer`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await res.body?.cancel();
      const wait = res.status === 429 ? Math.min(20, Math.max(1, Number(res.headers.get('retry-after')) || 3)) * 1000 : 1000 * 2 ** attempt;
      await LIBRARY_TIMING.sleep(wait);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel();
      throw new LibraryError(`${LABEL[p]} refused the Desk's token (${res.status}); check ${p === 'readwise' ? 'READWISE_TOKEN' : 'INSTAPAPER_TOKEN'}`);
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { status: res.status, body: null };
    }
    return { status: res.status, body: await readJsonCapped<T>(res.body, maxBytes, `${LABEL[p]} response`) };
  }
}

interface SyncRow {
  since: string | null;
  pending: string | null;
  started: string | null;
}

async function upsert(env: Env, p: LibraryProvider, id: string, url: string | null | undefined, title: string | null | undefined, savedAt: string | null) {
  const key = url ? normaliseLibraryUrl(url) : null;
  if (!key || !url) return;
  await env.DB.prepare(
    `INSERT INTO library_docs (provider, doc_id, url_key, url, title, saved_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, doc_id) DO UPDATE SET url_key = excluded.url_key, url = excluded.url, title = excluded.title, saved_at = excluded.saved_at`,
  )
    .bind(p, id, key, url.slice(0, 2000), title?.slice(0, 300) ?? null, savedAt)
    .run();
}

async function saveSync(env: Env, p: LibraryProvider, row: SyncRow) {
  await env.DB.prepare(
    `INSERT INTO library_sync (provider, since, pending, started, synced_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (provider) DO UPDATE SET since = excluded.since, pending = excluded.pending, started = excluded.started, synced_at = excluded.synced_at`,
  )
    .bind(p, row.since, row.pending, row.started, nowIso())
    .run();
}

interface ReadwiseDoc {
  id: string;
  url?: string | null;
  source_url?: string | null;
  title?: string | null;
  author?: string | null;
  site_name?: string | null;
  published_date?: string | number | null;
  saved_at?: string | null;
  parent_id?: string | null;
  html_content?: string | null;
}

interface InstapaperBookmark {
  id: number;
  url: string | null;
  title?: string | null;
  time?: number | null;
}

/** Bring the index up to date, a bounded number of pages at a time. True when it is complete. */
export async function syncLibrary(env: Env, p: LibraryProvider, pages = SYNC_PAGES[p]): Promise<boolean> {
  const row = (await env.DB.prepare('SELECT since, pending, started FROM library_sync WHERE provider = ?').bind(p).first<SyncRow>()) ?? { since: null, pending: null, started: null };
  if (p === 'readwise') {
    let cursor = row.pending;
    const started = row.pending ? row.started : nowIso();
    for (let i = 0; i < pages; i++) {
      const q = new URLSearchParams({ limit: '100' });
      if (row.since) q.set('updatedAfter', row.since);
      if (cursor) q.set('pageCursor', cursor);
      const r = await apiGet<{ results: ReadwiseDoc[]; nextPageCursor: string | null }>(env, p, `${READWISE}?${q}`, 8 * 1024 * 1024);
      if (!r.body) throw new LibraryError(`Readwise Reader answered ${r.status} to a list request`);
      for (const d of r.body.results ?? []) {
        if (d.parent_id) continue; // a highlight or a note, not a document
        await upsert(env, p, String(d.id), d.source_url || d.url, d.title, d.saved_at ?? null);
      }
      cursor = r.body.nextPageCursor ?? null;
      if (!cursor) {
        await saveSync(env, p, { since: started, pending: null, started: null });
        return true;
      }
    }
    await saveSync(env, p, { since: row.since, pending: cursor, started });
    return false;
  }
  const limit = 500;
  let offset = Number(row.pending ?? 0) || 0;
  const started = row.pending ? row.started : String(Math.floor(Date.now() / 1000));
  for (let i = 0; i < pages; i++) {
    const q = new URLSearchParams({ since: row.since ?? '1', limit: String(limit), offset: String(offset) });
    const r = await apiGet<{ bookmarks: InstapaperBookmark[]; deleted_ids?: number[] }>(env, p, `${INSTAPAPER}bookmarks?${q}`, 8 * 1024 * 1024);
    if (!r.body) throw new LibraryError(`Instapaper answered ${r.status} to a list request`);
    const marks = r.body.bookmarks ?? [];
    const gone = r.body.deleted_ids ?? [];
    for (const b of marks) await upsert(env, p, String(b.id), b.url, b.title, b.time ? new Date(b.time * 1000).toISOString() : null);
    for (const id of gone) await env.DB.prepare('DELETE FROM library_docs WHERE provider = ? AND doc_id = ?').bind(p, String(id)).run();
    offset += marks.length + gone.length;
    if (marks.length + gone.length < limit) {
      await saveSync(env, p, { since: started, pending: null, started: null });
      return true;
    }
  }
  await saveSync(env, p, { since: row.since, pending: String(offset), started });
  return false;
}

interface Hit {
  provider: LibraryProvider;
  doc_id: string;
  url: string;
  saved_at: string | null;
}

const yearOrDate = (s?: string | number | null): string | undefined => {
  if (s === null || s === undefined || s === '') return undefined;
  const d = new Date(typeof s === 'number' && s < 1e12 ? s * 1000 : s);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The saved copy's text as a source, or a reason it cannot be used. */
async function readHit(env: Env, hit: Hit, link: string, why: string): Promise<FetchOutcome | string> {
  let html = '';
  let paywalled = false;
  let fields: Extract<FetchOutcome, { kind: 'text' }>['fields'] = {};
  if (hit.provider === 'readwise') {
    const q = new URLSearchParams({ id: hit.doc_id, withHtmlContent: 'true' });
    const r = await apiGet<{ results: ReadwiseDoc[] }>(env, 'readwise', `${READWISE}?${q}`, 20 * 1024 * 1024);
    const d = r.body?.results?.[0];
    if (!d) return `Readwise Reader no longer has the saved copy (${r.status})`;
    html = d.html_content ?? '';
    fields = { title: d.title ?? undefined, creator: d.author ?? undefined, source_name: d.site_name ?? host(link), source_date: yearOrDate(d.published_date) };
  } else {
    const r = await apiGet<{ metadata?: { title?: string | null; author?: { name?: string | null } | null; pubtime?: number | null }; content?: { body?: string | null; paywalled?: boolean } }>(
      env,
      'instapaper',
      `${INSTAPAPER}bookmarks/${encodeURIComponent(hit.doc_id)}/parse`,
      20 * 1024 * 1024,
    );
    if (!r.body) return r.status === 400 ? 'Instapaper has no readable text for its saved copy' : `Instapaper answered ${r.status} for the saved copy`;
    html = r.body.content?.body ?? '';
    paywalled = r.body.content?.paywalled === true;
    const m = r.body.metadata ?? {};
    fields = { title: m.title ?? undefined, creator: m.author?.name ?? undefined, source_name: host(link), source_date: yearOrDate(m.pubtime) };
  }
  const { text, headings } = fragmentText(html, ['script', 'style']);
  if (text.trim().length < MIN_LIBRARY_TEXT) return `${LABEL[hit.provider]}'s saved copy has only ${wordCount(text)} words, a preview at most`;
  const words = wordCount(text);
  const saved = hit.saved_at ? ` saved on ${yearOrDate(hit.saved_at)}` : '';
  return {
    kind: 'text',
    text,
    extractor: hit.provider,
    meta: {
      headings,
      via: { route: hit.provider, label: `From your ${LABEL[hit.provider]} library: your copy${saved} (${why})`, ...(hit.saved_at ? { at: hit.saved_at } : {}) },
      ...(paywalled ? { note: 'Instapaper thinks this copy may be paywalled. Check it is the whole piece before quoting.' } : {}),
    },
    fields: { ...fields, minutes: readingMinutes(words) },
    snapshot: { bytes: new TextEncoder().encode(`<!doctype html><meta charset="utf-8"><article>${html}</article>`), contentType: 'text/html; charset=utf-8', ext: 'html' },
  };
}

/**
 * Read a piece from the editor's library by its link (and canonical link, if known): Readwise
 * Reader first, then Instapaper. Returns the source, or a plain reason it was not found.
 */
export async function fromLibrary(env: Env, links: Array<string | null | undefined>, why = 'the site shows only a preview'): Promise<{ outcome: Extract<FetchOutcome, { kind: 'text' }> } | { miss: string }> {
  const providers = libraryProviders(env);
  if (!providers.length) return { miss: 'No reading library is connected (READWISE_TOKEN, INSTAPAPER_TOKEN)' };
  const keys = [...new Set(links.map((l) => (l ? normaliseLibraryUrl(l) : null)).filter(Boolean) as string[])];
  if (!keys.length) return { miss: 'The item has no link to look up' };
  const link = links.find(Boolean)!;
  const reasons: string[] = [];
  for (const p of providers) {
    let complete = true;
    try {
      complete = await syncLibrary(env, p);
    } catch (e) {
      reasons.push(e instanceof LibraryError ? e.message : `${LABEL[p]}: the index could not be updated`);
    }
    const hits = (
      await env.DB.prepare(`SELECT provider, doc_id, url, saved_at FROM library_docs WHERE provider = ? AND url_key IN (${keys.map(() => '?').join(',')}) ORDER BY saved_at DESC`)
        .bind(p, ...keys)
        .all<Hit>()
    ).results;
    for (const hit of hits) {
      try {
        const got = await readHit(env, hit, link, why);
        if (typeof got !== 'string') {
          console.log(JSON.stringify({ event: 'fetch-route', route: p, url: link, words: wordCount((got as { text: string }).text) }));
          return { outcome: got as Extract<FetchOutcome, { kind: 'text' }> };
        }
        reasons.push(got);
      } catch (e) {
        reasons.push(e instanceof LibraryError ? e.message : `${LABEL[p]}: the saved copy could not be read`);
      }
    }
    if (!hits.length) reasons.push(`Not in your ${LABEL[p]} library${complete ? '' : ' yet (the index is still being built; try again in a minute)'}`);
  }
  return { miss: reasons.join('; ') };
}

/** Used by the fetch step: a paywalled article, read from the library or reported with why not. */
export async function paywalledFromLibrary(env: Env, url: string, paywall: Error): Promise<FetchOutcome> {
  if (!libraryProviders(env).length) throw paywall;
  const got = await fromLibrary(env, [url]).catch((e) => ({ miss: e instanceof LibraryError ? e.message : 'the library could not be read' }));
  if ('outcome' in got) return got.outcome;
  throw new PaywalledError(`${paywall.message.replace(/\.?$/, '.')} Your library: ${got.miss}.`);
}
