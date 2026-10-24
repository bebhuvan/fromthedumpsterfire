// The shelf's rules on SQLite with the real migrations: unique slugs, the dates a status switch fills,
// real dates only, the credit rule on covers, the long-line flag, what changed since the last
// publish, and the dictated note's deletion-only path (a rewording cleanup is refused).

import { describe, expect, it } from 'vitest';
import { checkDeletionOnly } from '@fdf/shared/cleanup';
import type { Shelf } from '@fdf/shared/shelf';
import { addBookLine, addBookNote, bookFromItem, createBook, patchBook, patchBookCover, setBookCover, shelfChanges, todayIst, type BookNoteRow } from '../src/shelf';
import { processNote } from '../src/voice';
import type { ItemRow } from '../src/db';
import { answer, makeEnv } from './fake-env';
import { fakeJpeg, NOW, seedHaul } from './seed';

describe('books', () => {
  it('makes unique slugs, fills dates on a status switch, refuses unreal dates, and flags long lines', async () => {
    const env = makeEnv();
    const a = await createBook(env, { title: { text: 'The Coal', italic: 'Question' }, author: 'William Stanley Jevons' });
    const b = await createBook(env, { title: { text: 'The Coal Question' }, author: 'Someone else' });
    expect([a.id, b.id]).toEqual(['the-coal-question', 'the-coal-question-2']);
    // A book being read starts today; marking it read finishes it today; starting again clears the finish.
    expect([a.status, a.started, a.finished]).toEqual(['reading', todayIst(), null]);
    const done = await patchBook(env, a, { status: 'read' });
    expect(done.finished).toBe(todayIst());
    const again = await patchBook(env, done, { status: 'reading' });
    expect(again.finished).toBeNull();
    // The editor's own finish date stands.
    expect((await patchBook(env, again, { status: 'read', started: '2026-09-20', finished: '2026-10-12' })).finished).toBe('2026-10-12');
    await expect(patchBook(env, again, { started: '2026-10-10', finished: '2026-10-01' })).rejects.toThrow(/finished before it was started/);
    await expect(patchBook(env, again, { finished: '2026-02-30' })).rejects.toThrow(/real date/);
    await expect(patchBook(env, again, { url: 'http://example.org/book' })).rejects.toThrow(/https/);
    await expect(createBook(env, { title: { text: '  ' }, author: 'X' })).rejects.toThrow(/title/);
    await expect(createBook(env, { title: { text: 'A book' }, author: ' ' })).rejects.toThrow(/author/);
    // The id never changes with the title.
    expect((await patchBook(env, again, { title: { text: 'The Coal Question, 1865' } })).id).toBe('the-coal-question');

    const long = Array.from({ length: 61 }, (_, i) => `word${i}`).join(' ');
    expect((await addBookLine(env, a, { text: long })).warning).toMatch(/61 words/);
    expect((await addBookLine(env, a, { text: 'It is wholly a confusion of ideas.' })).warning).toBeNull();
    await expect(addBookNote(env, a, { text: 'A note.', date: '2026-13-01' })).rejects.toThrow(/real date/);
  });

  it('holds a cover to the credit rule of pictures', async () => {
    const env = makeEnv();
    const a = await createBook(env, { title: { text: 'Seeing Like', italic: 'a State' }, author: 'James C. Scott' });
    const ok = { bytes: fakeJpeg(600, 900), credit: 'Yale University Press', licence: '© the publisher, shown for commentary', creator: 'Yale University Press', sourceUrl: 'https://yalebooks.yale.edu/book/x' };
    await expect(setBookCover(env, a, { ...ok, creator: '' })).rejects.toThrow(/Name who made the picture/);
    await expect(setBookCover(env, a, { ...ok, sourceUrl: undefined })).rejects.toThrow(/where you found the picture/);
    await expect(setBookCover(env, a, { ...ok, licence: ' ' })).rejects.toThrow(/licence/);
    await expect(setBookCover(env, a, { ...ok, bytes: new TextEncoder().encode('<svg/>') })).rejects.toThrow(/not a JPEG, PNG/);
    await setBookCover(env, a, ok);
    const row = (await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(a.id).first<Record<string, unknown>>())!;
    expect(row).toMatchObject({ cover_width: 600, cover_height: 900, cover_credit: 'Yale University Press', cover_mime: 'image/jpeg' });
    expect(String(row.cover_key)).toMatch(/^books\/seeing-like-a-state\/cover-[0-9a-z]+\.jpg$/);
    expect(env.MEDIA.objects.has(String(row.cover_key))).toBe(true);
    // Editing keeps the rule: the maker and where it came from cannot be cleared.
    const book = (await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(a.id).first())! as never;
    await expect(patchBookCover(env, book, { creator: '' })).rejects.toThrow(/Name who made/);
    await expect(patchBookCover(env, book, { sourceUrl: '' })).rejects.toThrow(/where you found/);
    await patchBookCover(env, book, { caption: 'My copy, a little foxed.' });
    expect((await env.DB.prepare('SELECT cover_caption FROM books WHERE id = ?').bind(a.id).first())!).toEqual({ cover_caption: 'My copy, a little foxed.' });
  });

  it('makes a shelf book from a Book item and links it', async () => {
    const env = await seedHaul(makeEnv());
    const item = async () => (await env.DB.prepare(`SELECT * FROM items WHERE id = 'it_jevons'`).first<ItemRow>())!;
    await expect(bookFromItem(env, await item())).rejects.toThrow(/Only a Book item/);
    await env.DB.prepare(`UPDATE items SET type = 'book', title_choice = '{"text":"The Coal","italic":"Question"}', url = 'https://en.wikisource.org/wiki/The_Coal_Question' WHERE id = 'it_jevons'`).run();
    const b = await bookFromItem(env, await item());
    expect(b).toMatchObject({ id: 'the-coal-question', title_text: 'The Coal', title_italic: 'Question', author: 'Someone', year: 1865, url: 'https://en.wikisource.org/wiki/The_Coal_Question', status: 'reading' });
    expect((await item()).shelf_id).toBe('the-coal-question');
  });
});

