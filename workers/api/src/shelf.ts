// Desk routes for the shelf: books, the editor's notes on each (typed, or dictated through the
// voice-note path), lines from the page, a cover with its credit, the link from a Haul's book item,
// and Publish the shelf. Mounted by index.ts behind the same lock, CSRF refusal and JSON-only rules as
// every other /api route (the cover upload is multipart; see security.ts). The rules live in
// packages/server/src/shelf.ts and publish.ts, so they hold whatever the Desk sends.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { BOOK_STATUSES, SPINES } from '@fdf/shared/shelf';
import {
  addBookLine,
  addBookNote,
  assembleShelf,
  BlockRefused,
  bookDetail,
  bookFromItem,
  bookOr404,
  bookView,
  createBook,
  deleteBook,
  deleteBookLine,
  deleteBookNote,
  linkItemToBook,
  listBooks,
  patchBook,
  patchBookCover,
  patchBookLine,
  patchBookNote,
  publishShelf,
  removeBookCover,
  reorderBookLines,
  setBookCover,
  type BookLineRow,
  type BookNoteRow,
  type Env,
  type ItemRow,
} from '@fdf/server';
import { fileHeaders } from './security';

type App = { Bindings: Env; Variables: { owner: string } };
export const shelfApi = new Hono<App>();

const MAX_COVER_BYTES = 15 * 1024 * 1024;

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');

async function body<T>(c: Context<App>, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw Object.assign(new Error('Expected a JSON body'), { status: 400 });
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw Object.assign(new Error(issues(r.error)), { status: 400 });
  return r.data;
}

const notFound = () => Object.assign(new Error('Not found'), { status: 404 });

/** The editor's refusals come back as they are, with their status; anything else is an error. */
async function attempt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BlockRefused) throw Object.assign(new Error(e.message), { status: e.status });
    throw e;
  }
}

const book = (env: Env, id: string) => attempt(() => bookOr404(env, id));
const detail = (env: Env, id: string) => attempt(() => bookDetail(env, id));

async function noteOr404(env: Env, id: string): Promise<BookNoteRow> {
  const n = await env.DB.prepare('SELECT * FROM book_notes WHERE id = ?').bind(id).first<BookNoteRow>();
  if (!n) throw notFound();
  return n;
}

async function lineOr404(env: Env, id: string): Promise<BookLineRow> {
  const l = await env.DB.prepare('SELECT * FROM book_lines WHERE id = ?').bind(id).first<BookLineRow>();
  if (!l) throw notFound();
  return l;
}

async function itemOr404(env: Env, id: string): Promise<ItemRow> {
  const it = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
  if (!it) throw notFound();
  return it;
}

// ---------------------------------------------------------------- shapes

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date like 2026-10-24');
const title = z.object({ text: z.string().trim().min(1, 'the title').max(300), italic: z.string().trim().max(200).optional() });
const https = z.string().trim().max(2000).regex(/^https:\/\/\S+$/, 'an https link');
const bookFields = {
  author: z.string().trim().min(1, 'name the author').max(300),
  year: z.number().int().min(-3000).max(2100).nullable().optional(),
  publisher: z.string().trim().max(200).nullable().optional(),
  url: https.nullable().optional().or(z.literal('')),
  status: z.enum(BOOK_STATUSES as [string, ...string[]]).optional(),
  started: isoDate.nullable().optional().or(z.literal('')),
  finished: isoDate.nullable().optional().or(z.literal('')),
  spine: z.enum(SPINES as [string, ...string[]]).nullable().optional(),
};
const newBook = z.object({ title, ...bookFields }).strict();
const bookPatch = z.object({ title: title.optional(), ...bookFields, author: bookFields.author.optional() }).strict();
const noteText = z.string().trim().min(1, 'a note needs some words').max(20_000);
const at = z.string().trim().max(120);
const newNote = z.object({ text: noteText, date: isoDate.optional(), at: at.optional(), noteId: z.string().max(64).optional(), publishAudio: z.boolean().optional() }).strict();
const notePatch = z.object({ text: noteText.optional(), date: isoDate.optional(), at: at.optional(), publishAudio: z.boolean().optional() }).strict();
const lineText = z.string().trim().min(1, 'type the line from the page').max(4000);
const locator = z.string().trim().max(120);
const newLine = z.object({ text: lineText, locator: locator.optional() }).strict();
const linePatch = z.object({ text: lineText.optional(), locator: locator.optional() }).strict();
const coverPatch = z
  .object({
    caption: z.string().max(600).optional(),
    credit: z.string().max(300).optional(),
    licence: z.string().max(200).optional(),
    creator: z.string().max(200).optional(),
    sourceUrl: z.string().max(2000).optional(),
    date: z.string().max(80).optional(),
  })
  .strict();

