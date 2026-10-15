// Tests for the Desk's rules that live in shared: style check, verbatim matching, deletion-only
// cleanup, capture detection and the runtime bundle validator.

import { describe, expect, it } from 'vitest';
import type { Haul, HaulIndex } from '../src/haul';
import { checkStyle } from '../src/style';
import { findVerbatim, isVerbatimAt } from '../src/verbatim';
import { checkDeletionOnly, cleanupDeterministic } from '../src/cleanup';
import { canonicalUrl, detectText, detectUrl, extractUrls, isOnlyUrls } from '../src/detect';
import { validateHaul } from '../src/validate';
import haulJson from '../fixtures/haul-001.json';
import indexJson from '../fixtures/index.json';

const haul = haulJson as Haul;
const index = indexJson as HaulIndex;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('style check', () => {
  const rules = (t: string) => checkStyle(t).issues.filter((i) => i.severity === 'error').map((i) => i.rule);

  it('passes plain, specific prose', () => {
    expect(checkStyle('Hamming gave this talk at Bellcore on 7 March 1986. He spent thirty years at Bell Labs.').ok).toBe(true);
  });
  it('flags em dashes, and chains even in lenient mode', () => {
    expect(rules('He left — and never came back.')).toContain('em-dash');
    expect(checkStyle('He left — and never came back.', { strict: false }).ok).toBe(true);
    expect(checkStyle('A — B — C.', { strict: false }).ok).toBe(false);
  });
  it('flags "not X but Y" shapes', () => {
    expect(rules('This is not just a book, but a map of the century.')).toContain('not-x-but-y');
    expect(rules("It isn't a memoir, it's a manual.")).toContain('not-x-but-y');
    expect(rules("It's not about coal. It's about plenty.")).toContain('not-x-but-y');
    expect(rules('He was not a soldier but a clerk.')).toContain('not-x-but-y');
    expect(rules('She could not sleep, but the night was short.')).not.toContain('not-x-but-y');
  });
  it('flags hedges and banned words, with inflections', () => {
    expect(rules("It's worth noting that the essay ran in July.")).toContain('hedge');
    expect(rules('Bush delves into memory.')).toContain('banned-word');
    expect(rules('A rich tapestry of ideas.')).toContain('banned-word');
    expect(rules('The work elevated the field.')).toContain('banned-word');
    expect(rules('A seamless transition.')).toContain('banned-word');
  });
  it('flags URLs in model prose', () => {
    expect(rules('See https://example.com for more.')).toContain('url');
    expect(rules('Read it on theatlantic.com today.')).toContain('url');
  });
  it('accepts every machine note in the sample Haul', () => {
    for (const item of haul.items) for (const m of item.marginalia) expect(checkStyle(m.text).issues).toEqual([]);
  });
});

describe('verbatim matching', () => {
  const source = 'The summation of human experience is being expanded at a prodigious rate, and the means we use\nfor threading through the consequent maze is the same as was used in the days of “square-rigged” ships.';
  it('finds exact quotes and checks offsets', () => {
    const r = findVerbatim(source, 'the means we use');
    expect(r).not.toBeNull();
    expect(isVerbatimAt(source, r!, 'the means we use')).toBe(true);
  });
  it('re-anchors tolerant matches to the source characters', () => {
    const r = findVerbatim(source, '"the means we use for threading through the consequent maze"');
    expect(r?.text).toBe('the means we use\nfor threading through the consequent maze');
    const q = findVerbatim(source, 'the days of "square-rigged" ships');
    expect(q?.text).toBe('the days of “square-rigged” ships');
    expect(isVerbatimAt(source, q!, q!.text)).toBe(true);
  });
  it('refuses paraphrase', () => {
    expect(findVerbatim(source, 'the means we use to thread through the maze')).toBeNull();
  });
});

