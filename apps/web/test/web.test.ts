import { describe, expect, it } from 'vitest';
import type { Haul, HaulIndex } from '@fdf/shared/haul';
import seedHaul from '@fdf/shared/fixtures/haul-001.json';
import seedIndex from '@fdf/shared/fixtures/index.json';
import { buildSearchIndex, query, topicIndex, around } from '../src/lib/search';
import { firstSentence, fullDate, objects, safeHref } from '../src/lib/site';
import { createStore, memoryBucket, checkIndex, IndexUnavailable } from '../src/lib/store';
import { findHaul } from '../src/lib/site';
import { esc, rss } from '../src/lib/xml';
import { tokensCss } from '../src/lib/tokens-css';
import { assetLinks, appleAppSiteAssociation } from '../src/lib/applinks';
import { aliasFor, cacheControl, pageCacheKey, sameOriginRedirect } from '../src/worker/lib';

const haul = seedHaul as Haul;
const index = seedIndex as HaulIndex;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('safeHref', () => {
  it('allows http and https only', () => {
    expect(safeHref('https://en.wikipedia.org/wiki/Memex')).toBe('https://en.wikipedia.org/wiki/Memex');
    expect(safeHref('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', 'mailto:a@b.c', '/relative', '//evil.com/x', 'not a url', '', null, undefined]) {
      expect(safeHref(bad as string)).toBeUndefined();
    }
  });
  it('refuses credentials in the URL', () => {
    expect(safeHref('https://user:pass@example.com/')).toBeUndefined();
  });
  it('normalises, so control characters cannot smuggle a scheme', () => {
    expect(safeHref('java\nscript:alert(1)')).toBeUndefined();
    expect(safeHref('https://example.com/a b')).toBe('https://example.com/a%20b');
  });
});

describe('search index', () => {
  const docs = buildSearchIndex([haul]);

  it('has one compact document per item with a site path', () => {
    expect(docs).toHaveLength(haul.items.length);
    const bush = docs.find((d) => d.id === 'as-we-may-think')!;
    expect(bush).toMatchObject({ n: 1, type: 'essay', title: 'As We May Think', creator: 'Vannevar Bush', url: '/haul/1/as-we-may-think' });
    expect(bush.italic).toBeUndefined();
    expect(docs.find((d) => d.id === 'coal-question')!.italic).toBe('more burning');
    for (const d of docs) for (const [text] of d.f) expect(text.trim()).not.toBe('');
  });

  it('serialises to small JSON', () => {
    expect(JSON.stringify(docs).length).toBeLessThan(20_000);
  });

  it('weights title and creator above body text', () => {
    const hits = query(docs, 'attention');
    expect(hits[0]!.doc.id).toBe('attention');
    expect(hits.map((h) => h.doc.id)).toContain('as-we-may-think');
    expect(query(docs, 'hamming')[0]!.doc.id).toBe('you-and-your-research');
  });

  it('prefix-matches every term, folds case and accents', () => {
    expect(query(docs, 'VANN').map((h) => h.doc.id)).toEqual(['as-we-may-think']);
    expect(query(docs, 'tagoré')[0]!.doc.id).toBe('stray-birds');
    // Jevons' connection note mentions "Bush's memex", so it matches too, below the essay itself.
    expect(query(docs, 'bush memex').map((h) => h.doc.id)).toEqual(['as-we-may-think', 'coal-question']);
    expect(query(docs, 'bush zebra')).toEqual([]);
    expect(query(docs, '   ')).toEqual([]);
  });

  it('gives a snippet from body text around the match', () => {
    const hit = query(docs, 'square')[0]!;
    expect(hit.snippet).toContain('square-rigged');
    expect(around('one two three', 'zzz')).toBeUndefined();
  });

  it('newer Hauls win ties', () => {
    const second = clone(haul);
    second.number = 2;
    const hits = query(buildSearchIndex([haul, second]), 'Tagore');
    expect(hits.map((h) => h.doc.n)).toEqual([2, 1]);
  });

  it('builds the A to Z topic index from the Wikipedia layer', () => {
    const topics = topicIndex([haul]);
    expect(topics.map((t) => t.title)).toEqual([...topics.map((t) => t.title)].sort((a, b) => a.localeCompare(b, 'en')));
    expect(topics.find((t) => t.title === 'Memex')!.items[0]!.item.id).toBe('as-we-may-think');
  });
});

