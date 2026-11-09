import { describe, expect, it } from 'vitest';
import { itemIssues, itemStanding, plainPath, quotationIssues, type ItemForCheck } from './prepublish';
import { normalisedForMatch } from './verbatim';

describe('where an item stands', () => {
  it('says plainly whether it is on the Desk, in a Haul, or published', () => {
    expect(itemStanding({ archived: false, haul: null, publishedIn: null }).text).toBe('On the Desk, not in a Haul');
    expect(itemStanding({ archived: true, haul: null, publishedIn: null }).text).toBe('Archived, not in a Haul');
    expect(itemStanding({ archived: false, haul: { number: 3, status: 'draft', version: 0 }, publishedIn: null }).text).toBe('In Haul 003, not yet published');
    const pub = itemStanding({ archived: false, haul: { number: 2, status: 'published', version: 3 }, publishedIn: 3 });
    expect(pub).toMatchObject({ state: 'published', text: 'Published in Haul 002, version 3' });
    expect(pub.detail).toMatch(/correction/);
  });
  it('tells an item added after its Haul went out from one readers already have', () => {
    const s = itemStanding({ archived: false, haul: { number: 2, status: 'published', version: 3 }, publishedIn: null });
    expect(s).toMatchObject({ state: 'next-version', text: 'In Haul 002, not yet published' });
    expect(s.detail).toMatch(/publish a correction/);
  });
});

const SOURCE = `For centuries, bird migration was a mystery. In the early 1800s, dramatic evidence emerged supporting the theory of migration. White storks began appearing in Germany with African arrows embedded in their bodies. These birds became known as pfeilstorchs, or "arrow storks". Subscribe now to get more.`;

const base: ItemForCheck = {
  title: 'Arrow storks',
  type: 'essay',
  creator: 'Amy L. Scarpignato',
  sourceName: 'The Conversation',
  sourceDate: '16 October 2026',
  year: null,
  url: 'https://theconversation.com/bird-migration-123',
  minutes: null,
  why: 'A stork flew home with a spear in its neck, and that settled an argument.',
  source: { text: SOURCE, wordCount: 50 },
  keptCards: [],
  pending: { notes: 0, ideas: 0, cards: 0 },
};
const kinds = (it: Partial<ItemForCheck>) => itemIssues({ ...base, ...it }).map((i) => `${i.kind}:${i.severity}`);

describe('before publishing', () => {
  it('finds nothing in a well-made item', () => {
    expect(itemIssues(base)).toEqual([]);
  });

  it('wants the person who made it, not the platform', () => {
    expect(kinds({ creator: '' })).toEqual(['maker:wrong']);
    expect(kinds({ creator: 'Substack' })).toEqual(['maker:wrong']);
    expect(kinds({ creator: 'YouTube' })).toEqual(['maker:wrong']);
    expect(kinds({ creator: 'astralcodexten.substack.com' })).toEqual(['maker:wrong']);
    expect(kinds({ creator: 'The Conversation' })).toEqual(['maker:wrong']); // the site's own name
    expect(kinds({ creator: 'Aeon', sourceName: 'Aeon', url: 'https://example.org/x' })).toEqual(['maker:doubt']);
    expect(itemIssues({ ...base, creator: 'Substack' })[0]!.message).toContain('"Substack"');
  });

  it('wants a date or a year', () => {
    expect(kinds({ sourceDate: '' })).toEqual(['date:wrong']);
    expect(kinds({ sourceDate: null, year: 1859 })).toEqual([]);
  });

  it("catches a paywall's teaser stored as the piece", () => {
    expect(kinds({ source: { text: 'The opening paragraph. This post is for paid subscribers. Already a subscriber? Sign in', wordCount: 14 } })).toEqual(['teaser:wrong']);
    expect(kinds({ minutes: 12, source: { text: SOURCE, wordCount: 400 } })).toEqual(['teaser:doubt']);
    expect(kinds({ type: 'podcast', minutes: 90, source: { text: SOURCE, wordCount: 400 } })).toEqual([]);
  });

  it('flags a quotation from the piece set as the editor’s words', () => {
    const why = `This is why I kept it.\n\nWhite storks began appearing in Germany with African arrows embedded in their bodies.`;
    const issues = itemIssues({ ...base, why });
    expect(issues.map((i) => `${i.kind}:${i.severity}`)).toEqual(['quotation:wrong']);
    expect(issues[0]!.message).toContain('"> "');
    expect(issues[0]!.fix).toBe('why');
  });

  it('leaves alone a quotation already on a "> " line, or in quotation marks inside a sentence', () => {
    expect(kinds({ why: `I kept it.\n\n> White storks began appearing in Germany with African arrows embedded in their bodies.` })).toEqual([]);
    expect(kinds({ why: 'She writes that “white storks began appearing in Germany with African arrows embedded in their bodies,” which is wonderful.' })).toEqual([]);
  });

  it('doubts a long sentence lifted from the piece without quotation marks', () => {
    const src = normalisedForMatch(SOURCE);
    const why = 'I love this. In the early 1800s, dramatic evidence emerged supporting the theory of migration. Then the storks.';
    expect(quotationIssues(why, src).map((i) => i.severity)).toEqual(['doubt']);
    // Short shared phrases are not quotations.
    expect(quotationIssues('Bird migration was a mystery for centuries, and I never knew.', src)).toEqual([]);
  });

  it('flags Wikipedia cards that are ambiguous or off topic', () => {
    expect(kinds({ keptCards: [{ id: 'w1', title: 'White stork', extract: 'The white stork is a large bird.' }] })).toEqual([]);
    expect(kinds({ keptCards: [{ id: 'w2', title: 'Mercury', extract: 'Mercury may refer to: a planet, an element…' }] })).toEqual(['wiki:wrong']);
    expect(kinds({ keptCards: [{ id: 'w3', title: 'Dilettante (record label)', extract: 'A British record label.' }] })).toEqual(['wiki:doubt']);
    // A bracketed qualifier is not held against the card.
    expect(kinds({ keptCards: [{ id: 'w4', title: 'Pfeilstorch (bird)', extract: 'A Pfeilstorch is a stork injured by an arrow.' }] })).toEqual([]);
  });

  it('counts suggestions still waiting for a tick', () => {
    const [u] = itemIssues({ ...base, pending: { notes: 2, ideas: 0, cards: 1 } });
    expect(u).toMatchObject({ kind: 'unticked', severity: 'doubt', fix: 'suggestions' });
    expect(u!.message).toBe('2 margin notes and 1 Wikipedia card are waiting for a tick. Only ticked ones print.');
  });
});

describe('the publish check in plain words', () => {
  it('names the place, not the bundle path', () => {
    expect(plainPath('items[2].why.text')).toEqual({ item: 2, where: 'your note' });
    expect(plainPath('items[0].source.date')).toEqual({ item: 0, where: 'the date' });
    expect(plainPath('fieldNote.paragraphs')).toEqual({ where: 'The field note' });
    expect(plainPath('fieldNote.title.text')).toEqual({ where: "The field note's title" });
    expect(plainPath('deck')).toEqual({ where: 'The deck' });
  });
});
