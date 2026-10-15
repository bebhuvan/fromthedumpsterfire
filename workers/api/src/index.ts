// The Desk API and UI host. Public: POST /v1/devices (the reader app) and GET /v1/health.
// Everything else, including the UI's static assets, requires the owner's Access assertion.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { checkStyle } from '@fdf/shared/style';
import { isVerbatimAt } from '@fdf/shared/verbatim';
import { typeSwatch } from '@fdf/shared/tokens';
import {
  assembleHaul,
  defaultColophon,
  describeRoutes,
  draftQuestions,
  draftRoute,
  errorMessage,
  firstSentence,
  judgeNotes,
  locatorFor,
  newId,
  nowIso,
  parseJson,
  processNote,
  publishHaul,
  resolveWikiTopic,
  runChecks,
  SECRET_NAMES,
  spendStatus,
  type CheckRow,
  type DraftRow,
  type Env,
  type ExcerptRow,
  type HaulRow,
  type ItemRow,
  type MarginalBody,
  type NoteRow,
  type SourceRow,
  type WikiRow,
} from '@fdf/server';
import { AccessDenied, devBypassAllowed, KNOWN_ENVIRONMENTS, readAssertion, verifyOwner } from './access';
import { captureEntries, captureFile, entriesFromPaste, type CaptureEntry } from './capture';
import { checkCsrf, escapeHtml, fileHeaders, isPublicRoute, localLimit, SECURITY_HEADERS, withHeaders } from './security';

type App = { Bindings: Env; Variables: { owner: string } };
const app = new Hono<App>();


app.onError((err, c) => {
  console.error(JSON.stringify({ event: 'error', path: c.req.path, error: errorMessage(err) }));
  const status = (err as { status?: number }).status;
  return c.json({ error: errorMessage(err) }, status && status >= 400 && status < 600 ? (status as 400) : 500);
});

// ------------------------------------------------------------------ headers, cross-site refusal, the lock

// Every response carries the Desk's security headers (a strict CSP: no inline or third-party script).
app.use('*', async (c, next) => {
  await next();
  c.res = withHeaders(c.res, SECURITY_HEADERS);
});

app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  // A deployment without a known ENVIRONMENT is misconfigured: refuse everything.
  if (!KNOWN_ENVIRONMENTS.has(c.env.ENVIRONMENT as string)) return c.json({ error: 'Misconfigured deployment' }, 503);
  if (isPublicRoute(c.req.method, url.pathname)) return next();
  const csrf = checkCsrf(c.req.raw);
  if (!csrf.ok) return c.json({ error: 'Refused', reason: csrf.reason }, csrf.status ?? 403);
  if (devBypassAllowed(c.env, url)) {
    c.set('owner', 'local-dev');
    return next();
  }
  try {
    const { email } = await verifyOwner(readAssertion(c.req.raw.headers), {
      teamDomain: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_AUD,
      ownerEmail: c.env.OWNER_EMAIL,
    });
    c.set('owner', email);
    return next();
  } catch (e) {
    const reason = e instanceof AccessDenied ? e.message : 'Access check failed';
    if (url.pathname.startsWith('/api/') || c.req.method !== 'GET') return c.json({ error: 'Not signed in as the editor', reason }, 403);
    return c.html(lockedPage(reason), 403);
  }
});

function lockedPage(reason: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Desk</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#141416;font:16px/1.5 Georgia,serif}@media(prefers-color-scheme:dark){body{background:#0F0F12;color:#F3F3F1}}main{max-width:28rem;padding:24px}h1{font-weight:500;font-style:italic;font-size:32px;margin:0 0 8px}p{margin:0;color:#77777f;font-family:system-ui,sans-serif;font-size:14px}</style></head>
<body><main><h1>The Desk</h1><p>This desk is private. ${escapeHtml(reason)}.</p></main></body></html>`;
}

// ------------------------------------------------------------------ public

app.get('/v1/health', (c) => c.json({ ok: true }));

const deviceSchema = z.object({
  token: z.string().min(20).max(4096).regex(/^[\w:\-.]+$/),
  platform: z.enum(['android', 'ios']),
  enabled: z.boolean(),
});

// Public by design (the reader app calls it). Narrow: JSON only, small, shape-checked, rate limited,
// and its only effect is one row in the devices table.
app.post('/v1/devices', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const limited = c.env.DEVICE_LIMITER ? !(await c.env.DEVICE_LIMITER.limit({ key: ip })).success : !localLimit(`dev:${ip}`, 20, 60_000);
  if (limited) return c.json({ error: 'Too many requests' }, 429);
  if ((c.req.header('content-type') ?? '').split(';')[0]!.trim() !== 'application/json') return c.json({ error: 'Expected application/json' }, 415);
  const len = Number(c.req.header('content-length') ?? 0);
  if (!len || len > 8192) return c.json({ error: 'Body missing or too large' }, 413);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Expected JSON' }, 400);
  }
  const p = deviceSchema.safeParse(body);
  if (!p.success) return c.json({ error: 'Expected { token, platform: "android" | "ios", enabled }' }, 400);
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO devices (token, platform, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (token) DO UPDATE SET platform = excluded.platform, enabled = excluded.enabled, updated_at = excluded.updated_at, failures = 0`,
  )
    .bind(p.data.token, p.data.platform, p.data.enabled ? 1 : 0, now, now)
    .run();
  return c.json({ ok: true });
});

