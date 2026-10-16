import { describe, expect, it } from 'vitest';
import type { Haul, HaulIndex } from '@fdf/shared/haul';
import seedHaul from '@fdf/shared/fixtures/haul-001.json';
import seedIndex from '@fdf/shared/fixtures/index.json';
import { buildSearchIndex, query, topicIndex, around } from '../src/lib/search';
import { firstSentence, fullDate, objects, safeHref } from '../src/lib/site';
import { assemble, loadArchive } from '../src/lib/data';
import { esc, rss } from '../src/lib/xml';
import { tokensCss } from '../src/lib/tokens-css';
import { assetLinks, appleAppSiteAssociation } from '../src/lib/applinks';
import { aliasFor } from '../src/worker/lib';

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

describe('build data', () => {
  it('loads the sample Haul when asked', async () => {
    const a = await loadArchive({ useSeed: true });
    expect(a.source).toBe('seed');
    expect(a.hauls[0]!.number).toBe(1);
  });

  it('fails the build on an invalid bundle', () => {
    const bad = clone(haul);
    bad.items[0]!.excerpt!.highlight = 'words that are not in the excerpt';
    expect(() => assemble(index, [bad])).toThrow(/failed validation[\s\S]*highlight/);
  });

  it('keeps the latest version of each Haul', () => {
    const v2 = clone(haul);
    v2.version = 2;
    v2.corrections = [{ date: '2026-10-16', text: 'Fixed a date.' }];
    expect(assemble(index, [haul, v2])[0]!.version).toBe(2);
    expect(assemble(index, [v2, haul])[0]!.version).toBe(2);
  });

  it('reads remote bundles, refuses odd paths, and falls back only in development', async () => {
    const files: Record<string, unknown> = {
      'https://files.example/hauls/index.json': index,
      'https://files.example/hauls/001/v1/haul.json': haul,
    };
    const fetchJson = async (url: string) => {
      if (!(url in files)) throw new Error(`404 ${url}`);
      return files[url];
    };
    const ok = await loadArchive({ base: 'https://files.example', fetchJson });
    expect(ok.source).toBe('remote');

    const evil = clone(index);
    evil.hauls[0]!.path = '../../secret.json';
    files['https://files.example/hauls/index.json'] = evil;
    await expect(loadArchive({ base: 'https://files.example', fetchJson })).rejects.toThrow(/unexpected path/);

    const down = async () => {
      throw new Error('offline');
    };
    await expect(loadArchive({ base: 'https://files.example', fetchJson: down })).rejects.toThrow(/offline/);
    expect((await loadArchive({ base: 'https://files.example', fetchJson: down, dev: true })).source).toBe('seed');
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

describe('before Haul 001', () => {
  it('builds from an empty index', () => {
    expect(assemble({ bundleVersion: 1, updatedAt: '2026-10-16T00:00:00.000Z', hauls: [] }, [])).toEqual([]);
  });
});
