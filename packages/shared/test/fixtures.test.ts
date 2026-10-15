import { describe, expect, it } from 'vitest';
import type { Haul, HaulIndex } from '../src/haul';
import { BUNDLE_VERSION, haulSlug } from '../src/haul';
import { typeSwatch } from '../src/tokens';
import haulJson from '../fixtures/haul-001.json';
import indexJson from '../fixtures/index.json';

const haul = haulJson as Haul;
const index = indexJson as HaulIndex;

// The same invariants the publisher must enforce before writing any bundle.
describe('haul bundle invariants', () => {
  const ids = new Set(haul.items.map((i) => i.id));
  const threadIds = new Set(haul.threads.map((t) => t.id));

  it('uses the current bundle version', () => {
    expect(haul.bundleVersion).toBe(BUNDLE_VERSION);
    expect(index.bundleVersion).toBe(BUNDLE_VERSION);
  });

  it('has unique item ids and known content types', () => {
    expect(ids.size).toBe(haul.items.length);
    for (const item of haul.items) expect(typeSwatch).toHaveProperty(item.type);
  });

  it('highlights only text that exists', () => {
    const fn = haul.fieldNote;
    if (fn.highlight) expect(fn.paragraphs.join(' ')).toContain(fn.highlight);
    for (const item of haul.items) {
      const ex = item.excerpt;
      if (ex?.highlight) expect(ex.text).toContain(ex.highlight);
    }
  });

  it('links only to items and threads in the bundle', () => {
    const refs = [
      ...haul.fieldNote.route.map((r) => r.itemId),
      ...haul.items.flatMap((i) => i.connections.map((c) => c.itemId)),
      ...haul.threads.flatMap((t) => t.points.map((p) => p.itemId)),
    ].filter((x): x is string => Boolean(x));
    for (const id of refs) expect(ids).toContain(id);
    for (const c of haul.items.flatMap((i) => i.connections)) {
      if (c.threadId) expect(threadIds).toContain(c.threadId);
      expect(Boolean(c.itemId || c.threadId)).toBe(true);
    }
  });

  it('gives every machine note a citation and every link https', () => {
    for (const item of haul.items) {
      for (const m of item.marginalia) expect(m.cite.length).toBeGreaterThan(0);
      for (const url of [item.source.url, ...item.wiki.map((w) => w.url)]) expect(url).toMatch(/^https:\/\//);
    }
  });

  it('agrees with its index entry', () => {
    const entry = index.hauls.find((h) => h.number === haul.number);
    expect(entry).toBeDefined();
    expect(entry!.itemCount).toBe(haul.items.length);
    expect(entry!.path).toContain(haulSlug(haul.number));
    expect(entry!.title).toEqual(haul.title);
  });
});
