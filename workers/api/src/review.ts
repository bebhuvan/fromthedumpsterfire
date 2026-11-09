// Desk routes for a Haul as a whole before it goes out: one-tap add and remove of an item, the
// pre-publish review (what is wrong or doubtful, per item) and every suggestion waiting for a tick.
// Mounted by index.ts behind the same lock, CSRF refusal and JSON-only rules as every /api route.

import { Hono } from 'hono';
import { haulReview, haulSuggestions, nowIso, standingFor, type Env, type ItemRow } from '@fdf/server';

type App = { Bindings: Env; Variables: { owner: string } };
export const reviewApi = new Hono<App>();

async function itemOr404(env: Env, id: string) {
  return env.DB.prepare('SELECT id, archived FROM items WHERE id = ?').bind(id).first<Pick<ItemRow, 'id' | 'archived'>>();
}

/** Add one item to the end of a Haul. An item is in one Haul at most; a published Haul takes it into its next version. */
reviewApi.post('/api/hauls/:id/items/:itemId', async (c) => {
  const { id, itemId } = c.req.param();
  const [haul, item] = await Promise.all([c.env.DB.prepare('SELECT id FROM hauls WHERE id = ?').bind(id).first(), itemOr404(c.env, itemId)]);
  if (!haul || !item) return c.json({ error: 'No such Haul or item' }, 404);
  const current = await c.env.DB.prepare('SELECT haul_id FROM haul_items WHERE item_id = ?').bind(itemId).first<{ haul_id: string }>();
  if (current && current.haul_id !== id) return c.json({ error: 'That item is already in another Haul' }, 409);
  if (!current) {
    const last = await c.env.DB.prepare('SELECT MAX(position) AS p FROM haul_items WHERE haul_id = ?').bind(id).first<{ p: number | null }>();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT OR IGNORE INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind(id, itemId, (last?.p ?? -1) + 1),
      c.env.DB.prepare('UPDATE hauls SET updated_at = ? WHERE id = ?').bind(nowIso(), id),
    ]);
  }
  return c.json(await standingFor(c.env, item));
});

/** Take an item out of a Haul that has not been published. A published Haul changes only by a correction. */
reviewApi.delete('/api/hauls/:id/items/:itemId', async (c) => {
  const { id, itemId } = c.req.param();
  const [haul, item] = await Promise.all([c.env.DB.prepare('SELECT status FROM hauls WHERE id = ?').bind(id).first<{ status: string }>(), itemOr404(c.env, itemId)]);
  if (!haul || !item) return c.json({ error: 'No such Haul or item' }, 404);
  if (haul.status === 'published') return c.json({ error: 'This Haul is published. Take items out on the Haul page, then publish a correction.' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM haul_items WHERE haul_id = ? AND item_id = ?').bind(id, itemId),
    c.env.DB.prepare('UPDATE hauls SET updated_at = ? WHERE id = ?').bind(nowIso(), id),
  ]);
  return c.json(await standingFor(c.env, item));
});

reviewApi.get('/api/hauls/:id/review', async (c) => c.json({ items: await haulReview(c.env, c.req.param('id')) }));

reviewApi.get('/api/hauls/:id/suggestions', async (c) => c.json({ items: await haulSuggestions(c.env, c.req.param('id')) }));
