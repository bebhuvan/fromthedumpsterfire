import type { APIRoute } from 'astro';
import { archive } from '../lib/data';
import { rss } from '../lib/xml';

export const GET: APIRoute = async () => {
  const { hauls } = await archive();
  return new Response(rss(hauls), { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
