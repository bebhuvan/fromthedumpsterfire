// Lives through the Desk's real routes: sources fetched by code, a draft refused whole when a quote
// or a figure is not in its source, the judge setting aside what it cannot confirm (and failing
// closed), the editor keeping and cutting lines, approval, and publish printing only kept lines.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { answer, makeEnv, type TestEnv } from '../../../packages/server/test/fake-env';
import { seedHaul } from '../../../packages/server/test/seed';
import { assembleHaul } from '../../../packages/server/src/publish';

const BASE = 'http://127.0.0.1:8787';
const H = { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1', 'content-type': 'application/json' };
const req = async (env: TestEnv, method: string, path: string, b?: unknown) => {
  const r = await app.request(`${BASE}${path}`, { method, headers: H, ...(b === undefined ? {} : { body: JSON.stringify(b) }) }, env);
  return { status: r.status, body: (await r.json()) as any };
};

const GUHA =
  'India’s first general election was, among other things, an act of faith. In March 1950 Sukumar Sen was appointed chief election commissioner. Born in 1899, he was educated at Presidency College and at London University, where he was awarded a gold medal in mathematics. ' +
  'Consider, first of all, the size of the electorate: 176 million Indians aged twenty-one or more, of whom about 85 percent could not read or write. Sukumar Sen was outraged by this practice, a ‘curious senseless relic of the past’, and directed his officials to correct the rolls. ' +
  'Nonetheless, some 2.8 million women voters had finally to be struck off the list. '.repeat(3);
const REPORT = 'Polling took place on the 25th, 27th, 29th and 31st October, and the 2nd November, 1951, in these two constituencies. All the remaining States went to the polls during January, 1952. '.repeat(6);

const page = (title: string, text: string) =>
  new Response(`<!doctype html><html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${text}</p></article></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

beforeEach(() => {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const u = new URL(String(input));
    if (u.hostname === 'cloudflare-dns.com') return Response.json({ Answer: u.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    if (u.href.startsWith('https://example.org/guha')) return page('The Travails of India’s first election commissioner', GUHA);
    if (u.href.startsWith('https://example.org/report')) return page('Report on the First General Elections', REPORT);
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } });
  });
});
afterEach(() => vi.unstubAllGlobals());

/** A judge that supports every line except those carrying "Overstated". */
const judge = (_m: string, input: Record<string, any>) => {
  const prompt = JSON.stringify(input);
  const notes = [...prompt.matchAll(/NOTE (\d+): ([^\\]*)/g)];
  return answer({ verdicts: notes.map((n) => ({ index: Number(n[1]), verdict: /Overstated/.test(n[2]!) ? 'partly' : 'supported', reason: 'checked' })) });
};
const deskEnv = (ai = judge) => seedHaul(makeEnv(ai, { DEV_AUTH_BYPASS: '1' } as never));

const sources = [
  { id: 'guha', author: 'Ramachandra Guha', title: 'India After Gandhi', kind: 'book', year: '2007', url: 'https://example.org/guha', via: 'An extract at The Caravan', workUrl: 'https://example.org/book' },
  { id: 'eci', author: 'Election Commission of India', title: 'Report on the First General Elections in India 1951-52', kind: 'report', year: '1955', url: 'https://example.org/report' },
];

const L = (id: string, text: string, source: string, quote: string) => ({ id, text, cites: [{ source, quote }] });
const draft = (over: Record<string, unknown> = {}) => ({
  name: 'Sukumar Sen',
  writer: 'claude-opus-5-5',
  born: { year: 1899, cites: [{ source: 'guha', quote: 'Born in 1899' }] },
  epithet: L('e', 'India’s first Chief Election Commissioner', 'guha', 'In March 1950 Sukumar Sen was appointed chief election commissioner.'),
  sections: [
    {
      heading: 'Every adult, by name',
      paragraphs: [
        [
          L('a', 'About 85 per cent of the electorate could not read or write.', 'guha', 'of whom about 85 percent could not read or write'),
          L('b', 'In the end about 2.8 million women were struck off the rolls.', 'guha', 'some 2.8 million women voters had finally to be struck off the list.'),
          L('c', 'Overstated: every woman in India was struck off.', 'guha', 'some 2.8 million women voters had finally to be struck off the list.'),
        ],
        [L('d', 'Polling in the hills began on 25 October 1951.', 'eci', 'Polling took place on the 25th, 27th, 29th and 31st October, and the 2nd November, 1951, in these two constituencies.')],
      ],
    },
  ],
  words: { text: 'curious senseless relic of the past', context: L('w', 'Sukumar Sen, on women entered on the rolls by description', 'guha', 'directed his officials to correct the rolls'), cites: [{ source: 'guha', quote: 'a ‘curious senseless relic of the past’' }] },
  dates: [{ year: '1899', line: L('y1', 'Born', 'guha', 'Born in 1899') }],
  figures: { title: 'The first general election, in numbers', rows: [{ value: '2.8 million', line: L('f1', 'women struck off the rolls', 'guha', 'some 2.8 million women voters') }] },
  reading: [{ author: 'Ornit Shani', title: 'How India Became Democratic', kind: 'book', year: '2017' }],
  ...over,
});

async function makeLife(env: TestEnv) {
  const r = await req(env, 'POST', '/api/lives', { name: 'Sukumar Sen', why: 'Why I want him here, in my words.', year: 1951, sources });
  expect(r.status).toBe(200);
  return r.body.itemId as string;
}

/** A one-page PDF whose text layer is `text` (enough of a PDF for the extractor). */
function tinyPdf(text: string): Uint8Array {
  const stream = `BT /F1 10 Tf 20 700 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe('Lives on the Desk', () => {
  it('reads the editor’s PDF of a source too slow to fetch, keeping the link as the source', async () => {
    const env = await deskEnv();
    const id = await makeLife(env);
    const line = 'The Chini and Pangi Assembly constituencies were the first to go to the polls before snow-fall. '.repeat(10);
    const form = new FormData();
    form.append('file', new File([tinyPdf(line)], 'report.pdf', { type: 'application/pdf' }));
    const r = await app.request(`${BASE}/api/items/${id}/life/sources/eci/file`, { method: 'POST', headers: { origin: BASE, 'sec-fetch-site': 'same-origin', 'x-desk': '1' }, body: form }, env);
    const body = (await r.json()) as any;
    expect(r.status).toBe(200);
    const eci = body.sources.find((s: any) => s.key === 'eci');
    expect(eci).toMatchObject({ status: 'fetched', url: 'https://example.org/report' });
    const row = await env.DB.prepare(`SELECT text, file_key FROM life_sources WHERE item_id = ? AND key = 'eci'`).bind(id).first<any>();
    expect(row.file_key).toBe(`uploads/${id}/life-eci.pdf`);
    expect(row.text).toContain('Chini and Pangi');
  });

  it('creates a Life and fetches its sources by code, keeping their text private', async () => {
    const env = await deskEnv();
    const id = await makeLife(env);
    const r = await req(env, 'GET', `/api/items/${id}/life`);
    expect(r.body.sources.map((s: any) => [s.key, s.status])).toEqual([['guha', 'fetched'], ['eci', 'fetched']]);
    expect(JSON.stringify(r.body)).not.toContain('gold medal');
    const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<any>();
    expect(item).toMatchObject({ type: 'life', kind: 'life', status: 'ready', creator: 'Ramachandra Guha', source_name: 'India After Gandhi', url: 'https://example.org/book' });
  });

  it('refuses a whole draft when a quote is not in its source or a figure is not in its quotes', async () => {
    const env = await deskEnv();
    const id = await makeLife(env);
    const bad = draft({ epithet: L('e', 'India’s first Chief Election Commissioner', 'guha', 'He was the first and the best.') });
    const r1 = await req(env, 'POST', `/api/items/${id}/life`, bad);
    expect(r1.status).toBe(422);
    expect(r1.body.problems[0].message).toMatch(/not in guha word for word/);
    const fig = draft({ dates: [{ year: '1898', line: L('y1', 'Born', 'guha', 'Born in 1899') }] });
    const r2 = await req(env, 'POST', `/api/items/${id}/life`, fig);
    expect(r2.status).toBe(422);
    expect(r2.body.problems.map((p: any) => p.message).join(' ')).toMatch(/1898 is not in its quotes/);
    const style = draft({ epithet: L('e', 'A testament to democracy — and a tapestry — of votes', 'guha', 'In March 1950 Sukumar Sen was appointed chief election commissioner.') });
    expect((await req(env, 'POST', `/api/items/${id}/life`, style)).status).toBe(422);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM lives').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('judges every line, sets aside what the judge cannot confirm, and records the writer', async () => {
    const env = await deskEnv();
    const id = await makeLife(env);
    const r = await req(env, 'POST', `/api/items/${id}/life`, draft());
    expect(r.status).toBe(200);
    expect(r.body.writer).toBe('claude-opus-5-5 (session)');
    const lines = r.body.draft.sections[0].paragraphs.flat();
    expect(lines.map((l: any) => [l.id, l.status])).toEqual([['a', 'proposed'], ['b', 'proposed'], ['c', 'rejected'], ['d', 'proposed']]);
    // The quote is re-anchored to the source's own characters.
    expect(lines[0].cites[0]).toMatchObject({ quote: 'of whom about 85 percent could not read or write' });
    expect(typeof lines[0].cites[0].start).toBe('number');
  });

  it('fails closed when the judge errors: nothing is offered', async () => {
    const env = await deskEnv(() => {
      throw new Error('model down');
    });
    const id = await makeLife(env);
    const r = await req(env, 'POST', `/api/items/${id}/life`, draft());
    const all = [r.body.draft.epithet, ...r.body.draft.sections[0].paragraphs.flat()];
    expect(all.every((l: any) => l.status === 'rejected')).toBe(true);
  });

  it('prints only what the editor kept, only after approval, which any change clears', async () => {
    const env = await deskEnv();
    const id = await makeLife(env);
    await req(env, 'POST', `/api/items/${id}/life`, draft());
    // Not approved: publish refuses.
    await env.DB.prepare(`INSERT INTO haul_items (haul_id, item_id, position) VALUES ('hl_1', ?, 9)`).bind(id).run();
    await env.DB.prepare(`INSERT INTO checks (item_id, name, status, detail, at) VALUES (?, 'links', 'pass', '{}', '2026-10-27')`).bind(id).run();
    expect((await assembleHaul(env, 'hl_1')).problems.map((p) => p.message)).toContain('approve the profile on the Desk before publishing');
    // Undecided lines block approval.
    const early = await req(env, 'POST', `/api/items/${id}/life/approve`, { approve: true });
    expect(early.body.approvedAt).toBeNull();
    expect(early.body.problems.join(' ')).toMatch(/still to keep or cut/);
    // The checker's rejection cannot be overridden.
    expect((await req(env, 'PATCH', `/api/items/${id}/life/lines/c`, { status: 'kept' })).status).toBe(409);
    await req(env, 'POST', `/api/items/${id}/life/all`, { status: 'kept' });
    await req(env, 'PATCH', `/api/items/${id}/life/lines/d`, { status: 'cut' });
    const ok = await req(env, 'POST', `/api/items/${id}/life/approve`, { approve: true });
    expect(ok.body.problems).toEqual([]);
    expect(ok.body.approvedAt).toBeTruthy();
    const a = await assembleHaul(env, 'hl_1');
    expect(a.problems.filter((p) => p.itemId === id)).toEqual([]);
    const item = a.haul.items.find((i) => i.type === 'life')!;
    expect(item.life!.sections[0]!.paragraphs).toEqual([
      [
        { text: 'About 85 per cent of the electorate could not read or write.', cites: [{ source: 'guha' }] },
        { text: 'In the end about 2.8 million women were struck off the rolls.', cites: [{ source: 'guha' }] },
      ],
    ]);
    // The cut paragraph took the report with it: the label names only what the printed profile cites.
    expect(item.life!.sources.map((s) => s.id)).toEqual(['guha']);
    expect(JSON.stringify(item.life)).not.toContain('quote');
    expect(a.bundleErrors.filter((e) => e.path.includes('life'))).toEqual([]);
    // A change clears the approval.
    await req(env, 'PATCH', `/api/items/${id}/life/lines/a`, { status: 'cut' });
    expect((await req(env, 'GET', `/api/items/${id}/life`)).body.approvedAt).toBeNull();
  });

  it('keeps a Life a Life, and makes nothing else one', async () => {
    const env = await deskEnv();
    const id = await makeLife(env);
    expect((await req(env, 'PATCH', `/api/items/${id}`, { type: 'essay' })).status).toBe(409);
    expect((await req(env, 'PATCH', `/api/items/it_jevons`, { type: 'life' })).status).toBe(409);
    expect((await req(env, 'POST', `/api/items/${id}/refetch`)).status).toBe(409);
    expect((await req(env, 'GET', `/api/items/it_jevons/life`)).status).toBe(409);
  });
});
