// Desk routes for data stories (docs/DATA-STORIES.md): check a story against the editor's stored
// note and the item's stored source without writing anything, publish it, and read the published
// index. Mounted by index.ts behind the same lock, CSRF refusal and JSON-only rules as every other
// /api route. The rules live in packages/server/src/publish.ts (publishStory), so they hold whatever
// the Desk or the terminal sends; zod checks only the frame here.

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { publishStory, readCapped, readDataIndex, TooLargeError, type Env } from '@fdf/server';
import type { Story } from '@fdf/shared/stories';

type App = { Bindings: Env; Variables: { owner: string } };
export const storiesApi = new Hono<App>();

/** A story with its rows is large but bounded; the cap is on the bytes actually read. */
export const MAX_STORY_BYTES = 2 * 1024 * 1024;

const storyFrame = z
  .object({
    title: z.string(),
    standfirst: z.string(),
    edition: z.string(),
    ledger: z.array(z.object({ value: z.string(), text: z.string(), loud: z.boolean().optional() }).strict()),
    movements: z.array(z.object({ numeral: z.string(), name: z.string(), plates: z.array(z.string()) }).strict()),
    plates: z.array(
      z
        .object({
          key: z.string(),
          name: z.string(),
          headline: z.string(),
          body: z.string(),
          caption: z.string(),
          figure: z.object({ form: z.string() }).passthrough(),
          sources: z.array(z.object({ maker: z.string(), dataset: z.string(), url: z.string(), licence: z.string(), retrieved: z.string() }).passthrough()),
          editorNote: z.string().optional(),
          quote: z.object({ text: z.string(), credit: z.string() }).strict().optional(),
        })
        .passthrough(),
    ),
    facts: z.array(z.object({ key: z.string(), value: z.number(), method: z.string() }).strict()),
  })
  .strict();

const storyBody = z.object({ slug: z.string().max(80), itemId: z.string().min(1).max(100), story: storyFrame }).strict();
const publishBody = storyBody.extend({ confirm: z.literal(true) }).strict();

async function body<T>(c: Context<App>, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(await readCapped(c.req.raw.body, MAX_STORY_BYTES, 'story')));
  } catch (e) {
    if (e instanceof TooLargeError) throw Object.assign(new Error('A story over 2 MB is not supported'), { status: 413 });
    throw Object.assign(new Error('Expected a JSON body'), { status: 400 });
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw Object.assign(new Error(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')), { status: 400 });
  return r.data;
}

/** Every published story, newest first. */
storiesApi.get('/api/stories', async (c) => c.json(await readDataIndex(c.env)));

/** What a publish would write, and every problem that would stop it. Writes nothing. */
storiesApi.post('/api/stories/check', async (c) => {
  const b = await body(c, storyBody);
  const r = await publishStory(c.env, { slug: b.slug, itemId: b.itemId, story: b.story as unknown as Story }, { dryRun: true });
  return c.json(r, r.ok ? 200 : 422);
});

storiesApi.post('/api/stories/publish', async (c) => {
  const b = await body(c, publishBody);
  const r = await publishStory(c.env, { slug: b.slug, itemId: b.itemId, story: b.story as unknown as Story });
  return c.json(r, r.ok ? 200 : 422);
});
