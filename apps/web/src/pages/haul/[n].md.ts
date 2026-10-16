import type { APIRoute } from 'astro';
import { haulMarkdown } from '../../lib/markdown';
import { archive } from '../../lib/runtime';
import { findHaul } from '../../lib/site';

export const GET: APIRoute = async ({ params }) => {
  const a = await archive();
  const found = findHaul(a, params.n);
  if (found.kind === 'missing') return new Response(null, { status: 404 });
  if (found.kind === 'failed') return new Response('Unavailable', { status: 503 });
  return new Response(haulMarkdown(found.haul, a.hauls), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
};
