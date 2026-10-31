// Publish end to end on a real SQLite D1 with the real migrations: plates, a cover, voice notes with
// their formats, a Rhyme, a kept connection and an approved Thread all land in the bundle; the bundle
// validates; and the two buckets stay apart (FILES gets only hauls/, MEDIA never gets hauls/).

import { describe, expect, it } from 'vitest';
import { validateHaul } from '@fdf/shared/validate';
import type { Haul, HaulIndex } from '@fdf/shared/haul';
import { publishHaul, assembleHaul, assembleShelf, publishShelf } from '../src/publish';
import { addBookLine, addBookNote, createBook, deleteBook, linkItemToBook, patchBook, setBookCover } from '../src/shelf';
import { SHELF_PATH, validateShelf, type Shelf } from '@fdf/shared/shelf';
import { approveSuggestion } from '../src/connect';
import { setEndQuote, setEndSource, createRhyme, patchRhyme } from '../src/rhymes';
import { addAudio, addCode, addPicture, addQuote, addVideo, blocksFor, reorderBlocks, setPicturePlate } from '../src/blocks';
import type { ItemRow } from '../src/db';
import { highlightCode } from '@fdf/shared/highlight';
import { afterEach, vi } from 'vitest';
import { makeEnv, type TestEnv } from './fake-env';
import { fakeJpeg, JEVONS, NADELLA, NOW, seedHaul } from './seed';

async function seedPlate(env: TestEnv, id: string, target: { item?: string; haul?: string }) {
  await env.MEDIA.put(`plates/${id}.jpg`, fakeJpeg(), { httpMetadata: { contentType: 'image/jpeg' } });
  await env.DB.prepare(
    `INSERT INTO plates (id, item_id, haul_id, provider, provider_id, query, title, creator, date, institution, licence, source_url, image_url, width, height, caption, status, r2_key, mime, created_at)
     VALUES (?, ?, ?, 'commons', ?, 'q', 'Faraday giving his card to Father Thames', 'Punch', '1855', 'Wikimedia Commons', 'Public domain', 'https://commons.wikimedia.org/wiki/File:FaradayFatherThames.jpg', 'https://upload.wikimedia.org/x.jpg', 1200, 800, 'Faraday giving his card to Father Thames. Punch, 1855.', 'chosen', ?, 'image/jpeg', ?)`,
  )
    .bind(id, target.item ?? null, target.haul ?? null, id, `plates/${id}.jpg`, NOW)
    .run();
  if (target.item) await env.DB.prepare('UPDATE items SET plate = ? WHERE id = ?').bind(id, target.item).run();
  if (target.haul) await env.DB.prepare('UPDATE hauls SET cover_plate = ? WHERE id = ?').bind(id, target.haul).run();
}

async function seedNote(env: TestEnv, id: string, format: string, mime: string) {
  await env.MEDIA.put(`notes/${id}.${format}`, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: mime } });
  await env.DB.prepare(`INSERT INTO notes (id, target, audio_key, mime, format, seconds, created_at) VALUES (?, 'why', ?, ?, ?, 12, ?)`).bind(id, `notes/${id}.${format}`, mime, format, NOW).run();
}

