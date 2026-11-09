// Where an item stands, end to end on SQLite with the real migrations: on the Desk, in a draft Haul,
// published (recorded at publish, or worked out once from an older bundle), and added after the
// Haul went out. Then the Haul's review and its suggestions.

import { describe, expect, it } from 'vitest';
import { publishHaul } from '../src/publish';
import { haulReview, haulSuggestions, matchBundleItems, publishedItems, standingFor, standings } from '../src/standing';
import { makeEnv, type TestEnv } from './fake-env';
import { NOW, seedHaul, seedItem } from './seed';

const add = (env: TestEnv, ids: string[]) => env.DB.batch(ids.map((id, i) => env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, ?)').bind('hl_1', id, i)));
const text = async (env: TestEnv, id: string) => (await standingFor(env, { id, archived: 0 })).standing.text;

describe('where an item stands', () => {
  it('follows an item from the Desk into a Haul, out to readers, and a late addition', async () => {
    const env = await seedHaul(makeEnv());
    expect(await text(env, 'it_jevons')).toBe('On the Desk, not in a Haul');
    const first = await standingFor(env, { id: 'it_jevons', archived: 0 });
    expect(first.draft).toEqual({ id: 'hl_1', number: 1 });

    await add(env, ['it_jevons']);
    expect(await text(env, 'it_jevons')).toBe('In Haul 001, not yet published');

    expect((await publishHaul(env, 'hl_1')).ok).toBe(true);
    const v = await env.DB.prepare('SELECT item_ids FROM haul_versions WHERE haul_id = ?').bind('hl_1').first<{ item_ids: string }>();
    expect(JSON.parse(v!.item_ids)).toEqual(['it_jevons']);
    expect(await text(env, 'it_jevons')).toBe('Published in Haul 001, version 1');
    // The published Haul is no longer where a one-tap "add" goes.
    expect((await standingFor(env, { id: 'it_jevons', archived: 0 })).draft).toBeNull();

    // Added after it went out: in the Haul, but readers do not have it yet.
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 1)').bind('hl_1', 'it_nadella').run();
    const late = await standingFor(env, { id: 'it_nadella', archived: 0 });
    expect(late.standing).toMatchObject({ state: 'next-version', text: 'In Haul 001, not yet published' });

    // The tray asks for many at once.
    const many = await standings(env, [
      { id: 'it_jevons', archived: 0, haul_id: 'hl_1', haul_number: 1, haul_status: 'published', haul_version: 1 },
      { id: 'it_nadella', archived: 0, haul_id: 'hl_1', haul_number: 1, haul_status: 'published', haul_version: 1 },
      { id: 'it_bush', archived: 1, haul_id: null, haul_number: null, haul_status: null, haul_version: null },
    ]);
    expect([...many.values()].map((s) => s.state)).toEqual(['published', 'next-version', 'archived']);
  });

  it('works out an older version from its bundle once, and remembers it', async () => {
    const env = await seedHaul(makeEnv());
    await add(env, ['it_jevons', 'it_nadella']);
    expect((await publishHaul(env, 'hl_1')).ok).toBe(true);
    // As a version published before 0011 would be: no item ids recorded; a third item came later.
    await env.DB.prepare('UPDATE haul_versions SET item_ids = NULL').run();
    await seedItem(env, 'it_late', { title: 'A late find', text: 'Words.', date: '2026' });
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 2)').bind('hl_1', 'it_late').run();
    const pub = await publishedItems(env, 'hl_1');
    expect([...pub!.ids].sort()).toEqual(['it_jevons', 'it_nadella']);
    const v = await env.DB.prepare('SELECT item_ids FROM haul_versions').first<{ item_ids: string }>();
    expect(JSON.parse(v!.item_ids).sort()).toEqual(['it_jevons', 'it_nadella']);
  });

  it('matches bundle items by their id or by the link to the original', () => {
    const rows = [
      { id: 'a', title: 'The Coal Question', title_choice: null, url: 'https://example.org/a', canonical_url: null },
      { id: 'b', title: 'Retitled since', title_choice: null, url: 'https://example.org/b', canonical_url: null },
      { id: 'c', title: 'Never published', title_choice: null, url: 'https://example.org/c', canonical_url: null },
    ];
    const bundle = { items: [{ id: 'the-coal-question', source: { url: '' } }, { id: 'old-title', source: { url: 'https://example.org/b' } }] } as never;
    expect(matchBundleItems(rows, bundle)).toEqual(['a', 'b']);
  });
});

describe("a Haul's review and suggestions", () => {
  it('lists what is wrong or doubtful per item, and every suggestion still to tick', async () => {
    const env = await seedHaul(makeEnv());
    await add(env, ['it_jevons', 'it_nadella']);
    await env.DB.prepare(`UPDATE items SET creator = 'Substack', source_date = '' WHERE id = 'it_nadella'`).run();
    await env.DB.prepare(
      `INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES
        ('d1', 'it_jevons', 'marginal', '{"text":"Jevons was 29.","cite":{"kind":"wiki","title":"William Stanley Jevons","cardId":"w1"}}', 'proposed', 0, ?, ?),
        ('d2', 'it_jevons', 'marginal', '{"text":"Set aside.","cite":{"kind":"wiki","title":"x","cardId":"w1"}}', 'rejected', 1, ?, ?)`,
    )
      .bind(NOW, NOW, NOW, NOW)
      .run();
    await env.DB.prepare(
      `INSERT INTO wiki_cards (id, item_id, query, title, summary, extract, url, status, position, created_at) VALUES ('w1', 'it_jevons', 'Jevons', 'William Stanley Jevons', 'An economist.', 'William Stanley Jevons was an English economist.', 'https://en.wikipedia.org/wiki/William_Stanley_Jevons', 'proposed', 0, ?)`,
    )
      .bind(NOW)
      .run();

    const review = await haulReview(env, 'hl_1');
    expect(review.map((r) => r.id)).toEqual(['it_jevons', 'it_nadella']);
    expect(review[0]!.issues.map((i) => i.kind)).toEqual(['unticked']);
    expect(review[0]!.issues[0]!.message).toBe('1 margin note and 1 Wikipedia card are waiting for a tick. Only ticked ones print.');
    expect(review[1]!.issues.map((i) => `${i.kind}:${i.severity}`)).toEqual(['maker:wrong', 'date:wrong']);

    const sug = await haulSuggestions(env, 'hl_1');
    expect(sug[0]!.drafts.map((d) => d.id)).toEqual(['d1']); // the set-aside line never shows
    expect(sug[0]!.wiki.map((w) => w.id)).toEqual(['w1']);
    expect(sug[1]!.drafts).toEqual([]);
  });
});
