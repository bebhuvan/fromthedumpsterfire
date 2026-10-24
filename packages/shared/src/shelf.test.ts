import { describe, expect, it } from 'vitest';
import shelfJson from '../fixtures/dev/shelf.json';
import { shelfOrder, spineOf, validateShelf, type Shelf } from './shelf';

const shelf = shelfJson as Shelf;

describe('shelf', () => {
  it('the development shelf validates', () => expect(validateShelf(shelf)).toEqual([]));
  it('puts books being read first, then the most recently touched', () => {
    const order = shelfOrder(shelf.books).map((b) => b.status);
    expect(order.indexOf('read')).toBeGreaterThan(order.lastIndexOf('reading'));
    expect(shelfOrder(shelf.books)[0]!.id).toBe('seeing-like-a-state');
  });
  it('gives each book a stable spine', () => {
    expect(spineOf({ id: 'x' })).toBe(spineOf({ id: 'x' }));
    expect(spineOf({ id: 'x', spine: 'ink' })).toBe('ink');
  });
  it('refuses bad books', () => {
    const bad = { ...shelf, books: [{ ...shelf.books[0]!, id: 'Bad Id', author: '', url: 'http://x', status: 'loved' as never }] };
    expect(validateShelf(bad).length).toBeGreaterThanOrEqual(4);
  });
  it('refuses a cover without credit, or hotlinked', () => {
    const b = { ...shelf.books[0]!, cover: { url: 'https://upload.wikimedia.org/x.jpg', width: 1, height: 1, caption: '', credit: '', licence: '' } };
    expect(validateShelf({ ...shelf, books: [b] }, { filesBase: 'https://files.example.org' }).join(' ')).toMatch(/credit.*published under|published under.*credit/s);
  });
  it('refuses a recording hosted anywhere but the files base', () => {
    const note = { date: '2026-10-20', text: 'Said aloud.', audio: { url: 'https://cdn.example.org/a.m4a', seconds: 4, format: 'm4a' as const } };
    const b = { ...shelf.books[0]!, notes: [note] };
    expect(validateShelf({ ...shelf, books: [b] }, { filesBase: 'https://files.example.org' })).toEqual(['books[0].notes[0].audio: must be published under https://files.example.org/']);
    expect(validateShelf({ ...shelf, books: [b] })).toEqual([]);
  });
});
