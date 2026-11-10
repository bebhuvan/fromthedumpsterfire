// The one-tap Haul routes and the item standing through the Desk Worker, on SQLite with the real
// migrations: add to the newest draft Haul, refused when in another Haul, take out of a draft only,
// the standing on the item and in the tray, the review and suggestions, and the lock on all of it.

import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { NOW, seedHaul } from '../../../packages/server/test/seed';

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1' };
const post = { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}' };
const del = { method: 'DELETE', headers: H };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const call = async (env: TestEnv, path: string, init: RequestInit = {}) => {
  const res = await app.request(`${BASE}${path}`, init, env);
  return { status: res.status, body: (await res.json()) as Body };
};
const deskEnv = () => seedHaul(makeEnv(() => ({}), { DEV_AUTH_BYPASS: '1' } as never));

describe('one-tap Haul routes', () => {
  it('adds an item to the end of the Haul, says where it stands, and takes it out again', async () => {
    const env = await deskEnv();
    let r = await call(env, '/api/items/it_jevons');
    expect(r.body.standing.text).toBe('On the Desk, not in a Haul');
    expect(r.body.draftHaul).toEqual({ id: 'hl_1', number: 1 });

    r = await call(env, '/api/hauls/hl_1/items/it_jevons', post);
    expect(r.status).toBe(200);
    expect(r.body.standing.text).toBe('In Haul 001, not yet published');
    r = await call(env, '/api/hauls/hl_1/items/it_nadella', post);
    const order = await env.DB.prepare('SELECT item_id FROM haul_items ORDER BY position').all<{ item_id: string }>();
    expect(order.results.map((x) => x.item_id)).toEqual(['it_jevons', 'it_nadella']);
    // Adding twice changes nothing.
    await call(env, '/api/hauls/hl_1/items/it_jevons', post);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM haul_items').first<{ n: number }>())!.n).toBe(2);

    const tray = await call(env, '/api/items?view=all');
    const jevons = tray.body.items.find((i: Body) => i.id === 'it_jevons');
    expect(jevons).toMatchObject({ haul_number: 1, haul_status: 'draft', standing: { state: 'haul' } });
    expect(tray.body.items.find((i: Body) => i.id === 'it_bush').standing.state).toBe('archived');

    r = await call(env, '/api/hauls/hl_1/items/it_jevons', del);
    expect(r.body.standing.text).toBe('On the Desk, not in a Haul');
  });

  it('refuses an item already in another Haul, and taking one out of a published Haul', async () => {
    const env = await deskEnv();
    await env.DB.prepare(`INSERT INTO hauls (id, number, colophon, created_at, updated_at, status, version) VALUES ('hl_2', 2, '', ?, ?, 'published', 1)`).bind(NOW, NOW).run();
    await env.DB.prepare(`INSERT INTO haul_items (haul_id, item_id, position) VALUES ('hl_2', 'it_jevons', 0)`).run();
    expect((await call(env, '/api/hauls/hl_1/items/it_jevons', post)).status).toBe(409);
    expect((await call(env, '/api/hauls/hl_2/items/it_jevons', del)).status).toBe(409);
    expect((await call(env, '/api/hauls/hl_9/items/it_jevons', post)).status).toBe(404);
  });

  it('serves the review and the suggestions, and refuses writes without the Desk header', async () => {
    const env = await deskEnv();
    await call(env, '/api/hauls/hl_1/items/it_jevons', post);
    const review = await call(env, '/api/hauls/hl_1/review');
    expect(review.body.items.map((i: Body) => i.id)).toEqual(['it_jevons']);
    expect(Array.isArray(review.body.items[0].issues)).toBe(true);
    expect((await call(env, '/api/hauls/hl_1/suggestions')).body.items[0]).toMatchObject({ id: 'it_jevons', drafts: [], wiki: [] });
    const bare = await app.request(`${BASE}/api/hauls/hl_1/items/it_nadella`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: '{}' }, env);
    expect(bare.status).toBe(403);
  });
});
