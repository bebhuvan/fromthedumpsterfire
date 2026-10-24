import { describe, expect, it } from 'vitest';
import { validateShelf, type Shelf, type ShelfBook } from '@fdf/shared/shelf';
import devShelf from '@fdf/shared/fixtures/dev/shelf.json';
import { dayMonth, firstWords, packShelves, PROUD, shelfGroups, spineAuthor, spineSize, SPINE_MAX, statusLine, stoppedAt } from './shelf';

const now = new Date(2026, 9, 24);
const book = (b: Partial<ShelfBook>): ShelfBook => ({ id: 'b', title: { text: 'A Book' }, author: 'A. Writer', status: 'read', notes: [], lines: [], ...b });
const shelf = devShelf as unknown as Shelf;

describe('the status line', () => {
  it('says since when a book is being read', () => {
    expect(statusLine(book({ status: 'reading', started: '2026-10-02' }), now)).toBe('Reading since 2 October');
    expect(statusLine(book({ status: 'reading' }), now)).toBe('Reading now');
  });

  it('gives a read book its span, naming a year only when it is not this one', () => {
    expect(statusLine(book({ started: '2026-09-20', finished: '2026-10-12' }), now)).toBe('Read from 20 September to 12 October');
    expect(statusLine(book({ started: '2025-03-01', finished: '2025-04-02' }), now)).toBe('Read from 1 March to 2 April 2025');
    expect(statusLine(book({ started: '2025-12-20', finished: '2026-01-05' }), now)).toBe('Read from 20 December 2025 to 5 January');
    expect(statusLine(book({ finished: '2026-08-20' }), now)).toBe('Finished on 20 August');
  });

  it('says where a book was put down when a note says so', () => {
    expect(statusLine(book({ status: 'put-down', notes: [{ date: '2026-07-29', at: 'p. 212', text: 'x' }] }), now)).toBe('Put down at page 212');
    expect(stoppedAt(book({ notes: [{ date: '2026-07-29', at: 'page 40', text: 'x' }] }))).toBe('page 40');
    expect(stoppedAt(book({ notes: [{ date: '2026-07-29', at: 'chapter 4', text: 'x' }] }))).toBe('chapter 4');
    expect(statusLine(book({ status: 'put-down' }), now)).toBe('Put down');
  });

  it('formats days by hand', () => {
    expect(dayMonth('2026-10-02', now)).toBe('2 October');
    expect(dayMonth('1998-01-31T00:00:00Z', now)).toBe('31 January 1998');
  });
});

describe('spines', () => {
  it('print surnames', () => {
    expect(spineAuthor('James C. Scott')).toBe('Scott');
    expect(spineAuthor('David Graeber and David Wengrow')).toBe('Graeber and Wengrow');
    expect(spineAuthor('Hamming')).toBe('Hamming');
  });

  it('vary a little in height, set long titles in two lines on a wider spine, and never change', () => {
    const sizes = shelf.books.map(spineSize);
    for (const s of sizes) {
      expect(s.height).toBeGreaterThanOrEqual(170);
      expect(s.height).toBeLessThanOrEqual(SPINE_MAX);
    }
    expect(new Set(sizes.map((s) => s.height)).size).toBeGreaterThan(2);
    const long = spineSize(book({ title: { text: 'The Art of Doing Science', italic: 'and Engineering' } }));
    expect(long.lines).toBe(2);
    expect(long.width).toBeGreaterThan(spineSize(book({ title: { text: 'Walden' } })).width);
    expect(spineSize(shelf.books[0]!)).toEqual(spineSize(shelf.books[0]!));
  });

  it('stand proud while the book is being read', () => {
    const b = book({ id: 'same', title: { text: 'Same' } });
    expect(spineSize({ ...b, status: 'reading' }).height - spineSize(b).height).toBe(PROUD);
  });

  it('pack onto shelves without running past the edge', () => {
    const widths = [40, 40, 54, 38, 52, 40];
    for (const avail of [120, 200, 312, 600]) {
      const rows = packShelves(widths, (w) => w, avail, 3);
      expect(rows.flat()).toEqual(widths);
      for (const r of rows) expect(r.reduce((a, w) => a + w, 0) + 3 * (r.length - 1)).toBeLessThanOrEqual(avail);
    }
    expect(packShelves([500], (w) => w, 300, 3)).toEqual([[500]]);
    expect(packShelves([], (w: number) => w, 300, 3)).toEqual([]);
  });
});

describe('the shelf screen', () => {
  it('groups reading, read, put down, leaving empty groups out', () => {
    const g = shelfGroups(shelf.books);
    expect(g.map((x) => x.label)).toEqual(['Reading now', 'Read', 'Put down']);
    expect(g[1]!.books[0]!.id).toBe('the-coal-question');
    expect(shelfGroups([book({ status: 'reading' })]).map((x) => x.status)).toEqual(['reading']);
  });

  it('shows the first words of a note, cut at a word', () => {
    expect(firstWords('Long, argumentative and fun.')).toBe('Long, argumentative and fun.');
    expect(firstWords('one two three, four five', 3)).toBe('one two three…');
  });

  it('runs on the development shelf, which validates', () => {
    expect(validateShelf(shelf)).toEqual([]);
  });
});
