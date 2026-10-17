// The sample Haul a development build carries until the first real Haul is published.
//
// It lives under seed/, a path no published Haul can have: bundles are immutable and never fetched
// again once the app holds them, so a sample kept at hauls/001/v1/haul.json would stand in for the
// real Haul 001 for good. The sample index points at seed/ for the same reason. Launch builds set
// EXPO_PUBLIC_USE_SEED=0 and carry nothing.

import type { Haul, HaulIndex } from '@fdf/shared/haul';
import seedIndex from '@fdf/shared/fixtures/index.json';
import seedHaul from '@fdf/shared/fixtures/haul-001.json';

export const INDEX_PATH = 'hauls/index.json';

export function seedTable(useSeed: boolean): Record<string, unknown> {
  if (!useSeed) return {};
  const index = seedIndex as unknown as HaulIndex;
  const table: Record<string, unknown> = {};
  const hauls = index.hauls.map((h) => {
    const path = `seed/${h.path}`;
    if (h.path === 'hauls/001/v1/haul.json') table[path] = seedHaul as unknown as Haul;
    return { ...h, path };
  });
  table[INDEX_PATH] = { ...index, hauls };
  return table;
}