// Anything else under /v1 is not a Desk page: never fall through to the UI.
app.all('/v1/*', (c) => c.json({ error: 'Not found' }, 404));

// ------------------------------------------------------------------ helpers

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

async function itemOr404(env: Env, id: string): Promise<ItemRow> {
  const it = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
  if (!it) throw notFound();
  return it;
}

function secretsPresent(env: Env) {
  return Object.fromEntries(SECRET_NAMES.map((n) => [n, Boolean(env[n])]));
}

// ------------------------------------------------------------------ me, settings

app.get('/api/me', async (c) => {
  return c.json({ owner: c.get('owner'), environment: c.env.ENVIRONMENT, spend: await spendStatus(c.env) });
});

app.get('/api/settings', async (c) => {
  const [spend, devices, calls, byTask] = await Promise.all([
    spendStatus(c.env),
    c.env.DB.prepare('SELECT platform, enabled, COUNT(*) AS n FROM devices GROUP BY platform, enabled').all(),
    c.env.DB.prepare('SELECT at, task, provider, model, input_tokens, output_tokens, audio_seconds, cost_usd, latency_ms, ok, error FROM model_calls ORDER BY at DESC LIMIT 40').all(),
    c.env.DB.prepare('SELECT task, COUNT(*) AS calls, SUM(cost_usd) AS cost FROM model_calls WHERE at >= ? GROUP BY task').bind(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()).all(),
  ]);
  return c.json({
    environment: c.env.ENVIRONMENT,
    spend,
    routes: describeRoutes(c.env),
    secrets: secretsPresent(c.env),
    access: { teamDomain: Boolean(c.env.ACCESS_TEAM_DOMAIN), aud: Boolean(c.env.ACCESS_AUD), owner: c.env.OWNER_EMAIL ?? '' },
    devices: devices.results,
    recentCalls: calls.results,
    spendByTask: byTask.results,
    filesBase: c.env.FILES_BASE,
  });
});

// ------------------------------------------------------------------ capture

const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u), 'only http(s) links can be captured');

const entrySchema = z.object({
  url: httpUrl.optional(),
  text: z.string().max(200_000).optional(),
  source: z.string().max(500).optional(),
  sourceUrl: httpUrl.optional().or(z.literal('')),
  why: z.string().max(20_000).optional(),
  whyNoteId: z.string().optional(),
  type: z.string().optional(),
});

app.post('/api/capture', async (c) => {
  const b = await body(c, z.object({ entries: z.array(entrySchema).max(50).optional(), paste: z.string().max(200_000).optional(), source: z.string().optional(), why: z.string().optional(), whyNoteId: z.string().optional(), type: z.string().optional() }));
  const entries: CaptureEntry[] = b.entries?.length
    ? b.entries.map((e) => ({ ...e, sourceUrl: e.sourceUrl || undefined }))
    : b.paste
      ? entriesFromPaste(b.paste, { source: b.source, why: b.why, whyNoteId: b.whyNoteId, type: b.type })
      : [];
  if (!entries.length) return c.json({ error: 'Nothing to capture' }, 400);
  return c.json({ captured: await captureEntries(c.env, entries) });
});

