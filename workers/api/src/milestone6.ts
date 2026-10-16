// Desk routes for plates, machine-suggested connections, Threads and Rhymes. Mounted by index.ts
// behind the same lock, CSRF refusal and JSON-only rules as every other /api route.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { EDGE_TYPES } from '@fdf/shared/haul';
import { checkStyle } from '@fdf/shared/style';
import {
  approveSuggestion,
  choosePlate,
  coverCandidatesFromItems,
  createRhyme,
  draftBridge,
  findPlates,
  getRhyme,
  guardedFetch,
  IMAGE_TYPES,
  nowIso,
  parseJson,
  patchRhyme,
  readCapped,
  runChecks,
  searchPlates,
  setEndQuote,
  setEndSource,
  setNoPlate,
  setSuggestionStatus,
  storeCandidates,
  suggestThreads,
  USER_AGENT,
  type Env,
  type PlateRow,
  type StoredPoint,
  type SuggestionRow,
  type ThreadRow,
} from '@fdf/server';
import { fileHeaders } from './security';

type App = { Bindings: Env; Variables: { owner: string } };
export const m6 = new Hono<App>();

async function body<T>(c: Context<App>, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw Object.assign(new Error('Expected a JSON body'), { status: 400 });
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw Object.assign(new Error(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')), { status: 400 });
  return r.data;
}

const notFound = () => Object.assign(new Error('Not found'), { status: 404 });
const query = z.object({ query: z.string().trim().min(2).max(100) });

// ------------------------------------------------------------------ plates

export async function platesFor(env: Env, t: { itemId: string } | { haulId: string }): Promise<PlateRow[]> {
  const rows =
    'itemId' in t
      ? await env.DB.prepare(`SELECT * FROM plates WHERE item_id = ? ORDER BY status = 'chosen' DESC, status = 'rejected', position`).bind(t.itemId).all<PlateRow>()
      : await env.DB.prepare(`SELECT * FROM plates WHERE haul_id = ? ORDER BY status = 'chosen' DESC, status = 'rejected', position`).bind(t.haulId).all<PlateRow>();
  return rows.results;
}

m6.get('/api/items/:id/plates', async (c) => c.json({ plates: await platesFor(c.env, { itemId: c.req.param('id') }) }));

// The editor's own search: no model involved, the query goes straight to the collections.
m6.post('/api/items/:id/plates', async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT 1 FROM items WHERE id = ?').bind(id).first())) throw notFound();
  const { query: q } = await body(c, query);
  const added = await storeCandidates(c.env, { itemId: id }, q, 'editor', await searchPlates(c.env, q, 9));
  return c.json({ added, plates: await platesFor(c.env, { itemId: id }) });
});

// Ask the machine for collection queries again (one cheap model call).
m6.post('/api/items/:id/plates/suggest', async (c) => {
  const id = c.req.param('id');
  const r = await findPlates(c.env, id, { force: true });
  return c.json({ ...r, plates: await platesFor(c.env, { itemId: id }) });
});

m6.post('/api/items/:id/plate-none', async (c) => {
  const { none } = await body(c, z.object({ none: z.boolean() }));
  await setNoPlate(c.env, { itemId: c.req.param('id') }, none);
  return c.json({ plates: await platesFor(c.env, { itemId: c.req.param('id') }) });
});

m6.get('/api/hauls/:id/plates', async (c) => c.json({ plates: await platesFor(c.env, { haulId: c.req.param('id') }) }));

m6.post('/api/hauls/:id/plates', async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT 1 FROM hauls WHERE id = ?').bind(id).first())) throw notFound();
  const { query: q } = await body(c, query);
  const added = await storeCandidates(c.env, { haulId: id }, q, 'editor', await searchPlates(c.env, q, 9));
  return c.json({ added, plates: await platesFor(c.env, { haulId: id }) });
});

m6.post('/api/hauls/:id/plates/from-items', async (c) => {
  const added = await coverCandidatesFromItems(c.env, c.req.param('id'));
  return c.json({ added, plates: await platesFor(c.env, { haulId: c.req.param('id') }) });
});

