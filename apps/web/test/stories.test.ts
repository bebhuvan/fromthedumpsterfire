// Data stories on the website: the store reads data/index.json and each story's file, validates both,
// falls back to an earlier version when the current one fails, and never renders bad data.

import { describe, expect, it } from 'vitest';
import { createStore, memoryBucket } from '../src/lib/store';
import { indexEntry, storyPath, type PublishedStory, type Story } from '@fdf/shared/stories';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fs: any = await import('node:fs' as string);
const story: Story = JSON.parse(fs.readFileSync(new URL('../../../packages/shared/fixtures/stories/fertility.json', import.meta.url), 'utf8'));
const quiet = { log: () => {} };
const at = '2026-11-10T00:00:00.000Z';
const pub = (version: number, s: Story = story): PublishedStory => ({ bundleVersion: 1, slug: 'fertility', number: 1, version, publishedAt: at, updatedAt: at, haul: { number: 2, itemId: 'it_1', itemSlug: 'the-paper', itemTitle: 'The Paper' }, story: s });
const files = (v: PublishedStory[], current = v[v.length - 1]!) => ({
  'data/index.json': { bundleVersion: 1, updatedAt: at, stories: [indexEntry(current)] },
  ...Object.fromEntries(v.map((p) => [storyPath(p.slug, p.version), p])),
});

describe('data stories in the store', () => {
  it('reads the index and a story that validates', async () => {
    const store = createStore(memoryBucket(files([pub(1)])), quiet);
    expect((await store.getDataIndex())?.stories.map((s) => s.slug)).toEqual(['fertility']);
    expect((await store.getStory('fertility'))?.version).toBe(1);
  });
  it('falls back to the newest earlier version when the current one fails', async () => {
    const broken = { ...pub(2), story: { ...story, plates: story.plates.slice(0, 1) } };
    const store = createStore(memoryBucket(files([pub(1), broken])), quiet);
    expect((await store.getStory('fertility'))?.version).toBe(1);
  });
  it('renders nothing for an unknown or malformed slug', async () => {
    const store = createStore(memoryBucket(files([pub(1)])), quiet);
    expect(await store.getStory('nope')).toBeNull();
    expect(await store.getStory('../hauls/index')).toBeNull();
  });
  it('ignores an index that fails validation', async () => {
    const f = files([pub(1)]);
    (f['data/index.json'] as { stories: unknown[] }).stories[0] = { slug: 'Bad Slug' };
    const logs: string[] = [];
    const store = createStore(memoryBucket(f), { log: (m) => logs.push(m) });
    expect(await store.getDataIndex()).toBeNull();
    expect(logs.join(' ')).toMatch(/data index rejected/);
  });
  it('has no stories before the first publish', async () => {
    const store = createStore(memoryBucket({}), quiet);
    expect(await store.getDataIndex()).toBeNull();
    expect(await store.getStory('fertility')).toBeNull();
  });
});