app.post('/api/capture/file', async (c) => {
  const form = await c.req.formData();
  const why = String(form.get('why') ?? '') || undefined;
  const type = String(form.get('type') ?? '') || undefined;
  const whyNoteId = String(form.get('whyNoteId') ?? '') || undefined;
  const out = [];
  for (const f of form.getAll('file')) {
    if (typeof f === 'string') continue;
    const r = await captureFile(c.env, f, { why, type, whyNoteId });
    if ('noteFile' in r) out.push({ error: `${f.name} is audio; add it as a voice note instead` });
    else out.push(r);
  }
  return c.json({ captured: out });
});

// Android Web Share Target (manifest share_target posts multipart here).
app.post('/share', async (c) => {
  const form = await c.req.formData();
  const text = [form.get('title'), form.get('text'), form.get('url')].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join('\n');
  let count = 0;
  let noteId: string | null = null;
  for (const f of form.getAll('files')) {
    if (typeof f === 'string') continue;
    const r = await captureFile(c.env, f).catch(() => null);
    if (r && 'noteFile' in r) noteId = await storeNote(c.env, f, 'capture', {});
    else if (r) count++;
  }
  if (text.trim()) {
    const entries = entriesFromPaste(text);
    count += (await captureEntries(c.env, entries)).length;
  }
  if (noteId) {
    await processNote(c.env, noteId).catch(() => null);
    return c.redirect(`/?note=${noteId}`, 303);
  }
  return c.redirect(`/?shared=${count}`, 303);
});

// ------------------------------------------------------------------ items

app.get('/api/items', async (c) => {
  const view = c.req.query('view') ?? 'tray';
  const where =
    view === 'archived' ? 'i.archived = 1' : view === 'all' ? '1 = 1' : view === 'ready' ? "i.archived = 0 AND i.status = 'ready'" : 'i.archived = 0';
  const rows = (
    await c.env.DB.prepare(
      `SELECT i.id, i.kind, i.type, i.status, i.status_detail, i.url, i.title, i.title_choice, i.creator, i.source_name, i.source_date, i.minutes,
              i.why_text IS NOT NULL AND i.why_text != '' AS has_why, i.captured_at, i.updated_at, i.archived, i.capture_text,
              (SELECT h.number FROM haul_items hi JOIN hauls h ON h.id = hi.haul_id WHERE hi.item_id = i.id LIMIT 1) AS haul_number,
              (SELECT COUNT(*) FROM drafts d WHERE d.item_id = i.id AND d.kind IN ('marginal', 'title') AND d.status = 'proposed') AS pending,
              (SELECT group_concat(name || ':' || status) FROM checks k WHERE k.item_id = i.id) AS checks
       FROM items i WHERE ${where} ORDER BY i.captured_at DESC LIMIT 300`,
    ).all()
  ).results;
  return c.json({ items: rows });
});

app.get('/api/items/:id', async (c) => {
  const id = c.req.param('id');
  const item = await itemOr404(c.env, id);
  const [source, excerpts, drafts, wiki, checks, notes, run, haul, connections] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM sources WHERE item_id = ?').bind(id).first<SourceRow>(),
    c.env.DB.prepare('SELECT * FROM excerpts WHERE item_id = ? ORDER BY chosen DESC, origin DESC, start').bind(id).all<ExcerptRow>(),
    c.env.DB.prepare('SELECT * FROM drafts WHERE item_id = ? ORDER BY kind, position').bind(id).all<DraftRow>(),
    c.env.DB.prepare('SELECT * FROM wiki_cards WHERE item_id = ? ORDER BY position').bind(id).all<WikiRow>(),
    c.env.DB.prepare('SELECT * FROM checks WHERE item_id = ?').bind(id).all<CheckRow>(),
    c.env.DB.prepare('SELECT * FROM notes WHERE item_id = ? ORDER BY created_at DESC').bind(id).all<NoteRow>(),
    c.env.DB.prepare('SELECT * FROM runs WHERE item_id = ? ORDER BY started_at DESC LIMIT 1').bind(id).first(),
    c.env.DB.prepare('SELECT h.id, h.number, h.status FROM haul_items hi JOIN hauls h ON h.id = hi.haul_id WHERE hi.item_id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT c.*, i.title AS to_title FROM connections c JOIN items i ON i.id = c.to_item_id WHERE c.item_id = ?').bind(id).all(),
  ]);
  return c.json({
    item,
    source: source ? { ...source, meta: parseJson(source.meta, {}) } : null,
    excerpts: excerpts.results,
    drafts: drafts.results.map((d) => ({ ...d, body: parseJson(d.body, {}) })),
    wiki: wiki.results,
    checks: checks.results.map((k) => ({ ...k, detail: parseJson(k.detail, {}) })),
    notes: notes.results,
    run,
    haul,
    connections: connections.results,
  });
});

