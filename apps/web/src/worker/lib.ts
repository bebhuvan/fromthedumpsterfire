// Pure pieces of the fdf-web Worker, kept apart so they can be tested (a Worker module may only
// export handlers).

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
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https:",
  "media-src 'self' https:",
  "font-src 'self'",
  "connect-src 'self'",
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
  const note = /^\/haul\/(\d+)\/note\/?$/.exec(pathname);
  if (note) return `/haul/${note[1]}#field-note`;
  const padded = /^\/haul\/0+(\d+)(\/.*)?$/.exec(pathname);
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

/** Files that never change under a given name; everything else is a page or a generated file. */
export const isImmutable = (pathname: string) => pathname.startsWith('/_astro/') || pathname.startsWith('/fonts/');

/** What the browser may keep. Pages and generated files are short so a publish shows within a minute. */
export function cacheControl(pathname: string, status: number): string {
  if (status >= 500) return 'no-store';
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
