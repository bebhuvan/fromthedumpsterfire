import type { APIRoute } from 'astro';
import { archive } from '../lib/runtime';
import { buildSearchIndex } from '../lib/search';

export const GET: APIRoute = async () => {
  const { hauls } = await archive();
  return new Response(JSON.stringify(buildSearchIndex(hauls)), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
