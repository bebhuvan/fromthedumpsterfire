// Request hygiene for the Desk: cross-site request refusal, content-type rules, response headers,
// a narrow rate limit for the public device route, and safe serving of stored files.

/** Routes that accept multipart bodies (uploads, the Android share target). Everything else is JSON. */
export const MULTIPART_ROUTES = new Set(['/api/capture/file', '/api/notes', '/share']);

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
 * Refuse state-changing requests that a browser could have sent from another site:
 * - Sec-Fetch-Site must be same-origin (the share target may also be "none": a user-initiated navigation);
 * - an Origin header, when present, must be the Desk's own origin;
 * - API writes must carry the custom `x-desk: 1` header (a cross-site page cannot set it without a
 *   CORS preflight, which this Worker never grants);
 * - bodies must be JSON, except on the upload routes, so a plain HTML form cannot post at all.
 */
export function checkCsrf(req: Request): CsrfVerdict {
  if (SAFE_METHODS.has(req.method)) return { ok: true };
  const url = new URL(req.url);
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const isShare = url.pathname === '/share';
  if (site && !(site === 'same-origin' || (isShare && site === 'none'))) return { ok: false, status: 403, reason: `cross-site request (${site})` };
  if (origin && origin !== url.origin && !(isShare && origin === 'null')) return { ok: false, status: 403, reason: 'foreign origin' };
  if (url.pathname.startsWith('/api/') && req.headers.get('x-desk') !== '1') return { ok: false, status: 403, reason: 'missing x-desk header' };
  const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const hasBody = req.headers.get('content-length') !== '0' && req.method !== 'DELETE';
  if (MULTIPART_ROUTES.has(url.pathname)) {
    if (type !== 'multipart/form-data') return { ok: false, status: 415, reason: 'expected multipart/form-data' };
  } else if (hasBody && type !== 'application/json') {
    return { ok: false, status: 415, reason: 'expected application/json' };
  }
  return { ok: true };
}

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