describe('deletion-only cleanup', () => {
  const raw = 'Okay so this is the Hamming talk. Um, I listened to it on the drive back from Mysore. The bit that stuck is, like, the Friday afternoons thing, you know.';
  it('accepts deletions of fillers and punctuation changes', () => {
    const clean = 'This is the Hamming talk. I listened to it on the drive back from Mysore. The bit that stuck is the Friday afternoons thing.';
    const r = checkDeletionOnly(raw, clean);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.deleted).toEqual(['Okay', 'so', 'Um', 'like', 'you know']);
  });
  it('rejects rewording, insertion and meaningful deletion', () => {
    expect(checkDeletionOnly(raw, 'This is the Hamming lecture. I listened to it on the drive back from Mysore.').ok).toBe(false);
    expect(checkDeletionOnly('I loved it.', 'I really loved it.').ok).toBe(false);
    expect(checkDeletionOnly('I did not like it.', 'I did like it.').ok).toBe(false);
    expect(checkDeletionOnly('I mean it.', 'I it.').ok).toBe(false);
  });
  it('code-only cleanup removes pure fillers and stutters and passes the gate', () => {
    const input = 'um so I I think, uh, the the essay is good . and it holds up';
    const out = cleanupDeterministic(input);
    expect(out).toBe('So I think, the essay is good. And it holds up');
    expect(checkDeletionOnly(input, out).ok).toBe(true);
  });
});

describe('capture detection', () => {
  it('detects source kinds from URLs', () => {
    expect(detectUrl('https://www.youtube.com/watch?v=a1Y73sPHKxw').kind).toBe('youtube');
    expect(detectUrl('https://youtu.be/a1Y73sPHKxw').kind).toBe('youtube');
    expect(detectUrl('https://arxiv.org/abs/1706.03762').type).toBe('paper');
    expect(detectUrl('https://x.com/someone/status/12345').type).toBe('post');
    expect(detectUrl('https://podcasts.apple.com/us/podcast/x/id1?i=2').kind).toBe('podcast');
    expect(detectUrl('https://example.org/report.pdf').kind).toBe('pdf');
    expect(detectUrl('https://someone.substack.com/p/thing').type).toBe('essay');
    expect(detectUrl('https://en.wikipedia.org/wiki/Great_Stink').type).toBe('rabbit-hole');
  });
  it('pulls many URLs from a paste', () => {
    const text = 'https://a.com/x, https://b.org/y.\n- https://a.com/x';
    expect(extractUrls(text)).toEqual(['https://a.com/x', 'https://b.org/y']);
    expect(isOnlyUrls(text)).toBe(true);
    expect(isOnlyUrls('Read this https://a.com because')).toBe(false);
  });
  it('tells poems from passages', () => {
    expect(detectText('The same stream of life\nthat runs through my veins\nnight and day\nruns through the world').type).toBe('poem');
    expect(detectText('A long paragraph of prose that goes on and on about coal and its price in Victorian England.').type).toBe('passage');
  });
  it('canonicalises tracking parameters away', () => {
    expect(canonicalUrl('https://www.example.com/a/?utm_source=x&id=3#top')).toBe('https://example.com/a?id=3');
  });
});

describe('bundle validator', () => {
  it('accepts the sample Haul and its index', () => {
    const r = validateHaul(haul, index);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('rejects a highlight that is not in the excerpt', () => {
    const h = clone(haul);
    h.items[0]!.excerpt!.highlight = 'words nobody wrote';
    expect(validateHaul(h).errors.map((e) => e.rule)).toContain('highlight');
  });
  it('rejects dangling links, missing citations and non-https links', () => {
    const h = clone(haul);
    h.items[0]!.connections.push({ type: 'Answers', title: 'x', note: 'y', itemId: 'missing' });
    h.items[0]!.marginalia.push({ text: 'Unsourced claim.', cite: '' });
    h.items[1]!.source.url = 'http://example.com';
    const rules = validateHaul(h).errors.map((e) => e.rule);
    expect(rules).toEqual(expect.arrayContaining(['link', 'citation', 'https']));
  });
  it('rejects machine prose that fails the style check', () => {
    const h = clone(haul);
    h.items[0]!.marginalia[0]!.text = 'Bush delves into a rich tapestry of ideas.';
    expect(validateHaul(h).errors.some((e) => e.rule.startsWith('style:'))).toBe(true);
  });
  it('requires a correction entry on later versions and an agreeing index', () => {
    const h = clone(haul);
    h.version = 2;
    expect(validateHaul(h).errors.map((e) => e.rule)).toContain('corrections');
    h.corrections = [{ date: '2026-10-20', text: 'Fixed a date.' }];
    expect(validateHaul(h).ok).toBe(true);
    const i = clone(index);
    i.hauls[0]!.itemCount = 3;
    expect(validateHaul(h, i).errors.map((e) => e.rule)).toContain('index');
  });
});
