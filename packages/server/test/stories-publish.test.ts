// Publishing a data story, on SQLite with the real migrations and in-memory buckets: the editor's
// words found unchanged in his stored note, the quotation found in the stored source, the slug, the
// story and index written under data/ only, versions that never overwrite, and a dry run that writes
// nothing. Uses the real fertility story and the editor's note it was made from.

import { describe, expect, it } from 'vitest';
import { DATA_INDEX_PATH, type DataIndex, type PublishedStory } from '@fdf/shared/stories/published';
import type { Story } from '@fdf/shared/stories';
import { isPublicPath, isStoryPath, publishStory, readDataIndex } from '../src/publish';
import { makeEnv, type TestEnv } from './fake-env';
import { NOW, seedItem } from './seed';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const STORY: Story = JSON.parse(fs.readFileSync(new URL('../../shared/fixtures/stories/fertility.json', import.meta.url), 'utf8'));
const NOTE: string = fs.readFileSync(new URL('../../shared/fixtures/stories/fertility-editor-note.txt', import.meta.url), 'utf8');
const QUOTE = STORY.plates.find((p) => p.quote)!.quote!.text;
const SOURCE = `Fertility has fallen across the world. ${QUOTE} The authors close on what that means.`;

const story = (): Story => structuredClone(STORY);

async function storyEnv(): Promise<TestEnv> {
  const env = makeEnv();
  await seedItem(env, 'it_fertility', { title: 'The Likelihood of Persistently Low Global Fertility', text: SOURCE, date: '2026', why: NOTE });
  return env;
}

/** Put the item in a published Haul whose latest bundle shows it. */
async function publishInHaul(env: TestEnv) {
  await env.DB.prepare(`INSERT INTO hauls (id, number, status, created_at, updated_at) VALUES ('hl_2', 2, 'published', ?, ?)`).bind(NOW, NOW).run();
  await env.DB.prepare(`INSERT INTO haul_items (haul_id, item_id, position) VALUES ('hl_2', 'it_fertility', 0)`).run();
  await env.DB.prepare(`INSERT INTO haul_versions (haul_id, version, path, sha256, published_at) VALUES ('hl_2', 1, 'hauls/002/v1/haul.json', 'x', ?)`).bind(NOW).run();
  await env.FILES.put('hauls/002/v1/haul.json', JSON.stringify({ items: [{ id: 'the-likelihood-of-persistently-low-global-fertility', title: { text: 'The Likelihood of Persistently Low Global Fertility' } }] }));
  env.FILES.writes.length = 0;
}

const read = async <T>(env: TestEnv, key: string) => (await (await env.FILES.get(key))!.json()) as T;
const input = (s: Story = story(), slug = 'fertility') => ({ story: s, slug, itemId: 'it_fertility' });

