// Desk routes for Lives: create a Life with its sources (fetched by code), take a profile from its
// writer (checked and judged in packages/server/src/lives.ts), keep or cut each line, approve.
// Mounted by index.ts behind the same lock, CSRF refusal and JSON-only rules as every /api route.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  addLifeSources,
  approveLife,
  createLife,
  fetchLifeSources,
  getItem,
  LifeError,
  lifeRow,
  lifeSourceRows,
  parseJson,
  runChecks,
  setAllLines,
  setLineStatus,
  submitLife,
  type Env,
  type LifeSourceRow,
} from '@fdf/server';

type App = { Bindings: Env; Variables: { owner: string } };
export const livesApi = new Hono<App>();

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

const https = z.string().max(2000).regex(/^https:\/\/\S+$/, 'an https link');
const kind = z.enum(['book', 'report', 'article', 'reference']);
const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'a short lowercase key, e.g. "guha"'),
  author: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(400),
  kind,
  publisher: z.string().max(200).optional(),
  year: z.string().max(20).optional(),
  url: https,
  via: z.string().max(300).optional(),
  workUrl: https.optional(),
});
const cite = z.object({ source: z.string().min(1).max(41), quote: z.string().min(2).max(2000), at: z.string().max(80).optional() });
const line = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), text: z.string().min(1).max(1200), cites: z.array(cite).min(1).max(8) });
const draftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  born: z.object({ year: z.number().int(), place: z.string().max(200).optional(), cites: z.array(cite).min(1).max(4) }).optional(),
  died: z.object({ year: z.number().int(), place: z.string().max(200).optional(), cites: z.array(cite).min(1).max(4) }).optional(),
  epithet: line,
  sections: z.array(z.object({ heading: z.string().min(1).max(120), paragraphs: z.array(z.array(line).min(1).max(20)).min(1).max(20) })).min(1).max(12),
  words: z.object({ text: z.string().min(2).max(400), context: line, cites: z.array(cite).min(1).max(2) }).optional(),
  dates: z.array(z.object({ year: z.string().min(1).max(20), line })).max(40).default([]),
  figures: z.object({ title: z.string().min(1).max(120), rows: z.array(z.object({ value: z.string().min(1).max(40), line })).min(1).max(12) }).optional(),
  reading: z
    .array(z.object({ author: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(400), kind, publisher: z.string().max(200).optional(), year: z.string().max(20).optional(), url: https.optional() }))
    .max(12)
    .default([]),
  writer: z.string().trim().min(1).max(60),
});

/** The sources as the Desk shows them: everything but the text. */
const sourceView = (r: LifeSourceRow) => ({
  id: r.id,
  key: r.key,
  author: r.author,
  title: r.title,
  kind: r.kind,
  publisher: r.publisher,
  year: r.year,
  url: r.url,
  via: r.via,
  workUrl: r.work_url,
  status: r.status,
  detail: r.detail,
  words: r.word_count,
  extractor: r.extractor,
  fetchedAt: r.fetched_at,
});

async function lifeItem(env: Env, id: string) {
  const it = await getItem(env, id);
  if (!it) throw Object.assign(new Error('Not found'), { status: 404 });
  if (it.type !== 'life') throw Object.assign(new Error('This item is not a Life'), { status: 409 });
  return it;
}

async function view(env: Env, id: string) {
  const row = await lifeRow(env, id);
  return {
    sources: (await lifeSourceRows(env, id)).map(sourceView),
    draft: parseJson(row?.body, null),
    writer: row?.writer ?? null,
    approvedAt: row?.approved_at ?? null,
    problems: parseJson<string[]>(row?.problems, []),
  };
}

/** Refusals from the rules come back with their status and problems, so the writer can fix them. */
async function attempt<T>(c: Context<App>, fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LifeError) return c.json({ error: e.message, problems: e.problems }, e.status as 400);
    throw e;
  }
}

