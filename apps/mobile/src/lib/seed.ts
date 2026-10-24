// The sample Hauls a development build carries until real Hauls are published: Haul 001 and the
// development samples 002 and 003 (packages/shared/fixtures/dev), which hold every content type and
// every block kind so each form can be checked on a phone.
//
// They live under seed/, a path no published Haul can have: bundles are immutable and never fetched
// again once the app holds them, so a sample kept at hauls/001/v1/haul.json would stand in for the
// real Haul 001 for good. The sample index points at seed/ for the same reason.
//
// Launch builds set EXPO_PUBLIC_USE_SEED=0 and carry nothing: data.ts only requires seedData behind
// that flag, and Metro folds the inlined flag away before it collects dependencies, so the fixtures
// are not even in the bundle (checked with `expo export`; see apps/mobile/AGENTS.md).

import type { Haul, HaulIndex } from '@fdf/shared/haul';
import { SHELF_PATH, type Shelf } from '@fdf/shared/shelf';

export const INDEX_PATH = 'hauls/index.json';

export interface SeedData {
  index: HaulIndex;
  /** Sample bundles by their published path, e.g. "hauls/002/v1/haul.json". */
  hauls: Record<string, Haul>;
  /** The development shelf (fixtures/dev/shelf.json). Mutable and refreshed like the index, so it sits
   * at the real path: a published shelf replaces it as soon as one exists. */
  shelf?: Shelf;
}

export function seedTable(data: SeedData | null): Record<string, unknown> {
  if (!data) return {};
  const table: Record<string, unknown> = {};
  const hauls = data.index.hauls
    .filter((h) => data.hauls[h.path])
    .map((h) => {
      const path = `seed/${h.path}`;
      table[path] = data.hauls[h.path];
      return { ...h, path };
    });
  table[INDEX_PATH] = { ...data.index, hauls };
  if (data.shelf) table[SHELF_PATH] = data.shelf;
  return table;
}
