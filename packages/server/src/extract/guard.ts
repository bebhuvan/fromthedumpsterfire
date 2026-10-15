// SSRF guard for every fetch of an editor-supplied (or source-supplied) URL. Only the public
// internet is reachable: http/https on default ports, no credentials in the URL, no internal
// hostnames, and every resolved address (A and AAAA, via DNS over HTTPS) must be public.
// Redirects are followed by hand, re-checking each hop, with a hop limit.
//
// Workers egress cannot reach a private network on its own, so this is defence in depth; it also
// keeps the pipeline from being pointed at Cloudflare-internal or metadata endpoints by name.

export class BlockedUrlError extends Error {
  readonly fatal = true;
  constructor(message: string) {
    super(`Blocked URL: ${message}`);
  }
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.home.arpa', '.localdomain', '.test', '.invalid', '.example', '.onion'];
const BLOCKED_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data', 'wpad']);

/** Parse a dotted IPv4 address (the URL parser already normalises decimal, hex and octal forms). */
function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

export function isPrivateIPv4(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expand an IPv6 literal to eight 16-bit groups. */
function ipv6Groups(host: string): number[] | null {
  let h = host.replace(/^\[|\]$/g, '').toLowerCase();
  const zone = h.indexOf('%');
  if (zone >= 0) h = h.slice(0, zone);
  if (!h.includes(':')) return null;
  // An embedded IPv4 tail (::ffff:1.2.3.4).
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (v4) {
    const p = ipv4(v4[1]!);
    if (!p) return null;
    h = h.slice(0, -v4[1]!.length) + `${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const [head, tail] = h.split('::') as [string, string | undefined];
  if (h.split('::').length > 2) return null;
  const hp = head ? head.split(':') : [];
  const tp = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? 8 - hp.length - tp.length : 0;
  if (fill < 0) return null;
  const groups = [...hp, ...Array(fill).fill('0'), ...tp].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function isPrivateIPv6(g: number[]): boolean {
  const all0 = g.slice(0, 7).every((x) => x === 0);
  if (all0 && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the IPv4 inside.
  const mapped = g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0);
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return isPrivateIPv4([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]);
  const first = g[0]!;
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && g[1] === 0x0db8 || // documentation
    first === 0x2002 // 6to4: embeds an IPv4 we cannot vouch for
  );
}

/** True if the address literal (v4 or v6) is not on the public internet. */
export function isBlockedAddress(addr: string): boolean {
  const v4 = ipv4(addr);
  if (v4) return isPrivateIPv4(v4);
  const v6 = ipv6Groups(addr);
  if (v6) return isPrivateIPv6(v6);
  return true; // not an address we understand
}

/** Static checks on a URL: scheme, port, credentials, hostname shape and IP literals. */
export function assertPublicUrl(raw: string | URL): URL {
  let u: URL;
  try {
    u = new URL(raw.toString());
  } catch {
    throw new BlockedUrlError('not a valid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedUrlError(`scheme ${u.protocol} is not allowed`);
  if (u.username || u.password) throw new BlockedUrlError('credentials in URLs are not allowed');
  if (u.port && !((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443'))) {
    throw new BlockedUrlError(`port ${u.port} is not allowed`);
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new BlockedUrlError('no host');
  if (host.startsWith('[') || host.includes(':')) {
    if (isBlockedAddress(host)) throw new BlockedUrlError('private or reserved IPv6 address');
    return u;
  }
  if (ipv4(host)) {
    if (isBlockedAddress(host)) throw new BlockedUrlError('private or reserved IPv4 address');
    return u;
  }
  // Anything numeric-looking that the parser did not normalise to dotted IPv4 is refused.
  if (/^[0-9.x]+$/i.test(host)) throw new BlockedUrlError('unusual numeric host');
  if (!host.includes('.')) throw new BlockedUrlError('single-label hostnames are not public');
  if (BLOCKED_NAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new BlockedUrlError(`${host} is not a public hostname`);
  return u;
}

export type Resolver = (host: string) => Promise<string[]>;

/** Resolve A and AAAA records with Cloudflare DNS over HTTPS. */
export const dohResolve: Resolver = async (host) => {
  const out: string[] = [];
  for (const type of ['A', 'AAAA']) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new BlockedUrlError(`could not resolve ${host}`);
    const j = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    for (const a of j.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
  }
  return out;
};

const resolved = new Map<string, { at: number; ok: boolean }>();

/** Static checks plus: every address the hostname resolves to is public. */
export async function assertPublicDestination(raw: string | URL, resolve: Resolver = dohResolve): Promise<URL> {
  const u = assertPublicUrl(raw);
  const host = u.hostname.toLowerCase();
  if (ipv4(host) || host.includes(':') || host.startsWith('[')) return u;
  const cached = resolved.get(host);
  if (cached && Date.now() - cached.at < 60_000) {
    if (!cached.ok) throw new BlockedUrlError(`${host} resolves to a private address`);
    return u;
  }
  const addrs = await resolve(host);
  const ok = addrs.length > 0 && addrs.every((a) => !isBlockedAddress(a));
  resolved.set(host, { at: Date.now(), ok });
  if (!addrs.length) throw new BlockedUrlError(`${host} does not resolve`);
  if (!ok) throw new BlockedUrlError(`${host} resolves to a private address`);
  return u;
}

export interface GuardedInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  resolve?: Resolver;
}

/** Headers never forwarded to a source, whatever the caller passes. */
const STRIPPED = /^(cookie|authorization|proxy-authorization|cf-[\w-]+|x-forwarded-[\w-]+|x-real-ip|forwarded|cf-access-[\w-]+)$/i;

/**
 * fetch() for untrusted URLs: validates the destination, follows redirects manually (re-validating
 * each hop, at most `maxRedirects`), strips credentials and internal headers, and times out.
 */
export async function guardedFetch(raw: string, init: GuardedInit = {}): Promise<Response> {
  const { maxRedirects = 5, timeoutMs = 25_000 } = init;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(init.headers ?? {})) if (!STRIPPED.test(k)) headers[k] = v;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = await assertPublicDestination(raw, init.resolve);
  let method = init.method ?? 'GET';
  let body = init.body;
  for (let hop = 0; ; hop++) {
    const res = await fetch(url.toString(), { method, headers, body, redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      if (hop >= maxRedirects) throw new BlockedUrlError(`more than ${maxRedirects} redirects`);
      url = await assertPublicDestination(new URL(res.headers.get('location')!, url), init.resolve);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    // Expose the final URL to callers (Response.url is read-only and empty for manual fetches).
    Object.defineProperty(res, 'finalUrl', { value: url.toString() });
    return res;
  }
}

export const finalUrlOf = (res: Response, fallback: string): string => (res as Response & { finalUrl?: string }).finalUrl ?? (res.url || fallback);
