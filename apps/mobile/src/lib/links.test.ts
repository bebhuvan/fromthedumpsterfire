import { describe, expect, it } from 'vitest';
import { getStateFromPath } from '@react-navigation/core';
import { screens } from './links';

/** The route a website path opens, with its params. */
function open(path: string) {
  const state = getStateFromPath(path, { screens });
  const route = state?.routes.at(-1);
  return route ? { name: route.name, params: route.params } : null;
}

describe('links from the website', () => {
  it('opens the Atlas and its stories at the website’s paths', () => {
    expect(open('/data')).toEqual({ name: 'Atlas', params: undefined });
    expect(open('/data/fertility')).toEqual({ name: 'Story', params: { slug: 'fertility' } });
    expect(open('/data/fertility#floor')).toEqual({ name: 'Story', params: { slug: 'fertility' } });
  });

  it('still opens Hauls, items, threads and the shelf', () => {
    expect(open('/haul/2')).toEqual({ name: 'Haul', params: { n: 2 } });
    expect(open('/haul/2/the-likelihood-of-persistently-low-global-fertility')).toEqual({ name: 'Item', params: { n: 2, item: 'the-likelihood-of-persistently-low-global-fertility' } });
    expect(open('/haul/2/thread/memory')).toEqual({ name: 'Thread', params: { n: 2, id: 'memory' } });
    expect(open('/haul/2/note')).toEqual({ name: 'Note', params: { n: 2 } });
    expect(open('/shelf/middlemarch')).toEqual({ name: 'Book', params: { id: 'middlemarch' } });
  });
});
