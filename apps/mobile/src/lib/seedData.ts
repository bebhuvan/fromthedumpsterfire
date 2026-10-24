// The sample bundles themselves. Only required behind EXPO_PUBLIC_USE_SEED (data.ts), so launch
// builds never include this file or the fixtures it pulls in.
import type { Haul, HaulIndex } from '@fdf/shared/haul';
import index from '@fdf/shared/fixtures/dev/index.json';
import haul001 from '@fdf/shared/fixtures/haul-001.json';
import haul002 from '@fdf/shared/fixtures/dev/haul-002.json';
import haul003 from '@fdf/shared/fixtures/dev/haul-003.json';
import type { SeedData } from './seed';

export const seedData: SeedData = {
  index: index as unknown as HaulIndex,
  hauls: {
    'hauls/001/v1/haul.json': haul001 as unknown as Haul,
    'hauls/002/v1/haul.json': haul002 as unknown as Haul,
    'hauls/003/v1/haul.json': haul003 as unknown as Haul,
  },
};
