// The data story routes through the Desk Worker: behind the lock, JSON with x-desk only, the frame
// checked, a body cap on the bytes read, a check that writes nothing, and a publish that needs
// confirm: true. The story's own rules are tested in packages/server/test/stories-publish.test.ts.

import { describe, expect, it } from 'vitest';
import { DATA_INDEX_PATH } from '@fdf/shared/stories/published';
import app from '../src/index';
import { makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { seedItem } from '../../../packages/server/test/seed';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const STORY = JSON.parse(fs.readFileSync(new URL('../../../packages/shared/fixtures/stories/fertility.json', import.meta.url), 'utf8'));
const NOTE: string = fs.readFileSync(new URL('../../../packages/shared/fixtures/stories/fertility-editor-note.txt', import.meta.url), 'utf8');
const QUOTE: string = STORY.plates.find((p: { quote?: unknown }) => p.quote).quote.text;

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1', 'content-type': 'application/json' };
const post = (b: unknown, headers: Record<string, string> = H) => ({ method: 'POST', headers, body: typeof b === 'string' ? b : JSON.stringify(b) });

async function deskEnv(over: Record<string, string> = { DEV_AUTH_BYPASS: '1' }): Promise<TestEnv> {
  const env = makeEnv(undefined, over as never);
  await seedItem(env, 'it_fertility', { title: 'Persistently Low Global Fertility', text: `Before. ${QUOTE} After.`, date: '2026', why: NOTE });
  return env;
}
const call = async (env: TestEnv, path: string, init: RequestInit = {}) => {
  const res = await app.request(`${BASE}${path}`, init, env);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const payload = { slug: 'fertility', itemId: 'it_fertility', story: STORY };

describe('data story routes', () => {
  it('are behind the lock and refuse writes without x-desk or JSON', async () => {
    const locked = await deskEnv({});
    for (const path of ['/api/stories', '/api/stories/check', '/api/stories/publish']) {
      const r = await app.request(`${BASE}${path}`, path === '/api/stories' ? {} : post({ ...payload, confirm: true }), locked);
      expect(r.status).toBe(403);
    }
    const env = await deskEnv();
    const { 'x-desk': _x, ...noDesk } = H;
    expect((await call(env, '/api/stories/publish', post({ ...payload, confirm: true }, noDesk))).status).toBe(403);
    expect((await call(env, '/api/stories/publish', post({ ...payload, confirm: true }, { ...H, 'content-type': 'text/plain' }))).status).toBe(415);
    expect(env.FILES.writes).toEqual([]);
  });

  it('checks the frame and caps the body on the bytes read', async () => {
    const env = await deskEnv();
    expect((await call(env, '/api/stories/check', post('not json'))).status).toBe(400);
    expect((await call(env, '/api/stories/check', post({ ...payload, story: { title: 'x' } }))).status).toBe(400);
    expect((await call(env, '/api/stories/check', post({ ...payload, extra: 1 }))).status).toBe(400);
    const big = JSON.stringify({ ...payload, padding: 'x'.repeat(2 * 1024 * 1024) });
    // A Content-Length that lies is not trusted.
    expect((await call(env, '/api/stories/check', post(big, { ...H, 'content-length': '10' }))).status).toBe(413);
    expect(env.FILES.writes).toEqual([]);
  });

  it('checks without writing, publishes only with confirm, and lists the index', async () => {
    const env = await deskEnv();
    const check = await call(env, '/api/stories/check', post(payload));
    expect(check).toMatchObject({ status: 200, body: { ok: true, problems: [], version: 1, number: 1 } });
    expect(env.FILES.writes).toEqual([]);
    const reworded = { ...payload, story: { ...STORY, standfirst: `${STORY.standfirst} Indeed.` } };
    expect((await call(env, '/api/stories/check', post(reworded))).status).toBe(422);
    expect((await call(env, '/api/stories/publish', post(payload))).status).toBe(400);
    expect((await call(env, '/api/stories/publish', post({ ...reworded, confirm: true }))).status).toBe(422);
    expect(env.FILES.writes).toEqual([]);
    const pub = await call(env, '/api/stories/publish', post({ ...payload, confirm: true }));
    expect(pub).toMatchObject({ status: 200, body: { ok: true, version: 1, number: 1, path: 'data/fertility/v1/story.json' } });
    expect(env.FILES.writes).toEqual(['data/fertility/v1/story.json', DATA_INDEX_PATH]);
    const index = await call(env, '/api/stories');
    expect((index.body.stories as Array<{ slug: string }>).map((s) => s.slug)).toEqual(['fertility']);
  });
});
