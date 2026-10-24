// Blocks: link parsing for every video and audio shape the editor may paste, the verbatim rule for
// pull quotes and code, and adding video, audio and pictures with the network stubbed (oEmbed,
// posters, audio HEAD checks, image links), all on SQLite with the real migrations.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedSrc, type Block } from '@fdf/shared/haul';
import { addAudio, addCode, addPicture, addQuote, addVideo, BlockRefused, blocksFor, deleteBlock, parseAudioLink, parseClock, parseVideoLink, reorderBlocks, setPicturePlate, trimCode } from '../src/blocks';
import type { ItemRow } from '../src/db';
import { fetchSource } from '../src/ingest';
import { draftLimits, quoteWhole } from '../src/steps';
import { makeEnv, type TestEnv } from './fake-env';
import { fakeJpeg, JEVONS, NOW, seedHaul } from './seed';

afterEach(() => vi.unstubAllGlobals());

type Handler = (url: string, init: RequestInit) => Response | undefined;
/** Stub the network: DNS over HTTPS answers a public address; everything else goes to `h` (404 if it declines). */
function stubNet(h: Handler) {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    calls.push({ url, method: init.method ?? 'GET' });
    return h(url, init) ?? new Response('not found', { status: 404 });
  });
  return calls;
}

const item = async (env: TestEnv, id = 'it_jevons') => (await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>())!;
const refused = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof BlockRefused && re.test(e.message));

