// Pure pieces of the fdf-web Worker, kept apart so they can be tested (a Worker module may only
// export handlers).

import { newsletter } from '../lib/newsletter';

export interface Env {
  ASSETS: { fetch(input: Request | string): Promise<Response> };
  /** "production" serves the canonical site; anything else is marked noindex. */
  ENVIRONMENT?: string;
  /** Changes on every deploy, so a new build never serves pages cached by the old one. */
  CF_VERSION_METADATA?: { id: string };
}

export const APEX = 'fromthedumpsterfire.com';

export const CSP = [
  "default-src 'none'",
  // Cloudflare Web Analytics: the edge injects its beacon, which loads from static.cloudflareinsights.com
  // and reports to cloudflareinsights.com. Cookieless; nothing else third-party runs.
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self'",
  "img-src 'self' https:",
  "media-src 'self' https:",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  // Only the players the bundle can name (embedSrc in @fdf/shared/haul), and the newsletter's own
  // sign-up form on /subscribe once its address is set (lib/newsletter.ts).
  ['frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://embed.podcasts.apple.com', newsletter?.origin]
    .filter(Boolean)
    .join(' '),
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY: Record<string, string> = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

/** Redirects that keep app deep links and old shapes working. Returns a path or null. */
export function aliasFor(raw: string): string | null {
  // "//host" would resolve to another origin; collapse any run of leading slashes first.
  const pathname = '/' + raw.replace(/^[\/\\]+/, '');
  if (pathname !== raw) return pathname;
  const padded = /^\/haul\/0+(\d+)(\/.*|\.md)?$/.exec(pathname);
  if (padded) return `/haul/${padded[1]}${padded[2] ?? ''}`;
  if (pathname === '/hauls' || pathname === '/hauls/') return '/archive';
  if (pathname === '/index.html') return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '') || '/';
  return null;
}

/** A same-origin absolute URL for an alias, or null if it would leave this origin. */
export function sameOriginRedirect(alias: string, base: URL): string | null {
  const to = new URL(alias, base);
  return to.origin === base.origin ? to.toString() : null;
}

/** Markdown mirror path for a canonical HTML route, or null when none applies. */
export function markdownMirrorFor(pathname: string): string | null {
  if (pathname.endsWith('.md') || pathname.endsWith('.txt') || pathname.endsWith('.xml') || pathname.endsWith('.json')) {
    return null;
  }
  if (pathname === '/' || pathname === '/about' || pathname === '/archive' || pathname === '/threads') {
    return '/llms.txt';
  }
  if (/^\/haul\/[1-9]\d{0,5}$/.test(pathname)) return `${pathname}.md`;
  if (/^\/haul\/[1-9]\d{0,5}\/thread\/[a-z0-9-]+$/i.test(pathname)) return `${pathname}.md`;
  if (/^\/haul\/[1-9]\d{0,5}\/[a-z0-9-]+$/i.test(pathname)) return `${pathname}.md`;
  return null;
}

/** True when an HTTP Accept header explicitly prefers text/markdown over text/html. */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  let mdQ = -1;
  let htmlQ = -1;
  for (const part of accept.split(',')) {
    const [media, ...params] = part.trim().split(';');
    const mime = media?.trim().toLowerCase();
    let q = 1.0;
    for (const param of params) {
      const [k, v] = param.trim().split('=');
      if (k?.trim().toLowerCase() === 'q') {
        const parsed = Number.parseFloat(v?.trim() ?? '1');
        if (!Number.isNaN(parsed)) q = parsed;
      }
    }
    if (mime === 'text/markdown' && q > mdQ) mdQ = q;
    if (mime === 'text/html' && q > htmlQ) htmlQ = q;
  }
  return mdQ > 0 && mdQ >= htmlQ;
}

/** HTTP Link header advertising feeds and Markdown mirrors for crawlers and LLM agents. */
export function discoveryLinkHeader(pathname: string): string {
  const links = [
    `<https://${APEX}/feed.xml>; rel="alternate"; type="application/rss+xml"`,
    `<https://${APEX}/llms.txt>; rel="llms-txt"`,
  ];
  const md = markdownMirrorFor(pathname);
  if (md) links.push(`<https://${APEX}${md}>; rel="alternate"; type="text/markdown"`);
  return links.join(', ');
}

/** Files that never change under a given name; everything else is a page or a generated file. */
export const isImmutable = (pathname: string) => pathname.startsWith('/_astro/') || pathname.startsWith('/fonts/');

/** What the browser may keep. Pages and generated files are short so a publish shows within a minute. */
export function cacheControl(pathname: string, status: number, negotiated = false): string {
  if (status >= 500) return 'no-store';
  // A Markdown answer on an HTML address (Accept negotiation). Shared caches in front of the Worker
  // key on the URL and ignore Vary, so it must never be stored there or browsers could be served it.
  if (negotiated) return 'private, no-store';
  if (status >= 400) return 'public, max-age=60';
  if (isImmutable(pathname)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=30, must-revalidate';
}

/** How long the edge keeps a rendered page. Safe to be long: the key changes on every publish. */
export const EDGE_TTL = 'public, max-age=86400';

/**
 * The edge cache key for a rendered page: deploy version + the index's updatedAt + path. The query
 * string is ignored (no page reads it on the server), so it can't be used to bust the cache.
 */
export function pageCacheKey(origin: string, version: string, updatedAt: string, pathname: string): string {
  return `${origin}/__page/${encodeURIComponent(version)}/${encodeURIComponent(updatedAt)}${pathname}`;
}
