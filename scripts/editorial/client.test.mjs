import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, apiPath, deskOrigin, DeskError, waitForItem } from './client.mjs';
import { run } from '../editorial.mjs';
import app from '../../workers/api/src/index';
import { makeEnv, answer } from '../../packages/server/test/fake-env';
import { seedHaul, seedItem } from '../../packages/server/test/seed';

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.unstubAllGlobals(); });
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'fdf-editorial-')); dirs.push(d); return d; };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const credentials = { clientId: 'test-client.access', clientSecret: 'test-secret-do-not-print' };

async function cli(args, fetcher, extraEnv = {}) {
  const d = temp();
  let stdout = '', stderr = '';
  const code = await run(['--config', join(d, 'missing.env'), ...args], {
    env: { FDF_DESK_URL: 'http://127.0.0.1:8787', ...extraEnv }, fetcher,
    stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; },
  });
  return { code, stdout, stderr };
}

it('uses the actual Worker API to edit, quote, order, preview and publish the same draft', async () => {
  const env = await seedHaul(makeEnv(undefined, { DEV_AUTH_BYPASS: '1' }));
  env.INGEST_QUEUE.sendBatch = async (messages) => { env.queue.push(...messages); };
  const fetcher = (url, init) => app.request(url, init, env);
  const d = temp();
  const payload = (name, data) => { const path = join(d, name); writeFileSync(path, JSON.stringify(data)); return path; };
  const capture = await cli(['capture', '--data', payload('capture.json', { entries: [{ url: 'https://example.org/an-essay', why: 'My note, with its own rhythm.' }] })], fetcher);
  expect(capture.code).toBe(0);
  expect(JSON.parse(capture.stdout).captured).toHaveLength(1);
  expect(env.queue.some((x) => x.body?.kind === 'ingest')).toBe(true);
  // Existing seed has source text, an excerpt and checks. CLI edits go through the Desk PATCH route.
  const edit = await cli(['edit', 'it_jevons', '--data', payload('edit.json', { why_text: 'I liked the question Jevons asks.' })], fetcher);
  expect(edit.code).toBe(0);
  const detail = await cli(['item', 'it_jevons'], fetcher);
  expect(JSON.parse(detail.stdout).item.why_text).toBe('I liked the question Jevons asks.');
  const bad = await cli(['request', 'POST', '/api/items/it_jevons/blocks', '--data', payload('bad.json', { kind: 'quote', text: 'Efficiency always lowers consumption.' })], fetcher);
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stderr).status).toBe(422);
  const quote = await cli(['request', 'POST', '/api/items/it_jevons/blocks', '--data', payload('quote.json', { kind: 'quote', text: 'The very contrary is the truth.', locator: 'p. 7' })], fetcher);
  expect(quote.code).toBe(0);
  const ordered = await cli(['order', 'hl_1', '--data', payload('order.json', { itemIds: ['it_jevons'] })], fetcher);
  expect(ordered.code).toBe(0);
  const preview = await cli(['preview', 'hl_1'], fetcher);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.stdout).problems).toEqual([]);
  expect(env.FILES.writes).toEqual([]);
  expect((await cli(['publish', 'hl_1'], fetcher)).code).toBe(1);
  expect(env.FILES.writes).toEqual([]);
  const published = await cli(['publish', 'hl_1', '--confirm-publish'], fetcher);
  expect(published.code).toBe(0);
  expect(JSON.parse(published.stdout).ok).toBe(true);
  const bundle = await (await env.FILES.get('hauls/001/v1/haul.json')).json();
  expect(bundle.items[0].why.text).toBe('I liked the question Jevons asks.');
  expect(bundle.items[0].blocks[0].text).toBe('The very contrary is the truth.');
});

it('sends multipart uploads through the existing upload route and preserves Unicode prose', async () => {
  const d = temp();
  const file = join(d, 'note.m4a'); writeFileSync(file, 'audio-bytes');
  const data = join(d, 'fields.json'); writeFileSync(data, JSON.stringify({ itemId: 'it_one', target: 'why' }));
  const seen = [];
  const r = await cli(['note', file, '--data', data], async (url, init) => {
    seen.push(init);
    expect(url).toMatch(/\/api\/notes$/);
    expect(init.headers['content-type']).toBeUndefined();
    expect(init.body.get('audio').type).toBe('audio/mp4');
    expect(init.body.get('itemId')).toBe('it_one');
    return json({ note: { transcript_raw: 'ನಮಸ್ಕಾರ, I loved this.', transcript_clean: 'ನಮಸ್ಕಾರ, I loved this.' } });
  });
  expect(r.code).toBe(0); expect(r.stdout).toContain('ನಮಸ್ಕಾರ'); expect(seen).toHaveLength(1);
});

