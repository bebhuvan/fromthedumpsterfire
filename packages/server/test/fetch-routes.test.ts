// Platform routes and the Wayback fallback, offline: every request is answered from fixtures
// (test/fixtures/fetch, shaped like the real responses), and every one must arrive the way
// guardedFetch sends it (manual redirects, after a DNS check of its host).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSource, isBotCheck, type CapturedItem, type FetchOutcome } from '../src/ingest';
import { mediumTarget, substackTarget, wordpressHints, wordpressTarget } from '../src/extract/platforms';
import { archiveKey, fetchSnapshot, SAVE_TIMING, savePageNow, waybackTime } from '../src/extract/wayback';
import { storeSource } from '../src/steps';
import { findVerbatim } from '@fdf/shared/verbatim';
import { makeEnv } from './fake-env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fs: Any = await import('node:fs' as string);
const path: Any = await import('node:path' as string);
const url: Any = await import('node:url' as string);
const zlib: Any = await import('node:zlib' as string);
const dir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'fixtures', 'fetch');
const fixture = (name: string): string => fs.readFileSync(path.join(dir, name), 'utf8');

type Handler = (u: URL, init: RequestInit) => Response | Promise<Response>;
interface Call {
  url: string;
  method: string;
  redirect?: string;
  ua: string;
}

let calls: Call[];
// guardedFetch caches a host's DNS answer for a minute, so lookups are kept across tests.
const dnsLookups: string[] = [];

/** Answer requests by URL prefix (longest first); anything unrouted is a 404. */
function serve(routes: Record<string, Handler | Response | (() => Response)>) {
  const keys = Object.keys(routes).sort((a, b) => b.length - a.length);
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const u = new URL(String(input));
    if (u.hostname === 'cloudflare-dns.com') {
      dnsLookups.push(u.searchParams.get('name') ?? '');
      return Response.json({ Answer: u.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    }
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url: u.toString(), method: init.method ?? 'GET', redirect: init.redirect, ua: headers['user-agent'] ?? '' });
    const key = keys.find((k) => u.toString().startsWith(k));
    if (!key) return new Response('<html><title>Not found</title></html>', { status: 404, headers: { 'content-type': 'text/html' } });
    const r = routes[key]!;
    return typeof r === 'function' ? (r as Handler)(u, init) : (r as Response).clone();
  });
}

const json = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const xml = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
const html = (body: string, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...extra } });

const item = (link: string): CapturedItem => ({ id: 'it_fetchtest_1', kind: 'article', type: 'essay', url: link, file_key: null, capture_text: null, source_name: null, title: null });
const text = (o: FetchOutcome) => (o.kind === 'text' ? o.text : '');

const SUB = 'https://sugataraju.substack.com/p/the-new-ordinariness-of-rahul-gandhi';
const WAYBACK = 'https://web.archive.org';

beforeEach(() => {
  calls = [];
  SAVE_TIMING.pollMs = 1;
  SAVE_TIMING.maxWaitMs = 50;
});
afterEach(() => {
  vi.unstubAllGlobals();
  SAVE_TIMING.pollMs = 6_000;
  SAVE_TIMING.maxWaitMs = 90_000;
});

/** Every request went through guardedFetch: manual redirects, our own user agent or the page UA, a DNS check first. */
function expectGuarded() {
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) {
    expect(c.redirect).toBe('manual');
    expect(dnsLookups).toContain(new URL(c.url).hostname);
  }
  // Platform APIs, feeds and the archive are asked as the Desk, never as a browser.
  for (const c of calls.filter((c) => /\/api\/|\/feed|wp-json|public-api|archive\.org/.test(c.url))) expect(c.ua).toMatch(/^FromTheDumpsterFireDesk\//);
}

