import type { APIRoute } from 'astro';
import { llmsTxt } from '../lib/markdown';
import { archive } from '../lib/runtime';

export const GET: APIRoute = async () => {
  const { hauls } = await archive();
  return new Response(llmsTxt(hauls), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
};
