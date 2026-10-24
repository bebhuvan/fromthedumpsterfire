import type { APIRoute } from 'astro';
import { archive, shelf } from '../lib/runtime';
import { sitemap } from '../lib/xml';

export const GET: APIRoute = async () => {
  const { hauls } = await archive();
  return new Response(sitemap(hauls, await shelf()), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
