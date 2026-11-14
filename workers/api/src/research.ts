// Desk routes for the research desk: the texts the machine may cite beside an item (fetched by the
// Desk itself, never supplied as text), and a research run on demand. Notes citing these texts go in
// through POST /api/items/:id/marginalia (index.ts) with cite kind "evidence", the same gates as all.
// Mounted by index.ts behind the same lock, CSRF refusal and JSON-only rules as every /api route.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { addWebEvidence, addWikiEvidence, errorMessage, evidenceFor, getItem, judgeNotes, researchItem, runChecks, SpendCeilingError, upsertCheck, type EvidenceRow, type Env } from '@fdf/server';

type App = { Bindings: Env; Variables: { owner: string } };
export const researchApi = new Hono<App>();

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

/** A fetched text for the caller: its text only when asked (`?text=1`), so a listing stays small. */
const shown = (e: EvidenceRow, withText: boolean) => {
  const { text, ...rest } = e;
  return withText ? { ...rest, text } : rest;
};

const writer = z.string().regex(/^[a-z0-9][a-z0-9.-]{1,58}$/);

researchApi.get('/api/items/:id/evidence', async (c) => {
  const id = c.req.param('id');
  if (!(await getItem(c.env, id))) return c.json({ error: 'Not found' }, 404);
  const withText = c.req.query('text') === '1';
  return c.json({ evidence: (await evidenceFor(c.env, id)).map((e) => shown(e, withText)) });
});

/**
 * Fetch a text for the machine to cite: `{"url":"https://…"}` (a page a session found; fetched by the
 * Desk through the guarded article path) or `{"wikipedia":"Great Stink"}` (resolved by code, the whole
 * article kept). Answers with the stored text, so the caller can quote it exactly.
 */
researchApi.post('/api/items/:id/evidence', async (c) => {
  const id = c.req.param('id');
  if (!(await getItem(c.env, id))) return c.json({ error: 'Not found' }, 404);
  const b = await body(
    c,
    z
      .object({ url: z.string().url().max(2000).optional(), wikipedia: z.string().min(1).max(200).optional(), writer: writer.optional() })
      .refine((x) => Boolean(x.url) !== Boolean(x.wikipedia), 'Give either url or wikipedia'),
  );
  if (b.url && !/^https?:\/\//i.test(b.url)) return c.json({ error: 'Only http and https links' }, 400);
  const via = `${b.writer ?? 'editorial'} (session)`;
  try {
    const row = b.url ? await addWebEvidence(c.env, id, b.url, via) : await addWikiEvidence(c.env, id, b.wikipedia!, via);
    if (!row) return c.json({ error: 'No Wikipedia article matches that title, or Wikipedia lists it as ambiguous; give the exact title' }, 422);
    return c.json({ evidence: shown(row, true) });
  } catch (e) {
    if (e instanceof SpendCeilingError) throw e;
    return c.json({ error: `Could not fetch it: ${errorMessage(e).slice(0, 300)}` }, 422);
  }
});

/** Seconds between two research runs on one item: each run is paid, and a double submit is easy. */
export const RESEARCH_COOLDOWN_SECONDS = 120;

/**
 * Run the research desk on one item now, judge only the notes it just wrote (a kept note keeps its
 * verdict), and answer with the counts. A failure is recorded on the item's checks.
 */
researchApi.post('/api/items/:id/research', async (c) => {
  const id = c.req.param('id');
  const item = await getItem(c.env, id);
  if (!item) return c.json({ error: 'Not found' }, 404);
  if (item.type === 'life' || item.kind === 'rhyme') return c.json({ error: 'A Life or a Rhyme carries its own cited lines' }, 409);
  const last = await c.env.DB.prepare(`SELECT at FROM checks WHERE item_id = ? AND name = 'research'`).bind(id).first<{ at: string }>();
  const since = last ? (Date.now() - Date.parse(last.at)) / 1000 : Infinity;
  if (since < RESEARCH_COOLDOWN_SECONDS) return c.json({ error: `Research ran on this item ${Math.round(since)} seconds ago; wait two minutes before running it again` }, 429);
  let r: Awaited<ReturnType<typeof researchItem>>;
  try {
    r = await researchItem(c.env, id);
  } catch (e) {
    if (e instanceof SpendCeilingError) throw e;
    await upsertCheck(c.env, id, 'research', 'warn', { summary: `The research desk failed: ${errorMessage(e).slice(0, 200)}`, rows: [] });
    return c.json({ error: `The research desk failed: ${errorMessage(e).slice(0, 300)}` }, 502);
  }
  const fresh = (
    await c.env.DB.prepare(`SELECT id FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status = 'proposed' AND json_extract(body, '$.verdict') = 'unchecked'`).bind(id).all<{ id: string }>()
  ).results.map((x) => x.id);
  const judged = fresh.length ? await judgeNotes(c.env, id, fresh) : { checked: 0, rejected: 0 };
  await runChecks(c.env, id, { links: false });
  return c.json({ ...r, judged: judged.checked, setAside: judged.rejected, offered: r.notes - judged.rejected });
});
