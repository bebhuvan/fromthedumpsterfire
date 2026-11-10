import { describe, expect, it } from 'vitest';
import { indexEntry, storyPath, type DataIndex, type PublishedStory } from '@fdf/shared/stories/published';
import fertility from '../../../../packages/shared/fixtures/stories/fertility.json';
import { goodIndex, goodStory, newestFirst, newestKept, plateOrder, plateSourceLine, storiesForHaul, storiesForItem, storyPaths, storyPictureFileName, storyPictureUrls, thumbOf } from './atlas';

const BASE = 'https://files.fromthedumpsterfire.com';
const pic = (slug: string, v: number, key: string, scheme: string) => ({ url: `${BASE}/data/${slug}/v${v}/plates/${key}-${scheme}.png`, width: 1020, height: 1200 });

function story(over: Partial<PublishedStory> = {}): PublishedStory {
  return {
    bundleVersion: 1,
    slug: 'fertility',
    number: 1,
    version: 1,
    publishedAt: '2026-11-10T02:52:00.052Z',
    updatedAt: '2026-11-10T02:52:00.052Z',
    haul: { number: 2, itemId: 'it_01', itemSlug: 'the-likelihood-of-persistently-low-global-fertility', itemTitle: 'The Likelihood of Persistently Low Global Fertility' },
    story: fertility as unknown as PublishedStory['story'],
    ...over,
  };
}

const withPictures = (s: PublishedStory) => ({ ...s, pictures: Object.fromEntries(s.story.plates.map((p) => [p.key, { light: pic(s.slug, s.version, p.key, 'light'), dark: pic(s.slug, s.version, p.key, 'dark') }])) });

describe('which story file may be shown', () => {
  it('takes a story that validates, with or without its pictures', () => {
    expect(goodStory(story(), 'fertility', BASE)).toBe(true);
    expect(goodStory(withPictures(story()), 'fertility', BASE)).toBe(true);
  });

  it('refuses a damaged file, another story, a newer bundle and pictures from another host', () => {
    expect(goodStory(null, 'fertility', BASE)).toBe(false);
    expect(goodStory({ slug: 'fertility' }, 'fertility', BASE)).toBe(false);
    expect(goodStory(story(), 'other', BASE)).toBe(false);
    expect(goodStory({ ...story(), bundleVersion: 2 }, 'fertility', BASE)).toBe(false);
    const s = withPictures(story());
    const key = s.story.plates[0]!.key;
    const foreign = { ...s, pictures: { ...s.pictures, [key]: { light: { ...pic('fertility', 1, key, 'light'), url: `https://example.com/data/fertility/v1/plates/${key}-light.png` }, dark: pic('fertility', 1, key, 'dark') } } };
    expect(goodStory(foreign, 'fertility', BASE)).toBe(false);
  });

  it('refuses a story whose machine words cite a figure that is not a fact', () => {
    const s = story();
    const plates = s.story.plates.map((p, i) => (i ? p : { ...p, body: `${p.body} It fell by 93.7 per cent.` }));
    expect(goodStory({ ...s, story: { ...s.story, plates } }, 'fertility', BASE)).toBe(false);
  });

  it('falls back from the current version to the newest earlier one on hand', () => {
    expect(storyPaths({ slug: 'fertility', version: 3 })).toEqual([storyPath('fertility', 3), storyPath('fertility', 2), storyPath('fertility', 1)]);
    const v1 = story();
    const v2 = story({ version: 2 });
    const kept = (have: Record<string, PublishedStory>) => (path: string) => have[path] ?? null;
    expect(newestKept({ slug: 'fertility', version: 3 }, kept({ [storyPath('fertility', 1)]: v1, [storyPath('fertility', 2)]: v2 }))).toBe(v2);
    expect(newestKept({ slug: 'fertility', version: 3 }, kept({ [storyPath('fertility', 1)]: v1 }))).toBe(v1);
    expect(newestKept({ slug: 'fertility', version: 3 }, kept({}))).toBeNull();
  });

  it('keeps an index only when it validates', () => {
    const index: DataIndex = { bundleVersion: 1, updatedAt: '2026-11-10T02:52:00.052Z', stories: [indexEntry(story())] };
    expect(goodIndex(index)).toBe(true);
    expect(goodIndex({ ...index, stories: [{ ...index.stories[0]!, path: 'data/fertility/v9/story.json' }] })).toBe(false);
    expect(goodIndex({ hauls: [] })).toBe(false);
    expect(goodIndex(null)).toBe(false);
  });
});