describe('publish writes only hauls/ to the public bucket', () => {
  it('assembles plates, cover, audio formats, a rhyme, a kept connection and a thread, and keeps the buckets apart', async () => {
    const env = await seedHaul(makeEnv());
    await seedPlate(env, 'pl_item', { item: 'it_jevons' });
    await seedPlate(env, 'pl_cover', { haul: 'hl_1' });
    await seedNote(env, 'vn_why', 'm4a', 'audio/mp4');
    await seedNote(env, 'vn_fn', 'webm', 'audio/webm');
    await env.DB.prepare(`UPDATE items SET why_note_id = 'vn_why', why_audio = 1 WHERE id = 'it_jevons'`).run();
    await env.DB.prepare(`UPDATE hauls SET fn_note_id = 'vn_fn' WHERE id = 'hl_1'`).run();

    // A Rhyme whose two quotes are selected from the two sources.
    const rid = await createRhyme(env, { thenItemId: 'it_jevons', nowItemId: 'it_nadella' });
    await setEndQuote(env, rid, 'then', { quote: 'The very contrary is the truth.' });
    const s = NADELLA.indexOf('Jevons paradox strikes again!');
    await setEndQuote(env, rid, 'now', { start: s, end: s + 'Jevons paradox strikes again!'.length, text: 'Jevons paradox strikes again!' });
    await patchRhyme(env, rid, { bridge: 'Jevons argued in 1865 that cheaper coal power would raise coal use. In 2025 Satya Nadella made the same argument about cheaper AI models.' });
    await env.DB.prepare(`UPDATE items SET why_text = 'The same goes for words.' WHERE id = ?`).bind(rid).run();
    for (const name of ['links', 'why']) await env.DB.prepare(`INSERT OR REPLACE INTO checks (item_id, name, status, detail, at) VALUES (?, ?, 'pass', '{}', ?)`).bind(rid, name, NOW).run();

    // A machine-suggested connection the editor kept with their own note.
    await env.DB.prepare(
      `INSERT INTO suggestions (id, from_item_id, to_item_id, type, note, from_quote, from_start, from_end, to_quote, to_start, to_end, confidence, created_at, updated_at)
       VALUES ('sg_1', 'it_nadella', 'it_jevons', 'Rhymes with', 'Nadella repeats the argument Jevons made about coal.', ?, ?, ?, ?, ?, ?, 0.9, ?, ?)`,
    )
      .bind('Jevons paradox strikes again!', s, s + 29, 'The very contrary is the truth.', JEVONS.indexOf('The very'), JEVONS.indexOf('The very') + 31, NOW, NOW)
      .run();
    await expect(approveSuggestion(env, 'sg_1', '  ')).rejects.toThrow(/own words/);
    await approveSuggestion(env, 'sg_1', 'The same sentence, 160 years apart.');
    // An approved thread over three pieces, one of them outside this Haul.
    await env.DB.prepare(
      `INSERT INTO threads (id, slug, title_text, title_italic, summary, points, item_ids, status, created_at, updated_at)
       VALUES ('th_1', 'price-of-plenty', 'The price', 'of plenty', 'Cheaper means more, again and again.', ?, '[]', 'approved', ?, ?)`,
    )
      .bind(
        JSON.stringify([
          { itemId: 'it_jevons', year: '1865', gist: 'Efficient engines burn more coal.', edge: 'Rhymes with' },
          { itemId: 'it_bush', year: '1945', gist: 'Too much to read.', edge: '' },
          { itemId: 'it_nadella', year: '2025', gist: 'The argument returns for AI.', edge: 'Rhymes with' },
        ]),
        NOW,
        NOW,
      )
      .run();

    await env.DB.batch(['it_jevons', 'it_nadella', rid].map((id, i) => env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind('hl_1', id, i)));

    const r = await publishHaul(env, 'hl_1');
    expect(r.problems).toEqual([]);
    expect(r.bundleErrors).toEqual([]);
    expect(r.ok).toBe(true);

    // Buckets: FILES only hauls/, MEDIA never hauls/.
    expect(env.FILES.writes.length).toBeGreaterThan(3);
    for (const k of env.FILES.writes) expect(k.startsWith('hauls/')).toBe(true);
    for (const k of env.MEDIA.writes) expect(k.startsWith('hauls/')).toBe(false);
    expect(await env.MEDIA.head('hauls/001/v1/haul.json')).toBeNull();

    const haul = (await (await env.FILES.get('hauls/001/v1/haul.json'))!.json()) as Haul;
    const index = (await (await env.FILES.get('hauls/index.json'))!.json()) as HaulIndex;
    expect(validateHaul(haul, index, { filesBase: env.FILES_BASE }).errors).toEqual([]);
    // Nothing in the bundle hotlinks an archive: a plate URL elsewhere fails the hosted rule.
    const hotlinked = structuredClone(haul);
    hotlinked.items.find((i) => i.plate)!.plate!.url = 'https://upload.wikimedia.org/wikipedia/commons/x.jpg';
    hotlinked.fieldNote.audio!.url = 'https://cdn.example.org/a.webm';
    const bad = validateHaul(hotlinked, index, { filesBase: env.FILES_BASE }).errors.filter((e) => e.rule === 'hosted').map((e) => e.path);
    expect(bad).toEqual(['fieldNote.audio.url', expect.stringMatching(/^items\[\d\]\.plate\.url$/)]);
    expect(validateHaul(hotlinked, index).errors.filter((e) => e.rule === 'hosted')).toEqual([]);

    const jev = haul.items.find((i) => i.title.text === 'The Coal Question')!;
    expect(jev.plate).toMatchObject({ url: 'https://files.example.org/hauls/001/plates/the-coal-question.jpg', width: 1200, height: 800, credit: 'Wikimedia Commons', licence: 'Public domain' });
    expect(jev.plate!.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    expect(env.FILES.objects.has('hauls/001/plates/the-coal-question.jpg')).toBe(true);
    expect(haul.cover?.url).toBe('https://files.example.org/hauls/001/plates/cover.jpg');
    expect(jev.why.audio).toMatchObject({ format: 'm4a', url: 'https://files.example.org/hauls/001/audio/the-coal-question-why.m4a' });
    expect(haul.fieldNote.audio?.format).toBe('webm');
    expect(r.warnings.some((w) => w.rule === 'audio-format' && /Android only/.test(w.message))).toBe(true);

    const rhyme = haul.items.find((i) => i.type === 'rhymes')!;
    expect(rhyme.rhyme).toMatchObject({ then: { year: '1865', quote: 'The very contrary is the truth.' }, now: { year: '2025', quote: 'Jevons paradox strikes again!' } });

    const nad = haul.items.find((i) => i.title.text === 'Jevons paradox strikes again')!;
    expect(nad.connections).toEqual([{ type: 'Rhymes with', title: 'The Coal Question', note: 'The same sentence, 160 years apart.', itemId: 'the-coal-question' }]);

    expect(haul.threads).toHaveLength(1);
    const th = haul.threads[0]!;
    expect(th.id).toBe('price-of-plenty');
    expect(th.points.map((p) => [p.year, p.inHaul, p.itemId ?? null])).toEqual([
      ['1865', true, 'the-coal-question'],
      ['1945', false, null],
      ['2025', true, 'jevons-paradox-strikes-again'],
    ]);
    expect(th.provenance).toMatch(/proposed 1 link .*kept 1/);
  });

  it('refuses a rhyme whose quote no longer matches its source, and a missing plate file', async () => {
    const env = await seedHaul(makeEnv());
    const rid = await createRhyme(env);
    await setEndSource(env, rid, 'then', 'it_jevons');
    await setEndQuote(env, rid, 'then', { quote: 'The very contrary is the truth.' });
    await env.DB.prepare(`UPDATE sources SET text = 'Something else entirely, for this test.' WHERE item_id = 'it_jevons'`).run();
    await env.DB.prepare(`UPDATE items SET plate = 'pl_gone' WHERE id = 'it_nadella'`).run();
    await env.DB.batch([rid, 'it_nadella'].map((id, i) => env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind('hl_1', id, i)));
    const a = await assembleHaul(env, 'hl_1');
    const msgs = a.problems.map((p) => p.message).join(' | ');
    expect(msgs).toMatch(/"then" quote is not matched word for word/);
    expect(msgs).toMatch(/"now" quote is not matched/);
    expect(msgs).toMatch(/needs a bridge/);
    expect(msgs).toMatch(/chosen plate is missing/);
    const r = await publishHaul(env, 'hl_1');
    expect(r.ok).toBe(false);
    expect(env.FILES.writes).toEqual([]);
  });

  it('rejects a pasted rhyme quote that is not in the source', async () => {
    const env = await seedHaul(makeEnv());
    const rid = await createRhyme(env, { thenItemId: 'it_jevons' });
    await expect(setEndQuote(env, rid, 'then', { quote: 'Efficiency always lowers consumption.' })).rejects.toThrow(/word for word/);
    await expect(setEndQuote(env, rid, 'then', { start: 0, end: 10, text: 'Not this at all' })).rejects.toThrow(/word for word/);
    await expect(patchRhyme(env, rid, { bridge: "It's not about coal, it's about compute." })).rejects.toThrow(/house style/);
  });
});

describe('blocks, new fields and the edition', () => {
  afterEach(() => vi.unstubAllGlobals());
  const row = async (env: TestEnv, id: string) => (await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>())!;

  it('writes blocks in order with code tokens and FILES copies, a Picture’s own plate, year, handle, recipient, place and the edition', async () => {
    const env = await seedHaul(makeEnv());
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
      if (url.startsWith('https://www.youtube.com/oembed?')) return Response.json({ title: 'Jevons in ten minutes' });
      if (url.startsWith('https://i.ytimg.com/vi/')) return new Response(fakeJpeg(480, 360), { headers: { 'content-type': 'image/jpeg' } });
      return new Response('nope', { status: 404 });
    });
    const code = 'def burn(coal):\n    return coal * 2';
    await env.DB.prepare(`UPDATE sources SET text = ? WHERE item_id = 'it_jevons'`).bind(`${JEVONS} In code: def burn(coal): return coal * 2`).run();
    const jev = await row(env, 'it_jevons');
    await addQuote(env, jev, { text: 'The very contrary is the truth.' });
    await addCode(env, jev, { code, lang: 'python' });
    await addVideo(env, jev, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m' });
    await addAudio(env, jev, { url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', title: 'The Coal Question, read aloud' });
    await addPicture(env, jev, { bytes: fakeJpeg(900, 600), caption: 'A colliery, 1860s.', creator: 'A maker', credit: 'Science Museum Group', licence: 'CC BY-NC-SA 4.0', sourceUrl: 'https://collection.sciencemuseumgroup.org.uk/objects/co1' });
    // A cut block stays on the Desk and never prints.
    await addQuote(env, jev, { text: 'As a rule, new modes of economy will lead to an increase of consumption.' });
    const ids = (await blocksFor(env, 'it_jevons')).map((b) => b.id);
    await env.DB.prepare(`UPDATE blocks SET status = 'cut' WHERE id = ?`).bind(ids[5]).run();
    // The editor moves the video to the top.
    await reorderBlocks(env, 'it_jevons', [ids[2]!, ids[0]!, ids[1]!, ids[3]!, ids[4]!, ids[5]!]);
    await env.DB.prepare(`UPDATE items SET type = 'letter', year = 1865, recipient = 'John Herschel', place = 'Manchester' WHERE id = 'it_jevons'`).run();

    // A post on X, and a Picture whose picture is its plate.
    await env.DB.prepare(`UPDATE items SET type = 'social', handle = '@satyanadella' WHERE id = 'it_nadella'`).run();
    await env.DB.prepare(`UPDATE items SET type = 'image', archived = 0 WHERE id = 'it_bush'`).run();
    await env.DB.prepare(`UPDATE hauls SET edition = 'plum' WHERE id = 'hl_1'`).run();
    await env.DB.batch(['it_jevons', 'it_nadella', 'it_bush'].map((id, i) => env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind('hl_1', id, i)));

    // Without its picture, a Picture cannot publish.
    expect((await assembleHaul(env, 'hl_1')).problems.map((p) => p.message)).toEqual([expect.stringMatching(/Picture needs its picture/)]);
    await setPicturePlate(env, await row(env, 'it_bush'), { bytes: fakeJpeg(1280, 860), caption: 'A memex, drawn for Life, 1945.', creator: 'A maker', sourceUrl: 'https://example.org/found', credit: 'Life magazine', licence: '© Time Inc., shown for commentary' });

    const r = await publishHaul(env, 'hl_1');
    expect(r.problems).toEqual([]);
    expect(r.bundleErrors).toEqual([]);
    expect(r.ok).toBe(true);
    for (const k of env.FILES.writes) expect(k.startsWith('hauls/')).toBe(true);

    const haul = (await (await env.FILES.get('hauls/001/v1/haul.json'))!.json()) as Haul;
    const index = (await (await env.FILES.get('hauls/index.json'))!.json()) as HaulIndex;
    expect(validateHaul(haul, index, { filesBase: env.FILES_BASE }).errors).toEqual([]);
    expect(haul.edition).toBe('plum');
    expect(index.hauls[0]!.edition).toBe('plum');

    const letter = haul.items[0]!;
    expect(letter).toMatchObject({ type: 'letter', year: 1865, recipient: 'John Herschel', place: 'Manchester' });
    expect(letter.blocks!.map((b) => b.kind)).toEqual(['video', 'quote', 'code', 'audio', 'image']);
    const [video, quote, codeBlock, audio, image] = letter.blocks!;
    expect(video).toEqual({ kind: 'video', provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Jevons in ten minutes', start: 60, poster: { url: 'https://files.example.org/hauls/001/media/the-coal-question-1-poster.jpg', width: 480, height: 360 } });
    expect(quote).toEqual({ kind: 'quote', text: 'The very contrary is the truth.' });
    expect(codeBlock).toMatchObject({ kind: 'code', code, lang: 'python' });
    expect(codeBlock?.kind === 'code' && codeBlock.tokens).toEqual(highlightCode(code, 'python'));
    expect(codeBlock?.kind === 'code' && codeBlock.tokens!.some(([role]) => role === 'k')).toBe(true);
    expect(audio).toEqual({ kind: 'audio', provider: 'spotify', url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', title: 'The Coal Question, read aloud' });
    expect(image).toEqual({
      kind: 'image',
      plate: { url: 'https://files.example.org/hauls/001/media/the-coal-question-5.jpg', width: 900, height: 600, caption: 'A colliery, 1860s.', creator: 'A maker', credit: 'Science Museum Group', licence: 'CC BY-NC-SA 4.0', sourceUrl: 'https://collection.sciencemuseumgroup.org.uk/objects/co1' },
    });
    for (const k of ['hauls/001/media/the-coal-question-1-poster.jpg', 'hauls/001/media/the-coal-question-5.jpg']) expect(env.FILES.objects.has(k)).toBe(true);

    expect(haul.items[1]).toMatchObject({ type: 'social', handle: '@satyanadella' });
    expect(haul.items[1]!.blocks).toBeUndefined();
    const pic = haul.items[2]!;
    expect(pic.type).toBe('image');
    expect(pic.plate).toEqual({ url: expect.stringMatching(/^https:\/\/files\.example\.org\/hauls\/001\/plates\/as-we-may-think\.jpg$/), width: 1280, height: 860, caption: 'A memex, drawn for Life, 1945.', creator: 'A maker', credit: 'Life magazine', licence: '© Time Inc., shown for commentary', sourceUrl: 'https://example.org/found' });
  });

  it('refuses a pull quote or code that no longer matches the source, and defaults the edition by number', async () => {
    const env = await seedHaul(makeEnv());
    const jev = await row(env, 'it_jevons');
    await addQuote(env, jev, { text: 'The very contrary is the truth.' });
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    expect((await assembleHaul(env, 'hl_1')).haul.edition).toBe('oxblood');
    await env.DB.prepare(`UPDATE sources SET text = 'Something else entirely, for this test.' WHERE item_id = 'it_jevons'`).run();
    const a = await assembleHaul(env, 'hl_1');
    expect(a.problems.map((p) => p.message)).toEqual([expect.stringMatching(/pull quote no longer matches the source/)]);
  });
});

describe('the share card', () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(64);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };

  it('writes the card next to the bundle and into it; a wrong one publishes without', async () => {
    const env = await seedHaul(makeEnv());
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    const wrong = await assembleHaul(env, 'hl_1', { card: png(800, 600) });
    expect(wrong.haul.card).toBeUndefined();
    expect(wrong.warnings.map((w) => w.rule)).toContain('card');
    expect((await assembleHaul(env, 'hl_1', { card: fakeJpeg(1200, 630) })).haul.card).toBeUndefined();

    const r = await publishHaul(env, 'hl_1', { card: png(1200, 630) });
    expect(r.ok).toBe(true);
    const haul = (await (await env.FILES.get('hauls/001/v1/haul.json'))!.json()) as Haul;
    expect(haul.card).toEqual({ url: 'https://files.example.org/hauls/001/v1/card.png', width: 1200, height: 630 });
    expect(env.FILES.objects.get('hauls/001/v1/card.png')?.httpMetadata?.contentType).toBe('image/png');
    expect(validateHaul(haul, undefined, { filesBase: env.FILES_BASE }).errors).toEqual([]);
    // Without a card, the bundle simply has none.
    const b = await assembleHaul(env, 'hl_1', { correction: 'Fixed a date.' });
    expect(b.haul.card).toBeUndefined();
  });
});

describe('item ids', () => {
  it('never uses the route words note or thread', async () => {
    const { itemSlug } = await import('../src/publish');
    expect([itemSlug('Note'), itemSlug('Thread'), itemSlug('A note on threads')]).toEqual(['note-item', 'thread-item', 'a-note-on-threads']);
  });

  it('keeps whole titles that fit and cuts long ones cleanly', async () => {
    const { itemSlug } = await import('../src/publish');
    expect(itemSlug('AI, public information, and the hope of a new civic consciousness')).toBe('ai-public-information-and-the-hope-of-a-new-civic-consciousness');
    expect(itemSlug('Anatomy of a Frontier Lab Agent Intrusion: A Technical Timeline of the July 2026 Incident')).toBe('anatomy-of-a-frontier-lab-agent-intrusion');
    expect(itemSlug('A very long title that keeps going and going without any break until it runs out of the room for it')).toBe('a-very-long-title-that-keeps-going-and-going-without-any-break-until-it-runs-out');
    expect(itemSlug('Go: a very long subtitle that keeps going and going without any break until it runs out of room')).not.toBe('go');
  });
});

describe('machine notes and ideas', () => {
  async function line(env: TestEnv, id: string, item: string, kind: 'marginal' | 'idea', status: string, text: string, quote: string, verdict = 'supported', source = JEVONS) {
    const start = source.indexOf(quote);
    const body = { text, cite: { kind: 'source', quote, start, end: start + quote.length }, verdict, ...(kind === 'idea' ? { locator: 'at 4:53' } : {}) };
    await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(id, item, kind, JSON.stringify(body), status, NOW, NOW)
      .run();
  }

  it('publishes only what the editor ticked; unticked lines neither block nor print', async () => {
    const env = await seedHaul(makeEnv());
    const q = 'The very contrary is the truth.';
    await line(env, 'dr_note_unticked', 'it_jevons', 'marginal', 'proposed', 'Jevons wrote this in 1865.', q);
    await line(env, 'dr_idea_kept', 'it_jevons', 'idea', 'kept', 'Jevons argues that cheaper coal power raises coal use.', q);
    await line(env, 'dr_idea_unticked', 'it_jevons', 'idea', 'proposed', 'Jevons argues something else.', q);
    await line(env, 'dr_idea_rejected', 'it_jevons', 'idea', 'rejected', 'Jevons says coal is infinite.', q, 'unsupported');
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();

    const r = await publishHaul(env, 'hl_1');
    expect(r.problems).toEqual([]);
    expect(r.bundleErrors).toEqual([]);
    const haul = (await (await env.FILES.get('hauls/001/v1/haul.json'))!.json()) as Haul;
    const jev = haul.items[0]!;
    expect(jev.marginalia).toEqual([]);
    expect(jev.ideas).toEqual([{ text: 'Jevons argues that cheaper coal power raises coal use.', quote: q, locator: 'at 4:53' }]);
  });

  it('cites the moment, not the caption text, for unpunctuated auto-captions; refuses an unconfirmed kept idea', async () => {
    const env = await seedHaul(makeEnv());
    // Older auto-captions: no punctuation anywhere.
    const captions = 'so it is wholly a confusion of ideas to suppose that the economical use of fuel is equivalent to a diminished consumption uh the very contrary is the truth and you know this is the thing people miss '.repeat(4);
    const q = 'the very contrary is the truth';
    // An uploaded transcript of old auto-captions is just as rough as fetched ones.
    await env.DB.prepare(`UPDATE sources SET extractor = 'transcript', text = ? WHERE item_id = 'it_jevons'`).bind(captions).run();
    await line(env, 'dr_idea_kept', 'it_jevons', 'idea', 'kept', 'Jevons argues that cheaper coal power raises coal use.', q, 'supported', captions);
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    const a = await assembleHaul(env, 'hl_1');
    expect(a.problems).toEqual([]);
    expect(a.bundleErrors).toEqual([]);
    expect(a.haul.items[0]!.ideas).toEqual([{ text: 'Jevons argues that cheaper coal power raises coal use.', quote: '', locator: 'at 4:53' }]);

    await line(env, 'dr_idea_partly', 'it_jevons', 'idea', 'edited', 'Jevons argues that coal will last forever.', q, 'partly', captions);
    const b = await assembleHaul(env, 'hl_1');
    expect(b.problems.map((p) => p.message)).toEqual([expect.stringMatching(/kept idea is not confirmed/)]);
  });
});

describe('the editor on a long item', () => {
  it('publishes the editor’s take on an idea and a start-here that links to the moment', async () => {
    const env = await seedHaul(makeEnv());
    const q = 'The very contrary is the truth.';
    const start = JEVONS.indexOf(q);
    const body = { text: 'Jevons argues that cheaper coal power raises coal use.', cite: { kind: 'source', quote: q, start, end: start + q.length }, verdict: 'supported', locator: 'at 1:02:14', reaction: '  The line I keep coming back to.  ' };
    await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES ('dr_i', 'it_jevons', 'idea', ?, 'kept', 0, ?, ?)`).bind(JSON.stringify(body), NOW, NOW).run();
    await env.DB.prepare(`UPDATE items SET type = 'video', start_at = '1:02:14', start_note = 'Where it turns.', media = ? WHERE id = 'it_jevons'`)
      .bind(JSON.stringify({ kind: 'video', url: 'https://www.youtube.com/watch?v=abcdefghijk', label: 'Watch · 2:10:00' }))
      .run();
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    const a = await assembleHaul(env, 'hl_1');
    expect(a.problems).toEqual([]);
    expect(a.bundleErrors).toEqual([]);
    const it0 = a.haul.items[0]!;
    expect(it0.ideas?.[0]?.reaction).toBe('The line I keep coming back to.');
    expect(it0.startHere).toEqual({ at: '1:02:14', note: 'Where it turns.', url: 'https://www.youtube.com/watch?v=abcdefghijk&t=3734s' });
  });
});

describe('a new reading replaces unticked Wikipedia cards', () => {
  it('keeps ticked cards and cards a kept note cites, and clears the rest', async () => {
    const { resolveWiki } = await import('../src/steps');
    const env = await seedHaul(makeEnv());
    const card = (id: string, status: string) =>
      env.DB.prepare(`INSERT INTO wiki_cards (id, item_id, query, title, summary, extract, url, status, position, created_at) VALUES (?, 'it_jevons', 'q', ?, 's', 'e', ?, ?, 0, ?)`)
        .bind(id, id, `https://en.wikipedia.org/wiki/${id}`, status, NOW)
        .run();
    await card('wk_kept', 'kept');
    await card('wk_cited', 'proposed');
    await card('wk_stale', 'proposed');
    const note = { text: 'A note.', cite: { kind: 'wiki', title: 'wk_cited', cardId: 'wk_cited' }, verdict: 'supported' };
    await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES ('dr_n', 'it_jevons', 'marginal', ?, 'kept', 0, ?, ?)`).bind(JSON.stringify(note), NOW, NOW).run();
    await resolveWiki(env, 'it_jevons', [], 4);
    const left = (await env.DB.prepare(`SELECT id FROM wiki_cards WHERE item_id = 'it_jevons' ORDER BY id`).all<{ id: string }>()).results.map((r) => r.id);
    expect(left).toEqual(['wk_cited', 'wk_kept']);
  });
});

describe('the shelf', () => {
  const item = async (env: TestEnv, id: string) => (await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>())!;
  const read = async <T,>(env: TestEnv, key: string) => (await (await env.FILES.get(key))!.json()) as T;

  it('a Haul publish writes Item.shelf; the shelf publish writes a valid shelf.json with covers and recordings copied, in order, linked to its Hauls', async () => {
    const env = await seedHaul(makeEnv());
    // Haul 1 carries a Book item that points to its shelf book.
    await env.DB.prepare(`UPDATE items SET type = 'book' WHERE id = 'it_jevons'`).run();
    const coal = await createBook(env, { title: { text: 'The Coal', italic: 'Question' }, author: 'William Stanley Jevons', year: 1865, url: 'https://en.wikisource.org/wiki/The_Coal_Question', status: 'read', started: '2026-09-20', finished: '2026-10-12' });
    expect(coal.id).toBe('the-coal-question');
    await linkItemToBook(env, await item(env, 'it_jevons'), coal.id);
    await expect(linkItemToBook(env, await item(env, 'it_nadella'), coal.id)).rejects.toThrow(/Only a Book item/);
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    const hr = await publishHaul(env, 'hl_1');
    expect(hr.problems).toEqual([]);
    expect(hr.ok).toBe(true);
    // The shelf is not published yet, so the Haul says the link will not land until it is.
    expect(hr.warnings.filter((w) => w.rule === 'shelf').map((w) => w.message)).toEqual([expect.stringMatching(/Publish the shelf/)]);
    const haul = await read<Haul>(env, 'hauls/001/v1/haul.json');
    expect(haul.items[0]!.shelf).toBe('the-coal-question');
    expect(validateHaul(haul, await read<HaulIndex>(env, 'hauls/index.json'), { filesBase: env.FILES_BASE }).errors).toEqual([]);
    // A deleted book would orphan the published link: refused.
    await expect(deleteBook(env, coal)).rejects.toThrow(/published Haul 1/);

    // A book being read: a cover, a typed note, a dictated note published with its recording, a line.
    const seeing = await createBook(env, { title: { text: 'Seeing Like', italic: 'a State' }, author: 'James C. Scott', year: 1998, status: 'reading', started: '2026-10-02' });
    await setBookCover(env, seeing, { bytes: fakeJpeg(600, 900), credit: 'Yale University Press', licence: '© the publisher, shown for commentary', creator: 'Yale University Press', sourceUrl: 'https://yalebooks.yale.edu/book/9780300078152/seeing-like-a-state/' });
    await addBookNote(env, seeing, { text: 'Starts with forestry in Prussia, and it is about every dashboard I have built.', date: '2026-10-09', at: 'chapter 1' });
    await seedNote(env, 'vn_book', 'm4a', 'audio/mp4');
    await addBookNote(env, seeing, { text: 'The chapter on city planning is the one I keep thinking about.', date: '2026-10-21', at: 'chapter 3', noteId: 'vn_book', publishAudio: true });
    await addBookLine(env, seeing, { text: 'Certain forms of knowledge and control require a narrowing of vision.', locator: 'chapter 1' });
    const pynchon = await createBook(env, { title: { text: "Gravity's Rainbow" }, author: 'Thomas Pynchon', status: 'put-down', started: '2026-07-01' });
    await addBookNote(env, pynchon, { text: 'Put down at page 212, not for good.', date: '2026-07-29', at: 'p. 212' });

    env.FILES.writes.length = 0;
    env.MEDIA.writes.length = 0;
    const r = await publishShelf(env);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.changes).toEqual(['The first publish of the shelf: 3 books.']);
    // FILES gets only shelf/ (a cover, a recording, the shelf), MEDIA gets nothing.
    expect(env.FILES.writes.length).toBe(3);
    for (const k of env.FILES.writes) expect(k.startsWith('shelf/')).toBe(true);
    expect(env.MEDIA.writes).toEqual([]);

    const shelf = await read<Shelf>(env, SHELF_PATH);
    expect(validateShelf(shelf, { filesBase: env.FILES_BASE })).toEqual([]);
    expect(Date.now() - new Date(shelf.updatedAt).getTime()).toBeLessThan(60_000);
    // Reading first, then the most recently touched.
    expect(shelf.books.map((b) => b.id)).toEqual(['seeing-like-a-state', 'the-coal-question', 'gravitys-rainbow']);
    const s0 = shelf.books[0]!;
    expect(s0.title).toEqual({ text: 'Seeing Like', italic: 'a State' });
    expect(s0.notes.map((n) => [n.date, n.at])).toEqual([
      ['2026-10-21', 'chapter 3'],
      ['2026-10-09', 'chapter 1'],
    ]);
    expect(s0.notes[0]!.audio).toEqual({ url: 'https://files.example.org/shelf/audio/seeing-like-a-state-vn_book.m4a', seconds: 12, format: 'm4a' });
    expect(s0.notes[1]!.audio).toBeUndefined();
    expect(env.FILES.objects.has('shelf/audio/seeing-like-a-state-vn_book.m4a')).toBe(true);
    expect(s0.cover).toMatchObject({ width: 600, height: 900, caption: '', credit: 'Yale University Press', licence: '© the publisher, shown for commentary', creator: 'Yale University Press', sourceUrl: 'https://yalebooks.yale.edu/book/9780300078152/seeing-like-a-state/' });
    expect(s0.cover!.url).toMatch(/^https:\/\/files\.example\.org\/shelf\/covers\/seeing-like-a-state-cover-[0-9a-z]+\.jpg$/);
    expect(env.FILES.objects.get(s0.cover!.url.replace('https://files.example.org/', ''))?.httpMetadata?.contentType).toBe('image/jpeg');
    expect(s0.lines).toEqual([{ text: 'Certain forms of knowledge and control require a narrowing of vision.', locator: 'chapter 1' }]);
    expect(s0.hauls).toBeUndefined();
    expect(shelf.books[1]).toMatchObject({ status: 'read', started: '2026-09-20', finished: '2026-10-12', year: 1865, hauls: [{ number: 1, itemId: 'the-coal-question' }] });
    expect(await env.DB.prepare('SELECT version, books FROM shelf_versions').all()).toMatchObject({ results: [{ version: 1, books: 3 }] });

    // The next publish says what changed, and copies nothing it already has.
    await addBookNote(env, pynchon, { text: 'Back to it in the winter.', date: '2026-10-20' });
    await patchBook(env, pynchon, { status: 'reading' });
    env.FILES.writes.length = 0;
    const r2 = await publishShelf(env);
    expect(r2.changes).toEqual(["Gravity's Rainbow: put down → reading now; 1 new note."]);
    expect(env.FILES.writes).toEqual([SHELF_PATH]);
  });

  it('refuses with plain messages and writes nothing: a cover without its credit, a missing file, a book without its author', async () => {
    const env = makeEnv();
    const b = await createBook(env, { title: { text: 'The Coal', italic: 'Question' }, author: 'William Stanley Jevons' });
    await setBookCover(env, b, { bytes: fakeJpeg(), credit: 'Wikisource', licence: 'Public domain', creator: 'Macmillan', sourceUrl: 'https://en.wikisource.org/wiki/The_Coal_Question' });
    await env.DB.prepare(`UPDATE books SET cover_credit = '' WHERE id = ?`).bind(b.id).run();
    const r = await publishShelf(env);
    expect([r.ok, r.problems]).toEqual([false, ['The Coal Question: the cover is missing its size, credit or licence; add it again']]);
    expect(env.FILES.writes).toEqual([]);

    await env.DB.prepare(`UPDATE books SET cover_credit = 'Wikisource' WHERE id = ?`).bind(b.id).run();
    const key = (await env.DB.prepare('SELECT cover_key FROM books WHERE id = ?').bind(b.id).first<{ cover_key: string }>())!.cover_key;
    await env.MEDIA.delete(key);
    const r2 = await publishShelf(env);
    expect([r2.ok, r2.problems]).toEqual([false, [expect.stringMatching(/missing from storage/)]]);
    expect(env.FILES.objects.has(SHELF_PATH)).toBe(false);

    await env.DB.prepare(`UPDATE books SET author = ' ', cover_key = NULL WHERE id = ?`).bind(b.id).run();
    expect((await assembleShelf(env)).problems).toEqual(['The Coal Question: author: name the author']);
  });

  it('finds a Book item linked after its Haul was published in the published bundle, and warns when the bundle cannot show it', async () => {
    const env = await seedHaul(makeEnv());
    await env.DB.prepare(`UPDATE items SET type = 'book' WHERE id IN ('it_jevons', 'it_bush')`).run();
    await env.DB.batch(['it_jevons', 'it_bush'].map((id, i) => env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind('hl_1', id, i)));
    expect((await publishHaul(env, 'hl_1')).ok).toBe(true);
    const coal = await createBook(env, { title: { text: 'The Coal', italic: 'Question' }, author: 'William Stanley Jevons' });
    const bush = await createBook(env, { title: { text: 'As We May Think' }, author: 'Vannevar Bush' });
    await linkItemToBook(env, await item(env, 'it_jevons'), coal.id);
    await linkItemToBook(env, await item(env, 'it_bush'), bush.id);
    // The editor renames the second item after publishing: the bundle no longer shows it by that id.
    await env.DB.prepare(`UPDATE items SET title = 'Memex' WHERE id = 'it_bush'`).run();
    const a = await assembleShelf(env);
    expect(a.problems).toEqual([]);
    expect(a.shelf.books.find((b) => b.id === 'the-coal-question')!.hauls).toEqual([{ number: 1, itemId: 'the-coal-question' }]);
    expect(a.shelf.books.find((b) => b.id === 'as-we-may-think')!.hauls).toBeUndefined();
    expect(a.warnings).toEqual([expect.stringMatching(/"Memex" in Haul 1 points to a shelf book, but the published Haul does not show it/)]);
  });
});