m6.post('/api/hauls/:id/cover-none', async (c) => {
  const { none } = await body(c, z.object({ none: z.boolean() }));
  await setNoPlate(c.env, { haulId: c.req.param('id') }, none);
  return c.json({ plates: await platesFor(c.env, { haulId: c.req.param('id') }) });
});

m6.post('/api/plates/:id/choose', async (c) => c.json({ plate: await choosePlate(c.env, c.req.param('id')) }));

// The caption is shown to readers in the serif: the editor may rewrite it in their own words.
m6.patch('/api/plates/:id', async (c) => {
  const p = await c.env.DB.prepare('SELECT * FROM plates WHERE id = ?').bind(c.req.param('id')).first<PlateRow>();
  if (!p) throw notFound();
  const b = await body(c, z.object({ caption: z.string().trim().min(1).max(400).optional(), status: z.enum(['candidate', 'rejected']).optional() }));
  if (b.status === 'rejected' && p.status === 'chosen') return c.json({ error: 'Choose another plate (or none) before setting this one aside' }, 409);
  await c.env.DB.prepare('UPDATE plates SET caption = COALESCE(?, caption), status = COALESCE(?, status) WHERE id = ?').bind(b.caption ?? null, b.status ?? null, p.id).run();
  return c.json({ plate: await c.env.DB.prepare('SELECT * FROM plates WHERE id = ?').bind(p.id).first() });
});

// Thumbnails come through the Desk (its CSP allows only its own images). The thumbnail URL came
// from a collection API, so it is fetched with the SSRF guard and must be an image.
m6.get('/api/plates/:id/thumb', async (c) => {
  const p = await c.env.DB.prepare('SELECT thumb_url, image_url, r2_key, mime FROM plates WHERE id = ?').bind(c.req.param('id')).first<Pick<PlateRow, 'thumb_url' | 'image_url' | 'r2_key' | 'mime'>>();
  if (!p) throw notFound();
  if (p.r2_key) {
    const obj = await c.env.MEDIA.get(p.r2_key);
    if (obj) return new Response(obj.body, { headers: fileHeaders(p.mime ?? 'image/jpeg', 'plate') });
  }
  // The thumbnail first, then the rendition if a provider's thumbnail size is refused.
  for (const u of [...new Set([p.thumb_url, p.image_url].filter((x): x is string => Boolean(x)))]) {
    const res = await guardedFetch(u, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, timeoutMs: 15_000 }).catch(() => null);
    if (!res) continue;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!res.ok || !IMAGE_TYPES.has(type)) {
      await res.body?.cancel();
      continue;
    }
    // Capped on the bytes actually read, whatever Content-Length says.
    const bytes = await readCapped(res.body, 8 * 1024 * 1024, 'thumbnail').catch(() => null);
    if (bytes) return new Response(bytes, { headers: { ...fileHeaders(type, 'thumb'), 'cache-control': 'private, max-age=86400' } });
  }
  return c.json({ error: 'Thumbnail unavailable' }, 502);
});

// ------------------------------------------------------------------ suggested connections

const SUGGESTION_SELECT = `SELECT s.*, a.title AS from_title, a.title_choice AS from_choice, a.type AS from_type, a.source_date AS from_date,
  b.title AS to_title, b.title_choice AS to_choice, b.type AS to_type, b.source_date AS to_date FROM suggestions s
  JOIN items a ON a.id = s.from_item_id JOIN items b ON b.id = s.to_item_id`;

