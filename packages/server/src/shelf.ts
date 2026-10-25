// The shelf on the Desk: books, the editor's dated notes on each, lines copied from the page, a
// cover, and the link from a Haul's book item to its shelf book. Every rule that decides what may
// print is enforced here, whatever the Desk sends:
//
// - a book's id is a slug of its title, unique, made once and never changed (it is the public address);
// - notes are the editor's words, stored as given. A dictated note comes through the voice-note path
//   (Whisper, then the deletion-only cleanup in voice.ts); what is stored is the text the editor accepted;
// - lines are typed from the page by the editor; past about 60 words a line is flagged, never refused;
// - a cover follows the credit rule of pictures (blocks.ts: credit, licence, who made it, and for an
//   upload where it was found), is fetched through guardedFetch with a byte cap, and is kept in MEDIA.
//
// publish.ts builds shelf/shelf.json from these rows and is the only writer to FILES.

import { bookStatusLabel, type BookStatus, type Shelf, type ShelfBook, type Spine } from '@fdf/shared/shelf';
import type { Title } from '@fdf/shared/haul';
import type { Env } from './env';
import type { ItemRow, NoteRow } from './db';
import { BlockRefused, checkPictureMeta, fetchImage, sourced, storePicture, type PictureMeta } from './blocks';
import { formatOfNote } from './voice';
import { dateIst, newId, nowIso, parseJson, slugify, wordCount } from './util';

