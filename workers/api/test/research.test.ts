// The research routes: a session hands the Desk a link or a Wikipedia title, the Desk fetches it,
// and a note citing it must quote it word for word before the judge sees it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { answer, makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { seedHaul } from '../../../packages/server/test/seed';

afterEach(() => vi.unstubAllGlobals());

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1', 'content-type': 'application/json' };
const call = async (env: TestEnv, method: string, path: string, b?: unknown) => {
  const r = await app.request(`${BASE}${path}`, { method, headers: H, ...(b ? { body: JSON.stringify(b) } : {}) }, env);
  return { status: r.status, body: (await r.json()) as any };
};

const ARTICLE = 'The Great Stink was an event in central London in July and August 1858.\nThe hot weather made the smell of untreated human waste on the Thames overwhelming.';
const URL_ = 'https://en.wikipedia.org/wiki/Great_Stink';

function stubWikipedia() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.includes('/page/summary/Great_Stink')) return Response.json({ type: 'standard', title: 'Great Stink', extract: ARTICLE.split('\n')[0], content_urls: { desktop: { page: URL_ } } });
      if (u.includes('/w/api.php')) return Response.json({ query: { pages: [{ title: 'Great Stink', extract: ARTICLE, fullurl: URL_, revisions: [{ revid: 9 }] }] } });
      return new Response('{}', { status: 404 });
    }),
  );
}

const deskEnv = (verdict = 'supported') => seedHaul(makeEnv(() => answer({ verdicts: [{ index: 0, verdict, reason: 'checked' }] }), { DEV_AUTH_BYPASS: '1' } as never));

describe('fetched evidence for session notes', () => {
  it('fetches a Wikipedia article by title, lists it without its text unless asked, and takes a note quoting it', async () => {
    stubWikipedia();
    const env = await deskEnv();
    const added = await call(env, 'POST', '/api/items/it_jevons/evidence', { wikipedia: 'Great Stink', writer: 'claude-opus-5-5' });
    expect(added.status).toBe(200);
    expect(added.body.evidence).toMatchObject({ kind: 'wiki', title: 'Great Stink', publisher: 'Wikipedia', url: URL_, text: ARTICLE, via: 'claude-opus-5-5 (session)' });
    const list = await call(env, 'GET', '/api/items/it_jevons/evidence');
    expect(list.body.evidence[0].text).toBeUndefined();
    expect((await call(env, 'GET', '/api/items/it_jevons/evidence?text=1')).body.evidence[0].text).toBe(ARTICLE);

    const note = await call(env, 'POST', '/api/items/it_jevons/marginalia', {
      text: 'London had its own crisis of plenty: in the summer of 1858 the Thames smelled so bad it was called the Great Stink.',
      cite: { kind: 'evidence', evidenceId: added.body.evidence.id, quote: 'The hot weather made the smell of untreated human waste on the Thames overwhelming.' },
      angle: 'echo',
      writer: 'claude-opus-5-5',
    });
    expect(note.status).toBe(200);
    expect(note.body.draft).toMatchObject({ status: 'proposed', model: 'claude-opus-5-5 (session)' });
    expect(note.body.draft.body).toMatchObject({ angle: 'echo', verdict: 'supported', cite: { kind: 'evidence', publisher: 'Wikipedia', title: 'Great Stink', url: URL_ } });
  });

  it('refuses a quotation not in the fetched text, a text from another item, a bad link and a bad body', async () => {
    stubWikipedia();
    const env = await deskEnv();
    const added = await call(env, 'POST', '/api/items/it_jevons/evidence', { wikipedia: 'Great Stink' });
    const id = added.body.evidence.id;
    expect((await call(env, 'POST', '/api/items/it_jevons/marginalia', { text: 'A plain note.', cite: { kind: 'evidence', evidenceId: id, quote: 'The Thames was always clean.' } })).status).toBe(422);
    expect((await call(env, 'POST', '/api/items/it_nadella/marginalia', { text: 'A plain note.', cite: { kind: 'evidence', evidenceId: id, quote: 'The Great Stink was an event in central London in July and August 1858.' } })).status).toBe(422);
    expect((await call(env, 'POST', '/api/items/it_jevons/evidence', { url: 'ftp://example.org/x' })).status).toBe(400);
    expect((await call(env, 'POST', '/api/items/it_jevons/evidence', { url: 'https://example.org/x', wikipedia: 'Great Stink' })).status).toBe(400);
    expect((await call(env, 'POST', '/api/items/it_jevons/evidence', { wikipedia: 'Nothing Like This' })).status).toBe(422);
    expect((await call(env, 'POST', '/api/items/it_nobody/evidence', { wikipedia: 'Great Stink' })).status).toBe(404);
  });

  it('sets aside a note citing fetched text that the judge does not confirm', async () => {
    stubWikipedia();
    const env = await deskEnv('partly');
    const added = await call(env, 'POST', '/api/items/it_jevons/evidence', { wikipedia: 'Great Stink' });
    const note = await call(env, 'POST', '/api/items/it_jevons/marginalia', { text: 'The Great Stink killed thousands in 1858.', cite: { kind: 'evidence', evidenceId: added.body.evidence.id, quote: 'The Great Stink was an event in central London in July and August 1858.' } });
    expect(note.body.draft.status).toBe('rejected');
  });
});

describe('research on demand', () => {
  it('waits two minutes between runs on one item, and judges only the notes it just wrote', async () => {
    const env = await seedHaul(makeEnv(() => answer({ leads: [] }), { DEV_AUTH_BYPASS: '1' } as never));
    const kept = JSON.stringify({ text: 'Kept.', cite: { kind: 'source', quote: 'The very contrary is the truth.', start: 0, end: 1 }, verdict: 'supported' });
    await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES ('dr_k', 'it_jevons', 'marginal', ?, 'kept', 0, 'now', 'now')`).bind(kept).run();
    const first = await call(env, 'POST', '/api/items/it_jevons/research');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ leads: 0, judged: 0 });
    expect(JSON.parse((await env.DB.prepare(`SELECT body FROM drafts WHERE id = 'dr_k'`).first<{ body: string }>())!.body).verdict).toBe('supported');
    expect((await call(env, 'POST', '/api/items/it_jevons/research')).status).toBe(429);
  });

  it('records a failure on the item', async () => {
    const env = await seedHaul(makeEnv(() => { throw new Error('model down'); }, { DEV_AUTH_BYPASS: '1' } as never));
    const r = await call(env, 'POST', '/api/items/it_jevons/research');
    expect(r.status).toBe(502);
    const check = await env.DB.prepare(`SELECT status, detail FROM checks WHERE item_id = 'it_jevons' AND name = 'research'`).first<{ status: string; detail: string }>();
    expect(check!.status).toBe('warn');
    expect(check!.detail).toContain('research desk failed');
  });
});
