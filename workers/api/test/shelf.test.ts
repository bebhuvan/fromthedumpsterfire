// The shelf routes through the Desk Worker, on SQLite with the real migrations: shape validation,
// plain refusals, notes typed and dictated (the voice-note path), lines with the long-line flag and
// their order, the cover upload with its credit, the Book item picker, and Publish the shelf.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHELF_PATH, type Shelf } from '@fdf/shared/shelf';
import { checkDeletionOnly } from '@fdf/shared/cleanup';
import app from '../src/index';
import { answer, makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { fakeJpeg, seedHaul } from '../../../packages/server/test/seed';

afterEach(() => vi.unstubAllGlobals());

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1' };
const json = (method: string, b: unknown) => ({ method, headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(b) });
const del = { method: 'DELETE', headers: H };

type Body = Record<string, unknown> & {
  error?: string;
  book?: { id: string; status: string; started: string | null; finished: string | null; cover: string | null };
  notes?: Array<{ id: string; text: string; date: string; audio: string | null; publish_audio: number }>;
  lines?: Array<{ id: string; text: string; warning: string | null }>;
  items?: Array<{ id: string; haul_number: number | null }>;
  books?: Array<{ id: string }>;
  warning?: string | null;
};

const RAW = 'Um, so the the chapter on city planning is, uh, the one I keep thinking about.';
async function deskEnv(): Promise<TestEnv> {
  const env = makeEnv((model) => (model.includes('whisper') ? { text: RAW, transcription_info: { duration: 6 } } : answer({ text: 'The urban planning chapter stays with me.' })), { DEV_AUTH_BYPASS: '1' } as never);
  return seedHaul(env);
}
const call = async (env: TestEnv, path: string, init: RequestInit = {}) => {
  const res = await app.request(`${BASE}${path}`, init, env);
  return { status: res.status, body: (await res.json()) as Body };
};
const newBook = { title: { text: 'Seeing Like', italic: 'a State' }, author: 'James C. Scott', year: 1998, status: 'reading', started: '2026-10-02' };

describe('shelf routes', () => {
  it('validates books, makes their slugs, switches status with dates, and deletes', async () => {
    const env = await deskEnv();
    for (const bad of [
      { ...newBook, author: '' },
      { ...newBook, status: 'loved' },
      { ...newBook, url: 'http://example.org/x' },
      { ...newBook, started: '2 Oct 2026' },
      { ...newBook, spine: 'neon' },
      { ...newBook, year: 1998.5 },
      { ...newBook, rating: 5 },
      { author: 'No title' },
    ])
      expect((await call(env, '/api/books', json('POST', bad))).status).toBe(400);
    const a = await call(env, '/api/books', json('POST', newBook));
    expect(a.status).toBe(200);
    expect(a.body.book).toMatchObject({ id: 'seeing-like-a-state', status: 'reading', started: '2026-10-02', finished: null, cover: null });
    expect((await call(env, '/api/books', json('POST', newBook))).body.book!.id).toBe('seeing-like-a-state-2');
    expect((await call(env, '/api/books/nope')).status).toBe(404);

    const read = await call(env, '/api/books/seeing-like-a-state', json('PATCH', { status: 'read' }));
    expect(read.body.book!.finished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const own = await call(env, '/api/books/seeing-like-a-state', json('PATCH', { finished: '2026-10-20' }));
    expect(own.body.book!.finished).toBe('2026-10-20');
    const early = await call(env, '/api/books/seeing-like-a-state', json('PATCH', { finished: '2026-09-01' }));
    expect([early.status, early.body.error]).toEqual([400, expect.stringMatching(/finished before it was started/)]);
    expect((await call(env, '/api/books/seeing-like-a-state', json('PATCH', { id: 'renamed' }))).status).toBe(400);

    expect((await call(env, '/api/books')).body.books!.map((b) => b.id).sort()).toEqual(['seeing-like-a-state', 'seeing-like-a-state-2']);
    expect((await call(env, '/api/books/seeing-like-a-state-2', del)).status).toBe(200);
    expect((await call(env, '/api/books/seeing-like-a-state-2')).status).toBe(404);
  });

  it('takes notes typed and dictated, newest first; edits and deletes them', async () => {
    const env = await deskEnv();
    await call(env, '/api/books', json('POST', newBook));
    expect((await call(env, '/api/books/seeing-like-a-state/notes', json('POST', { text: '   ' }))).status).toBe(400);
    expect((await call(env, '/api/books/seeing-like-a-state/notes', json('POST', { text: 'x', date: 'yesterday' }))).status).toBe(400);
    const typed = await call(env, '/api/books/seeing-like-a-state/notes', json('POST', { text: 'Starts with forestry in Prussia.', date: '2026-10-09', at: 'chapter 1' }));
    expect(typed.status).toBe(200);

    // Dictated: the existing voice-note route transcribes and cleans (deletion-only), the Desk shows
    // both, and the editor's accepted words are sent with the note's id.
    const fd = new FormData();
    fd.append('audio', new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], 'note.webm', { type: 'audio/webm' }));
    fd.append('target', 'book');
    const v = await app.request(`${BASE}/api/notes`, { method: 'POST', headers: H, body: fd }, env);
    const { note } = (await v.json()) as { note: { id: string; transcript_raw: string; transcript_clean: string; clean_method: string; format: string } };
    expect(note).toMatchObject({ transcript_raw: RAW, clean_method: 'code', format: 'webm' });
    expect(checkDeletionOnly(RAW, note.transcript_clean).ok).toBe(true);
    const spoken = await call(env, '/api/books/seeing-like-a-state/notes', json('POST', { text: note.transcript_clean, date: '2026-10-21', noteId: note.id, publishAudio: true }));
    expect(spoken.status).toBe(200);
    expect(spoken.body.notes!.map((n) => [n.date, n.text, Boolean(n.audio), n.publish_audio])).toEqual([
      ['2026-10-21', note.transcript_clean, true, 1],
      ['2026-10-09', 'Starts with forestry in Prussia.', false, 0],
    ]);
    // A typed note has no recording to publish.
    const typedId = spoken.body.notes![1]!.id;
    expect((await call(env, `/api/book-notes/${typedId}`, json('PATCH', { publishAudio: true }))).status).toBe(409);
    const edited = await call(env, `/api/book-notes/${typedId}`, json('PATCH', { text: 'Starts with forestry in eighteenth-century Prussia.', date: '2026-10-22' }));
    expect(edited.body.notes!.map((n) => n.date)).toEqual(['2026-10-22', '2026-10-21']);
    // Deleting a dictated note removes its recording from MEDIA too.
    const spokenId = edited.body.notes!.find((n) => n.audio)!.id;
    const key = (await env.DB.prepare('SELECT audio_key FROM book_notes WHERE id = ?').bind(spokenId).first<{ audio_key: string }>())!.audio_key;
    expect(env.MEDIA.objects.has(key)).toBe(true);
    expect((await call(env, `/api/book-notes/${spokenId}`, del)).body.notes!.length).toBe(1);
    expect(env.MEDIA.objects.has(key)).toBe(false);
  });

  it('flags long lines without refusing them, and orders and removes lines', async () => {
    const env = await deskEnv();
    await call(env, '/api/books', json('POST', newBook));
    const long = Array.from({ length: 70 }, (_, i) => `word${i}`).join(' ');
    const a = await call(env, '/api/books/seeing-like-a-state/lines', json('POST', { text: long, locator: 'p. 4' }));
    expect([a.status, a.body.warning]).toEqual([200, expect.stringMatching(/70 words/)]);
    const b = await call(env, '/api/books/seeing-like-a-state/lines', json('POST', { text: 'Certain forms of knowledge and control require a narrowing of vision.' }));
    expect(b.body.warning).toBeNull();
    const [l1, l2] = b.body.lines!;
    expect(l1!.warning).toMatch(/70 words/);
    expect((await call(env, '/api/books/seeing-like-a-state/lines/order', json('PUT', { ids: [l2!.id] }))).status).toBe(400);
    const o = await call(env, '/api/books/seeing-like-a-state/lines/order', json('PUT', { ids: [l2!.id, l1!.id] }));
    expect(o.body.lines!.map((l) => l.id)).toEqual([l2!.id, l1!.id]);
    expect((await call(env, `/api/book-lines/${l1!.id}`, json('PATCH', { text: '' }))).status).toBe(400);
    expect((await call(env, `/api/book-lines/${l1!.id}`, json('PATCH', { text: 'Shorter now.' }))).body.warning).toBeNull();
    expect((await call(env, `/api/book-lines/${l1!.id}`, del)).body.lines!.map((l) => l.id)).toEqual([l2!.id]);
  });

  it('takes a cover by upload only with its credit, serves it back through the Desk, and fetches links through the guard', async () => {
    const env = await deskEnv();
    await call(env, '/api/books', json('POST', newBook));
    const form = (fields: Record<string, string>, file = true) => {
      const f = new FormData();
      if (file) f.append('file', new File([fakeJpeg(600, 900)], 'cover.jpg', { type: 'image/jpeg' }));
      for (const [k, v] of Object.entries(fields)) f.append(k, v);
      return { method: 'POST', headers: H, body: f };
    };
    const credit = { credit: 'Yale University Press', licence: '© the publisher, shown for commentary', creator: 'Yale University Press' };
    expect((await call(env, '/api/books/seeing-like-a-state/cover', json('POST', {}))).status).toBe(415);
    const noSource = await call(env, '/api/books/seeing-like-a-state/cover', form(credit));
    expect([noSource.status, noSource.body.error]).toEqual([400, expect.stringMatching(/where you found/)]);
    const noMaker = await call(env, '/api/books/seeing-like-a-state/cover', form({ ...credit, creator: '', sourceUrl: 'https://yalebooks.yale.edu/x' }));
    expect([noMaker.status, noMaker.body.error]).toEqual([400, expect.stringMatching(/Name who made/)]);
    // A link is fetched through guardedFetch: a private address is refused.
    const local = await call(env, '/api/books/seeing-like-a-state/cover', form({ ...credit, url: 'http://127.0.0.1/cover.jpg' }, false));
    expect([local.status, local.body.error]).toEqual([422, expect.stringMatching(/could not be fetched/)]);
    const ok = await call(env, '/api/books/seeing-like-a-state/cover', form({ ...credit, sourceUrl: 'https://yalebooks.yale.edu/x', caption: 'The first edition.' }));
    expect(ok.status).toBe(200);
    const img = await app.request(`${BASE}${ok.body.book!.cover}`, {}, env);
    expect([img.status, img.headers.get('content-type')]).toEqual([200, 'image/jpeg']);
    expect((await call(env, '/api/books/seeing-like-a-state/cover', json('PATCH', { licence: '' }))).status).toBe(400);
    expect((await call(env, '/api/books/seeing-like-a-state/cover', del)).body.book!.cover).toBeNull();
  });

  it('links a Book item to a shelf book (or makes one from it), and publishes the shelf with its Haul link', async () => {
    const env = await deskEnv();
    await call(env, '/api/books', json('POST', newBook));
    const notBook = await call(env, '/api/items/it_jevons/shelf', json('PUT', { bookId: 'seeing-like-a-state' }));
    expect([notBook.status, notBook.body.error]).toEqual([409, expect.stringMatching(/Only a Book item/)]);
    await call(env, '/api/items/it_jevons', json('PATCH', { type: 'book', title_choice: { text: 'The Coal', italic: 'Question' } }));
    expect((await call(env, '/api/items/it_jevons/shelf', json('PUT', { bookId: 'no-such-book' }))).status).toBe(404);
    const made = await call(env, '/api/items/it_jevons/shelf', json('POST', {}));
    expect(made.body).toMatchObject({ item: { shelf_id: 'the-coal-question' }, book: { id: 'the-coal-question' } });
    expect((await call(env, '/api/items/it_jevons/shelf', json('PUT', { bookId: null }))).body.item).toMatchObject({ shelf_id: null });
    await call(env, '/api/items/it_jevons/shelf', json('PUT', { bookId: 'the-coal-question' }));
    expect((await call(env, '/api/books/the-coal-question')).body.items).toEqual([expect.objectContaining({ id: 'it_jevons', haul_number: null })]);

    // The Haul publishes with Item.shelf; then the shelf, which lists the Haul.
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    expect((await call(env, '/api/hauls/hl_1/publish', json('POST', { confirm: true }))).status).toBe(200);
    const pre = await call(env, '/api/shelf/preview');
    expect(pre.body).toMatchObject({ problems: [], changes: ['The first publish of the shelf: 2 books.'], last: null });
    expect((await call(env, '/api/shelf/publish', json('POST', {}))).status).toBe(400);
    const pub = await call(env, '/api/shelf/publish', json('POST', { confirm: true }));
    expect(pub.body).toMatchObject({ ok: true, version: 1, books: 2, path: SHELF_PATH });
    const shelf = (await (await env.FILES.get(SHELF_PATH))!.json()) as Shelf;
    // The item's id as the bundle published it (a slug of the title's roman part).
    expect(shelf.books.find((b) => b.id === 'the-coal-question')!.hauls).toEqual([{ number: 1, itemId: 'the-coal' }]);
    expect((await call(env, '/api/shelf/preview')).body).toMatchObject({ changes: [], last: { version: 1, books: 2 } });
    // The Desk serves the published shelf from FILES for checking.
    expect((await app.request(`${BASE}/files/${SHELF_PATH}`, {}, env)).status).toBe(200);
    // A book in a published Haul stays on the shelf.
    expect((await call(env, '/api/books/the-coal-question', del)).status).toBe(409);
  });

  it('refuses a shelf publish with plain messages', async () => {
    const env = await deskEnv();
    await call(env, '/api/books', json('POST', newBook));
    await env.DB.prepare(`UPDATE books SET author = '' WHERE id = 'seeing-like-a-state'`).run();
    const r = await call(env, '/api/shelf/publish', json('POST', { confirm: true }));
    expect([r.status, r.body.ok, r.body.problems]).toEqual([422, false, ['Seeing Like a State: author: name the author']]);
    expect(env.FILES.writes).toEqual([]);
  });
});