describe('request-time store', () => {
  const files = () => ({ 'hauls/index.json': clone(index), 'hauls/001/v1/haul.json': clone(haul) }) as Record<string, unknown>;
  const quiet = { log: () => {} };

  it('reads and validates the published bundles', async () => {
    const a = await createStore(memoryBucket(files()), quiet).archive();
    expect(a.hauls.map((h) => h.number)).toEqual([1]);
    expect(a.failed.size).toBe(0);
    expect(a.index.updatedAt).toBe(index.updatedAt);
  });

  it('treats a missing or empty index as the state before Haul 001', async () => {
    const a = await createStore(memoryBucket({}), quiet).archive();
    expect(a.hauls).toEqual([]);
    const b = await createStore(memoryBucket({ 'hauls/index.json': { bundleVersion: 1, updatedAt: '2026-10-16T00:00:00.000Z', hauls: [] } }), quiet).archive();
    expect(b.hauls).toEqual([]);
    expect(b.failed.size).toBe(0);
  });

  it('never renders a bundle that fails validation; falls back to the previous version', async () => {
    const f = files();
    const bad = clone(haul);
    bad.version = 2;
    bad.corrections = [{ date: '2026-10-16', text: 'A correction.' }];
    bad.items[0]!.excerpt!.highlight = 'words that are not in the excerpt';
    f['hauls/001/v2/haul.json'] = bad;
    const ix = clone(index);
    ix.hauls[0]!.path = 'hauls/001/v2/haul.json';
    f['hauls/index.json'] = ix;
    const logs: string[] = [];
    const a = await createStore(memoryBucket(f), { log: (m) => logs.push(m) }).archive();
    expect(a.hauls[0]!.version).toBe(1);
    expect(a.failed.size).toBe(0);
    expect(logs.join('\n')).toMatch(/v2\/haul\.json failed validation[\s\S]*serving v1/);
  });

  it('marks a Haul failed when no version validates, and its pages resolve to 503', async () => {
    const f = files();
    (f['hauls/001/v1/haul.json'] as Haul).items[0]!.marginalia[0]!.cite = '';
    const a = await createStore(memoryBucket(f), quiet).archive();
    expect(a.hauls).toEqual([]);
    expect(a.failed.get(1)).toMatch(/cite/);
    expect(findHaul(a, '1').kind).toBe('failed');
    expect(findHaul(a, '2').kind).toBe('missing');
    expect(findHaul(a, '001').kind).toBe('missing');
    f['hauls/001/v1/haul.json'] = '{not json';
    const b = await createStore(memoryBucket(f), quiet).archive();
    expect(b.failed.get(1)).toMatch(/not JSON/);
  });

  it('sees a new publish once the index TTL passes, without a restart', async () => {
    let t = 0;
    const f: Record<string, unknown> = {};
    const store = createStore(memoryBucket(f), { ...quiet, now: () => t });
    expect((await store.archive()).hauls).toEqual([]);
    Object.assign(f, files());
    expect((await store.archive()).hauls).toEqual([]);
    t += 25_000;
    expect((await store.archive()).hauls.map((h) => h.number)).toEqual([1]);
  });

  it('keeps the last good index when the index turns bad, and refuses to guess without one', async () => {
    let t = 0;
    const f = files();
    const store = createStore(memoryBucket(f), { ...quiet, now: () => t });
    await store.archive();
    f['hauls/index.json'] = '{broken';
    t += 25_000;
    expect((await store.getIndex()).updatedAt).toBe(index.updatedAt);
    await expect(createStore(memoryBucket(f), quiet).getIndex()).rejects.toBeInstanceOf(IndexUnavailable);
  });

  it('validates the index shape and bundle paths', () => {
    expect(checkIndex(index)).toBeNull();
    const evil = clone(index);
    evil.hauls[0]!.path = '../../secret.json';
    expect(checkIndex(evil)).toMatch(/unexpected path/);
    expect(checkIndex({ bundleVersion: 1, hauls: [] })).toMatch(/updatedAt/);
    expect(checkIndex([])).toMatch(/object/);
  });

  it('caches validation per path and etag', async () => {
    let t = 0;
    let gets = 0;
    const base = memoryBucket(files());
    const counting = {
      head: base.head,
      get: async (k: string) => {
        if (k.endsWith('haul.json')) gets++;
        return base.get(k);
      },
    };
    const store = createStore(counting, { ...quiet, now: () => t });
    await store.archive();
    await store.archive();
    expect(gets).toBe(1);
    t += 6 * 60_000; // past the recheck window: a head request confirms the etag, no new get
    await store.archive();
    expect(gets).toBe(1);
  });
});

