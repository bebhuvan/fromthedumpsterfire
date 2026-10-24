// The shelf's pure logic: how a book's spine is sized, how spines pack onto shelves of a given width,
// what its status line says, and the first words of its latest note. No React Native here, so it is
// tested in node (shelf.test.ts) and the screens only draw.

import { BOOK_STATUSES, bookStatusLabel, shelfOrder, type BookStatus, type ShelfBook } from '@fdf/shared/shelf';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
};

/** "2026-10-02" → "2 October", with the year only when it is not this year's. */
export function dayMonth(iso: string, now = new Date()): string {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`;
}

/** "Graeber and Wengrow" from "David Graeber and David Wengrow": surnames, as a spine prints them. */
export function spineAuthor(author: string): string {
  return author
    .split(/\s*(?:,|&|\band\b)\s*/)
    .map((n) => n.trim().split(/\s+/).at(-1) ?? '')
    .filter(Boolean)
    .join(' and ');
}

/** Where a put-down book stopped: "page 212" from a note's "p. 212", else its chapter. */
export function stoppedAt(book: Pick<ShelfBook, 'notes'>): string | null {
  for (const n of book.notes) {
    const page = /\b(?:p\.?|page)\s*(\d+)\b/i.exec(n.at ?? '');
    if (page) return `page ${page[1]}`;
    if (n.at?.trim()) return n.at.trim();
  }
  return null;
}

/** "Reading since 2 October", "Read from 20 September to 12 October", "Put down at page 212". */
export function statusLine(book: ShelfBook, now = new Date()): string {
  const d = (iso: string) => dayMonth(iso, now);
  if (book.status === 'reading') return book.started ? `Reading since ${d(book.started)}` : 'Reading now';
  if (book.status === 'read') {
    if (book.started && book.finished) {
      // A span inside one year names the year once, at the end, and only when it is not this one.
      const sameYear = parts(book.started).y === parts(book.finished).y;
      const from = sameYear ? dayMonth(book.started, new Date(parts(book.started).y, 5, 1)) : d(book.started);
      return `Read from ${from} to ${d(book.finished)}`;
    }
    return book.finished ? `Finished on ${d(book.finished)}` : 'Read';
  }
  const at = stoppedAt(book);
  return at ? `Put down at ${at}` : 'Put down';
}

/** The first words of a note, cut at a word with an ellipsis; whole when short. */
export function firstWords(text: string, max = 14): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return words.join(' ');
  return words.slice(0, max).join(' ').replace(/[,;:.!?]+$/, '') + '…';
}

export interface SpineSize {
  width: number;
  height: number;
  /** Lines of title along the spine: a long title is set in two, on a wider spine. */
  lines: 1 | 2;
}

const hash = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** Longest title that fits along a spine on one line (title and author share the length). */
export const ONE_LINE = 24;
export const SPINE_MAX = 222;
/** How far a book being read stands above its neighbours. */
export const PROUD = 10;

/**
 * A spine's size: taller for a longer title, within a few points of its neighbours so the row reads
 * as one shelf; a little thicker or thinner by its id, so it never changes between visits; a long
 * title on a wider spine in two lines; a book being read stands proud.
 */
export function spineSize(book: Pick<ShelfBook, 'id' | 'title' | 'status'>): SpineSize {
  const len = (book.title.text + (book.title.italic ? ' ' + book.title.italic : '')).length;
  const lines: 1 | 2 = len > ONE_LINE ? 2 : 1;
  const h = hash(book.id);
  const width = (lines === 2 ? 54 : 40) + (h % 4) * 2;
  const height = Math.min(SPINE_MAX - PROUD, 172 + Math.min(len, 40) * 0.9 + ((h >>> 3) % 3) * 4) + (book.status === 'reading' ? PROUD : 0);
  return { width, height: Math.round(height), lines };
}

/** Spines packed onto shelves no wider than `available`, in order; one too wide still gets a shelf. */
export function packShelves<T>(items: T[], widthOf: (t: T) => number, available: number, gap: number): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const it of items) {
    const w = widthOf(it);
    const need = row.length ? used + gap + w : w;
    if (row.length && need > available) {
      rows.push(row);
      row = [it];
      used = w;
    } else {
      row.push(it);
      used = need;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

/** The shelf's groups in their order (Reading now, Read, Put down), each in shelf order, empty ones left out. */
export function shelfGroups(books: ShelfBook[]): { status: BookStatus; label: string; books: ShelfBook[] }[] {
  const ordered = shelfOrder(books);
  return BOOK_STATUSES.map((status) => ({ status, label: bookStatusLabel[status], books: ordered.filter((b) => b.status === status) })).filter((g) => g.books.length);
}

export const bookTitle = (b: Pick<ShelfBook, 'title'>) => b.title.text + (b.title.italic ? ' ' + b.title.italic : '');