describe('stories in a Haul and on an item', () => {
  const a = indexEntry(story());
  const b = indexEntry(story({ slug: 'births', number: 2, haul: { number: 2, itemId: 'it_02', itemSlug: 'another', itemTitle: 'Another' } }));
  const c = indexEntry(story({ slug: 'air', number: 3, haul: { number: 3, itemId: 'it_03', itemSlug: 'delhi', itemTitle: 'Delhi' } }));
  const d = indexEntry(story({ slug: 'loose', number: 4, haul: undefined }));
  const index: DataIndex = { bundleVersion: 1, updatedAt: '2026-11-10T02:52:00.052Z', stories: [c, a, d, b] };

  it('lists the Atlas newest first', () => {
    expect(newestFirst(index).map((e) => e.number)).toEqual([4, 3, 2, 1]);
    expect(newestFirst(null)).toEqual([]);
  });

  it('gives a Haul its stories in series order', () => {
    expect(storiesForHaul(index, 2).map((e) => e.slug)).toEqual(['fertility', 'births']);
    expect(storiesForHaul(index, 1)).toEqual([]);
    expect(storiesForHaul(null, 2)).toEqual([]);
  });

  it('gives an item only the story that answers it, matched by the item id in its link', () => {
    expect(storiesForItem(index, 2, 'the-likelihood-of-persistently-low-global-fertility').map((e) => e.slug)).toEqual(['fertility']);
    expect(storiesForItem(index, 2, 'it_01')).toEqual([]);
    expect(storiesForItem(index, 3, 'the-likelihood-of-persistently-low-global-fertility')).toEqual([]);
  });
});

describe('plates and their pictures', () => {
  it('orders plates by movement', () => {
    const s = story().story;
    expect(plateOrder(s).map((p) => p.key)).toEqual(s.movements.flatMap((m) => m.plates));
    expect(plateOrder({ ...s, movements: [] }).map((p) => p.key)).toEqual(s.plates.map((p) => p.key));
  });

  it('thumbnails the first plate, and nothing before pictures exist', () => {
    const s = withPictures(story());
    const first = s.story.movements[0]!.plates[0]!;
    expect(thumbOf(s, 'dark')?.url).toBe(pic('fertility', 1, first, 'dark').url);
    expect(thumbOf(story(), 'light')).toBeNull();
    expect(thumbOf(null, 'light')).toBeNull();
  });

  it('keeps plate pictures under the story path, and nothing else', () => {
    expect(storyPictureFileName(`${BASE}/data/fertility/v2/plates/fall-light.png`)).toBe('data__fertility__v2__plates__fall-light.png');
    expect(storyPictureFileName(`${BASE}/data/fertility/v2/plates/../../x-light.png`)).toBeNull();
    expect(storyPictureFileName(`${BASE}/hauls/002/charts/a.png`)).toBeNull();
    expect(storyPictureFileName(`http://files.fromthedumpsterfire.com/data/fertility/v2/plates/fall-light.png`)).toBeNull();
    const s = withPictures(story());
    expect(storyPictureUrls(s)).toHaveLength(s.story.plates.length * 2);
    expect(storyPictureUrls(story())).toEqual([]);
  });

  it('names who made and who carried a plate’s data', () => {
    const p = story().story.plates[0]!;
    expect(plateSourceLine({ ...p, sources: [{ maker: 'UN', dataset: 'WPP', url: 'https://un.org', licence: 'CC BY 3.0 IGO', retrieved: '2026-11-09', via: { name: 'OWID', url: 'https://owid.org', licence: 'CC BY 4.0' } }] })).toBe('UN, via OWID');
    expect(plateSourceLine({ ...p, sources: [{ maker: 'UN', dataset: 'WPP', url: 'https://un.org', licence: 'CC BY 3.0 IGO', retrieved: '2026-11-09' }] })).toBe('UN');
  });
});
