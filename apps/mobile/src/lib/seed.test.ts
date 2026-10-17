import { describe, expect, it } from 'vitest';
import type { HaulIndex } from '@fdf/shared/haul';
import { INDEX_PATH, seedTable } from './seed';

describe('the sample Haul in development builds', () => {
  it('never sits at a path a real Haul can have', () => {
    const t = seedTable(true);
    const index = t[INDEX_PATH] as HaulIndex;
    expect(index.hauls.length).toBeGreaterThan(0);
    for (const h of index.hauls) {
      expect(h.path.startsWith('seed/')).toBe(true);
      expect(t[h.path]).toBeTruthy();
    }
    expect(Object.keys(t).filter((k) => k.startsWith('hauls/') && k !== INDEX_PATH)).toEqual([]);
  });
  it('is absent from launch builds', () => {
    expect(seedTable(false)).toEqual({});
  });
});