describe('what changed since the last publish', () => {
  const book = (over: Partial<Shelf['books'][number]> = {}): Shelf['books'][number] => ({ id: 'b', title: { text: 'A', italic: 'Book' }, author: 'X', status: 'reading', notes: [], lines: [], ...over });
  const shelf = (...books: Shelf['books']): Shelf => ({ bundleVersion: 1, updatedAt: NOW, books });
  it('names additions, removals, new and edited notes, status, lines, covers and Haul links', () => {
    const n1 = { date: '2026-10-01', text: 'One.' };
    expect(shelfChanges(null, shelf())).toEqual(['The first publish of the shelf, with no books.']);
    expect(shelfChanges(shelf(book({ notes: [n1] })), shelf(book({ notes: [n1] })))).toEqual([]);
    expect(shelfChanges(shelf(book()), shelf(book(), book({ id: 'c', title: { text: 'C' } })))).toEqual(['Added C (reading now).']);
    expect(shelfChanges(shelf(book(), book({ id: 'c', title: { text: 'C' } })), shelf(book()))).toEqual(['Removed C.']);
    expect(
      shelfChanges(
        shelf(book({ notes: [n1] })),
        shelf(book({ status: 'read', finished: '2026-10-20', notes: [{ date: '2026-10-20', text: 'Two.' }, { ...n1, text: 'One, edited.' }], lines: [{ text: 'A line.' }], hauls: [{ number: 2, itemId: 'a-book' }] })),
      ),
    ).toEqual(['A Book: reading now → read; 1 new note; 1 note edited; lines 0 → 1; in Hauls: 2; finished changed.']);
  });
});

describe('a dictated note', () => {
  it('stays deletion-only: Whisper, a rewording cleanup refused, the code cleanup stored as the editor accepted it', async () => {
    const RAW = 'Um, so the the chapter on city planning is, uh, the one I keep thinking about.';
    const env = makeEnv((model) => (model.includes('whisper') ? { text: RAW, transcription_info: { duration: 6 } } : answer({ text: 'The chapter on urban planning is the one that stays with me.' })));
    await env.MEDIA.put('notes/vn_1.m4a', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'audio/mp4' } });
    await env.DB.prepare(`INSERT INTO notes (id, target, audio_key, mime, format, created_at) VALUES ('vn_1', 'book', 'notes/vn_1.m4a', 'audio/mp4', 'm4a', ?)`).bind(NOW).run();
    const n = await processNote(env, 'vn_1');
    expect(n.transcript_raw).toBe(RAW);
    // The model was asked, and its rewording was refused by the token diff.
    expect(env.aiCalls.map((c) => c.model.includes('whisper'))).toEqual([true, false]);
    expect(n.clean_method).toBe('code');
    expect(n.transcript_clean).not.toMatch(/urban|stays with me/);
    expect(checkDeletionOnly(RAW, n.transcript_clean!).ok).toBe(true);
    expect(n.transcript_clean).toMatch(/city planning is.*the one I keep thinking about/);

    const b = await createBook(env, { title: { text: 'Seeing Like', italic: 'a State' }, author: 'James C. Scott' });
    await addBookNote(env, b, { text: n.transcript_clean!, noteId: 'vn_1', at: 'chapter 3' });
    const row = (await env.DB.prepare('SELECT * FROM book_notes').first<BookNoteRow>())!;
    expect(row).toMatchObject({ text: n.transcript_clean, note_id: 'vn_1', audio_key: 'notes/vn_1.m4a', format: 'm4a', seconds: 6, publish_audio: 0, date: todayIst(), at: 'chapter 3' });
    await expect(addBookNote(env, b, { text: 'Again.', noteId: 'vn_1' })).rejects.toThrow(/already a note/);
    await expect(addBookNote(env, b, { text: 'Gone.', noteId: 'vn_gone' })).rejects.toThrow(/record it again/);
  });
});
