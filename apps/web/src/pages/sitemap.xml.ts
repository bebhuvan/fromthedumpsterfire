import type { APIRoute } from 'astro';
import { archive } from '../lib/runtime';
import { sitemap } from '../lib/xml';

export const GET: APIRoute = async () => {
  const { hauls } = await archive();
  return new Response(sitemap(hauls), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
