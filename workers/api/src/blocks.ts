// Desk routes for an item's blocks: pull quotes, code, video and audio embeds, posts, pictures. Mounted by
// index.ts behind the same lock, CSRF refusal and JSON-only rules as every other /api route (the
// picture upload is the one multipart route here; see security.ts). The rules themselves live in
// packages/server/src/blocks.ts, so they hold whatever the Desk sends.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { CODE_LANGS } from '@fdf/shared/highlight';
import { SHARE, sceneToSvg, shareScene, type Chart } from '@fdf/shared/charts';
import { EDITIONS, type Edition } from '@fdf/shared/tokens';
import {
  addAudio,
  addChart,
  checkChart,
  fetchOwid,
  fetchWorldBank,
  replaceChart,
  addCode,
  addPicture,
  addPost,
  addQuote,
  addVideo,
  BlockRefused,
  blocksFor,
  blockView,
  deleteBlock,
  patchBlock,
  reorderBlocks,
  runChecks,
  setPicturePlate,
  type BlockRow,
  type Env,
  type ItemRow,
} from '@fdf/server';
import { fileHeaders } from './security';

type App = { Bindings: Env; Variables: { owner: string } };
export const blocksApi = new Hono<App>();

const MAX_PICTURE_BYTES = 15 * 1024 * 1024;

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

async function blockOr404(env: Env, id: string): Promise<BlockRow> {
  const b = await env.DB.prepare('SELECT * FROM blocks WHERE id = ?').bind(id).first<BlockRow>();
  if (!b) throw notFound();
  return b;
}

/** The editor's refusals come back as they are, with their status; anything else is an error. */
async function attempt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof BlockRefused) throw Object.assign(new Error(e.message), { status: e.status });
    throw e;
  }
}

async function listing(env: Env, itemId: string) {
  return { blocks: (await blocksFor(env, itemId)).map(blockView) };
}

const LANG_NAMES = Object.keys(CODE_LANGS) as [string, ...string[]];
const clock = z.string().trim().max(12);

/** One schema per kind; a quote is either a selection (offsets and text) or pasted text. */
const ADD = {
  quoteAt: z.object({ kind: z.literal('quote'), start: z.number().int().min(0), end: z.number().int().min(1), text: z.string().min(1).max(4000), locator: z.string().max(200).optional() }),
  quote: z.object({ kind: z.literal('quote'), text: z.string().trim().min(2).max(4000), locator: z.string().max(200).optional() }),
  code: z.object({ kind: z.literal('code'), code: z.string().min(1).max(20_000), lang: z.enum(LANG_NAMES).optional(), caption: z.string().max(300).optional() }),
  video: z.object({ kind: z.literal('video'), url: z.string().trim().min(8).max(2000), start: clock.optional() }),
  audio: z.object({ kind: z.literal('audio'), url: z.string().trim().min(8).max(2000), title: z.string().max(200).optional(), start: clock.optional() }),
  post: z.object({ kind: z.literal('post'), url: z.string().trim().min(8).max(2000) }),
};
type Added = z.infer<(typeof ADD)[keyof typeof ADD]>;

blocksApi.get('/api/items/:id/blocks', async (c) => {
  await itemOr404(c.env, c.req.param('id'));
  return c.json(await listing(c.env, c.req.param('id')));
});

/** A chart spec as sent; its shape and every honesty rule are checked by validateChart, server side. */
const CHART = z.object({ chart: z.record(z.string(), z.unknown()) });

