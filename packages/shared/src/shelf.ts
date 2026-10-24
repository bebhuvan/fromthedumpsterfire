// The shelf: the books the editor is reading or has read, each with a few dated notes in their own
// words. Not reviews and not recommendations: interesting books and what the editor made of them.
// Published by the Desk as one JSON file (shelf/shelf.json in FILES), apart from the Hauls, because a
// book takes weeks and a Haul takes days. A Haul's book item may point to its shelf entry (Item.shelf).

import type { Audio, Plate, Title } from './haul';
import { AUDIO_FORMATS } from './haul';
import { editionInk, palettes, type Scheme } from './tokens';

export const SHELF_VERSION = 1;
export const SHELF_PATH = 'shelf/shelf.json';

export type BookStatus = 'reading' | 'read' | 'put-down';
export const BOOK_STATUSES: readonly BookStatus[] = ['reading', 'read', 'put-down'];
export const bookStatusLabel: Record<BookStatus, string> = { reading: 'Reading now', read: 'Read', 'put-down': 'Put down' };

/** One of the editor's notes on a book, verbatim, with the day it was written. */
export interface BookNote {
  date: string; // ISO date
  text: string;
  audio?: Audio;
  /** Where in the book the note was written, e.g. "p. 112" or "chapter 4". */
  at?: string;
}

/** A line from the book the editor copied out, with where it is. Typed from the page by the editor. */
export interface BookLine {
  text: string;
  locator?: string;
}

/** The colours a book's spine can take on the shelf (light and dark in tokens.ts: spineInk). */
export type Spine = 'oxblood' | 'teal' | 'ochre' | 'plum' | 'pine' | 'umber' | 'slate' | 'olive' | 'ink' | 'paper';

export interface ShelfBook {
  /** A lowercase slug, the book's address: /shelf/<id>. */
  id: string;
  title: Title;
  author: string;
  /** The year the book first came out. */
  year?: number;
  publisher?: string;
  /** Where to find the book: the publisher's page, Open Library, a library. https only. */
  url?: string;
  status: BookStatus;
  started?: string; // ISO date
  finished?: string; // ISO date
  /** The editor's own photograph or the cover, copied to FILES, with its credit and licence. */
  cover?: Plate;
  spine?: Spine;
  /** Newest first. */
  notes: BookNote[];
  lines: BookLine[];
  /** Where the book appeared in a Haul. */
  hauls?: { number: number; itemId: string }[];
}

export interface Shelf {
  bundleVersion: number;
  updatedAt: string;
  /** Reading first, then by the latest note or finish date, newest first. */
  books: ShelfBook[];
}

export const SPINES: readonly Spine[] = ['oxblood', 'teal', 'ochre', 'plum', 'pine', 'umber', 'slate', 'olive', 'ink', 'paper'];

/** A spine's cloth and the colour of the type stamped on it, per scheme. */
export function spineColours(spine: Spine, scheme: Scheme): { cloth: string; type: string } {
  const p = palettes[scheme];
  if (spine === 'ink') return { cloth: p.ink, type: p.bg };
  if (spine === 'paper') return { cloth: p.plate, type: p.ink };
  // Edition inks are deep in light mode and pale in dark mode; the type takes the opposite.
  return { cloth: editionInk[scheme][spine], type: scheme === 'light' ? '#FFFFFF' : p.bg };
}

