// The editor's reading library (library.ts), offline: Readwise Reader and Instapaper answered by a
// stubbed fetch shaped like their documented responses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSource, type CapturedItem } from '../src/ingest';
import { fromLibrary, LIBRARY_TIMING, normaliseLibraryUrl, syncLibrary } from '../src/library';
import { storeSource } from '../src/steps';
import { makeEnv } from './fake-env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fs: Any = await import('node:fs' as string);
const path: Any = await import('node:path' as string);
const url: Any = await import('node:url' as string);
const fixture = (name: string): string => fs.readFileSync(path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'fixtures', 'fetch', name), 'utf8');

const RW = 'rw-secret-token-123';
const IP = 'ip-secret-token-456';
const PAID = 'https://www.slowboring.com/p/the-voice-of-a-generation';
const BODY = '<h2>The voice</h2>' + Array.from({ length: 12 }, (_, i) => `<p>Paragraph ${i + 1} of the editor's saved copy, with enough words in it to be the whole piece and not a preview of it.</p>`).join('');

type Handler = (u: URL, init: RequestInit) => Response | Promise<Response>;
let calls: Array<{ url: string; auth: string; redirect?: string }>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function serve(handler: Handler) {
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const u = new URL(String(input));
    if (u.hostname === 'cloudflare-dns.com') return Response.json({ Answer: u.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    const h = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url: u.toString(), auth: h.authorization ?? '', redirect: init.redirect });
    return handler(u, init);
  });
}

/** Readwise: one page of the list (a document, a highlight of it, another document), and the document with its HTML. */
const readwise = (u: URL): Response | null => {
  if (!u.toString().startsWith('https://readwise.io/api/v3/list/')) return null;
  if (u.searchParams.get('id') === 'rw1') {
    expect(u.searchParams.get('withHtmlContent')).toBe('true');
    return json({ results: [{ id: 'rw1', source_url: PAID + '?utm_source=twitter', title: 'The voice of a generation', author: 'Matthew Yglesias', site_name: 'Slow Boring', published_date: '2024-05-01', html_content: BODY }], nextPageCursor: null });
  }
  return json({
    results: [
      { id: 'rw1', source_url: 'http://slowboring.com/p/the-voice-of-a-generation/?utm_source=twitter#comments', url: 'https://read.readwise.io/read/rw1', title: 'The voice of a generation', saved_at: '2026-10-01T10:00:00Z' },
      { id: 'hl1', parent_id: 'rw1', source_url: PAID, title: 'a highlight' },
      { id: 'rw2', source_url: 'https://example.org/other', title: 'Other' },
    ],
    nextPageCursor: null,
  });
};

const item = (link: string): CapturedItem => ({ id: 'it_lib_1', kind: 'article', type: 'essay', url: link, file_key: null, capture_text: null, source_name: null, title: null });

beforeEach(() => {
  calls = [];
  LIBRARY_TIMING.sleep = async () => {};
});
afterEach(() => vi.unstubAllGlobals());