// Pull quotes, code, video, audio, posts and charts. Each is checked before it is stored; a refusal says why.
blocksApi.post('/api/items/:id/blocks', async (c) => {
  const item = await itemOr404(c.env, c.req.param('id'));
  const raw = await body(c, z.object({ kind: z.enum(['quote', 'code', 'video', 'audio', 'post', 'chart']) }).passthrough());
  if (raw.kind === 'chart') {
    const parsed = CHART.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'Send the chart as { kind: "chart", chart: {…} }' }, 400);
    const r = await attempt(() => addChart(c.env, item, parsed.data.chart as unknown as Chart));
    return c.json({ id: r.id, warnings: r.warnings, ...(await listing(c.env, item.id)) });
  }
  const schema = raw.kind === 'quote' ? ('start' in raw ? ADD.quoteAt : ADD.quote) : ADD[raw.kind as 'code' | 'video' | 'audio' | 'post'];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
  const b = parsed.data as Added;
  const id = await attempt(() => {
    switch (b.kind) {
      case 'quote':
        return addQuote(c.env, item, b);
      case 'code':
        return addCode(c.env, item, b);
      case 'video':
        return addVideo(c.env, item, b);
      case 'audio':
        return addAudio(c.env, item, b);
      case 'post':
        return addPost(c.env, item, b);
    }
  });
  await runChecks(c.env, item.id, { links: false });
  return c.json({ id, ...(await listing(c.env, item.id)) });
});

const textField = (max: number) => z.string().max(max).optional();

/**
 * A picture: multipart with `file` (an upload) or `url` (fetched through the SSRF guard, images
 * only), or `fromUpload=1` for the image the item was captured from; plus the credit and licence the
 * editor states. `as=plate` makes it the item's own picture (a Picture item prints as it); otherwise
 * it is a block.
 */
