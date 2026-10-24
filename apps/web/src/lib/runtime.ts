// The one store per isolate, bound to the FILES R2 bucket. Pages and the Worker wrapper share it,
// so the index read for the cache key is the same one the page renders from.
//
// FDF_USE_SEED=1 (never honoured in production) swaps the bucket for the sample Haul in
// packages/shared/fixtures, for local development without R2 data.

import { env } from 'cloudflare:workers';
import { createStore, memoryBucket, type Bucket, type Store } from './store';

let store: Store | undefined;
let seeded: Promise<Bucket> | undefined;

async function seedBucket(): Promise<Bucket> {
  // Hauls 002 and 003 are development samples (fixtures/dev) that carry every content type, every
  // block kind and a second and third edition colour.
  const [index, h1, h2, h3, shelf] = await Promise.all([
    import('@fdf/shared/fixtures/dev/index.json'),
    import('@fdf/shared/fixtures/haul-001.json'),
    import('@fdf/shared/fixtures/dev/haul-002.json'),
    import('@fdf/shared/fixtures/dev/haul-003.json'),
    import('@fdf/shared/fixtures/dev/shelf.json'),
  ]);
  return memoryBucket({
    'hauls/index.json': index.default,
    'hauls/001/v1/haul.json': h1.default,
    'hauls/002/v1/haul.json': h2.default,
    'hauls/003/v1/haul.json': h3.default,
    'shelf/shelf.json': shelf.default,
  });
}

function bucket(): Bucket {
  const e = env as { FILES?: Bucket; FDF_USE_SEED?: string; ENVIRONMENT?: string };
  if (e.FDF_USE_SEED === '1' && e.ENVIRONMENT !== 'production') {
    seeded ??= seedBucket();
    return {
      get: async (k) => (await seeded!).get(k),
      head: async (k) => (await seeded!).head(k),
    };
  }
  if (!e.FILES) throw new Error('FILES R2 binding is missing');
  return e.FILES;
}

export function getStore(): Store {
  store ??= createStore(bucket());
  return store;
}

export const archive = () => getStore().archive();

export const shelf = () => getStore().getShelf();