it('uploads audio through the actual Worker and retains raw text when cleanup tries to reword it', async () => {
  const raw = 'Um, I liked this, I liked this very much. The joke stays.';
  const env = await seedHaul(makeEnv((model) => model.includes('whisper') ? { text: raw, transcription_info: { duration: 6 } } : answer({ text: 'This is an excellent piece.' }), { DEV_AUTH_BYPASS: '1' }));
  const fetcher = (url, init) => app.request(url, init, env);
  const d = temp(), audio = join(d, 'voice.webm'), data = join(d, 'note.json');
  writeFileSync(audio, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]));
  writeFileSync(data, JSON.stringify({ itemId: 'it_jevons', target: 'why' }));
  const r = await cli(['note', audio, '--data', data], fetcher);
  expect(r.code).toBe(0);
  const note = JSON.parse(r.stdout).note;
  expect(note.transcript_raw).toBe(raw);
  expect(note.transcript_clean).not.toBe('This is an excellent piece.');
  expect(note.clean_method).toBe('code');
  expect(env.MEDIA.objects.has(note.audio_key)).toBe(true);
  expect((await env.DB.prepare('SELECT transcript_raw FROM notes WHERE id = ?').bind(note.id).first()).transcript_raw).toBe(raw);
});

it('pins credentials to one origin, never follows redirects and redacts credentials in refusals', async () => {
  const calls = [];
  const client = createClient({ origin: 'https://desk.example.org', credentials, fetcher: async (url, init) => {
    calls.push([url, init]); return new Response('', { status: 302, headers: { location: 'https://other.example/login' } });
  } });
  await expect(client.request('GET', '/api/items')).rejects.toThrow(/No redirect/);
  expect(calls).toHaveLength(1); expect(calls[0][1].redirect).toBe('manual');
  expect(calls[0][1].headers['CF-Access-Client-Secret']).toBe(credentials.clientSecret);
  for (const path of ['https://other.example/api/items', '//other.example/api/items', '/api/../secret', '/api/%2e%2e/settings', '/api/items#x', '/api/a\\b']) expect(() => apiPath(path)).toThrow();
  expect(() => deskOrigin('http://example.org')).toThrow();
  expect(() => deskOrigin('https://x@y.example')).toThrow();
  const r = await cli(['items'], async () => json({ error: credentials.clientSecret }, 403), { FDF_ACCESS_CLIENT_ID: credentials.clientId, FDF_ACCESS_CLIENT_SECRET: credentials.clientSecret });
  expect(r.stderr).not.toContain(credentials.clientSecret); expect(r.stderr).toContain('[redacted]');
});

it('never retries writes, retries reads twice and requires explicit publication/deletion flags even via request', async () => {
  const fetcher = vi.fn(async () => { throw new Error('network'); });
  const client = createClient({ origin: 'http://localhost:8787', fetcher, sleep: async () => {} });
  await expect(client.request('POST', '/api/capture', { data: {} })).rejects.toThrow(/may have completed/);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockClear(); await expect(client.request('GET', '/api/items')).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockClear();
  for (const path of ['/api/hauls/hl_1/publish', '/api/shelf/publish', '/api/hauls/hl_1/publish/', '/api/stories/publish']) await expect(client.request('POST', path)).rejects.toThrow(/confirm-publish/);
  await expect(client.request('DELETE', '/api/items/it_x')).rejects.toThrow(/confirm-delete/);
  expect(fetcher).not.toHaveBeenCalled();
});

it('fails cleanly on missing/partial credentials, invalid arguments, HTML and insecure config files', async () => {
  expect(() => createClient({ origin: 'https://desk.example.org' })).toThrow(/credentials/);
  expect(() => createClient({ origin: 'https://desk.example.org', credentials: { clientId: 'x' } })).toThrow(/both/);
  const client = createClient({ origin: 'http://localhost:8787', fetcher: async () => new Response('<html>private stuff</html>', { status: 403 }) });
  await expect(client.request('GET', '/api/items')).rejects.toThrow(/without JSON/);
  expect((await cli(['edit', 'it_x'], vi.fn())).code).toBe(1);
  expect((await cli(['items', 'extra'], vi.fn())).code).toBe(1);
  const d = temp(), config = join(d, 'config.env'); writeFileSync(config, 'FDF_ACCESS_TOKEN=secret\n', { mode: 0o644 }); chmodSync(config, 0o644);
  let stderr = '';
  expect(await run(['status', '--config', config], { env: {}, stderr: (s) => { stderr += s; } })).toBe(1);
  expect(stderr).toContain('chmod 600'); expect(stderr).not.toContain('=secret');
});

