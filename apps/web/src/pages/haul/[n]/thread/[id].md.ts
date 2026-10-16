import type { APIRoute } from 'astro';
import { threadMarkdown } from '../../../../lib/markdown';
import { archive } from '../../../../lib/runtime';
import { findHaul } from '../../../../lib/site';

export const GET: APIRoute = async ({ params }) => {
  const a = await archive();
  const found = findHaul(a, params.n);
  if (found.kind === 'missing') return new Response(null, { status: 404 });
  if (found.kind === 'failed') return new Response('Unavailable', { status: 503 });
  const thread = found.haul.threads.find((t) => t.id === params.id);
  if (!thread) return new Response(null, { status: 404 });
  return new Response(threadMarkdown(found.haul, thread, a.hauls), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
};
