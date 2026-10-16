// Pure pieces of the fdf-web Worker, kept apart so they can be tested (a Worker module may only
// export handlers).

export interface Env {
  ASSETS: { fetch(input: Request | string): Promise<Response> };
  /** "production" serves the canonical site; anything else is marked noindex. */
  ENVIRONMENT?: string;
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
export function aliasFor(pathname: string): string | null {
  const note = /^\/haul\/(\d+)\/note\/?$/.exec(pathname);
  if (note) return `/haul/${note[1]}#field-note`;
  const padded = /^\/haul\/0+(\d+)(\/.*)?$/.exec(pathname);
  if (padded) return `/haul/${padded[1]}${padded[2] ?? ''}`;
  if (pathname === '/hauls' || pathname === '/hauls/') return '/archive';
  if (pathname === '/index.html') return '/';
  return null;
}

export function cacheControl(pathname: string, status: number): string {
  if (status >= 400) return 'public, max-age=60';
  if (pathname.startsWith('/_astro/') || pathname.startsWith('/fonts/')) return 'public, max-age=31536000, immutable';
  // Pages and the index change when a Haul is published or corrected.
  return 'public, max-age=300, must-revalidate';
}
