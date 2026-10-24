import { describe, expect, it } from 'vitest';
import { BLOCK_KINDS, type Haul, type HaulIndex } from '@fdf/shared/haul';
import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { INDEX_PATH, seedTable } from './seed';
import { seedData } from './seedData';

describe('the sample Hauls in development builds', () => {
  it('never sit at a path a real Haul can have', () => {
    const t = seedTable(seedData);
    const index = t[INDEX_PATH] as HaulIndex;
    expect(index.hauls.map((h) => h.number)).toEqual([3, 2, 1]);
    for (const h of index.hauls) {
      expect(h.path.startsWith('seed/')).toBe(true);
      expect((t[h.path] as Haul).number).toBe(h.number);
    }
    expect(Object.keys(t).filter((k) => k.startsWith('hauls/') && k !== INDEX_PATH)).toEqual([]);
  });

  it('carry every content type and every block kind, so each form can be seen', () => {
    const items = Object.values(seedData.hauls).flatMap((h) => h.items);
    const types = new Set(items.map((i) => i.type));
    const missing = (Object.keys(typeLabel) as ContentType[]).filter((k) => !types.has(k) && !['post', 'video'].includes(k));
    expect(missing).toEqual([]);
    const kinds = new Set(items.flatMap((i) => (i.blocks ?? []).map((b) => b.kind)));
    expect(BLOCK_KINDS.filter((k) => !kinds.has(k) && k !== 'image' && k !== 'audio')).toEqual([]);
  });

  it('are absent from launch builds', () => {
    expect(seedTable(null)).toEqual({});
  });
});