const itemPatch = z.object({
  type: z.string().refine((t) => t in typeSwatch, 'unknown type').optional(),
  title: z.string().max(500).optional(),
  title_choice: z.object({ text: z.string().max(300), italic: z.string().max(200).optional() }).nullable().optional(),
  creator: z.string().max(300).optional(),
  source_name: z.string().max(300).optional(),
  source_date: z.string().max(100).optional(),
  url: z.string().url().refine((u) => u.startsWith('https://'), 'links must be https').or(z.literal('')).optional(),
  why_text: z.string().max(20_000).optional(),
  why_note_id: z.string().nullable().optional(),
  why_audio: z.boolean().optional(),
  locator: z.string().max(200).optional(),
  minutes: z.number().int().min(1).max(10_000).nullable().optional(),
  archived: z.boolean().optional(),
});

app.patch('/api/items/:id', async (c) => {
  const id = c.req.param('id');
  await itemOr404(c.env, id);
  const p = await body(c, itemPatch);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (k === 'title_choice') {
      sets.push('title_choice = ?');
      vals.push(v ? JSON.stringify(v) : null);
    } else if (k === 'why_audio' || k === 'archived') {
      sets.push(`${k} = ?`);
      vals.push(v ? 1 : 0);
    } else if (k === 'type') {
      sets.push('type = ?', "type_by = 'editor'");
      vals.push(v);
    } else if (k === 'url') {
      sets.push('url = ?', 'canonical_url = NULL');
      vals.push(v || null);
    } else {
      sets.push(`${k} = ?`);
      vals.push(v === '' ? null : v);
    }
  }
  if (sets.length) {
    sets.push('updated_at = ?');
    vals.push(nowIso(), id);
    await c.env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
  // Cheap checks follow the edit at once; link checks run on demand.
  if (p.why_text !== undefined || p.url !== undefined) await runChecks(c.env, id, { links: p.url !== undefined });
  return c.json({ item: await itemOr404(c.env, id) });
});