describe('recognising platform links', () => {
  it('Substack: subdomains, custom domains (a guess), open.substack.com and app links', () => {
    expect(substackTarget(SUB)).toEqual({ origin: 'https://sugataraju.substack.com', slug: 'the-new-ordinariness-of-rahul-gandhi', guess: false });
    expect(substackTarget('https://www.slowboring.com/p/live-your-values-and-adopt-values?utm_source=x')).toEqual({ origin: 'https://www.slowboring.com', slug: 'live-your-values-and-adopt-values', guess: true });
    expect(substackTarget('https://open.substack.com/pub/sugataraju/p/the-new-ordinariness-of-rahul-gandhi?r=1')).toMatchObject({ origin: 'https://sugataraju.substack.com', guess: false });
    expect(substackTarget('https://substack.com/home/post/p-220314845')).toEqual({ origin: 'https://substack.com', id: '220314845', guess: false });
    expect(substackTarget('https://example.org/2024/05/an-article/')).toBeNull();
  });
  it('Medium: author pages, subdomains, publications and custom domains (a guess)', () => {
    expect(mediumTarget('https://medium.com/@karpathy/software-2-0-a64152b37c35')).toEqual({ feed: 'https://medium.com/feed/@karpathy', id: 'a64152b37c35', guess: false });
    expect(mediumTarget('https://karpathy.medium.com/software-2-0-a64152b37c35?source=rss')).toEqual({ feed: 'https://medium.com/feed/@karpathy', id: 'a64152b37c35', guess: false });
    expect(mediumTarget('https://medium.com/data-science/show-and-tell-e1a1142456e2')).toMatchObject({ feed: 'https://medium.com/feed/data-science', guess: false });
    expect(mediumTarget('https://blog.example.org/a-title-e1a1142456e2')).toMatchObject({ feed: 'https://blog.example.org/feed', guess: true });
    expect(mediumTarget('https://medium.com/@karpathy')).toBeNull();
  });
  it('WordPress: wordpress.com through the public API, other sites from the page or by slug', () => {
    expect(wordpressTarget('https://terrytao.wordpress.com/2026/10/17/some-talks/')).toMatchObject({ collection: 'https://public-api.wordpress.com/wp/v2/sites/terrytao.wordpress.com/posts', slug: 'some-talks', guess: false });
    expect(wordpressTarget('https://ma.tt/2026/10/anthropic-employment/')).toMatchObject({ collection: 'https://ma.tt/wp-json/wp/v2/posts', slug: 'anthropic-employment', guess: true });
    const hints = wordpressHints('<link rel="https://api.w.org/" href="https://ma.tt/wp-json/" /><link rel="alternate" title="JSON" type="application/json" href="https://ma.tt/wp-json/wp/v2/posts/155275" />');
    expect(hints).toEqual({ apiRoot: 'https://ma.tt/wp-json/', resource: 'https://ma.tt/wp-json/wp/v2/posts/155275' });
    expect(wordpressTarget('https://ma.tt/2026/10/anthropic-employment/', hints!)).toMatchObject({ resource: 'https://ma.tt/wp-json/wp/v2/posts/155275', guess: false });
    expect(wordpressTarget('https://example.org/?rest_route=/', { apiRoot: 'https://example.org/?rest_route=/' })?.collection).toBe('https://example.org/?rest_route=%2Fwp%2Fv2%2Fposts');
  });
});