describe('publishing a data story', () => {
  it('refuses a reworded standfirst', async () => {
    const env = await storyEnv();
    const s = story();
    s.standfirst = s.standfirst.replace('An interesting paper', 'A fascinating paper');
    const r = await publishStory(env, input(s));
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('The standfirst is not the editor’s words unchanged, as whole sentences of his note.');
    expect(env.FILES.writes).toEqual([]);
  });

  it('refuses a reworded margin note', async () => {
    const env = await storyEnv();
    const s = story();
    const p = s.plates.find((x) => x.editorNote)!;
    p.editorNote = p.editorNote!.replace('most of the world', 'much of the world');
    const r = await publishStory(env, input(s));
    expect(r.problems).toContain(`Plate "${p.name}": the margin note is not the editor’s words unchanged.`);
    expect(env.FILES.writes).toEqual([]);
  });

  it('refuses a quotation that is not in the stored source', async () => {
    const env = await storyEnv();
    const s = story();
    const p = s.plates.find((x) => x.quote)!;
    p.quote!.text = p.quote!.text.replace('history offers no examples', 'history offers few examples');
    const r = await publishStory(env, input(s));
    expect(r.problems.some((m) => m.startsWith(`Plate "${p.name}": the quotation is not in the item's source word for word`))).toBe(true);
    expect(env.FILES.writes).toEqual([]);
  });

  it('refuses a fragment of the editor\'s words that changes their meaning', async () => {
    const env = await storyEnv();
    const s = story();
    // A clause cut from inside a sentence of his note: present in the text, but not a whole sentence.
    s.standfirst = 'falling fertility rates around the world.';
    const r = await publishStory(env, input(s));
    expect(r.problems.some((m) => m.startsWith('The standfirst is not the editor’s words unchanged'))).toBe(true);
  });

  it('refuses a quotation stitched together with an ellipsis', async () => {
    const env = await storyEnv();
    const s = story();
    const p = s.plates.find((x) => x.quote)!;
    p.quote!.text = 'To put it bluntly, history offers no examples … of societies recognizing very low birth rates.';
    const r = await publishStory(env, input(s));
    expect(r.problems).toContain(`Plate "${p.name}": a story's quotation is one unbroken passage, with no ellipsis.`);
  });

  it('refuses a plate listed twice in the movements (so another never shows)', async () => {
    const env = await storyEnv();
    const s = story();
    s.movements[0]!.plates[1] = s.movements[0]!.plates[0]!;
    const r = await publishStory(env, input(s));
    expect(r.problems).toContain('Every plate belongs to exactly one movement.');
  });

  it('stops when the index is damaged, or missing while stories exist, instead of starting over', async () => {
    const env = await storyEnv();
    await env.FILES.put(DATA_INDEX_PATH, '{ not json');
    const r1 = await publishStory(env, input());
    expect(r1.ok).toBe(false);
    expect(r1.problems.join(' ')).toMatch(/cannot be trusted/);
    const env2 = await storyEnv();
    await env2.FILES.put('data/other/v1/story.json', '{}');
    env2.FILES.writes.length = 0;
    const r2 = await publishStory(env2, input());
    expect(r2.ok).toBe(false);
    expect(r2.problems.join(' ')).toMatch(/is missing but data\/ holds published stories/);
    expect(env2.FILES.writes).toEqual([]);
  });

  it('refuses a bad slug, a missing item and a story of the wrong shape', async () => {
    const env = await storyEnv();
    for (const slug of ['Fertility', 'fertility/../hauls', 'fertility_2', '']) expect((await publishStory(env, input(story(), slug))).problems.some((m) => /slug/.test(m))).toBe(true);
    expect((await publishStory(env, { ...input(), itemId: 'it_nope' })).problems).toContain('No item it_nope.');
    expect((await publishStory(env, input({ title: 'x' } as unknown as Story))).problems).toContain('The story is not in the expected shape (docs/DATA-STORIES.md).');
    expect(env.FILES.writes).toEqual([]);
  });

  it('writes the story and the index, version 1 and number 1, with its Haul', async () => {
    const env = await storyEnv();
    await publishInHaul(env);
    const r = await publishStory(env, input());
    expect(r).toMatchObject({ ok: true, problems: [], warnings: ['No drawer: the app will show this story without its plates\' pictures.'], version: 1, number: 1, path: 'data/fertility/v1/story.json', url: 'https://files.example.org/data/fertility/v1/story.json' });
    expect(env.FILES.writes).toEqual(['data/fertility/v1/story.json', DATA_INDEX_PATH]);
    expect(env.FILES.objects.get('data/fertility/v1/story.json')!.httpMetadata!.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(env.FILES.objects.get(DATA_INDEX_PATH)!.httpMetadata!.cacheControl).toBe('public, max-age=60');
    const p = await read<PublishedStory>(env, 'data/fertility/v1/story.json');
    expect(p).toMatchObject({ bundleVersion: 1, slug: 'fertility', number: 1, version: 1, haul: { number: 2, itemId: 'it_fertility', itemSlug: 'the-likelihood-of-persistently-low-global-fertility', itemTitle: 'The Likelihood of Persistently Low Global Fertility' } });
    expect(p.story).toEqual(STORY);
    const index = await read<DataIndex>(env, DATA_INDEX_PATH);
    expect(index.stories).toHaveLength(1);
    expect(index.stories[0]).toMatchObject({ slug: 'fertility', number: 1, version: 1, path: 'data/fertility/v1/story.json', title: STORY.title, figure: { value: '2.25' } });
    expect(await readDataIndex(env)).toEqual(index);
  });

  it('publishes without a Haul link, with a warning, when the item is in no published Haul', async () => {
    const env = await storyEnv();
    const r = await publishStory(env, input());
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/in no published Haul/);
    expect((await read<PublishedStory>(env, 'data/fertility/v1/story.json')).haul).toBeUndefined();
  });

  it('makes a second publish version 2 with the same number and first publish date; a new slug takes the next number', async () => {
    const env = await storyEnv();
    await publishStory(env, input());
    const first = await read<PublishedStory>(env, 'data/fertility/v1/story.json');
    const r = await publishStory(env, input());
    expect(r).toMatchObject({ ok: true, version: 2, number: 1, path: 'data/fertility/v2/story.json' });
    const second = await read<PublishedStory>(env, 'data/fertility/v2/story.json');
    expect(second.publishedAt).toBe(first.publishedAt);
    // Version 1 stays where it was.
    expect(await read<PublishedStory>(env, 'data/fertility/v1/story.json')).toEqual(first);
    const other = await publishStory(env, input(story(), 'fertility-again'));
    expect(other).toMatchObject({ ok: true, version: 1, number: 2 });
    const index = await read<DataIndex>(env, DATA_INDEX_PATH);
    expect(index.stories.map((s) => [s.slug, s.number, s.version])).toEqual([['fertility-again', 2, 1], ['fertility', 1, 2]]);
  });

  it('draws each plate\'s pictures for the app, light and dark, and lists them in the story', async () => {
    const env = await storyEnv();
    const drawn: string[] = [];
    const drawer = { png: (svg: string) => (drawn.push(svg), new Uint8Array([137, 80, 78, 71])) };
    const r = await publishStory(env, input(), { drawer });
    expect(r.ok).toBe(true);
    const pub = await read<PublishedStory>(env, 'data/fertility/v1/story.json');
    expect(Object.keys(pub.pictures!).sort()).toEqual(STORY.plates.map((p) => p.key).sort());
    expect(drawn).toHaveLength(STORY.plates.length * 2);
    const fall = pub.pictures!.fall!;
    expect(fall.light.url).toMatch(/\/data\/fertility\/v1\/plates\/fall-light\.png$/);
    expect(fall.dark.width).toBe(1020);
    expect(env.FILES.writes).toContain('data/fertility/v1/plates/fall-dark.png');
    expect(env.FILES.writes.every(isStoryPath)).toBe(true);
    // The pictures are written before the story that points at them.
    expect(env.FILES.writes.indexOf('data/fertility/v1/plates/fall-light.png')).toBeLessThan(env.FILES.writes.indexOf('data/fertility/v1/story.json'));
  });

  it('never overwrites a published version, and never writes outside data/', async () => {
    // An index that says version 1 is next, while version 1 is already in the bucket: refused.
    const env = await storyEnv();
    await env.FILES.put(DATA_INDEX_PATH, JSON.stringify({ bundleVersion: 1, updatedAt: NOW, stories: [] }));
    await env.FILES.put('data/fertility/v1/story.json', '{"stale":true}');
    const r = await publishStory(env, input());
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/never overwritten/);
    expect(await read(env, 'data/fertility/v1/story.json')).toEqual({ stale: true });
    const env2 = await storyEnv();
    await publishStory(env2, input());
    expect(env2.FILES.writes.every(isStoryPath)).toBe(true);
    expect(env2.MEDIA.writes).toEqual([]);
    expect([isStoryPath('data/x/v1/story.json'), isStoryPath('data/../hauls/index.json'), isStoryPath('hauls/data/x'), isPublicPath('data/index.json')]).toEqual([true, false, false, true]);
  });

  it('writes nothing on a dry run, and says what it would write', async () => {
    const env = await storyEnv();
    const r = await publishStory(env, input(), { dryRun: true });
    expect(r).toMatchObject({ ok: true, problems: [], version: 1, number: 1, path: 'data/fertility/v1/story.json' });
    expect(r.changes).toEqual([`The first publish of "${STORY.title}", Atlas No. 1.`, `Writes data/fertility/v1/story.json and ${DATA_INDEX_PATH}.`]);
    expect(r.url).toBeUndefined();
    expect(env.FILES.writes).toEqual([]);
  });
});