blocksApi.post('/api/items/:id/picture', async (c) => {
  const item = await itemOr404(c.env, c.req.param('id'));
  const form = await c.req.formData();
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const meta = z
    .object({
      url: textField(2000),
      caption: textField(600),
      credit: z.string().max(300),
      licence: z.string().max(200),
      sourceUrl: textField(2000),
      creator: textField(200),
      date: textField(80),
      as: z.enum(['block', 'plate']).optional(),
      fromUpload: z.enum(['1']).optional(),
    })
    .safeParse({ url: str('url') || undefined, caption: str('caption'), credit: str('credit') ?? '', licence: str('licence') ?? '', sourceUrl: str('sourceUrl') || undefined, creator: str('creator'), date: str('date'), as: str('as') || undefined, fromUpload: str('fromUpload') || undefined });
  if (!meta.success) return c.json({ error: meta.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
  const m = meta.data;
  let bytes: Uint8Array | undefined;
  const f = form.get('file');
  if (f && typeof f !== 'string') {
    if (f.size > MAX_PICTURE_BYTES) return c.json({ error: 'Pictures over 15 MB are not supported' }, 413);
    bytes = new Uint8Array(await f.arrayBuffer());
  } else if (m.fromUpload) {
    if (!item.file_key || item.kind !== 'image') return c.json({ error: 'This item was not captured from a picture' }, 409);
    const obj = await c.env.MEDIA.get(item.file_key);
    if (!obj) return c.json({ error: 'The uploaded picture is missing from storage' }, 409);
    bytes = new Uint8Array(await obj.arrayBuffer());
  } else if (!m.url) return c.json({ error: 'Upload a picture or give a link to one' }, 400);
  if (m.url && !/^https?:\/\//i.test(m.url)) return c.json({ error: 'Only web links can be fetched' }, 400);
  const input = { bytes, url: bytes ? undefined : m.url, caption: m.caption, credit: m.credit, licence: m.licence, sourceUrl: m.sourceUrl, creator: m.creator, date: m.date };
  if (m.as === 'plate') {
    const plateId = await attempt(() => setPicturePlate(c.env, item, input));
    await runChecks(c.env, item.id, { links: false });
    return c.json({ plateId, ...(await listing(c.env, item.id)) });
  }
  const id = await attempt(() => addPicture(c.env, item, input));
  return c.json({ id, ...(await listing(c.env, item.id)) });
});

blocksApi.put('/api/items/:id/blocks/order', async (c) => {
  const item = await itemOr404(c.env, c.req.param('id'));
  const { ids } = await body(c, z.object({ ids: z.array(z.string().max(64)).max(64) }));
  await attempt(() => reorderBlocks(c.env, item.id, ids));
  return c.json(await listing(c.env, item.id));
});

blocksApi.patch('/api/blocks/:id', async (c) => {
  const row = await blockOr404(c.env, c.req.param('id'));
  const p = await body(
    c,
    z.object({
      locator: textField(200),
      caption: textField(600),
      lang: z.enum(LANG_NAMES).nullable().optional(),
      code: z.string().min(1).max(20_000).optional(),
      title: textField(200),
      start: clock.optional(),
      credit: textField(300),
      licence: textField(200),
      sourceUrl: textField(2000),
      creator: textField(200),
      date: textField(80),
      status: z.enum(['kept', 'cut']).optional(),
    }),
  );
  await attempt(() => patchBlock(c.env, row, p));
  await runChecks(c.env, row.item_id, { links: false });
  return c.json(await listing(c.env, row.item_id));
});

// A chart's whole spec, replaced after the editor edits it (words, data, form, annotations).
blocksApi.put('/api/blocks/:id/chart', async (c) => {
  const row = await blockOr404(c.env, c.req.param('id'));
  const b = await body(c, CHART);
  const r = await attempt(() => replaceChart(c.env, row, b.chart as unknown as Chart));
  return c.json({ warnings: r.warnings, ...(await listing(c.env, row.item_id)) });
});

/**
 * A chart's share card as a PNG, drawn here for the editor to download before (or without)
 * publishing: the same card publish writes next to the bundle. Only a chart that passes every check
 * is drawn, so no picture of a dishonest chart can leave the Desk.
 */
blocksApi.post('/api/charts/share', async (c) => {
  const b = await body(c, CHART.extend({ edition: z.enum(EDITIONS as unknown as [Edition, ...Edition[]]).optional(), haul: z.number().int().min(1).max(9999).optional(), figure: z.number().int().min(1).max(99).optional() }));
  const chart = b.chart as unknown as Chart;
  await attempt(async () => checkChart(chart));
  const { chartDrawer } = await import('./draw');
  const drawer = await chartDrawer(c.env);
  const site = (c.env.SITE_BASE ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const png = drawer.png(sceneToSvg(shareScene(chart, { ...(b.haul ? { haul: b.haul } : {}), ...(b.figure ? { figure: b.figure } : {}), ...(site ? { address: site } : {}) }), { scheme: 'light', edition: b.edition ?? 'oxblood' }), SHARE.zoom);
  const name = `${(chart.title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart'}.png`;
  return new Response(png, { headers: { 'content-type': 'image/png', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
});

/**
 * The data behind a chart, fetched by code from Our World in Data (a grapher link) or the World Bank
 * (an indicator and countries), with each source's licence as stated. Nothing is stored: the Desk
 * builds the chart from the answer and keeps it with POST /api/items/:id/blocks.
 */
blocksApi.post('/api/charts/fetch', async (c) => {
  const b = await body(
    c,
    z.discriminatedUnion('provider', [
      z.object({ provider: z.literal('owid'), chart: z.string().trim().min(2).max(500), entities: z.array(z.string().max(120)).max(60).optional(), from: z.number().int().optional(), to: z.number().int().optional() }),
      z.object({ provider: z.literal('worldbank'), indicator: z.string().trim().min(2).max(60), countries: z.array(z.string().max(3)).min(1).max(30), from: z.number().int().optional(), to: z.number().int().optional() }),
    ]),
  );
  const r = await attempt(() => (b.provider === 'owid' ? fetchOwid(b.chart, b) : fetchWorldBank(b.indicator, b.countries, b)));
  return c.json(r);
});

blocksApi.delete('/api/blocks/:id', async (c) => {
  const row = await blockOr404(c.env, c.req.param('id'));
  await deleteBlock(c.env, row);
  await runChecks(c.env, row.item_id, { links: false });
  return c.json(await listing(c.env, row.item_id));
});

// A block's poster or picture, from private storage (the Desk's CSP allows only its own images).
blocksApi.get('/api/blocks/:id/media', async (c) => {
  const row = await blockOr404(c.env, c.req.param('id'));
  if (!row.media_key) throw notFound();
  const obj = await c.env.MEDIA.get(row.media_key);
  if (!obj) throw notFound();
  return new Response(obj.body, { headers: fileHeaders(row.mime ?? obj.httpMetadata?.contentType, row.media_key.split('/').pop()) });
});
