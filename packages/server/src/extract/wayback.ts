// The Wayback Machine as a fallback when a site refuses Cloudflare's servers: the latest archived
// copy of the page, read raw (the id_ form, without the archive's toolbar or rewritten links), else
// a fresh capture through Save Page Now, polled for a bounded time. The Internet Archive fetches
// the page from its own servers, so a site that turns us away usually lets it through.
//
// The item keeps the original link; the source records where the text came from and when the
// copy was made. No account and no key: anonymous Save Page Now, our own user agent.

import { fetchBytes, decode } from './http';
import { readCapped } from './stream';

const MAX_PAGE = 15 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const ARCHIVE = 'https://web.archive.org';

/** How long a fetch step waits for Save Page Now, and how often it asks. Tests shorten these. */
export const SAVE_TIMING = { maxWaitMs: 90_000, pollMs: 6_000 };

export interface WaybackCopy {
  html: string;
  /** The copy a person can open (with the archive's toolbar). */
  url: string;
  /** The raw copy we read. */
  raw: string;
  timestamp: string;
  archivedAt: string;
  saved: boolean;
}

export interface SaveOptions {
  /** Longest wait for a fresh capture before giving up (the next retry finds it if it lands later). */
  maxWaitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** 20261018022210 -> 2026-10-18T02:22:10Z */
export function waybackTime(ts: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(ts);
  if (!m) return ts;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}Z`;
}

/** The address to look up: no fragment, no tracking parameters. */
export function archiveKey(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_\w+|fbclid|gclid|ref|ref_src|source|triedRedirect|publication_id|post_id|isFreemail)$/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

async function json<T>(url: string): Promise<T | null> {
  const r = await fetchBytes(url, { maxBytes: MAX_JSON, timeoutMs: 20_000, headers: { accept: 'application/json' } }).catch(() => null);
  if (!r || r.status >= 400) return null;
  try {
    return JSON.parse(decode(r.bytes, r.contentType)) as T;
  } catch {
    return null;
  }
}

/** The newest capture that the archive recorded as a 200, if any. */
export async function latestSnapshot(raw: string): Promise<{ timestamp: string; original: string } | null> {
  const key = archiveKey(raw);
  const rows = await json<string[][]>(`${ARCHIVE}/cdx/search/cdx?url=${encodeURIComponent(key)}&output=json&limit=-1&filter=statuscode:200&fl=timestamp,original`);
  const last = rows && rows.length > 1 ? rows[rows.length - 1] : null;
  if (last && /^\d{14}$/.test(last[0] ?? '') && last[1]) return { timestamp: last[0]!, original: last[1] };
  // The availability API answers from a different index; worth one more look when CDX is empty.
  const avail = await json<{ archived_snapshots?: { closest?: { available?: boolean; status?: string; timestamp?: string; url?: string } } }>(
    `https://archive.org/wayback/available?url=${encodeURIComponent(key)}`,
  );
  const c = avail?.archived_snapshots?.closest;
  if (c?.available && c.status === '200' && c.timestamp && /^\d{14}$/.test(c.timestamp)) return { timestamp: c.timestamp, original: key };
  return null;
}

async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  // Raw copies are sometimes the stored gzip body with no Content-Encoding header.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return readCapped(stream as ReadableStream<Uint8Array>, MAX_PAGE, 'archived page');
}

/** Read one capture raw. Null when the archive does not serve it as a 200 page. */
export async function fetchSnapshot(timestamp: string, original: string, saved = false): Promise<WaybackCopy | null> {
  const raw = `${ARCHIVE}/web/${timestamp}id_/${original}`;
  const r = await fetchBytes(raw, { maxBytes: MAX_PAGE, timeoutMs: 30_000 });
  if (r.status !== 200) return null;
  const bytes = await gunzipIfNeeded(r.bytes);
  // The archive redirects to the nearest capture; read its timestamp from where we landed.
  const landed = /\/web\/(\d{14})id_\//.exec(r.url)?.[1] ?? timestamp;
  return {
    html: decode(bytes, r.contentType),
    url: `${ARCHIVE}/web/${landed}/${original}`,
    raw,
    timestamp: landed,
    archivedAt: waybackTime(landed),
    saved,
  };
}

export type SaveResult = { ok: true; timestamp: string; original: string } | { ok: false; reason: string };

/**
 * Ask Save Page Now for a fresh capture and wait for it, at most `maxWaitMs`. Anonymous captures
 * are rate-limited by the archive; a refusal comes back as a reason, not an exception.
 */
export async function savePageNow(raw: string, opts: SaveOptions = {}): Promise<SaveResult> {
  const { maxWaitMs = SAVE_TIMING.maxWaitMs, pollMs = SAVE_TIMING.pollMs, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  const key = archiveKey(raw);
  const start = await fetchBytes(`${ARCHIVE}/save`, {
    method: 'POST',
    body: new URLSearchParams({ url: key }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
    maxBytes: MAX_JSON,
    timeoutMs: 30_000,
  }).catch((e) => ({ status: 0, bytes: new Uint8Array(), contentType: '', url: '', error: String(e) }));
  const page = decode(start.bytes, start.contentType);
  const job = /spn2-[0-9a-f]{16,64}/.exec(page)?.[0];
  if (!job) {
    const said = /<p>\s*([^<]{10,240})<\/p>/.exec(page.replace(/\s+/g, ' '))?.[1]?.trim();
    return { ok: false, reason: start.status === 429 ? 'Save Page Now is busy (429)' : said ? `Save Page Now said: ${said}` : `Save Page Now did not start (${start.status || 'no answer'})` };
  }
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    await sleep(pollMs);
    const s = await json<{ status?: string; timestamp?: string; original_url?: string; http_status?: number; status_ext?: string; message?: string }>(`${ARCHIVE}/save/status/${job}`);
    if (s?.status === 'success' && s.timestamp) {
      if (s.http_status && s.http_status !== 200) return { ok: false, reason: `the archive saw a ${s.http_status} from the site too` };
      return { ok: true, timestamp: s.timestamp, original: s.original_url ?? key };
    }
    if (s?.status === 'error') return { ok: false, reason: `Save Page Now failed (${s.status_ext ?? s.message ?? 'error'})` };
    if (Date.now() + pollMs > deadline) return { ok: false, reason: `Save Page Now was still working after ${Math.round(maxWaitMs / 1000)} s` };
  }
}