describe('normaliseLibraryUrl', () => {
  it('matches the same article however it was shared', () => {
    const k = normaliseLibraryUrl(PAID);
    expect(normaliseLibraryUrl('http://slowboring.com/p/the-voice-of-a-generation/?utm_source=twitter&utm_medium=social#comments')).toBe(k);
    expect(normaliseLibraryUrl('https://WWW.slowboring.com/p/the-voice-of-a-generation?r=abc&s=r')).toBe(k);
    expect(normaliseLibraryUrl('https://example.org/a?id=2&page=1')).toBe('example.org/a?id=2&page=1');
    expect(normaliseLibraryUrl('https://example.org/a?page=1&id=2')).toBe('example.org/a?id=2&page=1');
    expect(normaliseLibraryUrl('https://example.org/search?s=cats&r=2')).toBe('example.org/search?r=2&s=cats');
    expect(normaliseLibraryUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('the reading library', () => {
  it('reads a paywalled article from the Readwise copy, keeping the original link', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    serve((u) => readwise(u) ?? (u.pathname.startsWith('/api/v1/posts/') ? json(JSON.parse(fixture('substack-paid.json'))) : new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })));
    const out = await fetchSource(env, item(PAID));
    expect(out.kind).toBe('text');
    if (out.kind !== 'text') return;
    expect(out.extractor).toBe('readwise');
    expect(out.text).toContain("Paragraph 12 of the editor's saved copy");
    expect(out.meta.via?.route).toBe('readwise');
    expect(out.meta.via?.label).toMatch(/Readwise Reader library/);
    expect(out.fields.creator).toBe('Matthew Yglesias');
    // The token goes only to Readwise, only in the header, with redirects refused.
    const rw = calls.filter((c) => c.url.startsWith('https://readwise.io/'));
    expect(rw.length).toBe(2);
    for (const c of rw) {
      expect(c.auth).toBe(`Token ${RW}`);
      expect(c.redirect).toBe('error');
      expect(c.url).not.toContain(RW);
    }
    for (const c of calls.filter((c) => !c.url.startsWith('https://readwise.io/'))) expect(c.auth).toBe('');
    // Highlights are not indexed; the next lookup asks only for changes.
    const rows = (await env.DB.prepare('SELECT doc_id FROM library_docs ORDER BY doc_id').all<{ doc_id: string }>()).results.map((r) => r.doc_id);
    expect(rows).toEqual(['rw1', 'rw2']);
    await syncLibrary(env, 'readwise');
    expect(calls.at(-1)!.url).toMatch(/updatedAfter=/);
  });

  it('never uses the saved copy for a source quoted beside another item (library: false)', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    serve((u) => readwise(u) ?? (u.pathname.startsWith('/api/v1/posts/') ? json(JSON.parse(fixture('substack-paid.json'))) : new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })));
    await expect(fetchSource(env, item(PAID), { library: false })).rejects.toThrow(/paid subscribers/);
    expect(calls.some((c) => /readwise|instapaper/.test(c.url))).toBe(false);
  });

  it('leaves a paywalled piece failed, as before, when no library is connected', async () => {
    serve((u) => (u.pathname.startsWith('/api/v1/posts/') ? json(JSON.parse(fixture('substack-paid.json'))) : new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })));
    await expect(fetchSource(makeEnv(), item(PAID))).rejects.toThrow(/paid subscribers/);
    expect(calls.some((c) => /readwise|instapaper/.test(c.url))).toBe(false);
  });

  it('says why when the piece is not in the library, and never shows the token', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    serve((u) => (u.hostname === 'readwise.io' ? json({ results: [], nextPageCursor: null }) : u.pathname.startsWith('/api/v1/posts/') ? json(JSON.parse(fixture('substack-paid.json'))) : new Response('nope', { status: 404 })));
    const err = await fetchSource(env, item(PAID)).catch((e: Error) => e);
    expect(String(err)).toMatch(/paid subscribers.*Not in your Readwise Reader library/s);
    expect(String(err)).not.toContain(RW);
  });

  it('falls through to Instapaper, and refuses an Instapaper copy with no readable text', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW, INSTAPAPER_TOKEN: IP });
    let parse = 0;
    serve((u) => {
      if (u.hostname === 'readwise.io') return json({ results: [], nextPageCursor: null });
      if (u.pathname === '/api/2/bookmarks') return json({ bookmarks: [{ id: 77, url: PAID + '?utm_campaign=x', title: 'The voice', time: 1760000000 }], deleted_ids: [], total: 1 });
      if (u.pathname === '/api/2/bookmarks/77/parse') {
        parse++;
        return parse === 1 ? json({ error: { code: 400, message: 'Parsed content unavailable' } }, 400) : json({ metadata: { title: 'The voice', author: { name: 'Matthew Yglesias', url: null }, pubtime: 1714521600 }, content: { body: BODY, words: 300, paywalled: true } });
      }
      return new Response('nope', { status: 404 });
    });
    const miss = await fromLibrary(env, [PAID]);
    expect('miss' in miss && miss.miss).toMatch(/Not in your Readwise Reader library; Instapaper has no readable text/);
    const hit = await fromLibrary(env, [PAID]);
    expect('outcome' in hit).toBe(true);
    if (!('outcome' in hit)) return;
    expect(hit.outcome.extractor).toBe('instapaper');
    expect(hit.outcome.meta.note).toMatch(/may be paywalled/);
    for (const c of calls.filter((c) => c.url.includes('instapaper.com'))) expect(c.auth).toBe(`Bearer ${IP}`);
    // Instapaper's index asks for changes since the last sync, from the start the first time.
    expect(calls.find((c) => c.url.includes('/api/2/bookmarks?'))!.url).toMatch(/since=1&/);
  });

  it('waits out a Readwise rate limit and tries again', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    const waits: number[] = [];
    LIBRARY_TIMING.sleep = async (ms) => void waits.push(ms);
    let n = 0;
    serve((u) => (n++ === 0 ? json({ detail: 'slow down' }, 429, { 'retry-after': '7' }) : readwise(u)!));
    const got = await fromLibrary(env, [PAID]);
    expect('outcome' in got).toBe(true);
    expect(waits).toEqual([7000]);
  });

  it('reports a refused token without the token', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    serve(() => json({ detail: 'Invalid token.' }, 401));
    const got = await fromLibrary(env, [PAID]);
    expect('miss' in got && got.miss).toMatch(/refused the Desk's token \(401\); check READWISE_TOKEN/);
    expect(JSON.stringify(got)).not.toContain(RW);
  });

  it('builds a long index a few pages at a time and resumes where it stopped', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    serve((u) => {
      const page = Number(u.searchParams.get('pageCursor') ?? 0);
      return json({ results: [{ id: `d${page}`, source_url: `https://example.org/${page}` }], nextPageCursor: page < 4 ? String(page + 1) : null });
    });
    expect(await syncLibrary(env, 'readwise', 2)).toBe(false);
    expect(await syncLibrary(env, 'readwise', 2)).toBe(false);
    expect(await syncLibrary(env, 'readwise', 2)).toBe(true);
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM library_docs').first<{ n: number }>())!.n;
    expect(n).toBe(5);
    const row = (await env.DB.prepare(`SELECT since, pending FROM library_sync WHERE provider = 'readwise'`).first<{ since: string; pending: string | null }>())!;
    expect(row.pending).toBeNull();
    expect(row.since).toMatch(/^\d{4}-/);
  });

  it('stores the library copy as a private source, never in the public bucket', async () => {
    const env = makeEnv(undefined, { READWISE_TOKEN: RW });
    serve((u) => readwise(u)!);
    const got = await fromLibrary(env, [PAID]);
    if (!('outcome' in got)) throw new Error('expected a hit');
    await env.DB.prepare(`INSERT INTO items (id, kind, type, url, status, captured_at, updated_at) VALUES ('it_lib_1', 'article', 'essay', ?, 'fetching', '2026-10-25', '2026-10-25')`).bind(PAID).run();
    await storeSource(env, 'it_lib_1', got.outcome);
    const src = await env.DB.prepare(`SELECT extractor, meta FROM sources WHERE item_id = 'it_lib_1'`).first<{ extractor: string; meta: string }>();
    expect(src?.extractor).toBe('readwise');
    expect(JSON.parse(src!.meta).via.route).toBe('readwise');
    expect(env.FILES.objects.size).toBe(0);
    expect([...env.MEDIA.objects.keys()]).toContain("snapshots/it_lib_1/text.txt");
  });
});
