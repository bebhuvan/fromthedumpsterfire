import { describe, expect, it } from 'vitest';
import haul from '../fixtures/haul-001.json';
import dev from '../fixtures/dev/haul-002.json';
import type { Haul, Item } from '../src/haul';
import { ledger, wordCount } from '../src/ledger';

const base: Item = {
  id: 'x', type: 'essay', title: { text: 'T' }, creator: 'C', source: { name: 'S', date: '2026', url: 'https://example.com' },
  why: { text: 'I liked this one a lot.' }, marginalia: [], wiki: [], connections: [],
};

describe('the ledger', () => {
  it('counts words as runs of non-space', () => {
    expect(wordCount('  one  two\nthree ')).toBe(3);
    expect(wordCount(undefined)).toBe(0);
  });

  it("keeps the editor's, the source's and the machine's words apart", () => {
    const item: Item = {
      ...base,
      excerpt: { text: 'Four words from source.' } as Item['excerpt'],
      marginalia: [{ text: 'A machine note here.', cite: 'Wikipedia' }],
      ideas: [{ text: 'The idea in brief.', quote: 'A quoted passage.', locator: 'p. 1', reaction: 'Yes indeed.' }],
      connections: [{ type: 'Answers', title: 'Other', note: 'My own link note.' }],
      blocks: [{ kind: 'quote', text: 'Pull quote words.' }, { kind: 'code', code: 'not counted at all' }],
    };
    expect(ledger(item)).toEqual({ editor: 6 + 2 + 4, source: 4 + 3 + 3, machine: 4 + 4 });
  });

  it('counts every item of the sample Hauls without throwing, and the note is always the editor’s', () => {
    for (const h of [haul, dev] as unknown as Haul[]) for (const it of h.items) {
      const l = ledger(it);
      expect(l.editor).toBeGreaterThan(0);
      expect(l.source).toBeGreaterThanOrEqual(0);
      expect(l.machine).toBeGreaterThanOrEqual(0);
    }
  });
});
