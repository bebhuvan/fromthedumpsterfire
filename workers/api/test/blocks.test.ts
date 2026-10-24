// The block routes through the Desk Worker, on SQLite with the real migrations: shape validation,
// plain refusals, reorder and remove, the picture upload (credit and licence required), the new item
// fields and the Haul's edition.

import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { fakeJpeg, seedHaul } from '../../../packages/server/test/seed';

afterEach(() => vi.unstubAllGlobals());

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1' };
const json = (method: string, b: unknown) => ({ method, headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(b) });

async function deskEnv(): Promise<TestEnv> {
  return seedHaul(makeEnv(undefined, { DEV_AUTH_BYPASS: '1' } as never));
}
const call = async (env: TestEnv, path: string, init: RequestInit = {}) => {
  const res = await app.request(`${BASE}${path}`, init, env);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { blocks?: Array<{ id: string; kind: string; body: Record<string, unknown>; image: string | null }>; error?: string } };
};

describe('block routes', () => {
  it('validates shapes, refuses what does not match, and orders and removes blocks', async () => {
    const env = await deskEnv();
    expect((await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'gif', url: 'x' }))).status).toBe(400);
    expect((await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'code', code: 'x', lang: 'cobol' }))).status).toBe(400);
    expect((await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'quote' }))).status).toBe(400);
    expect((await call(env, '/api/items/it_nobody/blocks', json('POST', { kind: 'quote', text: 'The very contrary is the truth.' }))).status).toBe(404);

    const bad = await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'quote', text: 'Efficiency always lowers consumption.' }));
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatch(/not in the source word for word/);
    const v = await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'video', url: 'https://www.dailymotion.com/video/x7tgad0' }));
    expect([v.status, v.body.error]).toEqual([400, expect.stringMatching(/Only YouTube and Vimeo/)]);

    const a = await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'quote', text: 'The very contrary is the truth.' }));
    expect(a.status).toBe(200);
    const b = await call(env, '/api/items/it_jevons/blocks', json('POST', { kind: 'quote', start: 0, end: 18, text: 'It is wholly a con' }));
    expect(b.status).toBe(200);
    const [q1, q2] = b.body.blocks!;
    expect([q1!.body.text, q2!.body.text]).toEqual(['The very contrary is the truth.', 'It is wholly a con']);

    // The Quotes check now carries a row per pull quote.
    const checks = await env.DB.prepare(`SELECT detail FROM checks WHERE item_id = 'it_jevons' AND name = 'quotes'`).first<{ detail: string }>();
    expect(JSON.parse(checks!.detail).rows.filter((r: { label: string }) => r.label.startsWith('Pull quote'))).toHaveLength(2);

    expect((await call(env, '/api/items/it_jevons/blocks/order', json('PUT', { ids: [q2!.id] }))).status).toBe(400);
    const o = await call(env, '/api/items/it_jevons/blocks/order', json('PUT', { ids: [q2!.id, q1!.id] }));
    expect(o.body.blocks!.map((x) => x.id)).toEqual([q2!.id, q1!.id]);

    const p = await call(env, `/api/blocks/${q1!.id}`, json('PATCH', { locator: 'p. 7', status: 'cut' }));
    expect(p.body.blocks!.find((x) => x.id === q1!.id)!.body.locator).toBe('p. 7');
    expect((await call(env, `/api/blocks/${q1!.id}`, json('PATCH', { status: 'gone' }))).status).toBe(400);

    const d = await call(env, `/api/blocks/${q2!.id}`, { method: 'DELETE', headers: H });
    expect(d.body.blocks!.map((x) => x.id)).toEqual([q1!.id]);
    // The item detail carries its blocks.
    const detail = await call(env, '/api/items/it_jevons');
    expect((detail.body.blocks as unknown[]).length).toBe(1);
  });

  it('takes a picture by upload only with a credit and a licence, and serves it back through the Desk', async () => {
    const env = await deskEnv();
    const form = (fields: Record<string, string>, file = true) => {
      const f = new FormData();
      if (file) f.append('file', new File([fakeJpeg(800, 600)], 'colliery.jpg', { type: 'image/jpeg' }));
      for (const [k, v] of Object.entries(fields)) f.append(k, v);
      return { method: 'POST', headers: H, body: f };
    };
    // JSON is refused on the upload route (multipart only), and multipart elsewhere.
    expect((await call(env, '/api/items/it_jevons/picture', json('POST', {}))).status).toBe(415);
    const noLicence = await call(env, '/api/items/it_jevons/picture', form({ credit: 'Punch' }));
    expect([noLicence.status, noLicence.body.error]).toEqual([400, expect.stringMatching(/licence/)]);
    expect((await call(env, '/api/items/it_jevons/picture', form({ credit: 'Punch', licence: 'Public domain' }, false))).status).toBe(400);
    const ok = await call(env, '/api/items/it_jevons/picture', form({ credit: 'Punch', licence: 'Public domain', caption: 'A colliery.' }));
    expect(ok.status).toBe(200);
    const blk = ok.body.blocks![0]!;
    expect(blk.body).toMatchObject({ kind: 'image', width: 800, height: 600, credit: 'Punch', licence: 'Public domain' });
    const img = await app.request(`${BASE}${blk.image}`, {}, env);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');

    // As a Picture item's own plate.
    const plate = await call(env, '/api/items/it_jevons/picture', form({ credit: 'Hokusai', licence: 'public domain', as: 'plate' }));
    expect(plate.status).toBe(200);
    expect((await env.DB.prepare(`SELECT plate FROM items WHERE id = 'it_jevons'`).first<{ plate: string }>())!.plate).toBe(plate.body.plateId);
  });

  it('saves the new item fields and the Haul edition, with their limits', async () => {
    const env = await deskEnv();
    const r = await call(env, '/api/items/it_jevons', json('PATCH', { year: 1865, handle: '@jevons', recipient: 'John Herschel', place: 'Manchester', type: 'letter' }));
    expect(r.status).toBe(200);
    expect(r.body.item).toMatchObject({ year: 1865, handle: '@jevons', recipient: 'John Herschel', place: 'Manchester', type: 'letter' });
    expect((await call(env, '/api/items/it_jevons', json('PATCH', { year: 1865.5 }))).status).toBe(400);
    expect((await call(env, '/api/items/it_jevons', json('PATCH', { year: null, handle: '' }))).body.item).toMatchObject({ year: null, handle: null });

    expect((await call(env, '/api/hauls/hl_1', json('PATCH', { edition: 'neon' }))).status).toBe(400);
    const h = await call(env, '/api/hauls/hl_1', json('PATCH', { edition: 'teal', swatch: 'lilac' }));
    expect(h.body.haul).toMatchObject({ edition: 'teal', swatch: 'lilac' });
    expect((await call(env, '/api/hauls/hl_1', json('PATCH', { edition: null }))).body.haul).toMatchObject({ edition: null });
  });
});