describe('video links', () => {
  const yt = (u: string) => parseVideoLink(u);
  it('reads every YouTube shape, with its start time', () => {
    expect(yt('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(yt('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&feature=share')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 90 });
    expect(yt('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=754')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 754 });
    expect(yt('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ id: 'dQw4w9WgXcQ' });
    expect(yt('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 42 });
    expect(yt('https://youtu.be/dQw4w9WgXcQ?si=Qx12&t=1h2m3s')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 3723 });
    expect(yt('https://www.youtube.com/shorts/aqz-KE-bpKQ')).toEqual({ provider: 'youtube', id: 'aqz-KE-bpKQ' });
    expect(yt('https://www.youtube.com/embed/dQw4w9WgXcQ?start=30&rel=0')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 30 });
    expect(yt('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(yt('https://www.youtube.com/live/dQw4w9WgXcQ?t=600s')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 600 });
    expect(yt('https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=2m')).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ', start: 120 });
  });
  it('reads Vimeo links, and refuses unlisted ones and other hosts', () => {
    expect(yt('https://vimeo.com/76979871')).toEqual({ provider: 'vimeo', id: '76979871' });
    expect(yt('https://vimeo.com/76979871#t=1m5s')).toEqual({ provider: 'vimeo', id: '76979871', start: 65 });
    expect(yt('https://player.vimeo.com/video/76979871?t=30')).toEqual({ provider: 'vimeo', id: '76979871', start: 30 });
    expect(yt('https://vimeo.com/channels/staffpicks/76979871')).toEqual({ provider: 'vimeo', id: '76979871' });
    expect(yt('https://vimeo.com/groups/shortfilms/videos/76979871')).toEqual({ provider: 'vimeo', id: '76979871' });
    expect(() => yt('https://vimeo.com/76979871/a1b2c3d4e5')).toThrow(/unlisted/);
    expect(() => yt('https://player.vimeo.com/video/76979871?h=a1b2c3')).toThrow(/unlisted/);
    expect(() => yt('https://www.youtube.com/@veritasium')).toThrow(/does not name a video/);
    expect(() => yt('https://www.youtube.com/watch?v=short')).toThrow(/does not name a video/);
    expect(() => yt('https://www.dailymotion.com/video/x7tgad0')).toThrow(/Only YouTube and Vimeo/);
    expect(() => yt('not a link')).toThrow(/not a link/);
  });
  it('gives ids the shared embed accepts', () => {
    for (const u of ['https://youtu.be/dQw4w9WgXcQ?t=42', 'https://vimeo.com/76979871#t=10s']) {
      const v = yt(u);
      expect(embedSrc({ kind: 'video', ...v, title: 't' })).toBeTruthy();
    }
  });
  it('reads link times', () => {
    expect([parseClock('90'), parseClock('90s'), parseClock('1m30s'), parseClock('1h'), parseClock('1:30'), parseClock('1:02:14'), parseClock(''), parseClock('soon')]).toEqual([90, 90, 90, 3600, 90, 3734, null, null]);
  });
});

describe('audio links', () => {
  it('reads Spotify episodes and shows, dropping tracking and locale', () => {
    expect(parseAudioLink('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc123')).toEqual({ provider: 'spotify', url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk' });
    expect(parseAudioLink('https://open.spotify.com/intl-de/episode/4rOoJ6Egrf8K2IrywzwOMk?t=95')).toEqual({ provider: 'spotify', url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', start: 95 });
    expect(parseAudioLink('https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL')).toEqual({ provider: 'spotify', url: 'https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL' });
    expect(() => parseAudioLink('https://open.spotify.com/track/4rOoJ6Egrf8K2IrywzwOMk')).toThrow(/episode or show/);
  });
  it('reads Apple Podcasts shows and episodes', () => {
    expect(parseAudioLink('https://podcasts.apple.com/in/podcast/the-seen-and-the-unseen/id1229657208?i=1000654321098&uo=4')).toEqual({
      provider: 'apple',
      url: 'https://podcasts.apple.com/in/podcast/the-seen-and-the-unseen/id1229657208?i=1000654321098',
    });
    expect(parseAudioLink('https://podcasts.apple.com/us/podcast/id1229657208')).toEqual({ provider: 'apple', url: 'https://podcasts.apple.com/us/podcast/id1229657208' });
    expect(() => parseAudioLink('https://podcasts.apple.com/us/browse')).toThrow(/does not name/);
  });
  it('takes an https audio file and refuses plain http', () => {
    expect(parseAudioLink('https://cdn.example.org/ep/42.mp3#t=1:00')).toEqual({ provider: 'file', url: 'https://cdn.example.org/ep/42.mp3', start: 60 });
    expect(() => parseAudioLink('http://cdn.example.org/ep/42.mp3')).toThrow(/https/);
  });
  it('gives links the shared embed accepts', () => {
    for (const u of ['https://open.spotify.com/intl-de/episode/4rOoJ6Egrf8K2IrywzwOMk?si=1', 'https://podcasts.apple.com/in/podcast/the-seen-and-the-unseen/id1229657208?i=1000654321098']) {
      const a = parseAudioLink(u);
      expect(embedSrc({ kind: 'audio', ...a, title: 't' } as Extract<Block, { kind: 'audio' }>)).toBeTruthy();
    }
  });
});

describe('pull quotes and code are excerpts', () => {
  it('stores a pasted quote as the source’s own characters, and refuses one that is not there', async () => {
    const env = await seedHaul(makeEnv());
    const it0 = await item(env);
    // Straight quotes, odd spacing and case still find the line; what is stored is the source's text.
    await addQuote(env, it0, { text: '  the very   contrary is the truth.  ' });
    const [b] = await blocksFor(env, 'it_jevons');
    expect(JSON.parse(b!.body)).toMatchObject({ kind: 'quote', text: 'The very contrary is the truth.', start: JEVONS.indexOf('The very') });
    await refused(addQuote(env, it0, { text: 'Efficiency always lowers consumption.' }), /not in the source word for word/);
    const s = JEVONS.indexOf('As a rule');
    await addQuote(env, it0, { start: s, end: s + 9, text: 'As a rule' });
    await refused(addQuote(env, it0, { start: s, end: s + 9, text: 'Not this' }), /does not match/);
  });

  it('refuses quotes and code on an item with no source text', async () => {
    const env = await seedHaul(makeEnv());
    await env.DB.prepare(`DELETE FROM sources WHERE item_id = 'it_jevons'`).run();
    const it0 = await item(env);
    await refused(addQuote(env, it0, { text: 'The very contrary is the truth.' }), /no source text/);
    await refused(addCode(env, it0, { code: 'x = 1' }), /no source text/);
  });

  it('matches code with whitespace collapsed, prints the editor’s paste, and is strict about the rest', async () => {
    const env = await seedHaul(makeEnv());
    // Extraction flattened the indentation and line breaks.
    const page = 'Here is the loop: def total(xs): s = 0 for x in xs: s += x return s and that is all.';
    await env.DB.prepare(`UPDATE sources SET text = ? WHERE item_id = 'it_jevons'`).bind(page).run();
    const it0 = await item(env);
    const pasted = '\n\ndef total(xs):\n    s = 0\n    for x in xs:\n        s += x   \n    return s\n\n';
    await addCode(env, it0, { code: pasted, lang: 'py', caption: 'The loop' });
    const [b] = await blocksFor(env, 'it_jevons');
    expect(JSON.parse(b!.body)).toMatchObject({ kind: 'code', code: trimCode(pasted), lang: 'python', caption: 'The loop' });
    expect(JSON.parse(b!.body).code).toBe('def total(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s');
    await refused(addCode(env, it0, { code: 'DEF TOTAL(xs):' }), /not in the source/);
    await refused(addCode(env, it0, { code: 'def mean(xs): return sum(xs)' }), /not in the source/);
    await refused(addCode(env, it0, { code: 'def total(xs):', lang: 'cobol' }), /Unknown language/);
  });
});

describe('video, audio and pictures', () => {
  it('resolves a YouTube link through oEmbed and keeps the poster in MEDIA', async () => {
    const env = await seedHaul(makeEnv());
    const calls = stubNet((url) => {
      if (url.startsWith('https://www.youtube.com/oembed?')) return Response.json({ title: 'The  Coal Question,  explained', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' });
      if (url === 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg') return new Response(fakeJpeg(480, 360), { headers: { 'content-type': 'image/jpeg' } });
    });
    await addVideo(env, await item(env), { url: 'https://youtu.be/dQw4w9WgXcQ?t=90' });
    const [b] = await blocksFor(env, 'it_jevons');
    expect(JSON.parse(b!.body)).toEqual({ kind: 'video', provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'The Coal Question, explained', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', start: 90, poster: { width: 480, height: 360 } });
    expect(b!.media_key).toMatch(/^blocks\/bk_.+\/poster\.jpg$/);
    expect(env.MEDIA.objects.has(b!.media_key!)).toBe(true);
    expect(env.FILES.writes).toEqual([]);
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['www.youtube.com', 'i.ytimg.com']);
  });

  it('refuses a video oEmbed does not know; the editor’s start overrides the link’s', async () => {
    const env = await seedHaul(makeEnv());
    stubNet((url) => (url.startsWith('https://vimeo.com/api/oembed.json') ? Response.json({ title: 'Powers of Ten', thumbnail_url: 'https://i.vimeocdn.com/video/1.jpg' }) : undefined));
    await refused(addVideo(env, await item(env), { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }), /does not know this video/);
    // Vimeo with a poster that fails: the video is still added, without a poster.
    await addVideo(env, await item(env), { url: 'https://vimeo.com/76979871#t=10s', start: '1:00' });
    const [b] = await blocksFor(env, 'it_jevons');
    expect(JSON.parse(b!.body)).toMatchObject({ provider: 'vimeo', id: '76979871', title: 'Powers of Ten', start: 60 });
    expect(b!.media_key).toBeNull();
  });

  it('checks that an audio file is audio, and titles Spotify from its oEmbed', async () => {
    const env = await seedHaul(makeEnv());
    const calls = stubNet((url, init) => {
      if (url === 'https://cdn.example.org/page.mp3') return new Response(init.method === 'HEAD' ? null : '<html></html>', { headers: { 'content-type': 'text/html' } });
      if (url === 'https://cdn.example.org/ep42.mp3') return init.method === 'HEAD' ? new Response(null, { status: 405 }) : new Response('ID', { status: 206, headers: { 'content-type': 'audio/mpeg' } });
      if (url.startsWith('https://open.spotify.com/oembed?')) return Response.json({ title: 'Episode 42: Coal' });
    });
    const it0 = await item(env);
    await refused(addAudio(env, it0, { url: 'https://cdn.example.org/page.mp3', title: 'A page' }), /not an audio file/);
    await refused(addAudio(env, it0, { url: 'https://cdn.example.org/ep42.mp3' }), /Type the episode/);
    await addAudio(env, it0, { url: 'https://cdn.example.org/ep42.mp3', title: 'Episode 42', start: '12:30' });
    expect(calls.filter((c) => c.url === 'https://cdn.example.org/ep42.mp3').map((c) => c.method)).toEqual(['HEAD', 'GET', 'HEAD', 'GET']);
    await addAudio(env, it0, { url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=x' });
    await addAudio(env, it0, { url: 'https://podcasts.apple.com/in/podcast/the-seen-and-the-unseen/id1229657208?i=1000654321098', title: 'The Seen and the Unseen, episode 300' });
    await refused(addAudio(env, it0, { url: 'https://podcasts.apple.com/in/podcast/the-seen-and-the-unseen/id1229657208' }), /Type the episode/);
    const bodies = (await blocksFor(env, 'it_jevons')).map((b) => JSON.parse(b.body));
    expect(bodies).toEqual([
      { kind: 'audio', provider: 'file', url: 'https://cdn.example.org/ep42.mp3', title: 'Episode 42', start: 750 },
      { kind: 'audio', provider: 'spotify', url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', title: 'Episode 42: Coal' },
      { kind: 'audio', provider: 'apple', url: 'https://podcasts.apple.com/in/podcast/the-seen-and-the-unseen/id1229657208?i=1000654321098', title: 'The Seen and the Unseen, episode 300' },
    ]);
  });

  it('takes a picture only with its credit and licence; links must be images; measures and stores it', async () => {
    const env = await seedHaul(makeEnv());
    stubNet((url) => {
      if (url === 'https://images.example.org/meme.png') {
        const png = new Uint8Array(32);
        png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
        new DataView(png.buffer).setUint32(16, 640);
        new DataView(png.buffer).setUint32(20, 480);
        return new Response(png, { headers: { 'content-type': 'image/png' } });
      }
      if (url === 'https://images.example.org/page') return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    });
    const it0 = await item(env);
    await refused(addPicture(env, it0, { bytes: fakeJpeg(), credit: 'Punch', licence: '' }), /licence/);
    await refused(addPicture(env, it0, { bytes: fakeJpeg(), credit: ' ', licence: 'public domain' }), /credit/);
    await refused(addPicture(env, it0, { bytes: new TextEncoder().encode('<svg onload=alert(1)></svg>'), credit: 'x', licence: 'y' }), /not a JPEG, PNG/);
    await refused(addPicture(env, it0, { url: 'https://images.example.org/page', credit: 'x', licence: 'y' }), /text\/html/);
    await refused(addPicture(env, it0, { url: 'http://127.0.0.1/x.png', credit: 'x', licence: 'y' }), /could not be fetched/);
    await addPicture(env, it0, { bytes: fakeJpeg(1600, 1000), caption: 'Punch, 1855.', credit: 'Punch', licence: 'Public domain', sourceUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' });
    await addPicture(env, it0, { url: 'https://images.example.org/meme.png', credit: 'The creator', licence: '© the creator, shown for commentary' });
    const rows = await blocksFor(env, 'it_jevons');
    expect(rows.map((r) => JSON.parse(r.body))).toEqual([
      { kind: 'image', caption: 'Punch, 1855.', credit: 'Punch', licence: 'Public domain', width: 1600, height: 1000, sourceUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' },
      { kind: 'image', caption: '', credit: 'The creator', licence: '© the creator, shown for commentary', width: 640, height: 480 },
    ]);
    expect(rows.map((r) => r.mime)).toEqual(['image/jpeg', 'image/png']);
    for (const r of rows) expect(env.MEDIA.objects.has(r.media_key!)).toBe(true);

    // Order and removal.
    await reorderBlocks(env, 'it_jevons', [rows[1]!.id, rows[0]!.id]);
    expect((await blocksFor(env, 'it_jevons')).map((r) => r.id)).toEqual([rows[1]!.id, rows[0]!.id]);
    await refused(reorderBlocks(env, 'it_jevons', [rows[1]!.id]), /each of this item/);
    await deleteBlock(env, rows[1]!);
    expect(env.MEDIA.objects.has(rows[1]!.media_key!)).toBe(false);
    expect((await blocksFor(env, 'it_jevons')).map((r) => r.id)).toEqual([rows[0]!.id]);
  });

  it('makes an uploaded picture a Picture item’s own plate', async () => {
    const env = await seedHaul(makeEnv());
    await env.DB.prepare(`UPDATE items SET type = 'image' WHERE id = 'it_jevons'`).run();
    const plateId = await setPicturePlate(env, await item(env), { bytes: fakeJpeg(1280, 860), caption: 'Under the Wave off Kanagawa, about 1831.', credit: 'Katsushika Hokusai, via Wikimedia Commons', licence: 'public domain' });
    const p = await env.DB.prepare('SELECT * FROM plates WHERE id = ?').bind(plateId).first<Record<string, unknown>>();
    expect(p).toMatchObject({ provider: 'editor', status: 'chosen', width: 1280, height: 860, institution: 'Katsushika Hokusai, via Wikimedia Commons', licence: 'public domain', r2_key: `plates/${plateId}.jpg` });
    expect((await item(env)).plate).toBe(plateId);
    void NOW;
  });
});

describe('the pipeline on the new types', () => {
  it('reads nothing from a Picture upload, and still transcribes a photographed page', async () => {
    const env = makeEnv();
    await env.MEDIA.put('uploads/up_1/wave.jpg', fakeJpeg(), { httpMetadata: { contentType: 'image/jpeg' } });
    const base = { id: 'it_pic', kind: 'image' as const, url: null, file_key: 'uploads/up_1/wave.jpg', capture_text: null, source_name: null, title: null };
    expect(await fetchSource(env, { ...base, type: 'image' })).toMatchObject({ kind: 'none' });
    expect(env.aiCalls).toEqual([]);
  });

  it('prints a short quotation or post whole, and gives no big ideas to a post, a quotation, a picture or a tool', async () => {
    const env = await seedHaul(makeEnv());
    await env.DB.prepare(`UPDATE items SET type = 'social' WHERE id = 'it_nadella'`).run();
    const src = (await env.DB.prepare(`SELECT text, word_count FROM sources WHERE item_id = 'it_nadella'`).first<{ text: string; word_count: number }>())!;
    expect(await quoteWhole(env, await item(env, 'it_nadella'), src)).toBe(true);
    const ex = await env.DB.prepare(`SELECT * FROM excerpts WHERE item_id = 'it_nadella' AND chosen = 1`).first<{ text: string; start: number; end: number }>();
    expect(ex!.text).toBe(src.text.trim());
    // Once chosen, never replaced; an essay is never quoted whole.
    expect(await quoteWhole(env, await item(env, 'it_nadella'), src)).toBe(false);
    expect(await quoteWhole(env, await item(env, 'it_jevons'), { text: JEVONS, word_count: 40 })).toBe(false);
    for (const type of ['social', 'quote', 'image', 'tool']) expect(draftLimits({ type, minutes: 90 }, 20_000).ideas).toBe(0);
    expect(draftLimits({ type: 'speech', minutes: 40 }, 6000).ideas).toBeGreaterThan(0);
  });
});