it('bounds polling and stops on failed/paused items', async () => {
  let time = 0;
  const client = { request: vi.fn(async () => ({ item: { status: 'reading' } })) };
  await expect(waitForItem(client, 'it_one', { seconds: 1, now: () => time, sleep: async (ms) => { time += ms; } })).rejects.toThrow(/still processing/);
  expect(client.request).toHaveBeenCalledTimes(2);
  await expect(waitForItem({ request: async () => ({ item: { status: 'paused' } }) }, 'it_one')).rejects.toThrow(/paused/);
});

it('makes a Life and submits its profile from the terminal, sources fetched by the Desk', async () => {
  const text = 'Born in 1899, he was educated at Presidency College and at London University, where he was awarded a gold medal in mathematics. '.repeat(8);
  vi.stubGlobal('fetch', async (input) => {
    const u = new URL(String(input));
    if (u.hostname === 'cloudflare-dns.com') return json({ Answer: u.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    return new Response(`<html><head><title>India After Gandhi</title></head><body><article><h1>An extract</h1><p>${text}</p></article></body></html>`, { headers: { 'content-type': 'text/html' } });
  });
  const env = await seedHaul(makeEnv((_m, input) => answer({ verdicts: [...JSON.stringify(input).matchAll(/NOTE (\d+):/g)].map((m) => ({ index: Number(m[1]), verdict: 'supported', reason: 'ok' })) }), { DEV_AUTH_BYPASS: '1' }));
  const fetcher = (url, init) => app.request(url, init, env);
  const d = temp();
  const payload = (name, data) => { const path = join(d, name); writeFileSync(path, JSON.stringify(data)); return path; };
  const source = { id: 'guha', author: 'Ramachandra Guha', title: 'India After Gandhi', kind: 'book', url: 'https://example.org/guha' };
  const made = await cli(['life', '--data', payload('life.json', { name: 'Sukumar Sen', why: 'My note.', sources: [source] })], fetcher);
  expect(made.code).toBe(0);
  const itemId = JSON.parse(made.stdout).itemId;
  const line = (id, t, quote) => ({ id, text: t, cites: [{ source: 'guha', quote }] });
  // The draft file may carry the sources too (the session's working copy); the Desk's own are used.
  const profile = {
    name: 'Sukumar Sen', writer: 'claude-opus-5-5', sources: [source],
    epithet: line('e', 'A mathematician in the civil service', 'awarded a gold medal in mathematics'),
    sections: [{ heading: 'Early life', paragraphs: [[line('a', 'Born in 1899, he studied at Presidency College.', 'Born in 1899, he was educated at Presidency College')]] }],
  };
  const sent = await cli(['life-draft', itemId, '--data', payload('profile.json', profile)], fetcher);
  expect(sent.code).toBe(0);
  expect(JSON.parse(sent.stdout)).toMatchObject({ judged: 2, setAside: 0, writer: 'claude-opus-5-5 (session)' });
  const bad = await cli(['life-draft', itemId, '--data', payload('bad.json', { ...profile, epithet: line('e', 'Born in 1898', 'Born in 1899') })], fetcher);
  expect(bad.code).toBe(1);
  expect(bad.stderr).toMatch(/1898/);
  const shown = await cli(['life-show', itemId], fetcher);
  expect(JSON.parse(shown.stdout).sources[0]).toMatchObject({ key: 'guha', status: 'fetched' });
  expect(shown.stdout).not.toMatch(/gold medal in mathematics\. Born/);
});

it('checks and publishes a data story from the terminal, publishing only with --confirm-publish', async () => {
  const story = JSON.parse(readFileSync(new URL('../../packages/shared/fixtures/stories/fertility.json', import.meta.url), 'utf8'));
  const note = readFileSync(new URL('../../packages/shared/fixtures/stories/fertility-editor-note.txt', import.meta.url), 'utf8');
  const quote = story.plates.find((p) => p.quote).quote.text;
  const env = makeEnv(undefined, { DEV_AUTH_BYPASS: '1' });
  await seedItem(env, 'it_fertility', { title: 'Persistently Low Global Fertility', text: `Before. ${quote} After.`, date: '2026', why: note });
  const fetcher = (url, init) => app.request(url, init, env);
  const d = temp();
  const file = join(d, 'story.json');
  writeFileSync(file, JSON.stringify(story));
  const args = ['--data', file, '--slug', 'fertility', '--item', 'it_fertility'];
  expect((await cli(['story-check', '--data', file, '--slug', 'Bad Slug', '--item', 'it_fertility'], fetcher)).code).toBe(1);
  expect((await cli(['story-check', '--slug', 'fertility', '--item', 'it_fertility'], fetcher)).code).toBe(1);
  const checked = await cli(['story-check', ...args], fetcher);
  expect(checked.code).toBe(0);
  expect(JSON.parse(checked.stdout)).toMatchObject({ ok: true, version: 1, number: 1 });
  const refused = await cli(['story-publish', ...args], fetcher);
  expect(refused.code).toBe(1);
  expect(refused.stderr).toMatch(/confirm-publish/);
  expect(env.FILES.writes).toEqual([]);
  const published = await cli(['story-publish', ...args, '--confirm-publish'], fetcher);
  expect(published.code).toBe(0);
  expect(JSON.parse(published.stdout)).toMatchObject({ ok: true, path: 'data/fertility/v1/story.json' });
  expect(JSON.parse((await cli(['stories'], fetcher)).stdout).stories.map((s) => s.slug)).toEqual(['fertility']);
});

it('runs a Haul from a session: excerpt by words, keep and cut, a fetched source, a margin note and the todo list', async () => {
  const env = await seedHaul(makeEnv(() => answer({ verdicts: [{ index: 0, verdict: 'supported', reason: 'ok' }] }), { DEV_AUTH_BYPASS: '1' }));
  const fetcher = (url, init) => app.request(url, init, env);
  const d = temp();
  const payload = (name, data) => { const path = join(d, name); writeFileSync(path, JSON.stringify(data)); return path; };
  await env.DB.prepare(`INSERT INTO haul_items (haul_id, item_id, position) VALUES ('hl_1', 'it_jevons', 0)`).run();
  await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES ('dr_a', 'it_jevons', 'marginal', ?, 'proposed', 0, 'now', 'now')`)
    .bind(JSON.stringify({ text: 'Jevons wrote in 1865.', cite: { kind: 'source', quote: 'The very contrary is the truth.', start: 0, end: 1 }, verdict: 'supported' })).run();

  const ex = await cli(['excerpt', 'it_jevons', '--data', payload('ex.json', { text: 'The very contrary is the truth.' })], fetcher);
  expect(ex.code).toBe(0);
  expect(JSON.parse(ex.stdout).excerpt).toMatchObject({ text: 'The very contrary is the truth.', chosen: 1 });
  expect((await cli(['excerpt', 'it_jevons', '--data', payload('bad.json', { text: 'Coal is endless.' })], fetcher)).code).toBe(1);

  const todo = JSON.parse((await cli(['todo', 'hl_1'], fetcher)).stdout);
  expect(todo.items[0].notes).toEqual([{ id: 'dr_a', text: 'Jevons wrote in 1865.' }]);
  expect((await cli(['keep', 'dr_a'], fetcher)).code).toBe(0);
  expect(JSON.parse((await cli(['todo', 'hl_1'], fetcher)).stdout).items[0].notes).toEqual([]);
  expect((await cli(['keep', 'it_jevons'], fetcher)).code).toBe(1);

  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes('/page/summary/Great_Stink')) return Response.json({ type: 'standard', title: 'Great Stink', extract: 'The Great Stink was an event in London in 1858.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Great_Stink' } } });
    if (u.includes('/w/api.php')) return Response.json({ query: { pages: [{ title: 'Great Stink', extract: 'The Great Stink was an event in London in 1858.\nThe smell of the Thames was overwhelming that summer.', fullurl: 'https://en.wikipedia.org/wiki/Great_Stink' }] } });
    return new Response('{}', { status: 404 });
  }));
  const added = await cli(['evidence-add', 'it_jevons', '--data', payload('ev.json', { wikipedia: 'Great Stink', writer: 'claude-opus-5-5' })], fetcher);
  expect(added.code).toBe(0);
  const evId = JSON.parse(added.stdout).evidence.id;
  expect(JSON.parse((await cli(['evidence', 'it_jevons'], fetcher)).stdout).evidence[0].text).toBeUndefined();
  expect(JSON.parse((await cli(['evidence', 'it_jevons', '--text'], fetcher)).stdout).evidence[0].text).toContain('overwhelming');
  const note = await cli(['margin', 'it_jevons', '--data', payload('note.json', { text: 'London smelled its own plenty in 1858, the summer of the Great Stink.', cite: { kind: 'evidence', evidenceId: evId, quote: 'The Great Stink was an event in London in 1858.' }, angle: 'echo', writer: 'claude-opus-5-5' })], fetcher);
  expect(note.code).toBe(0);
  expect(JSON.parse(note.stdout).draft).toMatchObject({ status: 'proposed', body: { angle: 'echo', verdict: 'supported' } });
});
