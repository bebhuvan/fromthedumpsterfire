// The fdf-web Worker. Pages are rendered by Astro at request time from the bundles in the FILES R2
// bucket, so a Desk publish or correction shows without a deploy. This wrapper runs first: it
// redirects www to the apex, maps the app's deep-link aliases, refuses anything but GET/HEAD, keys
// rendered pages in the edge cache on hauls/index.json's updatedAt, and puts security and cache
// headers on every response. Fonts and hashed CSS/JS skip the Worker entirely (wrangler.jsonc).

import { handle } from '@astrojs/cloudflare/handler';
import { getStore } from '../lib/runtime';
import { IndexUnavailable } from '../lib/store';
import {
  aliasFor,
  APEX,
  cacheControl,
  discoveryLinkHeader,
  EDGE_TTL,
  isImmutable,
  markdownMirrorFor,
  pageCacheKey,
  prefersMarkdown,
  sameOriginRedirect,
  SECURITY,
  type Env,
} from './lib';

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
  passThroughOnException(): void;
}

function finish(res: Response, url: URL, env: Env, head: boolean, cacheStatus?: string, originalPath?: string): Response {
  const out = new Response(head ? null : res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  if (url.protocol === 'https:') out.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  out.headers.set('cache-control', cacheControl(url.pathname, res.status, originalPath !== undefined && originalPath !== url.pathname));
  out.headers.delete('cdn-cache-control');
  const ct = out.headers.get('content-type') ?? '';
  if (ct === 'text/html') out.headers.set('content-type', 'text/html; charset=utf-8');
  if (ct.startsWith('text/html') || ct.startsWith('text/markdown')) {
    out.headers.set('link', discoveryLinkHeader(originalPath ?? url.pathname));
    out.headers.append('vary', 'Accept');
  }
  if (cacheStatus) out.headers.set('x-fdf-cache', cacheStatus);
  if (url.pathname.startsWith('/.well-known/')) out.headers.set('content-type', 'application/json');
  if (env.ENVIRONMENT !== 'production' || url.hostname !== APEX) out.headers.set('x-robots-tag', 'noindex');
  return out;
}

async function unavailable(url: URL, env: Env, head: boolean): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL('/503', url))).catch(() => null);
  const body = page && page.ok ? page.body : 'The site is being checked and will be back in a few minutes.';
  const type = page && page.ok ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  return finish(new Response(body, { status: 503, headers: { 'content-type': type, 'retry-after': '60' } }), url, env, head);
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${APEX}`) {
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD', ...SECURITY } });
    }
    const alias = aliasFor(url.pathname);
    const target = alias ? sameOriginRedirect(alias, url) : null;
    if (target) return Response.redirect(target, 301);

    const originalPath = url.pathname;
    const mdMirror = prefersMarkdown(request.headers.get('accept')) ? markdownMirrorFor(url.pathname) : null;
    if (mdMirror) url.pathname = mdMirror;

    const head = request.method === 'HEAD';
    const get = head || mdMirror ? new Request(url.toString(), { method: 'GET', headers: request.headers }) : request;

    // Static files (assets that slipped past the run_worker_first exclusions) need no data.
    if (isImmutable(url.pathname)) return finish(await env.ASSETS.fetch(get), url, env, head);

    let updatedAt: string;
    try {
      updatedAt = (await getStore().getIndex()).updatedAt;
      // Shelf pages also change when the shelf is published.
      if (url.pathname === '/shelf' || url.pathname.startsWith('/shelf/') || url.pathname === '/sitemap.xml') updatedAt += `|${(await getStore().getShelf())?.updatedAt ?? 'none'}`;
    } catch (err) {
      if (err instanceof IndexUnavailable) return unavailable(url, env, head);
      console.error('[fdf] index read failed', err);
      return unavailable(url, env, head);
    }

    // caches.default is a no-op on workers.dev, so the preview always renders; production caches.
    const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
    const key = new Request(pageCacheKey(url.origin, env.CF_VERSION_METADATA?.id ?? 'dev', updatedAt, url.pathname));
    if (cache) {
      const hit = await cache.match(key).catch(() => undefined);
      if (hit) return finish(hit, url, env, head, 'HIT', originalPath);
    }

    let res: Response;
    try {
      res = await handle(get, env, ctx);
    } catch (err) {
      console.error('[fdf] render failed', url.pathname, err);
      return unavailable(url, env, head);
    }
    if (res.status >= 500 && res.status !== 503) {
      console.error('[fdf] render returned', res.status, url.pathname);
      return unavailable(url, env, head);
    }

    if (cache && res.status === 200 && !res.headers.has('set-cookie')) {
      const stored = new Response(res.clone().body, res);
      stored.headers.set('cache-control', EDGE_TTL);
      ctx.waitUntil(cache.put(key, stored).catch((e: unknown) => console.error('[fdf] cache put failed', e)));
    }
    return finish(res, url, env, head, cache ? 'MISS' : undefined, originalPath);
  },
};
