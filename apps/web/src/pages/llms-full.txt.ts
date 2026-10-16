import type { APIRoute } from 'astro';
import { llmsFullTxt } from '../lib/markdown';
import { archive } from '../lib/runtime';

export const GET: APIRoute = async () => {
  const { hauls } = await archive();
  return new Response(llmsFullTxt(hauls), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
};