app.delete('/api/items/:id', async (c) => {
  const id = c.req.param('id');
  const inHaul = await c.env.DB.prepare(`SELECT h.status FROM haul_items hi JOIN hauls h ON h.id = hi.haul_id WHERE hi.item_id = ?`).bind(id).first<{ status: string }>();
  if (inHaul?.status === 'published') return c.json({ error: 'This item is in a published Haul; archive it instead' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM haul_items WHERE item_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM connections WHERE item_id = ? OR to_item_id = ?').bind(id, id),
    c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// The editor may correct a transcription (OCR or a pasted passage). Excerpts that no longer match are unchosen.
app.put('/api/items/:id/source', async (c) => {
  const id = c.req.param('id');
  const { text } = await body(c, z.object({ text: z.string().min(1).max(1_500_000) }));
  const src = await c.env.DB.prepare('SELECT * FROM sources WHERE item_id = ?').bind(id).first<SourceRow>();
  if (!src) throw notFound();
  if (!['ocr', 'pasted', 'description'].includes(src.extractor)) return c.json({ error: 'Only transcriptions and pasted passages can be corrected; fetched sources are kept as fetched' }, 409);
  await c.env.DB.prepare('UPDATE sources SET text = ?, word_count = ?, edited = 1 WHERE item_id = ?').bind(text, text.split(/\s+/).filter(Boolean).length, id).run();
  const exs = (await c.env.DB.prepare('SELECT * FROM excerpts WHERE item_id = ?').bind(id).all<ExcerptRow>()).results;
  for (const ex of exs) if (!isVerbatimAt(text, ex, ex.text)) await c.env.DB.prepare('DELETE FROM excerpts WHERE id = ?').bind(ex.id).run();
  await runChecks(c.env, id, { links: false });
  return c.json({ ok: true });
});

app.post('/api/items/:id/refetch', async (c) => {
  await itemOr404(c.env, c.req.param('id'));
  await c.env.DB.prepare(`UPDATE items SET status = 'queued', status_detail = NULL WHERE id = ?`).bind(c.req.param('id')).run();
  await c.env.INGEST_QUEUE.send({ kind: 'ingest', itemId: c.req.param('id') });
  return c.json({ ok: true });
});

app.post('/api/items/:id/redraft', async (c) => {
  await itemOr404(c.env, c.req.param('id'));
  await c.env.DB.prepare(`UPDATE items SET status = 'queued', status_detail = 'Redrafting' WHERE id = ?`).bind(c.req.param('id')).run();
  await c.env.INGEST_QUEUE.send({ kind: 'redraft', itemId: c.req.param('id') });
  return c.json({ ok: true });
});

app.post('/api/items/:id/check', async (c) => {
  await itemOr404(c.env, c.req.param('id'));
  return c.json({ checks: await runChecks(c.env, c.req.param('id')) });
});

app.get('/api/items/:id/file', async (c) => {
  const it = await itemOr404(c.env, c.req.param('id'));
  if (!it.file_key) throw notFound();
  const obj = await c.env.MEDIA.get(it.file_key);
  if (!obj) throw notFound();
  return new Response(obj.body, { headers: fileHeaders(obj.httpMetadata?.contentType, obj.customMetadata?.name ?? 'upload') });
});

// ------------------------------------------------------------------ excerpts

app.post('/api/items/:id/excerpts', async (c) => {
  const id = c.req.param('id');
  const item = await itemOr404(c.env, id);
  const b = await body(c, z.object({ start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1) }));
  const src = await c.env.DB.prepare('SELECT text, meta FROM sources WHERE item_id = ?').bind(id).first<{ text: string; meta: string | null }>();
  if (!src) return c.json({ error: 'No source text yet' }, 409);
  // The excerpt is the source's own characters at those offsets, trimmed of edge whitespace.
  let { start, end } = b;
  while (start < end && /\s/.test(src.text[start]!)) start++;
  while (end > start && /\s/.test(src.text[end - 1]!)) end--;
  const text = src.text.slice(start, end);
  if (!text || text !== b.text.trim()) return c.json({ error: 'That selection does not match the source text; select it again' }, 409);
  const exId = newId('ex_');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE excerpts SET chosen = 0 WHERE item_id = ?').bind(id),
    c.env.DB.prepare(
      `INSERT INTO excerpts (id, item_id, start, end, text, locator, origin, chosen, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, 'editor', 1, 1, ?)`,
    ).bind(exId, id, start, end, text, locatorFor(item, src, start), nowIso()),
  ]);
  await runChecks(c.env, id, { links: false });
  return c.json({ excerpt: await c.env.DB.prepare('SELECT * FROM excerpts WHERE id = ?').bind(exId).first() });
});

app.patch('/api/excerpts/:id', async (c) => {
  const ex = await c.env.DB.prepare('SELECT * FROM excerpts WHERE id = ?').bind(c.req.param('id')).first<ExcerptRow>();
  if (!ex) throw notFound();
  const b = await body(
    c,
    z.object({ chosen: z.boolean().optional(), highlight: z.object({ start: z.number().int().min(0), end: z.number().int().min(1) }).nullable().optional(), locator: z.string().max(200).optional() }),
  );
  if (b.chosen) await c.env.DB.prepare('UPDATE excerpts SET chosen = 0 WHERE item_id = ?').bind(ex.item_id).run();
  if (b.chosen !== undefined) await c.env.DB.prepare('UPDATE excerpts SET chosen = ? WHERE id = ?').bind(b.chosen ? 1 : 0, ex.id).run();
  if (b.highlight !== undefined) {
    if (b.highlight && (b.highlight.end > ex.text.length || b.highlight.start >= b.highlight.end)) return c.json({ error: 'The highlight must sit inside the excerpt' }, 400);
    let hs = b.highlight?.start ?? null;
    let he = b.highlight?.end ?? null;
    if (hs != null && he != null) {
      while (hs < he && /\s/.test(ex.text[hs]!)) hs++;
      while (he > hs && /\s/.test(ex.text[he - 1]!)) he--;
    }
    await c.env.DB.prepare('UPDATE excerpts SET highlight_start = ?, highlight_end = ? WHERE id = ?').bind(hs, he, ex.id).run();
  }
  if (b.locator !== undefined) await c.env.DB.prepare('UPDATE excerpts SET locator = ? WHERE id = ?').bind(b.locator, ex.id).run();
  await runChecks(c.env, ex.item_id, { links: false });
  return c.json({ excerpt: await c.env.DB.prepare('SELECT * FROM excerpts WHERE id = ?').bind(ex.id).first() });
});

app.delete('/api/excerpts/:id', async (c) => {
  const ex = await c.env.DB.prepare('SELECT item_id FROM excerpts WHERE id = ?').bind(c.req.param('id')).first<{ item_id: string }>();
  if (!ex) throw notFound();
  await c.env.DB.prepare('DELETE FROM excerpts WHERE id = ?').bind(c.req.param('id')).run();
  await runChecks(c.env, ex.item_id, { links: false });
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ drafts (titles, marginalia)

app.patch('/api/drafts/:id', async (c) => {
  const d = await c.env.DB.prepare('SELECT * FROM drafts WHERE id = ?').bind(c.req.param('id')).first<DraftRow>();
  if (!d) throw notFound();
  const b = await body(c, z.object({ status: z.enum(['proposed', 'kept', 'cut']).optional(), text: z.string().min(1).max(2000).optional(), useCorrected: z.boolean().optional() }));
  let bodyJson = parseJson<Record<string, unknown>>(d.body, {});
  let status = b.status ?? d.status;
  let style = null as ReturnType<typeof checkStyle> | null;
  if (d.kind === 'marginal') {
    const m = bodyJson as unknown as MarginalBody;
    const newText = b.useCorrected && m.corrected ? m.corrected : b.text;
    if (newText !== undefined && newText !== m.text) {
      style = checkStyle(newText);
      bodyJson = { ...m, text: newText.trim(), edited: true, verdict: 'unchecked', reason: 'Changed; checking again', corrected: undefined };
      status = 'edited';
    }
  } else if (d.kind === 'title' && b.text !== undefined) {
    style = checkStyle(b.text);
    bodyJson = { ...bodyJson, text: b.text.trim() };
  }
  await c.env.DB.prepare('UPDATE drafts SET body = ?, status = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(bodyJson), status, nowIso(), d.id).run();
  // An edited note is checked against its evidence again before it can ship.
  if (d.kind === 'marginal' && d.item_id && bodyJson.verdict === 'unchecked') {
    await judgeNotes(c.env, d.item_id, d.id).catch((e) => console.error(JSON.stringify({ event: 'rejudge-failed', error: errorMessage(e) })));
  }
  if (d.item_id) await runChecks(c.env, d.item_id, { links: false });
  const fresh = await c.env.DB.prepare('SELECT * FROM drafts WHERE id = ?').bind(d.id).first<DraftRow>();
  return c.json({ draft: { ...fresh, body: parseJson(fresh!.body, {}) }, style });
});

// ------------------------------------------------------------------ wikipedia

app.patch('/api/wiki/:id', async (c) => {
  const w = await c.env.DB.prepare('SELECT * FROM wiki_cards WHERE id = ?').bind(c.req.param('id')).first<WikiRow>();
  if (!w) throw notFound();
  const b = await body(c, z.object({ status: z.enum(['proposed', 'kept', 'cut']).optional(), summary: z.string().min(1).max(600).optional() }));
  await c.env.DB.prepare('UPDATE wiki_cards SET status = COALESCE(?, status), summary = COALESCE(?, summary) WHERE id = ?').bind(b.status ?? null, b.summary ?? null, w.id).run();
  return c.json({ wiki: await c.env.DB.prepare('SELECT * FROM wiki_cards WHERE id = ?').bind(w.id).first() });
});

app.post('/api/items/:id/wiki', async (c) => {
  const id = c.req.param('id');
  await itemOr404(c.env, id);
  const { query } = await body(c, z.object({ query: z.string().min(2).max(200) }));
  const s = await resolveWikiTopic(query);
  if (!s) return c.json({ error: `No Wikipedia article found for "${query}"` }, 404);
  const dup = await c.env.DB.prepare('SELECT id FROM wiki_cards WHERE item_id = ? AND url = ?').bind(id, s.url).first();
  if (dup) return c.json({ error: `${s.title} is already on this item` }, 409);
  const wid = newId('wk_');
  const pos = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM wiki_cards WHERE item_id = ?').bind(id).first<{ n: number }>();
  await c.env.DB.prepare(
    `INSERT INTO wiki_cards (id, item_id, query, title, summary, extract, url, revision, status, http_status, checked_at, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'kept', 200, ?, ?, ?)`,
  )
    .bind(wid, id, query, s.title, firstSentence(s.extract), s.extract, s.url, s.revision ?? null, nowIso(), pos?.n ?? 0, nowIso())
    .run();
  return c.json({ wiki: await c.env.DB.prepare('SELECT * FROM wiki_cards WHERE id = ?').bind(wid).first() });
});

// ------------------------------------------------------------------ connections

app.post('/api/items/:id/connections', async (c) => {
  const id = c.req.param('id');
  const b = await body(c, z.object({ toItemId: z.string(), type: z.string().min(2).max(40), note: z.string().min(2).max(400) }));
  await itemOr404(c.env, b.toItemId);
  const cid = newId('cn_');
  await c.env.DB.prepare('INSERT INTO connections (id, item_id, to_item_id, type, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(cid, id, b.toItemId, b.type, b.note, nowIso()).run();
  return c.json({ ok: true, id: cid });
});

app.delete('/api/connections/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM connections WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ voice notes

async function storeNote(env: Env, file: File, target: string, refs: { itemId?: string; haulId?: string }): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw Object.assign(new Error('Voice notes over 25 MB are not supported'), { status: 413 });
  const id = newId('vn_');
  const mime = file.type || 'audio/webm';
  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
  const key = `notes/${id}.${ext}`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: mime } });
  await env.DB.prepare('INSERT INTO notes (id, item_id, haul_id, target, audio_key, mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, refs.itemId ?? null, refs.haulId ?? null, target, key, mime, nowIso())
    .run();
  return id;
}

app.post('/api/notes', async (c) => {
  const form = await c.req.formData();
  const file = form.get('audio');
  if (!file || typeof file === 'string') return c.json({ error: 'No audio' }, 400);
  const target = String(form.get('target') ?? 'capture');
  const itemId = String(form.get('itemId') ?? '') || undefined;
  const haulId = String(form.get('haulId') ?? '') || undefined;
  const id = await storeNote(c.env, file, target, { itemId, haulId });
  const note = await processNote(c.env, id);
  return c.json({ note });
});

app.get('/api/notes/:id', async (c) => {
  const n = await c.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(c.req.param('id')).first<NoteRow>();
  if (!n) throw notFound();
  return c.json({ note: n });
});

app.get('/api/notes/:id/audio', async (c) => {
  const n = await c.env.DB.prepare('SELECT audio_key, mime FROM notes WHERE id = ?').bind(c.req.param('id')).first<{ audio_key: string; mime: string }>();
  if (!n) throw notFound();
  const obj = await c.env.MEDIA.get(n.audio_key);
  if (!obj) throw notFound();
  return new Response(obj.body, { headers: fileHeaders(n.mime, n.audio_key.split('/').pop()) });
});

// ------------------------------------------------------------------ hauls

app.get('/api/hauls', async (c) => {
  const rows = (
    await c.env.DB.prepare(
      `SELECT h.id, h.number, h.title_text, h.title_italic, h.deck, h.swatch, h.status, h.version, h.published_at, h.updated_at,
              (SELECT COUNT(*) FROM haul_items hi WHERE hi.haul_id = h.id) AS item_count
       FROM hauls h ORDER BY h.number DESC`,
    ).all()
  ).results;
  return c.json({ hauls: rows });
});

app.post('/api/hauls', async (c) => {
  const max = await c.env.DB.prepare('SELECT MAX(number) AS n FROM hauls').first<{ n: number | null }>();
  const id = newId('hl_');
  const now = nowIso();
  await c.env.DB.prepare('INSERT INTO hauls (id, number, colophon, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, (max?.n ?? 0) + 1, defaultColophon(), now, now).run();
  return c.json({ haul: await c.env.DB.prepare('SELECT * FROM hauls WHERE id = ?').bind(id).first() });
});

async function haulDetail(env: Env, id: string) {
  const h = await env.DB.prepare('SELECT * FROM hauls WHERE id = ?').bind(id).first<HaulRow>();
  if (!h) throw notFound();
  const items = (
    await env.DB.prepare(
      `SELECT i.id, i.type, i.status, i.title, i.title_choice, i.creator, i.source_name, i.source_date, i.captured_at, i.why_text,
              (SELECT group_concat(name || ':' || status) FROM checks k WHERE k.item_id = i.id) AS checks
       FROM haul_items hi JOIN items i ON i.id = hi.item_id WHERE hi.haul_id = ? ORDER BY hi.position`,
    ).bind(id).all()
  ).results;
  const versions = (await env.DB.prepare('SELECT * FROM haul_versions WHERE haul_id = ? ORDER BY version DESC').bind(id).all()).results;
  return { haul: { ...h, route: parseJson(h.route, []), questions: parseJson(h.questions, []) }, items, versions };
}

app.get('/api/hauls/:id', async (c) => c.json(await haulDetail(c.env, c.req.param('id'))));

const routeStep = z.object({ day: z.string().max(20), text: z.string().max(400), by: z.enum(['editor', 'machine']), itemId: z.string().optional(), drafted: z.boolean().optional() });

app.patch('/api/hauls/:id', async (c) => {
  const id = c.req.param('id');
  const b = await body(
    c,
    z.object({
      title_text: z.string().max(200).optional(),
      title_italic: z.string().max(200).nullable().optional(),
      deck: z.string().max(600).optional(),
      swatch: z.enum(['apricot', 'coral', 'butter', 'sky', 'mint', 'pistachio']).optional(),
      fn_title_text: z.string().max(200).optional(),
      fn_title_italic: z.string().max(200).nullable().optional(),
      fn_body: z.string().max(40_000).optional(),
      fn_highlight: z.string().max(1000).nullable().optional(),
      fn_note_id: z.string().nullable().optional(),
      route: z.array(routeStep).max(40).optional(),
      questions: z.array(z.object({ q: z.string(), answer: z.string().max(20_000) })).max(6).optional(),
      colophon: z.string().max(2000).optional(),
    }),
  );
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(k === 'route' || k === 'questions' ? JSON.stringify(v) : v === '' && k.endsWith('italic') ? null : v);
  }
  if (sets.length) {
    sets.push('updated_at = ?');
    vals.push(nowIso(), id);
    await c.env.DB.prepare(`UPDATE hauls SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
  return c.json(await haulDetail(c.env, id));
});

app.put('/api/hauls/:id/items', async (c) => {
  const id = c.req.param('id');
  const { itemIds } = await body(c, z.object({ itemIds: z.array(z.string()).max(40) }));
  const elsewhere = itemIds.length
    ? (await c.env.DB.prepare(`SELECT item_id FROM haul_items WHERE haul_id != ? AND item_id IN (${itemIds.map(() => '?').join(',')})`).bind(id, ...itemIds).all<{ item_id: string }>()).results
    : [];
  if (elsewhere.length) return c.json({ error: 'An item can be in only one Haul' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM haul_items WHERE haul_id = ?').bind(id),
    ...itemIds.map((itemId, i) => c.env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind(id, itemId, i)),
    c.env.DB.prepare('UPDATE hauls SET updated_at = ? WHERE id = ?').bind(nowIso(), id),
  ]);
  return c.json(await haulDetail(c.env, id));
});

app.post('/api/hauls/:id/questions', async (c) => {
  const questions = await draftQuestions(c.env, c.req.param('id'));
  return c.json({ questions, ...(await haulDetail(c.env, c.req.param('id'))) });
});

app.post('/api/hauls/:id/route', async (c) => {
  const route = await draftRoute(c.env, c.req.param('id'));
  return c.json({ route, ...(await haulDetail(c.env, c.req.param('id'))) });
});

app.get('/api/hauls/:id/preview', async (c) => {
  const a = await assembleHaul(c.env, c.req.param('id'), { correction: c.req.query('correction') ?? undefined });
  return c.json({ haul: a.haul, index: a.index, problems: a.problems, bundleErrors: a.bundleErrors, warnings: a.warnings });
});

app.post('/api/hauls/:id/publish', async (c) => {
  const b = await body(c, z.object({ correction: z.string().max(1000).optional(), confirm: z.literal(true) }));
  const r = await publishHaul(c.env, c.req.param('id'), { correction: b.correction });
  return c.json(r, r.ok ? 200 : 422);
});

// Published files, for checking a preview deployment's bundles (production serves them from R2 directly).
app.get('/files/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/files\//, ''));
  if (!key.startsWith('hauls/')) throw notFound();
  const obj = await c.env.MEDIA.get(key);
  if (!obj) throw notFound();
  return new Response(obj.body, { headers: fileHeaders(obj.httpMetadata?.contentType, key.split('/').pop()) });
});

// ------------------------------------------------------------------ the UI

app.get('*', async (c) => {
  if (!c.env.ASSETS) return c.text('No UI bundled', 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