type BookIn = z.infer<typeof newBook>;
/** '' clears a link or date; zod's enums come back as strings, the server types them. */
const toInput = <T extends Partial<BookIn>>(b: T) => ({
  ...b,
  ...(b.url !== undefined ? { url: b.url || null } : {}),
  ...(b.started !== undefined ? { started: b.started || null } : {}),
  ...(b.finished !== undefined ? { finished: b.finished || null } : {}),
}) as Parameters<typeof patchBook>[2];

// ---------------------------------------------------------------- books

shelfApi.get('/api/books', async (c) => c.json({ books: await listBooks(c.env) }));

shelfApi.post('/api/books', async (c) => {
  const b = await body(c, newBook);
  const row = await attempt(() => createBook(c.env, toInput(b) as Parameters<typeof createBook>[1]));
  return c.json(await detail(c.env, row.id));
});

shelfApi.get('/api/books/:id', async (c) => c.json(await detail(c.env, c.req.param('id'))));

shelfApi.patch('/api/books/:id', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  const p = await body(c, bookPatch);
  await attempt(() => patchBook(c.env, row, toInput(p)));
  return c.json(await detail(c.env, row.id));
});

shelfApi.delete('/api/books/:id', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  await attempt(() => deleteBook(c.env, row));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- notes

// A typed note, or a dictated one: the Desk posts the voice note to /api/notes first (Whisper, then the
// deletion-only cleanup), shows both versions, and sends the words the editor accepted with its id.
shelfApi.post('/api/books/:id/notes', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  const n = await body(c, newNote);
  const id = await attempt(() => addBookNote(c.env, row, n));
  return c.json({ id, ...(await detail(c.env, row.id)) });
});

shelfApi.patch('/api/book-notes/:id', async (c) => {
  const row = await noteOr404(c.env, c.req.param('id'));
  const p = await body(c, notePatch);
  await attempt(() => patchBookNote(c.env, row, p));
  return c.json(await detail(c.env, row.book_id));
});

shelfApi.delete('/api/book-notes/:id', async (c) => {
  const row = await noteOr404(c.env, c.req.param('id'));
  await deleteBookNote(c.env, row);
  return c.json(await detail(c.env, row.book_id));
});

// ---------------------------------------------------------------- lines

shelfApi.post('/api/books/:id/lines', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  const l = await body(c, newLine);
  const r = await attempt(() => addBookLine(c.env, row, l));
  return c.json({ ...r, ...(await detail(c.env, row.id)) });
});

shelfApi.put('/api/books/:id/lines/order', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  const { ids } = await body(c, z.object({ ids: z.array(z.string().max(64)).max(64) }));
  await attempt(() => reorderBookLines(c.env, row.id, ids));
  return c.json(await detail(c.env, row.id));
});

shelfApi.patch('/api/book-lines/:id', async (c) => {
  const row = await lineOr404(c.env, c.req.param('id'));
  const p = await body(c, linePatch);
  const r = await attempt(() => patchBookLine(c.env, row, p));
  return c.json({ ...r, ...(await detail(c.env, row.book_id)) });
});

shelfApi.delete('/api/book-lines/:id', async (c) => {
  const row = await lineOr404(c.env, c.req.param('id'));
  await deleteBookLine(c.env, row);
  return c.json(await detail(c.env, row.book_id));
});

// ---------------------------------------------------------------- the cover

const textField = (max: number) => z.string().max(max).optional();

