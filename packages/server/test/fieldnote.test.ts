// The field note's body end to end on a real SQLite D1: the editor's marks become headings, links,
// italics and quotations; a lone YouTube link is resolved by code into a video with its poster kept
// in MEDIA and copied next to the bundle; a link that cannot be resolved stops the publish; a link
// taken out of the note drops its poster.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assembleHaul } from '../src/publish';
import { fieldNoteForBundle, resolveFieldNoteEmbeds, type FieldNoteEmbeds } from '../src/fieldnote';
import { makeEnv, type TestEnv } from './fake-env';
import { fakeJpeg, seedHaul } from './seed';

const NOTE = `## Where we come from

As I write this, I'm reminded of King's [*Letter from Birmingham Jail*](https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html).

> Injustice anywhere is a threat to justice everywhere.

https://www.youtube.com/watch?v=HKhxfpOFFL0&t=1555s

https://x.com/nobody/status/1234567890

https://www.bbc.com/news/world-asia-india-34265882`;

function stubNetwork() {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    if (url.startsWith('https://www.youtube.com/oembed?')) return Response.json({ title: 'Margaret MacMillan on the uses of history' });
    if (url.startsWith('https://i.ytimg.com/vi/')) return new Response(fakeJpeg(480, 360), { headers: { 'content-type': 'image/jpeg' } });
    return new Response('nope', { status: 404 });
  });
}

async function saveNote(env: TestEnv, text: string) {
  const row = (await env.DB.prepare('SELECT fn_embeds FROM hauls WHERE id = ?').bind('hl_1').first<{ fn_embeds: string }>())!;
  const embeds = await resolveFieldNoteEmbeds(env, 'hl_1', text, JSON.parse(row.fn_embeds) as FieldNoteEmbeds);
  await env.DB.prepare('UPDATE hauls SET fn_body = ?, fn_embeds = ? WHERE id = ?').bind(text, JSON.stringify(embeds), 'hl_1').run();
  return embeds;
}

describe('the field note body', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves lone links by code, sets out the editor’s marks, and refuses a link it could not resolve', async () => {
    const env = await seedHaul(makeEnv());
    stubNetwork();
    const embeds = await saveNote(env, NOTE);
    const video = embeds['https://www.youtube.com/watch?v=HKhxfpOFFL0&t=1555s']!;
    expect(video.block).toMatchObject({ kind: 'video', provider: 'youtube', id: 'HKhxfpOFFL0', title: 'Margaret MacMillan on the uses of history', start: 1555 });
    expect(video.media_key).toMatch(/^fieldnote\/hl_1\/.+\.jpg$/);
    expect(await env.MEDIA.get(video.media_key!)).toBeTruthy();
    expect(embeds['https://x.com/nobody/status/1234567890']).toMatchObject({ error: expect.stringMatching(/X does not show this post/) });
    // An ordinary page is a link, not an embed, and is never fetched.
    expect(Object.keys(embeds)).toHaveLength(2);

    const a = await assembleHaul(env, 'hl_1');
    expect(a.problems.map((p) => p.message)).toContain("the field note's link https://x.com/nobody/status/1234567890 is not set as an embed: X does not show this post publicly (it may be private, deleted or from a protected account).");
    const fn = a.haul.fieldNote;
    expect(fn.body?.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'quotation', 'video', 'paragraph']);
    expect(fn.body![1]).toEqual({
      kind: 'paragraph',
      runs: [{ text: "As I write this, I'm reminded of King's " }, { text: 'Letter from Birmingham Jail', url: 'https://www.africa.upenn.edu/Articles_Gen/Letter_Birmingham.html', em: true }, { text: '.' }],
    });
    expect(fn.paragraphs).toEqual([
      'Where we come from',
      "As I write this, I'm reminded of King's Letter from Birmingham Jail.",
      'Injustice anywhere is a threat to justice everywhere.',
      'https://www.bbc.com/news/world-asia-india-34265882',
    ]);
    const poster = (fn.body![3] as { poster?: { url: string } }).poster!;
    expect(poster.url).toBe(`${env.FILES_BASE}/hauls/001/media/field-note-1-poster.jpg`);
    expect(a.copies).toContainEqual([video.media_key, 'hauls/001/media/field-note-1-poster.jpg']);
    expect(a.bundleErrors.filter((e) => e.path.startsWith('fieldNote'))).toEqual([]);

    // The editor takes the post out: the publish is clear, and a dropped video loses its poster.
    await saveNote(env, NOTE.replace('https://x.com/nobody/status/1234567890\n\n', ''));
    expect((await assembleHaul(env, 'hl_1')).problems.filter((p) => p.message.includes('field note'))).toEqual([]);
    await saveNote(env, 'Only words now.');
    expect(await env.MEDIA.get(video.media_key!)).toBeNull();
  });

  it('keeps a plain note plain', () => {
    const r = fieldNoteForBundle('One paragraph.\n\nAnd a second,\nover two lines.', {}, 'hauls/001/media/field-note', 'https://files.example');
    expect(r).toEqual({ paragraphs: ['One paragraph.', 'And a second, over two lines.'], copies: [], problems: [] });
  });
});