livesApi.post('/api/lives', async (c) => {
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(200), why: z.string().max(6000).optional(), year: z.number().int().min(-3000).max(2100).optional(), sources: z.array(sourceSchema).min(1).max(12) }));
  const r = await attempt(c, () => createLife(c.env, b));
  if (r instanceof Response) return r;
  await runChecks(c.env, r.itemId, { links: false });
  return c.json({ itemId: r.itemId, ...(await view(c.env, r.itemId)) });
});

livesApi.get('/api/items/:id/life', async (c) => {
  await lifeItem(c.env, c.req.param('id'));
  return c.json(await view(c.env, c.req.param('id')));
});

livesApi.post('/api/items/:id/life/sources', async (c) => {
  const id = c.req.param('id');
  await lifeItem(c.env, id);
  const b = await body(c, z.object({ sources: z.array(sourceSchema).min(1).max(12) }));
  const r = await attempt(c, async () => {
    await addLifeSources(c.env, id, b.sources);
    return fetchLifeSources(c.env, id);
  });
  if (r instanceof Response) return r;
  return c.json(await view(c.env, id));
});

livesApi.post('/api/items/:id/life/fetch', async (c) => {
  const id = c.req.param('id');
  await lifeItem(c.env, id);
  const b = await body(c, z.object({ key: z.string().max(41).optional() }));
  await fetchLifeSources(c.env, id, b.key);
  return c.json(await view(c.env, id));
});

// The profile from its writer: refused whole (422, with every problem) unless every line passes.
livesApi.post('/api/items/:id/life', async (c) => {
  const id = c.req.param('id');
  await lifeItem(c.env, id);
  const b = await body(c, draftSchema);
  const r = await attempt(c, () => submitLife(c.env, id, { name: b.name, ...(b.born ? { born: b.born } : {}), ...(b.died ? { died: b.died } : {}), reading: b.reading, writer: b.writer, ...withStatus(b) }, `${b.writer} (session)`));
  if (r instanceof Response) return r;
  await runChecks(c.env, id, { links: false });
  return c.json({ judged: r.judged, setAside: r.setAside, ...(await view(c.env, id)) });
});

/** Every line arrives proposed; the Desk sets status, verdict and reason, never the writer. */
function withStatus(b: z.infer<typeof draftSchema>) {
  const p = <T extends { id: string; text: string; cites: z.infer<typeof cite>[] }>(l: T) => ({ id: l.id, text: l.text, cites: l.cites, status: 'proposed' as const });
  return {
    epithet: p(b.epithet),
    sections: b.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map((para) => para.map(p)) })),
    ...(b.words ? { words: { text: b.words.text, context: p(b.words.context), cites: b.words.cites } } : {}),
    dates: b.dates.map((d) => ({ year: d.year, line: p(d.line) })),
    ...(b.figures ? { figures: { title: b.figures.title, rows: b.figures.rows.map((r) => ({ value: r.value, line: p(r.line) })) } } : {}),
  };
}

livesApi.patch('/api/items/:id/life/lines/:line', async (c) => {
  const id = c.req.param('id');
  await lifeItem(c.env, id);
  const b = await body(c, z.object({ status: z.enum(['kept', 'cut', 'proposed']) }));
  const r = await attempt(c, () => setLineStatus(c.env, id, c.req.param('line'), b.status));
  if (r instanceof Response) return r;
  await runChecks(c.env, id, { links: false });
  return c.json(await view(c.env, id));
});

livesApi.post('/api/items/:id/life/all', async (c) => {
  const id = c.req.param('id');
  await lifeItem(c.env, id);
  const b = await body(c, z.object({ status: z.enum(['kept', 'cut']) }));
  const r = await attempt(c, () => setAllLines(c.env, id, b.status));
  if (r instanceof Response) return r;
  await runChecks(c.env, id, { links: false });
  return c.json(await view(c.env, id));
});

livesApi.post('/api/items/:id/life/approve', async (c) => {
  const id = c.req.param('id');
  await lifeItem(c.env, id);
  const b = await body(c, z.object({ approve: z.boolean() }));
  const r = await attempt(c, () => approveLife(c.env, id, b.approve));
  if (r instanceof Response) return r;
  await runChecks(c.env, id, { links: false });
  return c.json({ ...r, ...(await view(c.env, id)) });
});
