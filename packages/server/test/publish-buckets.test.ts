// Publish end to end on a real SQLite D1 with the real migrations: plates, a cover, voice notes with
// their formats, a Rhyme, a kept connection and an approved Thread all land in the bundle; the bundle
// validates; and the two buckets stay apart (FILES gets only hauls/, MEDIA never gets hauls/).

import { describe, expect, it } from 'vitest';
import { validateHaul } from '@fdf/shared/validate';
import type { Haul, HaulIndex } from '@fdf/shared/haul';
import { publishHaul, assembleHaul } from '../src/publish';
import { approveSuggestion } from '../src/connect';
import { setEndQuote, setEndSource, createRhyme, patchRhyme } from '../src/rhymes';
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

describe('item ids', () => {
  it('never uses the route words note or thread', async () => {
    const { itemSlug } = await import('../src/publish');
    expect([itemSlug('Note'), itemSlug('Thread'), itemSlug('A note on threads')]).toEqual(['note-item', 'thread-item', 'a-note-on-threads']);
  });
});
