import { describe, expect, it } from 'vitest';
import type { Item } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { formName, formOf, headword, hostOf, speaker } from './forms';
import { seedData } from './seedData';

const base = { excerpt: { text: 'x', locator: '' }, plate: { url: 'u', width: 1, height: 1, caption: '', credit: '', licence: '' }, rhyme: undefined } as Pick<Item, 'excerpt' | 'plate' | 'rhyme'>;

describe('printed forms', () => {
  it('gives every content type a form with a name', () => {
    for (const type of Object.keys(typeLabel) as ContentType[]) expect(formName[formOf({ ...base, type })]).toBeTruthy();
  });

  it('sets the new types as the website does', () => {
    const f = (type: ContentType) => formOf({ ...base, type });
    expect([f('quote'), f('letter'), f('social'), f('image'), f('book'), f('tool'), f('speech')]).toEqual(['epigraph', 'letter', 'clipping', 'print', 'jacket', 'label', 'transcript']);
  });

  it('falls back to a magazine opening when the form lacks what it needs', () => {
    expect(formOf({ type: 'quote' })).toBe('opening');
    expect(formOf({ type: 'image', excerpt: base.excerpt })).toBe('opening');
    expect(formOf({ type: 'rhymes' })).toBe('opening');
  });

  it('gives every sample item its own form', () => {
    const forms = new Set(Object.values(seedData.hauls).flatMap((h) => h.items.map(formOf)));
    for (const f of ['epigraph', 'letter', 'clipping', 'print', 'jacket', 'label', 'transcript'] as const) expect(forms.has(f)).toBe(true);
  });

  it('writes headwords, speakers and hosts', () => {
    expect(headword('The Great Stink')).toEqual({ word: 'Great Stink,', article: 'The' });
    expect(headword('Datasette')).toEqual({ word: 'Datasette', article: '' });
    expect(speaker('Steve Jobs')).toBe('JOBS');
    expect(speaker('via Plato')).toBe('PLATO');
    expect(hostOf('https://www.datasette.io/docs')).toBe('datasette.io');
    expect(hostOf('mailto:x')).toBe('');
  });
});