m6.get('/api/suggestions', async (c) => {
  const status = c.req.query('status') ?? 'proposed';
  const itemId = c.req.query('itemId');
  const where = [status === 'all' ? '1 = 1' : 's.status = ?', itemId ? '(s.from_item_id = ? OR s.to_item_id = ?)' : '1 = 1'].join(' AND ');
  const binds = [...(status === 'all' ? [] : [status]), ...(itemId ? [itemId, itemId] : [])];
  const rows = (await c.env.DB.prepare(`${SUGGESTION_SELECT} WHERE ${where} ORDER BY s.status = 'proposed' DESC, s.confidence DESC, s.created_at DESC LIMIT 200`).bind(...binds).all()).results;
  const counts = (await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM suggestions GROUP BY status').all<{ status: string; n: number }>()).results;
  return c.json({ suggestions: rows.map((r) => ({ ...r, routes: parseJson((r as { routes: string }).routes, {}) })), counts, edgeTypes: EDGE_TYPES });
});

m6.post('/api/suggestions/:id/approve', async (c) => {
  const b = await body(c, z.object({ note: z.string().max(400), type: z.string().optional() }));
  return c.json({ suggestion: await approveSuggestion(c.env, c.req.param('id'), b.note, b.type) });
});

m6.post('/api/suggestions/:id/reject', async (c) => c.json({ suggestion: await setSuggestionStatus(c.env, c.req.param('id'), 'rejected') }));
m6.post('/api/suggestions/:id/reopen', async (c) => c.json({ suggestion: await setSuggestionStatus(c.env, c.req.param('id'), 'proposed') }));

// Look for connections again for one item (queued: embedding and judging run in the pipeline).
m6.post('/api/items/:id/connect', async (c) => {
  if (!(await c.env.DB.prepare('SELECT 1 FROM sources WHERE item_id = ?').bind(c.req.param('id')).first())) return c.json({ error: 'No source text yet' }, 409);
  await c.env.INGEST_QUEUE.send({ kind: 'connect', itemId: c.req.param('id') });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ threads

async function threadView(env: Env, t: ThreadRow) {
  const points = parseJson<StoredPoint[]>(t.points, []);
  const items = new Map(
    (
      await env.DB.prepare(`SELECT id, title, title_choice, type, creator FROM items WHERE id IN (${points.map(() => '?').join(',') || "''"})`)
        .bind(...points.map((p) => p.itemId))
        .all<{ id: string; title: string | null; title_choice: string | null; type: string; creator: string | null }>()
    ).results.map((r) => [r.id, r]),
  );
  return { ...t, points: points.map((p) => ({ ...p, item: items.get(p.itemId) ?? null })), item_ids: parseJson<string[]>(t.item_ids, []) };
}

m6.get('/api/threads', async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT * FROM threads ORDER BY status = 'proposed' DESC, status = 'approved' DESC, updated_at DESC`).all<ThreadRow>()).results;
  return c.json({ threads: await Promise.all(rows.map((t) => threadView(c.env, t))) });
});

m6.post('/api/threads/suggest', async (c) => {
  const r = await suggestThreads(c.env);
  return c.json(r);
});

// The editor names the Thread. Titles, summary and gists are shown in the serif once approved, so
// approving vouches for them; whatever the editor rewrites is theirs.
m6.patch('/api/threads/:id', async (c) => {
  const t = await c.env.DB.prepare('SELECT * FROM threads WHERE id = ?').bind(c.req.param('id')).first<ThreadRow>();
  if (!t) throw notFound();
  const b = await body(
    c,
    z.object({
      title_text: z.string().trim().min(1).max(120).optional(),
      title_italic: z.string().trim().max(120).nullable().optional(),
      summary: z.string().trim().min(1).max(600).optional(),
      gists: z.record(z.string(), z.string().max(240)).optional(),
      years: z.record(z.string(), z.string().max(12)).optional(),
      status: z.enum(['proposed', 'approved', 'rejected']).optional(),
    }),
  );
  const points = parseJson<StoredPoint[]>(t.points, [])
    .map((p) => (b.gists && p.itemId in b.gists ? { ...p, gist: b.gists[p.itemId]!.trim() } : p))
    .map((p) => (b.years && p.itemId in b.years ? { ...p, year: b.years[p.itemId]!.trim() } : p))
    .sort((x, y) => (x.year || '9999').localeCompare(y.year || '9999'));
  const edited = b.title_text !== undefined || b.title_italic !== undefined || b.summary !== undefined || b.gists !== undefined || b.years !== undefined;
  if (b.status === 'approved') {
    const title = b.title_text ?? t.title_text;
    const summary = b.summary ?? t.summary;
    if (!title.trim() || !summary.trim()) return c.json({ error: 'A Thread needs a title and a summary' }, 400);
    if (points.some((p) => !p.gist.trim())) return c.json({ error: 'Every point needs a line (write the missing ones)' }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE threads SET title_text = COALESCE(?, title_text), title_italic = CASE WHEN ? THEN ? ELSE title_italic END, summary = COALESCE(?, summary), points = ?,
       status = COALESCE(?, status), edited = edited OR ?, updated_at = ? WHERE id = ?`,
  )
    .bind(b.title_text ?? null, b.title_italic !== undefined ? 1 : 0, b.title_italic || null, b.summary ?? null, JSON.stringify(points), b.status ?? null, edited ? 1 : 0, nowIso(), t.id)
    .run();
  const fresh = (await c.env.DB.prepare('SELECT * FROM threads WHERE id = ?').bind(t.id).first<ThreadRow>())!;
  const style = checkStyle([fresh.title_text, fresh.title_italic, fresh.summary].filter(Boolean).join('. '), { strict: false });
  return c.json({ thread: await threadView(c.env, fresh), style });
});

// ------------------------------------------------------------------ rhymes

async function rhymeDetail(env: Env, id: string) {
  const item = await env.DB.prepare(`SELECT * FROM items WHERE id = ? AND kind = 'rhyme'`).bind(id).first();
  const rhyme = await getRhyme(env, id);
  if (!item || !rhyme) throw notFound();
  const end = async (srcId: string | null) => {
    if (!srcId) return null;
    const it = await env.DB.prepare('SELECT id, title, title_choice, creator, source_name, source_date, url, canonical_url, status, status_detail, type FROM items WHERE id = ?').bind(srcId).first();
    const src = await env.DB.prepare('SELECT item_id, text, extractor, word_count, meta, fetched_at, edited, snapshot_key FROM sources WHERE item_id = ?').bind(srcId).first<{ meta: string | null }>();
    return { item: it, source: src ? { ...src, meta: parseJson(src.meta, {}) } : null };
  };
  const checks = (await env.DB.prepare('SELECT * FROM checks WHERE item_id = ?').bind(id).all<{ detail: string }>()).results.map((k) => ({ ...k, detail: parseJson(k.detail, {}) }));
  return { item, rhyme, then: await end(rhyme.then_item_id), now: await end(rhyme.now_item_id), checks };
}

m6.post('/api/rhymes', async (c) => {
  const b = await body(c, z.object({ thenItemId: z.string().optional(), nowItemId: z.string().optional() }));
  const id = await createRhyme(c.env, b);
  await runChecks(c.env, id, { links: false });
  return c.json(await rhymeDetail(c.env, id));
});

m6.get('/api/rhymes/:id', async (c) => c.json(await rhymeDetail(c.env, c.req.param('id'))));

m6.put('/api/rhymes/:id/:end/source', async (c) => {
  const end = c.req.param('end');
  if (end !== 'then' && end !== 'now') throw notFound();
  const { itemId } = await body(c, z.object({ itemId: z.string() }));
  await setEndSource(c.env, c.req.param('id'), end, itemId);
  await runChecks(c.env, c.req.param('id'), { links: end === 'then' });
  return c.json(await rhymeDetail(c.env, c.req.param('id')));
});

m6.put('/api/rhymes/:id/:end/quote', async (c) => {
  const end = c.req.param('end');
  if (end !== 'then' && end !== 'now') throw notFound();
  const b = await body(c, z.union([z.object({ start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1) }), z.object({ quote: z.string().min(2).max(2000) })]));
  await setEndQuote(c.env, c.req.param('id'), end, b);
  await runChecks(c.env, c.req.param('id'), { links: false });
  return c.json(await rhymeDetail(c.env, c.req.param('id')));
});

m6.patch('/api/rhymes/:id', async (c) => {
  const b = await body(
    c,
    z.object({
      then_year: z.string().max(40).optional(),
      then_cite: z.string().max(300).optional(),
      now_year: z.string().max(40).optional(),
      now_cite: z.string().max(300).optional(),
      bridge: z.string().max(1200).optional(),
    }),
  );
  await patchRhyme(c.env, c.req.param('id'), b);
  await runChecks(c.env, c.req.param('id'), { links: false });
  return c.json(await rhymeDetail(c.env, c.req.param('id')));
});

m6.post('/api/rhymes/:id/bridge', async (c) => {
  await draftBridge(c.env, c.req.param('id'));
  await runChecks(c.env, c.req.param('id'), { links: false });
  return c.json(await rhymeDetail(c.env, c.req.param('id')));
});