describe('Substack', () => {
  it('reads a free post from the post API, before and without the page, with clean text and all authors', async () => {
    serve({ 'https://sugataraju.substack.com/api/v1/posts/the-new-ordinariness-of-rahul-gandhi': json(fixture('substack-post.json')) });
    const out = await fetchSource(makeEnv(), item(SUB));
    expect(out.extractor).toBe('substack-api');
    const t = text(out);
    expect(t).toContain('The protest began on a Monday');
    expect(t).toContain('## A dance in the head');
    expect(t).toContain('A crowd on Janpath'); // captions stay
    expect(t).not.toMatch(/Subscribe|Thanks for reading|Expand|reader's comment/);
    expect(t).toContain('walked with him. Nobody'); // the footnote number is gone from the sentence
    expect(out.fields).toMatchObject({ title: 'The new ordinariness of Rahul Gandhi', creator: 'Sugata Srinivasaraju, A. Guest Writer', source_name: 'Sugata Srinivasaraju', source_date: '14 October 2026', canonical_url: SUB });
    expect(out.meta.via).toMatchObject({ route: 'substack-api' });
    expect(calls.map((c) => c.url)).toEqual(['https://sugataraju.substack.com/api/v1/posts/the-new-ordinariness-of-rahul-gandhi']);
    expectGuarded();
  });

  it('refuses a paid post instead of storing its preview, and never looks for another copy', async () => {
    serve({
      'https://www.slowboring.com/api/v1/posts/the-voice-of-a-generation': json(fixture('substack-paid.json')),
      [WAYBACK]: () => {
        throw new Error('must not ask the archive for a paywalled post');
      },
    });
    await expect(fetchSource(makeEnv(), item('https://www.slowboring.com/p/the-voice-of-a-generation'))).rejects.toMatchObject({ fatal: true, message: expect.stringMatching(/paid subscribers.*\b\d+ of its 1456 words/) });
    expect(calls.every((c) => !c.url.includes('archive.org'))).toBe(true);
  });

  it('falls back to the feed when the API refuses (custom domain), and spots a paid post there', async () => {
    serve({
      'https://www.slowboring.com/api/v1/posts/': html('<title>Too Many Requests</title>', 429),
      'https://www.slowboring.com/feed': xml(fixture('substack-feed.xml')),
    });
    const out = await fetchSource(makeEnv(), item('https://www.slowboring.com/p/live-your-values-and-adopt-values'));
    expect(out.extractor).toBe('substack-feed');
    expect(text(out)).toContain('## Values to live by');
    expect(out.fields).toMatchObject({ title: 'Live your values, and adopt values to live by', creator: 'Matthew Yglesias', source_name: 'Slow Boring', source_date: '12 October 2026' });
    await expect(fetchSource(makeEnv(), item('https://www.slowboring.com/p/the-voice-of-a-generation'))).rejects.toThrow(/paid subscribers: its feed carries only the opening/);
  });

  it('when the API and feed refuse but the page answers, reads the post body alone', async () => {
    const page = fixture('archived-page.html').replace('</div></div></article>', '</div></div><div class="post-footer"><a>Share</a></div><div class="portable-archive">No posts</div></article>');
    serve({
      'https://sugataraju.substack.com/api/': html('<title>Too Many Requests</title>', 429),
      'https://sugataraju.substack.com/feed': html('<title>Too Many Requests</title>', 429),
      [SUB]: html(page),
    });
    const out = await fetchSource(makeEnv(), item(SUB));
    expect(out.extractor).toBe('substack-page');
    expect(text(out).startsWith('The protest began on a Monday')).toBe(true);
    expect(text(out).endsWith('in the heat.')).toBe(true);
    expect(out.fields).toMatchObject({ title: 'The new ordinariness of Rahul Gandhi', creator: 'Sugata Srinivasaraju' });
  });

  it('a /p/ link on a site that is not Substack goes straight on to the page', async () => {
    const page = `<html><head><title>A plain site</title></head><body><article><h1>A plain site</h1>${'<p>An ordinary article on an ordinary site, long enough to read as one, with sentences that go on.</p>'.repeat(8)}</article></body></html>`;
    serve({ 'https://plain.example.org/p/an-article': html(page) });
    const out = await fetchSource(makeEnv(), item('https://plain.example.org/p/an-article'));
    expect(out.extractor).toBe('defuddle');
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/api/v1/posts/an-article', '/p/an-article']); // no feed request
  });
});

describe('WordPress', () => {
  it('uses the REST API the page advertises: the post alone, its author and the site name', async () => {
    const page = `<html><head><title>Employment</title><link rel="https://api.w.org/" href="https://ma.tt/wp-json/" /><link rel="alternate" title="JSON" type="application/json" href="https://ma.tt/wp-json/wp/v2/posts/155275" /></head><body><article><p>A short post for the fixture, with a sentence that runs long enough to count as an article’s worth of text for the extractor’s threshold.</p><p>A second paragraph says something about work, and about how tools change it, in the plain way a blog post does.</p><div>Share this: Facebook X</div></article></body></html>`;
    serve({
      'https://ma.tt/2026/10/anthropic-employment/': html(page),
      'https://ma.tt/wp-json/wp/v2/posts/155275': json(JSON.stringify(JSON.parse(fixture('wp-posts.json'))[0])),
      'https://ma.tt/wp-json/': json(fixture('wp-root.json')),
    });
    const out = await fetchSource(makeEnv(), item('https://ma.tt/2026/10/anthropic-employment/'));
    expect(out.extractor).toBe('wordpress-api');
    expect(text(out)).toContain('an article’s worth');
    expect(text(out)).not.toMatch(/Share this|Related/);
    expect(out.fields).toMatchObject({ title: 'Employment ’s next decade', creator: 'Matt', source_name: 'Matt Mullenweg', source_date: '17 October 2026', canonical_url: 'https://ma.tt/2026/10/anthropic-employment/' });
    expect(calls.find((c) => c.url.includes('/posts/155275'))?.url).toContain('_embed=author');
    expectGuarded();
  });

  it('when the page refuses, tries the REST API by slug', async () => {
    serve({
      'https://ma.tt/2026/10/anthropic-employment/': html('<title>Forbidden</title>', 403),
      'https://ma.tt/wp-json/wp/v2/posts?slug=anthropic-employment': json(fixture('wp-posts.json')),
      'https://ma.tt/wp-json/': json(fixture('wp-root.json')),
    });
    const out = await fetchSource(makeEnv(), item('https://ma.tt/2026/10/anthropic-employment/'));
    expect(out.extractor).toBe('wordpress-api');
    expect(calls.some((c) => c.url.includes('archive.org'))).toBe(false);
  });

  it('wordpress.com blogs go to the public API first', async () => {
    serve({
      'https://public-api.wordpress.com/wp/v2/sites/terrytao.wordpress.com/posts?slug=anthropic-employment': json(fixture('wp-posts.json').replace(/https:\\\/\\\/ma\.tt|https:\/\/ma\.tt/g, 'https://terrytao.wordpress.com')),
      'https://public-api.wordpress.com/rest/v1.1/sites/terrytao.wordpress.com': json({ name: "What's new" }),
    });
    const out = await fetchSource(makeEnv(), item('https://terrytao.wordpress.com/2026/10/anthropic-employment/'));
    expect(out.extractor).toBe('wordpress-api');
    expect(out.fields.source_name).toBe("What's new");
    expect(calls.every((c) => c.url.startsWith('https://public-api.wordpress.com/'))).toBe(true);
  });
});

describe('Medium', () => {
  it('reads a free story from the feed, without the "originally published" line or the tracking pixel', async () => {
    serve({ 'https://medium.com/feed/@karpathy': xml(fixture('medium-feed.xml')) });
    const out = await fetchSource(makeEnv(), item('https://karpathy.medium.com/software-2-0-a64152b37c35'));
    expect(out.extractor).toBe('medium-feed');
    expect(text(out)).toContain('## The classical stack');
    expect(text(out)).not.toMatch(/originally published|continuing the conversation/);
    expect(out.fields).toMatchObject({ title: 'Software 2.0', creator: 'Andrej Karpathy', source_name: 'Medium', canonical_url: 'https://karpathy.medium.com/software-2-0-a64152b37c35', source_date: '11 November 2017' });
    expectGuarded();
  });

  it('says a members-only story is members-only', async () => {
    serve({ 'https://medium.com/feed/@karpathy': xml(fixture('medium-feed.xml')) });
    await expect(fetchSource(makeEnv(), item('https://medium.com/@karpathy/a-members-only-story-0123456789ab'))).rejects.toThrow(/members-only Medium story/);
  });

  it('an older story (not in the feed) behind a bot check comes from the Wayback Machine', async () => {
    const original = 'https://medium.com/@karpathy/yes-you-should-understand-backprop-e2f06eab496b';
    const archived = fixture('archived-page.html').replace(/sugataraju\.substack\.com\/p\/the-new-ordinariness-of-rahul-gandhi/g, 'medium.com/@karpathy/yes-you-should-understand-backprop-e2f06eab496b').replace('substackcdn.com', 'cdn-client.medium.com');
    serve({
      'https://medium.com/feed/@karpathy': xml(fixture('medium-feed.xml')),
      [original]: html(fixture('bot-check.html'), 403, { 'cf-mitigated': 'challenge' }),
      [`${WAYBACK}/cdx/search/cdx`]: json([['timestamp', 'original'], ['20221018152752', original]]),
      [`${WAYBACK}/web/20221018152752id_/`]: html(archived),
    });
    const out = await fetchSource(makeEnv(), item(original));
    expect(out.extractor).toBe('wayback');
    expect(out.meta.via).toEqual({ route: 'wayback', label: "From the Wayback Machine's copy of 18 October 2022 (the site showed a bot check)", url: `${WAYBACK}/web/20221018152752/${original}`, at: '2022-10-18T15:27:52Z' });
    expect(out.fields.canonical_url).toBe(original); // never the archive's address
    expect(calls.some((c) => c.url.startsWith(`${WAYBACK}/save`))).toBe(false); // a copy existed: no new capture
    expectGuarded();
  });
});

describe('the Wayback Machine', () => {
  it('Substack refusing everything: no copy yet, so Save Page Now, polled until it lands; the item keeps its link', async () => {
    let polls = 0;
    const gz = zlib.gzipSync(Buffer.from(fixture('archived-page.html')));
    serve({
      'https://sugataraju.substack.com/': html('<title>Too Many Requests</title>', 429),
      [`${WAYBACK}/cdx/search/cdx`]: json([]),
      'https://archive.org/wayback/available': json({ url: SUB, archived_snapshots: {} }),
      [`${WAYBACK}/save/status/spn2-`]: () => json(++polls < 3 ? fixture('spn-pending.json') : fixture('spn-success.json')),
      [`${WAYBACK}/save`]: (_u, init) => {
        expect(init.method).toBe('POST');
        expect(String(init.body)).toBe(`url=${encodeURIComponent(SUB)}`);
        return html(fixture('spn-start.html'));
      },
      // The raw copy arrives as the stored gzip body, with no Content-Encoding.
      [`${WAYBACK}/web/20261018022210id_/`]: new Response(gz, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    });
    const env = makeEnv();
    const out = await fetchSource(env, item(SUB));
    expect(out.extractor).toBe('wayback');
    expect(polls).toBe(3);
    expect(out.meta.via).toMatchObject({ route: 'wayback-saved', url: `${WAYBACK}/web/20261018022210/${SUB}`, at: '2026-10-18T02:22:10Z' });
    expect(out.meta.via?.label).toMatch(/fresh capture of 18 October 2026 \(the site refused the Desk: 429, too many requests\)/);
    expect(out.fields).toMatchObject({ title: 'The new ordinariness of Rahul Gandhi', creator: 'Sugata Srinivasaraju', source_name: 'Sugata Srinivasaraju', canonical_url: SUB });
    expectGuarded();

    // Stored as fetched, so an excerpt copied from it matches verbatim.
    await env.DB.prepare(`INSERT INTO items (id, kind, type, url, status, captured_at, updated_at) VALUES ('it_fetchtest_1', 'article', 'essay', ?, 'fetching', '2026-10-18', '2026-10-18')`).bind(SUB).run();
    await storeSource(env, 'it_fetchtest_1', out as Extract<FetchOutcome, { kind: 'text' }>);
    const row = await env.DB.prepare('SELECT text, extractor, meta FROM sources WHERE item_id = ?').bind('it_fetchtest_1').first<{ text: string; extractor: string; meta: string }>();
    expect(row?.extractor).toBe('wayback');
    expect(JSON.parse(row!.meta).via.route).toBe('wayback-saved');
    expect(findVerbatim(row!.text, '“There is a difference,” a party worker told me')).not.toBeNull();
    const it2 = await env.DB.prepare('SELECT url, canonical_url FROM items WHERE id = ?').bind('it_fetchtest_1').first<{ url: string; canonical_url: string }>();
    expect(it2).toEqual({ url: SUB, canonical_url: SUB });
  });

  it('when nothing works on a 429 the error stays retryable and says what was tried', async () => {
    serve({
      'https://sugataraju.substack.com/': html('<title>Too Many Requests</title>', 429),
      [`${WAYBACK}/cdx/search/cdx`]: json([]),
      'https://archive.org/wayback/available': json({ archived_snapshots: {} }),
      [`${WAYBACK}/save`]: html(fixture('spn-limit.html')),
    });
    const err = await fetchSource(makeEnv(), item(SUB)).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect('fatal' in err).toBe(false);
    expect(err.message).toMatch(/refused the fetch for now \(429: too many requests\)/);
    expect(err.message).toMatch(/Substack API: .*429.*Substack feed: .*429.*no copy yet.*limit of active Save Page Now sessions/);
  });

  it('a page that is gone uses an old copy if there is one, and never asks for a new capture', async () => {
    const gone = 'https://news.example.org/2019/03/a-lost-article';
    serve({
      [gone]: html('<title>Not found</title>', 404),
      [`${WAYBACK}/cdx/search/cdx`]: json([]),
      'https://archive.org/wayback/available': json({ archived_snapshots: {} }),
    });
    await expect(fetchSource(makeEnv(), item(gone))).rejects.toMatchObject({ fatal: true, message: expect.stringMatching(/returned 404, and the Wayback Machine has no readable copy/) });
    expect(calls.some((c) => c.url.startsWith(`${WAYBACK}/save`))).toBe(false);
    expect(calls.some((c) => c.url.includes('wp-json'))).toBe(false);
  });

  it('an archived copy of a paid post is refused, not stored', async () => {
    const paid = 'https://www.slowboring.com/p/the-voice-of-a-generation';
    serve({
      'https://www.slowboring.com/': html('<title>Too Many Requests</title>', 429),
      [`${WAYBACK}/cdx/search/cdx`]: json([['timestamp', 'original'], ['20261017110000', paid]]),
      [`${WAYBACK}/web/20261017110000id_/`]: html(fixture('archived-paid.html')),
    });
    await expect(fetchSource(makeEnv(), item(paid))).rejects.toThrow(/paid subscribers; the archived copy has only the public preview/);
  });

  it('Save Page Now polling is bounded', async () => {
    let polls = 0;
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    serve({
      [`${WAYBACK}/save/status/`]: () => (polls++, json(fixture('spn-pending.json'))),
      [`${WAYBACK}/save`]: html(fixture('spn-start.html')),
    });
    const r = await savePageNow(SUB, { maxWaitMs: 60_000, pollMs: 6_000, sleep: async (ms) => void (clock += ms) });
    expect(r).toEqual({ ok: false, reason: 'Save Page Now was still working after 60 s' });
    expect(polls).toBeLessThanOrEqual(10);
    vi.restoreAllMocks();
  });

  it('caps what a gzip copy may inflate to', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1));
    serve({ [`${WAYBACK}/web/20261018022210id_/`]: new Response(bomb, { status: 200, headers: { 'content-type': 'text/html' } }) });
    await expect(fetchSnapshot('20261018022210', SUB)).rejects.toThrow(/larger than/);
  });

  it('timestamps and lookup keys', () => {
    expect(waybackTime('20261018022210')).toBe('2026-10-18T02:22:10Z');
    expect(archiveKey(`${SUB}?utm_source=share&r=abc#comments`)).toBe(`${SUB}?r=abc`);
  });
});

describe('bot checks', () => {
  it('a 200 challenge page counts as a refusal, an article does not', () => {
    const f = (h: Record<string, string> = {}) => ({ url: 'https://x.example.org/', status: 200, contentType: 'text/html', bytes: new Uint8Array(), headers: new Headers(h) });
    expect(isBotCheck(f(), fixture('bot-check.html'))).toBe(true);
    expect(isBotCheck(f({ 'cf-mitigated': 'challenge' }), '<html></html>')).toBe(true);
    expect(isBotCheck(f(), fixture('archived-page.html'))).toBe(false);
  });
});
