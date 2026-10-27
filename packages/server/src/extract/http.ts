// Outbound fetches: one user agent, timeouts and size limits for everything the pipeline reads.

import { FatalError } from '../util';
import { finalUrlOf, guardedFetch } from './guard';

export const USER_AGENT = 'FromTheDumpsterFireDesk/1.0 (+https://fromthedumpsterfire.com; editor desk)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface Fetched {
  url: string;
  status: number;
  contentType: string;
  bytes: Uint8Array;
  headers?: Headers;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Some publishers serve a stub to unknown agents; a browser UA gets the real page. */
  browser?: boolean;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

export async function fetchBytes(url: string, opts: FetchOptions = {}): Promise<Fetched> {
  const { timeoutMs = 25_000, maxBytes = 40 * 1024 * 1024 } = opts;
  const res = await guardedFetch(url, {
    method: opts.method ?? 'GET',
    body: opts.body,
    timeoutMs,
    headers: {
      'user-agent': opts.browser ? BROWSER_UA : USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
      ...opts.headers,
    },
  });
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new FatalError(`Source is too large (${Math.round(declared / 1e6)} MB)`);
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FatalError(`Source is too large (over ${Math.round(maxBytes / 1e6)} MB)`);
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }
  return { url: finalUrlOf(res, url), status: res.status, contentType: res.headers.get('content-type') ?? '', bytes, headers: res.headers };
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<Fetched & { text: string }> {
  const r = await fetchBytes(url, { maxBytes: 8 * 1024 * 1024, ...opts });
  return { ...r, text: decode(r.bytes, r.contentType) };
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const r = await fetchText(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  if (r.status >= 400) throw new Error(`${url} returned ${r.status}`);
  return JSON.parse(r.text) as T;
}

export function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  try {
    return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Whether a link resolves: a 2xx after redirects. HEAD first, then GET whenever HEAD fails. */
export async function checkLink(url: string): Promise<{ ok: boolean; status: number; finalUrl: string }> {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await guardedFetch(url, { method, headers: { 'user-agent': BROWSER_UA, accept: '*/*' }, timeoutMs: 15_000 });
      await res.body?.cancel();
      if (res.ok) return { ok: true, status: res.status, finalUrl: finalUrlOf(res, url) };
      // Servers mishandle HEAD in every way (404, 406, 405…), so a failed HEAD is only a reason to ask
      // again with GET; only GET's answer decides.
      if (method === 'GET') return { ok: false, status: res.status, finalUrl: finalUrlOf(res, url) };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Blocked URL')) return { ok: false, status: 0, finalUrl: url };
      if (method === 'GET') return { ok: false, status: 0, finalUrl: url };
    }
  }
  return { ok: false, status: 0, finalUrl: url };
}
