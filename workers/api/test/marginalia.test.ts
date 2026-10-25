// Machine notes written in an editorial session: the same gates as the pipeline's own notes
// (evidence word for word or a card on the item, the style check, the judge), and nothing the judge
// does not fully confirm is offered.

import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { answer, makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { seedHaul } from '../../../packages/server/test/seed';

afterEach(() => vi.unstubAllGlobals());

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1', 'content-type': 'application/json' };
const post = async (env: TestEnv, b: unknown, item = 'it_jevons') => {
  const r = await app.request(`${BASE}/api/items/${item}/marginalia`, { method: 'POST', headers: H, body: JSON.stringify(b) }, env);
  return { status: r.status, body: (await r.json()) as any };
};

const judged = (verdict: string) => () => answer({ verdicts: [{ index: 0, verdict, reason: 'checked' }] });
const deskEnv = (verdict = 'supported') => seedHaul(makeEnv(judged(verdict), { DEV_AUTH_BYPASS: '1' } as never));

describe('session-written machine notes', () => {
  it('anchors the evidence in the source, records the writer and offers a note the judge confirms', async () => {
    const env = await deskEnv();
    const r = await post(env, { text: 'Jevons argued in 1865 that cheaper coal use would raise total consumption.', cite: { kind: 'source', quote: '“The very contrary is the truth.”' }, writer: 'claude-opus-5-5' });
    expect(r.status).toBe(200);
    expect(r.body.draft).toMatchObject({ kind: 'marginal', status: 'proposed', model: 'claude-opus-5-5 (session)' });
    expect(r.body.draft.body).toMatchObject({ verdict: 'supported', cite: { kind: 'source', quote: 'The very contrary is the truth.' } });
  });

  it('sets aside, unseen, a note the judge does not fully confirm', async () => {
    const env = await deskEnv('partly');
    const r = await post(env, { text: 'Jevons thought coal would last forever.', cite: { kind: 'source', quote: 'The very contrary is the truth.' } });
    expect(r.body.draft.status).toBe('rejected');
  });

  it('refuses evidence that is not in the source, a card from elsewhere, and prose that fails the style check', async () => {
    const env = await deskEnv();
    expect((await post(env, { text: 'A plain note.', cite: { kind: 'source', quote: 'Efficiency always lowers consumption.' } })).status).toBe(422);
    expect((await post(env, { text: 'A plain note.', cite: { kind: 'wiki', cardId: 'wk_nowhere' } })).status).toBe(422);
    const s = await post(env, { text: 'This is not just a note — it is a tapestry — a testament.', cite: { kind: 'source', quote: 'The very contrary is the truth.' } });
    expect([s.status, s.body.error]).toEqual([422, 'The note fails the style check']);
    expect((await post(env, { text: 'A plain note.', cite: { kind: 'source', quote: 'The very contrary is the truth.' }, writer: 'Bad Writer!' })).status).toBe(400);
    expect((await post(env, { text: 'A plain note.', cite: { kind: 'source', quote: 'The very contrary is the truth.' } }, 'it_nobody')).status).toBe(404);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM drafts WHERE item_id = 'it_jevons' AND model LIKE '%(session)'`).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });
});
