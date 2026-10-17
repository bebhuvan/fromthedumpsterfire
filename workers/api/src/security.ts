// Request hygiene for the Desk: cross-site request refusal, content-type rules, response headers,
// a narrow rate limit for the public device route, and safe serving of stored files.

/** Routes that accept multipart bodies (uploads, the Android share target). Everything else is JSON. */
export const MULTIPART_ROUTES = new Set(['/api/capture/file', '/api/notes', '/share']);
/** Uploading a PDF to an item already captured (a paper whose download is blocked). POST only. */
const ITEM_FILE = /^\/api\/items\/[A-Za-z0-9_-]{1,64}\/file$/;
export const isMultipartRoute = (method: string, pathname: string) => MULTIPART_ROUTES.has(pathname) || (method === 'POST' && ITEM_FILE.test(pathname));

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** Stored files (uploads, bundles, audio) are inert: no scripts, no rendering as a page of ours. */
export const FILE_CSP = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfVerdict {
  ok: boolean;
  status?: 403 | 415;
  reason?: string;
}

/**
 * Refuse state-changing requests that a browser could have sent from another site. Fails closed:
 * - the Origin header must be present and equal to the Desk's own origin (exact match). The one
 *   exception is the Android share target, a user-initiated navigation: it must say
 *   Sec-Fetch-Site "none" or "same-origin", and any Origin it sends must be ours or "null";
 * - Sec-Fetch-Site, when sent, must be "same-origin" (or "none" for the share target);
 * - writes must carry the custom `x-desk: 1` header (a cross-site page cannot set it without a
 *   CORS preflight, which this Worker never grants);
 * - POST, PUT and PATCH bodies must be JSON (multipart only on the upload routes), whatever their
 *   length, so a plain HTML form cannot post at all.
 */
export function checkCsrf(req: Request): CsrfVerdict {
  if (SAFE_METHODS.has(req.method)) return { ok: true };
  const url = new URL(req.url);
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const isShare = url.pathname === '/share' && req.method === 'POST';
  if (isShare) {
    if (site !== 'none' && site !== 'same-origin') return { ok: false, status: 403, reason: 'share target must be a user navigation' };
    if (origin !== null && origin !== url.origin && origin !== 'null') return { ok: false, status: 403, reason: 'foreign origin' };
  } else {
    if (site !== null && site !== 'same-origin') return { ok: false, status: 403, reason: `cross-site request (${site})` };
    if (origin !== url.origin) return { ok: false, status: 403, reason: origin ? 'foreign origin' : 'missing Origin' };
    if (req.headers.get('x-desk') !== '1') return { ok: false, status: 403, reason: 'missing x-desk header' };
  }
  const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (isMultipartRoute(req.method, url.pathname)) {
    if (type !== 'multipart/form-data') return { ok: false, status: 415, reason: 'expected multipart/form-data' };
  } else if (req.method !== 'DELETE' && type !== 'application/json') {
    return { ok: false, status: 415, reason: 'expected application/json' };
  }
  return { ok: true };
}

/** The only unauthenticated routes, by exact method and path. */
const PUBLIC_ROUTES = new Set(['POST /v1/devices', 'GET /v1/health']);
export const isPublicRoute = (method: string, pathname: string) => PUBLIC_ROUTES.has(`${method} ${pathname}`);

export function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) if (!out.headers.has(k) || k === 'content-security-policy') out.headers.set(k, v);
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'application/pdf', 'application/json', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/opus', 'video/webm']);

/**
 * Headers for serving a stored object. Only known inert types are served inline with their own
 * type; anything else (HTML snapshots, SVG, unknown) is a download of application/octet-stream.
 */
export function fileHeaders(contentType: string | undefined, name = 'file'): Record<string, string> {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const inline = INLINE_TYPES.has(type);
  return {
    'content-type': inline ? (type === 'application/json' ? 'application/json; charset=utf-8' : type) : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\w.\-]+/g, '_')}"`,
    'content-security-policy': FILE_CSP,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, max-age=3600',
  };
}

/** A small in-isolate limiter, used when the Rate Limiting binding is not configured. */
const buckets = new Map<string, { n: number; reset: number }>();
export function localLimit(key: string, limit: number, periodMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { n: 1, reset: now + periodMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return true;
  }
  b.n++;
  return b.n <= limit;
}