export interface BookRow {
  id: string;
  title_text: string;
  title_italic: string | null;
  author: string;
  year: number | null;
  publisher: string | null;
  url: string | null;
  status: BookStatus;
  started: string | null;
  finished: string | null;
  spine: Spine | null;
  cover_key: string | null;
  cover_mime: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_caption: string | null;
  cover_credit: string | null;
  cover_licence: string | null;
  cover_creator: string | null;
  cover_source_url: string | null;
  cover_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookNoteRow {
  id: string;
  book_id: string;
  date: string;
  at: string | null;
  text: string;
  note_id: string | null;
  audio_key: string | null;
  format: string | null;
  seconds: number | null;
  publish_audio: number;
  created_at: string;
  updated_at: string;
}

export interface BookLineRow {
  id: string;
  book_id: string;
  text: string;
  locator: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

const refuse = (m: string, status = 422): never => {
  throw new BlockRefused(m, status);
};

/** A copied line longer than this many words is flagged (a line is a sentence or two, not a page). */
export const LINE_WORDS = 60;
export const MAX_LINES_PER_BOOK = 40;
export const MAX_NOTES_PER_BOOK = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Today in India time, as an ISO date. */
export const todayIst = () => dateIst(nowIso());

/** A real calendar date (2026-02-30 is not one). */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The flag on a long line, or null. Never a refusal: the editor decides. */
export function lineWarning(text: string): string | null {
  const n = wordCount(text);
  return n > LINE_WORDS ? `This line is ${n} words. A line is a sentence or two; past about ${LINE_WORDS} words it reads as a passage.` : null;
}

// ---------------------------------------------------------------- slugs

/** A book's slug from its title: "The Coal" + "Question" -> "the-coal-question"; unique on the shelf. */
export async function bookSlug(env: Env, title: Title): Promise<string> {
  const base = slugify([title.text, title.italic].filter(Boolean).join(' '), 60);
  // A prefix compare, not LIKE: D1 refuses LIKE patterns over 50 bytes, and a long title's slug is 60.
  const taken = new Set(
    (await env.DB.prepare(`SELECT id FROM books WHERE id = ? OR substr(id, 1, ?) = ?`).bind(base, base.length + 1, `${base}-`).all<{ id: string }>()).results.map((r) => r.id),
  );
  if (!taken.has(base)) return base;
  for (let k = 2; ; k++) if (!taken.has(`${base}-${k}`)) return `${base}-${k}`;
}

// ---------------------------------------------------------------- books

export interface BookInput {
  title: Title;
  author: string;
  year?: number | null;
  publisher?: string | null;
  url?: string | null;
  status?: BookStatus;
  started?: string | null;
  finished?: string | null;
  spine?: Spine | null;
}

export type BookPatch = Partial<BookInput>;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function checkDates(started: string | null, finished: string | null) {
  if (started && !isIsoDate(started)) refuse('The start date must be a real date (YYYY-MM-DD).', 400);
  if (finished && !isIsoDate(finished)) refuse('The finish date must be a real date (YYYY-MM-DD).', 400);
  if (started && finished && finished < started) refuse('The book cannot be finished before it was started.', 400);
}

function checkUrl(url: string | null | undefined) {
  if (url && !/^https:\/\/\S+$/.test(url)) refuse('Where to find the book must be an https link.', 400);
}

export async function bookOr404(env: Env, id: string): Promise<BookRow> {
  const b = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(id).first<BookRow>();
  if (!b) refuse('No such book on the shelf.', 404);
  return b!;
}

export async function createBook(env: Env, input: BookInput): Promise<BookRow> {
  const title: Title = { text: clean(input.title.text), ...(clean(input.title.italic) ? { italic: clean(input.title.italic) } : {}) };
  if (!title.text) refuse('Give the book its title.', 400);
  const author = clean(input.author);
  if (!author) refuse('Name the author.', 400);
  const status = input.status ?? 'reading';
  // A book being read started today unless the editor says otherwise; a book read finished today.
  const started = input.started ?? (status === 'reading' ? todayIst() : null);
  const finished = input.finished ?? (status === 'read' ? todayIst() : null);
  checkDates(started, finished);
  checkUrl(input.url);
  const id = await bookSlug(env, title);
  if (!ID.test(id)) refuse('The title needs at least one letter or number for its address.', 400);
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO books (id, title_text, title_italic, author, year, publisher, url, status, started, finished, spine, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, title.text, title.italic ?? null, author, input.year ?? null, clean(input.publisher) || null, input.url || null, status, started, finished, input.spine ?? null, now, now)
    .run();
  return bookOr404(env, id);
}

/**
 * Change a book's fields. The id never changes. A status switch fills the obvious date: marking a
 * book read sets its finish to today unless one is given; starting it again clears the finish.
 */
export async function patchBook(env: Env, row: BookRow, p: BookPatch): Promise<BookRow> {
  const next = { ...row };
  if (p.title !== undefined) {
    const text = clean(p.title.text);
    if (!text) refuse('A title cannot be empty.', 400);
    next.title_text = text;
    next.title_italic = clean(p.title.italic) || null;
  }
  if (p.author !== undefined) {
    if (!clean(p.author)) refuse('Name the author.', 400);
    next.author = clean(p.author);
  }
  if (p.year !== undefined) next.year = p.year;
  if (p.publisher !== undefined) next.publisher = clean(p.publisher) || null;
  if (p.url !== undefined) {
    checkUrl(p.url);
    next.url = p.url || null;
  }
  if (p.spine !== undefined) next.spine = p.spine;
  if (p.started !== undefined) next.started = p.started || null;
  if (p.finished !== undefined) next.finished = p.finished || null;
  if (p.status !== undefined && p.status !== row.status) {
    next.status = p.status;
    if (p.status === 'read' && p.finished === undefined && !row.finished) next.finished = todayIst();
    if (p.status === 'reading' && p.finished === undefined) next.finished = null;
    if (p.status === 'reading' && p.started === undefined && !row.started) next.started = todayIst();
  }
  checkDates(next.started, next.finished);
  await env.DB.prepare(
    `UPDATE books SET title_text = ?, title_italic = ?, author = ?, year = ?, publisher = ?, url = ?, status = ?, started = ?, finished = ?, spine = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(next.title_text, next.title_italic, next.author, next.year, next.publisher, next.url, next.status, next.started, next.finished, next.spine, nowIso(), row.id)
    .run();
  return bookOr404(env, row.id);
}

/** Linked items in published Hauls keep a book on the shelf; otherwise it goes with its notes, lines and files. */
export async function deleteBook(env: Env, row: BookRow): Promise<void> {
  const pub = await env.DB.prepare(
    `SELECT h.number FROM items i JOIN haul_items hi ON hi.item_id = i.id JOIN hauls h ON h.id = hi.haul_id WHERE i.shelf_id = ? AND h.status = 'published' LIMIT 1`,
  )
    .bind(row.id)
    .first<{ number: number }>();
  if (pub) refuse(`This book appears in published Haul ${pub.number}, which links to it. Mark it put down instead.`, 409);
  const notes = (await env.DB.prepare('SELECT note_id, audio_key FROM book_notes WHERE book_id = ?').bind(row.id).all<{ note_id: string | null; audio_key: string | null }>()).results;
  await env.DB.batch([
    env.DB.prepare('UPDATE items SET shelf_id = NULL WHERE shelf_id = ?').bind(row.id),
    ...notes.filter((n) => n.note_id).map((n) => env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(n.note_id)),
    env.DB.prepare('DELETE FROM book_notes WHERE book_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM book_lines WHERE book_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM books WHERE id = ?').bind(row.id),
  ]);
  for (const k of [row.cover_key, ...notes.map((n) => n.audio_key)]) if (k) await env.MEDIA.delete(k);
}

// ---------------------------------------------------------------- notes

export interface NoteInput {
  text: string;
  date?: string;
  at?: string;
  /** The voice note (notes.id) the text was dictated in; its recording stays with the note. */
  noteId?: string;
  publishAudio?: boolean;
}

export async function addBookNote(env: Env, book: BookRow, input: NoteInput): Promise<string> {
  const text = input.text.trim();
  if (!text) refuse('A note needs some words.', 400);
  const date = input.date ?? todayIst();
  if (!isIsoDate(date)) refuse('The note’s date must be a real date (YYYY-MM-DD).', 400);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM book_notes WHERE book_id = ?').bind(book.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_NOTES_PER_BOOK) refuse(`A book takes at most ${MAX_NOTES_PER_BOOK} notes.`, 409);
  let voice: NoteRow | null = null;
  if (input.noteId) {
    voice = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(input.noteId).first<NoteRow>();
    if (!voice) refuse('That voice note is gone; record it again.', 409);
    const used = await env.DB.prepare('SELECT book_id FROM book_notes WHERE note_id = ?').bind(input.noteId).first();
    if (used) refuse('That voice note is already a note on the shelf.', 409);
  }
  const id = newId('bn_');
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO book_notes (id, book_id, date, at, text, note_id, audio_key, format, seconds, publish_audio, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      book.id,
      date,
      input.at?.trim() || null,
      text,
      voice?.id ?? null,
      voice?.audio_key ?? null,
      voice ? formatOfNote(voice) : null,
      voice?.seconds ?? null,
      voice && input.publishAudio ? 1 : 0,
      now,
      now,
    )
    .run();
  await touch(env, book.id);
  return id;
}

export async function patchBookNote(env: Env, row: BookNoteRow, p: { text?: string; date?: string; at?: string; publishAudio?: boolean }): Promise<void> {
  const text = p.text !== undefined ? p.text.trim() : row.text;
  if (!text) refuse('A note needs some words. Delete it instead.', 400);
  const date = p.date ?? row.date;
  if (!isIsoDate(date)) refuse('The note’s date must be a real date (YYYY-MM-DD).', 400);
  if (p.publishAudio && !row.audio_key) refuse('This note was typed; it has no recording to publish.', 409);
  await env.DB.prepare('UPDATE book_notes SET text = ?, date = ?, at = ?, publish_audio = ?, updated_at = ? WHERE id = ?')
    .bind(text, date, p.at !== undefined ? p.at.trim() || null : row.at, p.publishAudio !== undefined ? (p.publishAudio ? 1 : 0) : row.publish_audio, nowIso(), row.id)
    .run();
  await touch(env, row.book_id);
}

export async function deleteBookNote(env: Env, row: BookNoteRow): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM book_notes WHERE id = ?').bind(row.id),
    ...(row.note_id ? [env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(row.note_id)] : []),
  ]);
  if (row.audio_key) await env.MEDIA.delete(row.audio_key);
  await touch(env, row.book_id);
}

/** Newest first: by the day written, then by when it was added. */
export async function notesFor(env: Env, bookId: string): Promise<BookNoteRow[]> {
  return (await env.DB.prepare('SELECT * FROM book_notes WHERE book_id = ? ORDER BY date DESC, created_at DESC').bind(bookId).all<BookNoteRow>()).results;
}

// ---------------------------------------------------------------- lines

export async function linesFor(env: Env, bookId: string): Promise<BookLineRow[]> {
  return (await env.DB.prepare('SELECT * FROM book_lines WHERE book_id = ? ORDER BY position, created_at').bind(bookId).all<BookLineRow>()).results;
}

export async function addBookLine(env: Env, book: BookRow, input: { text: string; locator?: string }): Promise<{ id: string; warning: string | null }> {
  const text = input.text.trim();
  if (!text) refuse('Type the line from the page.', 400);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(position) AS p FROM book_lines WHERE book_id = ?').bind(book.id).first<{ n: number; p: number | null }>();
  if ((n?.n ?? 0) >= MAX_LINES_PER_BOOK) refuse(`A book takes at most ${MAX_LINES_PER_BOOK} lines.`, 409);
  const id = newId('bl_');
  const now = nowIso();
  await env.DB.prepare('INSERT INTO book_lines (id, book_id, text, locator, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, book.id, text, input.locator?.trim() || null, (n?.p ?? -1) + 1, now, now)
    .run();
  await touch(env, book.id);
  return { id, warning: lineWarning(text) };
}

export async function patchBookLine(env: Env, row: BookLineRow, p: { text?: string; locator?: string }): Promise<{ warning: string | null }> {
  const text = p.text !== undefined ? p.text.trim() : row.text;
  if (!text) refuse('A line cannot be empty. Delete it instead.', 400);
  await env.DB.prepare('UPDATE book_lines SET text = ?, locator = ?, updated_at = ? WHERE id = ?')
    .bind(text, p.locator !== undefined ? p.locator.trim() || null : row.locator, nowIso(), row.id)
    .run();
  await touch(env, row.book_id);
  return { warning: lineWarning(text) };
}

export async function deleteBookLine(env: Env, row: BookLineRow): Promise<void> {
  await env.DB.prepare('DELETE FROM book_lines WHERE id = ?').bind(row.id).run();
  await touch(env, row.book_id);
}

/** Put a book's lines in the given order; the list must name each of them exactly once. */
export async function reorderBookLines(env: Env, bookId: string, ids: string[]): Promise<void> {
  const have = (await linesFor(env, bookId)).map((l) => l.id);
  if (ids.length !== have.length || new Set(ids).size !== ids.length || !ids.every((id) => have.includes(id))) refuse('The order must list each of this book’s lines once.', 400);
  await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE book_lines SET position = ? WHERE id = ? AND book_id = ?').bind(i, id, bookId)));
  await touch(env, bookId);
}

// ---------------------------------------------------------------- the cover

/** The cover: an upload or an image link fetched through the guard, with the credit rule of pictures. */
export async function setBookCover(env: Env, book: BookRow, input: { bytes?: Uint8Array; url?: string } & PictureMeta): Promise<void> {
  const m = sourced(checkPictureMeta(input), input);
  const got = input.bytes ? { bytes: input.bytes, finalUrl: undefined } : input.url ? await fetchImage(input.url) : refuse('Upload a picture of the cover or give a link to one.', 400);
  const stored = await storePicture(env, (ext) => `books/${book.id}/cover-${newId()}.${ext}`, got.bytes, got.finalUrl);
  await env.DB.prepare(
    `UPDATE books SET cover_key = ?, cover_mime = ?, cover_width = ?, cover_height = ?, cover_caption = ?, cover_credit = ?, cover_licence = ?, cover_creator = ?, cover_source_url = ?, cover_date = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(stored.key, stored.mime, stored.width, stored.height, m.caption?.trim() || null, m.credit, m.licence, m.creator?.trim() || null, m.sourceUrl?.trim() || null, m.date?.trim() || null, nowIso(), book.id)
    .run();
  if (book.cover_key && book.cover_key !== stored.key) await env.MEDIA.delete(book.cover_key);
}

/** Change the cover's caption or credit; the same rule holds after the edit. */
export async function patchBookCover(env: Env, book: BookRow, p: Partial<PictureMeta>): Promise<void> {
  if (!book.cover_key) refuse('This book has no cover yet.', 409);
  const m = checkPictureMeta({
    credit: p.credit ?? book.cover_credit ?? '',
    licence: p.licence ?? book.cover_licence ?? '',
    creator: p.creator ?? book.cover_creator ?? '',
    sourceUrl: p.sourceUrl ?? book.cover_source_url ?? '',
  });
  // An uploaded cover must say where it came from; clearing the link is refused.
  if (!m.sourceUrl?.trim()) refuse('Say where you found the picture (a link to its page or post), so readers can follow it to the person who made it.', 400);
  await env.DB.prepare('UPDATE books SET cover_caption = ?, cover_credit = ?, cover_licence = ?, cover_creator = ?, cover_source_url = ?, cover_date = ?, updated_at = ? WHERE id = ?')
    .bind(
      p.caption !== undefined ? p.caption.trim() || null : book.cover_caption,
      m.credit,
      m.licence,
      m.creator!.trim(),
      m.sourceUrl!.trim(),
      p.date !== undefined ? p.date.trim() || null : book.cover_date,
      nowIso(),
      book.id,
    )
    .run();
}

export async function removeBookCover(env: Env, book: BookRow): Promise<void> {
  await env.DB.prepare(
    `UPDATE books SET cover_key = NULL, cover_mime = NULL, cover_width = NULL, cover_height = NULL, cover_caption = NULL, cover_credit = NULL, cover_licence = NULL, cover_creator = NULL, cover_source_url = NULL, cover_date = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(nowIso(), book.id)
    .run();
  if (book.cover_key) await env.MEDIA.delete(book.cover_key);
}

// ---------------------------------------------------------------- Haul items

/** Point a Haul's book item at a shelf book, or unlink it (null). Only items of type book take one. */
export async function linkItemToBook(env: Env, item: ItemRow, bookId: string | null): Promise<void> {
  if (bookId) {
    if (item.type !== 'book') refuse('Only a Book item can point to the shelf. Set its type to Book first.', 409);
    await bookOr404(env, bookId);
  }
  await env.DB.prepare('UPDATE items SET shelf_id = ?, updated_at = ? WHERE id = ?').bind(bookId, nowIso(), item.id).run();
}

/** A shelf book made from a Book item's details (title, author, year, link), then linked to it. */
export async function bookFromItem(env: Env, item: ItemRow): Promise<BookRow> {
  if (item.type !== 'book') refuse('Only a Book item can make a shelf book. Set its type to Book first.', 409);
  const chosen = parseJson<Title | null>(item.title_choice, null);
  const title: Title = chosen?.text ? chosen : { text: item.title?.trim() || '' };
  if (!title.text) refuse('Give the item a title first.', 409);
  if (!item.creator?.trim()) refuse('Name the item’s author (under More, “By”) first.', 409);
  const found = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(item.source_date ?? '');
  const year = item.year ?? (found ? Number(found[1]) : null);
  const link = item.canonical_url || item.url;
  const book = await createBook(env, {
    title,
    author: item.creator!,
    year,
    url: link && /^https:\/\//.test(link) ? link : null,
    status: 'reading',
  });
  await linkItemToBook(env, item, book.id);
  return book;
}

// ---------------------------------------------------------------- views

const touch = (env: Env, bookId: string) => env.DB.prepare('UPDATE books SET updated_at = ? WHERE id = ?').bind(nowIso(), bookId).run();

export const bookTitle = (b: Pick<BookRow, 'title_text' | 'title_italic'>): Title => (b.title_italic ? { text: b.title_text, italic: b.title_italic } : { text: b.title_text });
export const bookTitleText = (b: Pick<BookRow, 'title_text' | 'title_italic'>) => [b.title_text, b.title_italic].filter(Boolean).join(' ');

export interface LinkedItem {
  id: string;
  type: string;
  title: string | null;
  title_choice: string | null;
  haul_id: string | null;
  haul_number: number | null;
  haul_status: string | null;
}

export async function itemsForBook(env: Env, bookId: string): Promise<LinkedItem[]> {
  return (
    await env.DB.prepare(
      `SELECT i.id, i.type, i.title, i.title_choice, h.id AS haul_id, h.number AS haul_number, h.status AS haul_status
       FROM items i LEFT JOIN haul_items hi ON hi.item_id = i.id LEFT JOIN hauls h ON h.id = hi.haul_id WHERE i.shelf_id = ? ORDER BY h.number, i.captured_at`,
    )
      .bind(bookId)
      .all<LinkedItem>()
  ).results;
}

/** A book as the Desk shows it: the row, the cover through the Desk, and its counts. */
export function bookView(b: BookRow) {
  return { ...b, title: bookTitle(b), cover: b.cover_key ? `/api/books/${b.id}/cover?v=${encodeURIComponent(b.cover_key.split('/').pop() ?? '')}` : null };
}

export async function listBooks(env: Env) {
  const rows = (
    await env.DB.prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM book_notes n WHERE n.book_id = b.id) AS note_count, (SELECT COUNT(*) FROM book_lines l WHERE l.book_id = b.id) AS line_count,
              (SELECT MAX(n.date) FROM book_notes n WHERE n.book_id = b.id) AS last_note, (SELECT COUNT(*) FROM items i WHERE i.shelf_id = b.id) AS item_count
       FROM books b`,
    ).all<BookRow & { note_count: number; line_count: number; last_note: string | null; item_count: number }>()
  ).results;
  return rows.map((r) => ({ ...bookView(r), note_count: r.note_count, line_count: r.line_count, last_note: r.last_note, item_count: r.item_count }));
}

export async function bookDetail(env: Env, id: string) {
  const book = await bookOr404(env, id);
  const [notes, lines, items] = await Promise.all([notesFor(env, id), linesFor(env, id), itemsForBook(env, id)]);
  return {
    book: bookView(book),
    notes: notes.map((n) => ({ ...n, audio: n.note_id ? `/api/notes/${n.note_id}/audio` : null })),
    lines: lines.map((l) => ({ ...l, warning: lineWarning(l.text) })),
    items,
  };
}

// ---------------------------------------------------------------- what changed since the last publish

/** Plain lines saying what the next shelf changes against the published one. Ignores updatedAt. */
export function shelfChanges(prev: Shelf | null, next: Shelf): string[] {
  if (!prev) return [next.books.length ? `The first publish of the shelf: ${next.books.length} book${next.books.length === 1 ? '' : 's'}.` : 'The first publish of the shelf, with no books.'];
  const name = (b: ShelfBook) => [b.title.text, b.title.italic].filter(Boolean).join(' ');
  const before = new Map(prev.books.map((b) => [b.id, b]));
  const after = new Map(next.books.map((b) => [b.id, b]));
  const out: string[] = [];
  for (const b of next.books) {
    const p = before.get(b.id);
    if (!p) {
      out.push(`Added ${name(b)} (${bookStatusLabel[b.status].toLowerCase()}).`);
      continue;
    }
    const bits: string[] = [];
    if (p.status !== b.status) bits.push(`${bookStatusLabel[p.status].toLowerCase()} → ${bookStatusLabel[b.status].toLowerCase()}`);
    const pNotes = new Set(p.notes.map((n) => JSON.stringify(n)));
    const nNotes = new Set(b.notes.map((n) => JSON.stringify(n)));
    const addedNotes = [...nNotes].filter((n) => !pNotes.has(n)).length;
    const goneNotes = [...pNotes].filter((n) => !nNotes.has(n)).length;
    const changed = Math.min(addedNotes, goneNotes);
    if (addedNotes - changed) bits.push(`${addedNotes - changed} new note${addedNotes - changed === 1 ? '' : 's'}`);
    if (changed) bits.push(`${changed} note${changed === 1 ? '' : 's'} edited`);
    if (goneNotes - changed) bits.push(`${goneNotes - changed} note${goneNotes - changed === 1 ? '' : 's'} removed`);
    if (JSON.stringify(p.lines) !== JSON.stringify(b.lines)) bits.push(b.lines.length === p.lines.length ? 'lines changed' : `lines ${p.lines.length} → ${b.lines.length}`);
    if (JSON.stringify(p.cover ?? null) !== JSON.stringify(b.cover ?? null)) bits.push(b.cover ? (p.cover ? 'new cover or credit' : 'a cover') : 'cover removed');
    if (JSON.stringify(p.hauls ?? []) !== JSON.stringify(b.hauls ?? [])) bits.push(`in Hauls: ${(b.hauls ?? []).map((h) => h.number).join(', ') || 'none'}`);
    const fields = (['title', 'author', 'year', 'publisher', 'url', 'started', 'finished', 'spine'] as const).filter((k) => JSON.stringify(p[k] ?? null) !== JSON.stringify(b[k] ?? null));
    if (fields.length) bits.push(`${fields.join(', ')} changed`);
    if (bits.length) out.push(`${name(b)}: ${bits.join('; ')}.`);
  }
  for (const p of prev.books) if (!after.has(p.id)) out.push(`Removed ${name(p)}.`);
  const order = (s: Shelf) => s.books.map((b) => b.id).join(' ');
  if (!out.length && order(prev) !== order(next)) out.push('The order changed.');
  return out;
}

