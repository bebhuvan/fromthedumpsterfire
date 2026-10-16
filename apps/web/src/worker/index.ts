// The fdf-web Worker: a thin layer over the static site. It runs before the assets so it can
// redirect www to the apex, map the app's deep-link aliases, and put security and cache headers
// on every response. Everything else is a static file built by Astro.

import { aliasFor, APEX, cacheControl, SECURITY, type Env } from './lib';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${APEX}`) {
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD', ...SECURITY } });
    }
    const alias = aliasFor(url.pathname);
    if (alias) return Response.redirect(new URL(alias, url).toString(), 301);

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
    if (url.protocol === 'https:') out.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    if (!out.headers.has('cache-control') || res.ok) out.headers.set('cache-control', cacheControl(url.pathname, res.status));
    if (url.pathname.startsWith('/.well-known/')) out.headers.set('content-type', 'application/json');
    if (env.ENVIRONMENT !== 'production' || url.hostname !== APEX) out.headers.set('x-robots-tag', 'noindex');
    return out;
  },
};