/** A book's spine colour: the editor's choice, else one picked from its id, so it never changes. */
export function spineOf(book: Pick<ShelfBook, 'id' | 'spine'>): Spine {
  if (book.spine && SPINES.includes(book.spine)) return book.spine;
  let h = 0;
  for (const ch of book.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPINES[h % SPINES.length]!;
}

/** The day a book last changed: its newest note, its finish, its start. */
export function bookUpdated(b: ShelfBook): string {
  return [b.notes[0]?.date, b.finished, b.started].filter((x): x is string => Boolean(x)).sort().at(-1) ?? '';
}

/** Order for the shelf: reading first, then the most recently touched. */
export function shelfOrder(books: ShelfBook[]): ShelfBook[] {
  const rank: Record<BookStatus, number> = { reading: 0, read: 1, 'put-down': 2 };
  return [...books].sort((a, b) => rank[a.status] - rank[b.status] || bookUpdated(b).localeCompare(bookUpdated(a)) || a.id.localeCompare(b.id));
}

const ISO = /^\d{4}-\d{2}-\d{2}/;
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Validate a shelf before it is published or rendered. Returns the problems found (empty when good). */
export function validateShelf(s: Shelf, opts: { filesBase?: string } = {}): string[] {
  const errs: string[] = [];
  const e = (p: string, m: string) => errs.push(`${p}: ${m}`);
  const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const https = (v: unknown) => typeof v === 'string' && /^https:\/\/\S+$/.test(v);
  if (!s || typeof s !== 'object') return ['shelf: not an object'];
  if (s.bundleVersion !== SHELF_VERSION) e('bundleVersion', `must be ${SHELF_VERSION}`);
  if (!str(s.updatedAt)) e('updatedAt', 'missing');
  if (!Array.isArray(s.books)) return [...errs, 'books: must be an array'];
  const ids = new Set<string>();
  s.books.forEach((b, i) => {
    const p = `books[${i}]`;
    if (!b || typeof b !== 'object') return e(p, 'not an object');
    if (typeof b.id !== 'string' || !ID.test(b.id)) e(`${p}.id`, 'a lowercase slug');
    else if (ids.has(b.id)) e(`${p}.id`, 'ids are unique');
    else ids.add(b.id);
    if (!b.title || !str(b.title.text)) e(`${p}.title`, 'needs text');
    if (!str(b.author)) e(`${p}.author`, 'name the author');
    if (b.year !== undefined && !Number.isInteger(b.year)) e(`${p}.year`, 'a whole year');
    if (b.url !== undefined && !https(b.url)) e(`${p}.url`, 'https only');
    if (!BOOK_STATUSES.includes(b.status)) e(`${p}.status`, BOOK_STATUSES.join(', '));
    if (b.started !== undefined && !ISO.test(b.started)) e(`${p}.started`, 'an ISO date');
    if (b.finished !== undefined && !ISO.test(b.finished)) e(`${p}.finished`, 'an ISO date');
    if (b.spine !== undefined && !SPINES.includes(b.spine)) e(`${p}.spine`, SPINES.join(', '));
    if (b.cover) {
      if (!https(b.cover.url)) e(`${p}.cover.url`, 'https only');
      const base = opts.filesBase?.replace(/\/$/, '');
      if (base && !b.cover.url.startsWith(`${base}/`)) e(`${p}.cover.url`, `must be published under ${base}/`);
      if (!str(b.cover.credit) || !str(b.cover.licence)) e(`${p}.cover`, 'a cover states its credit and licence');
    }
    if (!Array.isArray(b.notes)) e(`${p}.notes`, 'must be an array');
    else
      b.notes.forEach((n, j) => {
        if (!str(n.text)) e(`${p}.notes[${j}].text`, 'empty');
        if (!ISO.test(n.date ?? '')) e(`${p}.notes[${j}].date`, 'an ISO date');
        if (n.audio && (!https(n.audio.url) || (n.audio.format && !AUDIO_FORMATS.includes(n.audio.format)))) e(`${p}.notes[${j}].audio`, 'an https audio file');
      });
    if (!Array.isArray(b.lines)) e(`${p}.lines`, 'must be an array');
    else b.lines.forEach((l, j) => !str(l.text) && e(`${p}.lines[${j}].text`, 'empty'));
    b.hauls?.forEach((h, j) => {
      if (!Number.isInteger(h.number) || h.number < 1 || !str(h.itemId)) e(`${p}.hauls[${j}]`, 'a Haul number and an item id');
    });
  });
  return errs;
}