describe('text helpers', () => {
  it('formats dates without the build locale', () => {
    expect(fullDate('2026-10-15')).toBe('Thursday 15 October 2026');
    expect(objects(6)).toBe('Six objects');
    expect(objects(1)).toBe('One object');
    expect(objects(25)).toBe('25 objects');
  });
  it('takes whole first sentences and skips initials', () => {
    expect(firstSentence('Everyone cites the memex. Read it now.')).toBe('Everyone cites the memex.');
    expect(firstSentence('I read W. Stanley Jevons on a train. Then more.')).toBe('I read W. Stanley Jevons on a train.');
    expect(firstSentence('No full stop here')).toBe('No full stop here');
  });
});

describe('feeds and tokens', () => {
  it('escapes everything in the RSS feed', () => {
    const h = clone(haul);
    h.deck = 'Fish & <chips> "quoted"';
    const xml = rss([h]);
    expect(xml).toContain('Fish &amp; &lt;chips&gt; &quot;quoted&quot;');
    expect(xml).not.toContain('<chips>');
    expect(xml).toContain('<link>https://fromthedumpsterfire.com/haul/1</link>');
    expect(esc(`'`)).toBe('&apos;');
  });

  it('generates light and dark custom properties from the shared tokens', () => {
    const css = tokensCss();
    expect(css).toContain('--machine:#4651D2');
    expect(css).toContain('--machine:#A3ACFF');
    expect(css).toContain('--ember:#FF4F1F');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('.t-rhymes{--tint:var(--t-rhymes)}');
  });
});

describe('app links and aliases', () => {
  it('emits nothing without a real fingerprint, and rejects malformed ones', () => {
    expect(assetLinks(undefined)).toBeNull();
    expect(appleAppSiteAssociation('')).toBeNull();
    expect(() => assetLinks('not-a-fingerprint')).toThrow();
    const fp = Array.from({ length: 32 }, () => 'AB').join(':');
    expect(JSON.parse(assetLinks(fp)!)[0].target.package_name).toBe('com.fromthedumpsterfire.app');
  });

  it('maps the app deep-link aliases', () => {
    expect(aliasFor('/haul/1/note')).toBe('/haul/1#field-note');
    expect(aliasFor('/haul/001/as-we-may-think')).toBe('/haul/1/as-we-may-think');
    expect(aliasFor('/hauls')).toBe('/archive');
    expect(aliasFor('/haul/1/as-we-may-think')).toBeNull();
    expect(aliasFor('/haul/10')).toBeNull();
  });
});

describe('edge cache', () => {
  it('keys pages on deploy version, index updatedAt and path, ignoring the query', () => {
    const k1 = pageCacheKey('https://fromthedumpsterfire.com', 'v1', '2026-10-16T00:00:00Z', '/haul/1');
    const k2 = pageCacheKey('https://fromthedumpsterfire.com', 'v1', '2026-10-17T00:00:00Z', '/haul/1');
    const k3 = pageCacheKey('https://fromthedumpsterfire.com', 'v2', '2026-10-16T00:00:00Z', '/haul/1');
    expect(new Set([k1, k2, k3]).size).toBe(3);
    expect(k1).toMatch(/\/haul\/1$/);
  });
  it('lets browsers keep pages for 30 seconds and never caches server errors', () => {
    expect(cacheControl('/haul/1', 200)).toBe('public, max-age=30, must-revalidate');
    expect(cacheControl('/fonts/a.woff2', 200)).toContain('immutable');
    expect(cacheControl('/haul/1', 503)).toBe('no-store');
    expect(aliasFor('/haul/1/')).toBe('/haul/1');
    expect(aliasFor('/')).toBeNull();
  });
});

describe('redirects never leave the site', () => {
  const base = new URL('https://fromthedumpsterfire.com/');
  for (const path of ['//evil.com/', '//evil.com', '///evil.com/x/', '/\\evil.com/', '//evil.com/haul/1/note']) {
    it(`keeps ${JSON.stringify(path)} on this origin`, () => {
      const alias = aliasFor(path);
      const target = alias ? sameOriginRedirect(alias, base) : null;
      if (target) expect(new URL(target).origin).toBe(base.origin);
    });
  }
  it('refuses an alias that resolves elsewhere', () => {
    expect(sameOriginRedirect('//evil.com', base)).toBeNull();
    expect(sameOriginRedirect('https://evil.com/', base)).toBeNull();
  });
});
