// Small helpers used everywhere on the server side.

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Time-ordered, URL-safe id: 10 chars of milliseconds + 10 random chars (Crockford base32). */
export function newId(prefix = ''): string {
  let t = Date.now();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % 32];
  return prefix + time + rand;
}

export const nowIso = () => new Date().toISOString();

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** A lowercase slug for item ids in the bundle: "As We May Think" -> "as-we-may-think". */
export function slugify(s: string, max = 48): string {
  const slug = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug || 'item';
  // Cut at a word break, not mid-word ("…largest-democra"), unless that would lose more than half.
  const cut = slug.slice(0, max + 1);
  const end = cut.endsWith('-') ? max : cut.lastIndexOf('-');
  return (end > max / 2 ? slug.slice(0, end) : slug.slice(0, max)).replace(/-+$/, '') || 'item';
}

export function wordCount(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

/** Reading minutes at 230 words a minute, at least one. */
export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 230));

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Errors a workflow step should not retry (bad input, spend ceiling, unsupported source). */
export class FatalError extends Error {
  readonly fatal = true;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Weekday short name in India time, for the route ("Tue", "Wed"). */
export function weekdayIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

export function dateIst(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}
