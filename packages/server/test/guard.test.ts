// SSRF guard: only public http(s) destinations, every redirect hop re-checked.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicDestination, assertPublicUrl, guardedFetch, isBlockedAddress } from '../src/extract/guard';

const publicDns = async () => ['93.184.216.34'];

describe('address ranges', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', 'ff02::1',
  ])('blocks %s', (a) => expect(isBlockedAddress(a)).toBe(true));
  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:93.184.216.34'])('allows %s', (a) => expect(isBlockedAddress(a)).toBe(false));
});

describe('URL shape', () => {
  it.each([
    'file:///etc/passwd',
    'gopher://example.com',
    'ftp://example.com/x',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'https://example.com:22/',
    'http://localhost/',
    'http://foo.localhost/',
    'http://metadata.google.internal/',
    'http://service.internal/',
    'http://intranet/',
    'http://127.0.0.1/',
    'http://2130706433/', // decimal 127.0.0.1
    'http://0x7f000001/', // hex
    'http://0177.0.0.1/', // octal
    'http://[::1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://169.254.169.254/latest/meta-data/',
  ])('refuses %s', (u) => expect(() => assertPublicUrl(u)).toThrow(/Blocked URL/));
  it('accepts ordinary public URLs, default ports included', () => {
    expect(assertPublicUrl('https://example.com/a?b=1').hostname).toBe('example.com');
    expect(assertPublicUrl('http://example.com:80/').hostname).toBe('example.com');
    expect(assertPublicUrl('https://example.com:443/').hostname).toBe('example.com');
  });
});

describe('resolution', () => {
  it('refuses a public-looking name that resolves to a private address', async () => {
    await expect(assertPublicDestination('https://rebind.example.org/', async () => ['10.0.0.5'])).rejects.toThrow(/private/);
    await expect(assertPublicDestination('https://mixed.example.org/', async () => ['93.184.216.34', '::1'])).rejects.toThrow(/private/);
    await expect(assertPublicDestination('https://nx.example.org/', async () => [])).rejects.toThrow(/does not resolve/);
  });
  it('allows a name that resolves publicly', async () => {
    await expect(assertPublicDestination('https://ok.example.org/', publicDns)).resolves.toBeInstanceOf(URL);
  });
});

describe('guardedFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('re-checks every redirect hop and refuses a redirect into a private range', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(u);
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    });
    await expect(guardedFetch('https://hop.example.org/', { resolve: publicDns })).rejects.toThrow(/Blocked URL/);
    expect(calls).toEqual(['https://hop.example.org/']);
  });

  it('enforces a hop limit', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => new Response(null, { status: 301, headers: { location: `https://loop${++n}.example.org/` } }));
    await expect(guardedFetch('https://loop0.example.org/', { resolve: publicDns, maxRedirects: 3 })).rejects.toThrow(/redirects/);
    expect(n).toBe(4);
  });

  it('follows public redirects manually and never forwards credentials or internal headers', async () => {
    const seen: Array<{ url: string; headers: Record<string, string>; redirect?: string }> = [];
    vi.stubGlobal('fetch', async (u: string, init: RequestInit) => {
      seen.push({ url: u, headers: init.headers as Record<string, string>, redirect: init.redirect });
      return seen.length === 1 ? new Response(null, { status: 302, headers: { location: '/final' } }) : new Response('ok', { status: 200 });
    });
    const res = await guardedFetch('https://a.example.org/start', {
      resolve: publicDns,
      headers: { 'user-agent': 'x', cookie: 'secret=1', authorization: 'Bearer t', 'cf-access-jwt-assertion': 'jwt', 'x-forwarded-for': '1.2.3.4' },
    });
    expect(await res.text()).toBe('ok');
    expect(seen.map((s) => s.url)).toEqual(['https://a.example.org/start', 'https://a.example.org/final']);
    for (const s of seen) {
      expect(s.redirect).toBe('manual');
      expect(Object.keys(s.headers)).toEqual(['user-agent']);
    }
  });
});