/**
 * The cover: multipart with `file` (an upload) or `url` (an image link fetched through the SSRF guard,
 * images only, capped), plus the credit, licence, maker and where it was found (blocks.ts's rule).
 */
shelfApi.post('/api/books/:id/cover', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  const form = await c.req.formData();
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const meta = z
    .object({ url: textField(2000), caption: textField(600), credit: z.string().max(300), licence: z.string().max(200), sourceUrl: textField(2000), creator: textField(200), date: textField(80) })
    .safeParse({ url: str('url') || undefined, caption: str('caption'), credit: str('credit') ?? '', licence: str('licence') ?? '', sourceUrl: str('sourceUrl') || undefined, creator: str('creator'), date: str('date') });
  if (!meta.success) return c.json({ error: issues(meta.error) }, 400);
  const m = meta.data;
  let bytes: Uint8Array | undefined;
  const f = form.get('file');
  if (f && typeof f !== 'string') {
    if (f.size > MAX_COVER_BYTES) return c.json({ error: 'Pictures over 15 MB are not supported' }, 413);
    bytes = new Uint8Array(await f.arrayBuffer());
  } else if (!m.url) return c.json({ error: 'Upload a picture of the cover or give a link to one' }, 400);
  if (!bytes && m.url && !/^https?:\/\//i.test(m.url)) return c.json({ error: 'Only web links can be fetched' }, 400);
  await attempt(() => setBookCover(c.env, row, { bytes, url: bytes ? undefined : m.url, caption: m.caption, credit: m.credit, licence: m.licence, sourceUrl: m.sourceUrl, creator: m.creator, date: m.date }));
  return c.json(await detail(c.env, row.id));
});

shelfApi.patch('/api/books/:id/cover', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  const p = await body(c, coverPatch);
  await attempt(() => patchBookCover(c.env, row, p));
  return c.json(await detail(c.env, row.id));
});

shelfApi.delete('/api/books/:id/cover', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  await removeBookCover(c.env, row);
  return c.json(await detail(c.env, row.id));
});

// The cover from private storage (the Desk's CSP allows only its own images).
shelfApi.get('/api/books/:id/cover', async (c) => {
  const row = await book(c.env, c.req.param('id'));
  if (!row.cover_key) throw notFound();
  const obj = await c.env.MEDIA.get(row.cover_key);
  if (!obj) throw notFound();
  return new Response(obj.body, { headers: fileHeaders(row.cover_mime ?? obj.httpMetadata?.contentType, row.cover_key.split('/').pop()) });
});

// ---------------------------------------------------------------- a Haul's book item

/** Point a Book item at a shelf book, or unlink it with null. */
shelfApi.put('/api/items/:id/shelf', async (c) => {
  const item = await itemOr404(c.env, c.req.param('id'));
  const { bookId } = await body(c, z.object({ bookId: z.string().max(81).nullable() }).strict());
  await attempt(() => linkItemToBook(c.env, item, bookId));
  return c.json({ item: await itemOr404(c.env, item.id), book: bookId ? bookView(await book(c.env, bookId)) : null });
});

/** Make a shelf book from a Book item's details, and link the item to it. */
shelfApi.post('/api/items/:id/shelf', async (c) => {
  const item = await itemOr404(c.env, c.req.param('id'));
  await body(c, z.object({}).strict());
  const row = await attempt(() => bookFromItem(c.env, item));
  return c.json({ item: await itemOr404(c.env, item.id), book: bookView(row) });
});

// ---------------------------------------------------------------- publish the shelf

/** What a publish would write, what it changes since the last one, and whether it passes. */
shelfApi.get('/api/shelf/preview', async (c) => {
  const a = await assembleShelf(c.env);
  const last = await c.env.DB.prepare('SELECT version, published_at, books FROM shelf_versions ORDER BY version DESC LIMIT 1').first();
  return c.json({ shelf: a.shelf, problems: a.problems, warnings: a.warnings, changes: a.changes, last });
});

shelfApi.post('/api/shelf/publish', async (c) => {
  await body(c, z.object({ confirm: z.literal(true) }).strict());
  const r = await publishShelf(c.env);
  return c.json(r, r.ok ? 200 : 422);
});
