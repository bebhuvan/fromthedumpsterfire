// POST /api/items/:id/library: the editor asks for a piece to be read from their own saved copy.

import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { makeEnv } from '../../../packages/server/test/fake-env';
import { LIBRARY_TIMING } from '../../../packages/server/src/library';

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1', 'content-type': 'application/json' };
const LINK = 'https://example.org/essays/a-long-piece';
const BODY = Array.from({ length: 10 }, (_, i) => `<p>Paragraph ${i + 1} of the saved copy, long enough to read as the whole piece and more than a preview.</p>`).join('');

async function setup(over: Record<string, string> = {}) {
  const env = makeEnv(undefined, { DEV_AUTH_BYPASS: '1', ...over } as never);
  await env.DB.prepare(`INSERT INTO items (id, kind, type, url, status, status_detail, captured_at, updated_at) VALUES ('it_lib', 'article', 'essay', ?, 'failed', 'This post is for paid subscribers', '2026-10-25', '2026-10-25')`).bind(LINK).run();
  return env;
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/items/:id/library', () => {
  it('stores the Readwise copy as the source and queues a redraft', async () => {
    LIBRARY_TIMING.sleep = async () => {};
    const env = await setup({ READWISE_TOKEN: 'rw-token' });
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const u = new URL(String(input));
      return Response.json(u.searchParams.get('id') ? { results: [{ id: 'd1', source_url: LINK, title: 'A long piece', html_content: BODY }] } : { results: [{ id: 'd1', source_url: LINK + '?utm_source=x' }], nextPageCursor: null });
    });
    const res = await app.request(`${BASE}/api/items/it_lib/library`, { method: 'POST', headers: H, body: '{}' }, env);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { words: number; via: string };
    expect(out.via).toMatch(/Readwise Reader/);
    expect(JSON.stringify(out)).not.toContain('rw-token');
    const src = await env.DB.prepare(`SELECT extractor FROM sources WHERE item_id = 'it_lib'`).first<{ extractor: string }>();
    expect(src?.extractor).toBe('readwise');
    const item = await env.DB.prepare(`SELECT status, url FROM items WHERE id = 'it_lib'`).first<{ status: string; url: string }>();
    expect(item).toEqual({ status: 'queued', url: LINK });
    expect(env.queue).toEqual([{ kind: 'redraft', itemId: 'it_lib' }]);
  });

  it('says plainly when no library is connected', async () => {
    const env = await setup();
    const res = await app.request(`${BASE}/api/items/it_lib/library`, { method: 'POST', headers: H, body: '{}' }, env);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/No reading library is connected/);
  });
});
