import { describe, expect, it } from 'vitest';
import type { Haul, Item, Life } from './haul';
import { assembleLife, checkLifeDraft, lifeBylineText, lifeYears, sourceKey, untracedFigures, wordNumbersIn, type LifeDraft } from './life';
import { validateHaul } from './validate';
import haul001 from '../fixtures/haul-001.json';

describe('figures in a Life', () => {
  it('finds figures written as words, but not the pronoun one', () => {
    expect(wordNumbersIn('aged twenty-one or more, four months later').map((w) => w.value)).toEqual([21, 4]);
    expect(wordNumbersIn('drop it in the right one; one of the officers; no one came')).toEqual([]);
  });

  it('matches a figure rounded no finer than it is written, and fails closed otherwise', () => {
    expect(untracedFigures('173 million names', ['was 17,32,13,635.'])).toEqual([]);
    expect(untracedFigures('about 85 per cent', ['about 85 percent could not read'])).toEqual([]);
    expect(untracedFigures('aged twenty-one', ['aged 21 or more'])).toEqual([]);
    expect(untracedFigures('2.8 million women', ['some 2.8 million women'])).toEqual([]);
    expect(untracedFigures('2.9 million women', ['some 2.8 million women'])).toEqual(['2.9 million']);
    expect(untracedFigures('born in 1898', ['Born in 1899'])).toEqual(['1898']);
    expect(untracedFigures('three decades later', ['in 1921'])).toEqual(['three']);
  });
});

const src = { guha: 'Born in 1899, he was educated at Presidency College. Sukumar Sen was outraged by this practice, a ‘curious senseless relic of the past’. Some 2.8 million women voters had finally to be struck off the list.' };
const line = (id: string, text: string, quote: string, status: 'proposed' | 'kept' | 'cut' = 'kept') => ({ id, text, cites: [{ source: 'guha', quote }], status });
const draft = (): LifeDraft => ({
  name: 'Sukumar Sen',
  writer: 'Claude',
  born: { year: 1899, cites: [{ source: 'guha', quote: 'Born in 1899' }] },
  epithet: line('e', 'Chief Election Commissioner', 'Sukumar Sen was outraged'),
  sections: [{ heading: 'The roll', paragraphs: [[line('a', 'He studied at Presidency College.', 'educated at Presidency College'), line('b', 'About 2.8 million women were struck off.', '2.8 million women voters', 'cut')]] }],
  words: { text: 'curious senseless relic of the past', context: line('w', 'On women entered by description', 'Sukumar Sen was outraged by this practice'), cites: [{ source: 'guha', quote: 'a ‘curious senseless relic of the past’' }] },
  dates: [{ year: '1899', line: line('d', 'Born', 'Born in 1899') }],
  sources: [{ id: 'guha', author: 'Ramachandra Guha', title: 'India After Gandhi', kind: 'book', url: 'https://example.org/guha' }],
  reading: [],
});

describe('checking a draft', () => {
  it('anchors every quote and passes a clean draft', () => {
    const r = checkLifeDraft(draft(), src);
    expect(r.problems).toEqual([]);
    expect(r.draft.sections[0]!.paragraphs[0]![0]!.cites[0]).toMatchObject({ start: src.guha.indexOf('educated'), quote: 'educated at Presidency College' });
  });

  it('refuses words that are not inside their quote, a heading with a figure, and a listed source nobody cites', () => {
    const d = draft();
    d.words!.text = 'a curious relic';
    d.sections[0]!.heading = 'The 1951 roll';
    const msgs = checkLifeDraft(d, src).problems.map((p) => p.message).join(' | ');
    expect(msgs).toMatch(/inside the quote/);
    expect(msgs).toMatch(/no figures/);
  });

  it('assembles only kept lines, without the quotes', () => {
    const { life } = assembleLife(checkLifeDraft(draft(), src).draft);
    expect(life!.sections[0]!.paragraphs).toEqual([[{ text: 'He studied at Presidency College.', cites: [{ source: 'guha' }] }]]);
    expect(JSON.stringify(life)).not.toMatch(/quote|start/);
    expect(lifeYears(life!)).toBe('born 1899');
    expect(lifeBylineText(life!)).toBe('Written by Claude from Ramachandra Guha’s India After Gandhi.');
  });

  it('names institutions in the label and keys sources by surname or initials', () => {
    const life = { writer: 'Claude', sources: [draft().sources[0]!, { id: 'eci', author: 'Election Commission of India', title: 'Report', kind: 'report' as const, url: 'https://e.org' }] };
    expect(lifeBylineText(life)).toBe('Written by Claude from Ramachandra Guha’s India After Gandhi and the Election Commission of India’s Report.');
    expect(life.sources.map(sourceKey)).toEqual(['Guha', 'ECI']);
  });
});

describe('a Life in the bundle', () => {
  const base = haul001 as unknown as Haul;
  const withLife = (life: Partial<Life> | undefined, type = 'life'): Haul => {
    const { life: built } = assembleLife(checkLifeDraft(draft(), src).draft);
    const item: Item = { ...base.items[0]!, id: 'sukumar-sen', type: type as Item['type'], ...(life === undefined ? {} : { life: { ...built!, ...life } }) };
    return { ...base, items: [...base.items, item] };
  };
  const errs = (h: Haul) => validateHaul(h).errors.map((e) => `${e.path} ${e.message}`);

  it('passes a well-formed Life and old bundles still pass', () => {
    expect(validateHaul(base).ok).toBe(true);
    expect(errs(withLife({}))).toEqual([]);
  });

  it('refuses a Life without its profile, a profile on another type, an uncited line and a source nobody cites', () => {
    expect(errs(withLife(undefined)).join()).toMatch(/carries its profile/);
    expect(errs(withLife({}, 'essay')).join()).toMatch(/only a Life/);
    const uncited = withLife({ sections: [{ heading: 'The roll', paragraphs: [[{ text: 'He studied.', cites: [] }]] }] });
    expect(errs(uncited).join()).toMatch(/cites a source/);
    const extra = withLife({ sources: [...draft().sources, { id: 'spare', author: 'Someone', title: 'Unused', kind: 'article', url: 'https://example.org/x' }] });
    expect(errs(extra).join()).toMatch(/nothing cites it/);
    const anon = withLife({ sources: [{ ...draft().sources[0]!, author: '' }] });
    expect(errs(anon).join()).toMatch(/names who made it/);
    const styled = withLife({ epithet: { text: 'A towering testament — to democracy — and more', cites: [{ source: 'guha' }] } });
    expect(validateHaul(styled).errors.some((e) => e.rule.startsWith('style:') && e.path.endsWith('epithet.text'))).toBe(true);
  });
});
