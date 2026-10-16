// Regression tests for the resource caps and the Browser Rendering SSRF checks: limits hold on the
// bytes actually streamed (missing or lying Content-Length, Range ignored with a 200), chunk and
// candidate counts are bounded, and the browser may not reach internal addresses.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRange, mp3Chunks, MAX_CHUNKS, planAudio } from '../src/extract/audio';
import { readCapped, readSlice } from '../src/extract/stream';
import { choosePlate, MAX_PER_SEARCH, MAX_PLATES_PER_TARGET, storeCandidates, type PlateCandidate } from '../src/plates';
import { vetBrowserRequest } from '../src/extract/browser';
import { makeEnv } from './fake-env';
import { fakeJpeg, seedHaul } from './seed';

afterEach(() => vi.unstubAllGlobals());

/** An endless body that counts how many bytes were pulled from it. */
function endless(chunk = 64 * 1024, head?: Uint8Array) {
  const stats = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      const b = new Uint8Array(chunk);
      if (head && stats.pulled === 0) b.set(head.subarray(0, chunk));
      for (let i = head && stats.pulled === 0 ? head.length : 0; i < chunk; i++) b[i] = (stats.pulled + i) & 255;
      stats.pulled += chunk;
      c.enqueue(b);
    },
    cancel() {
      stats.cancelled = true;
    },
  });
  return { stream, stats };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    return handler(url, init);
  });
}

describe('stream limits', () => {
  it('readSlice takes only its slice and stops reading', async () => {
    const { stream, stats } = endless(1000);
    const out = await readSlice(stream, 2500, 1000);
    expect(out.length).toBe(1000);
    expect(out[0]).toBe(2500 & 255);
    expect(stats.pulled).toBeLessThanOrEqual(4000);
    expect(stats.cancelled).toBe(true);
  });
  it('readCapped refuses past the cap and cancels the body', async () => {
    const { stream, stats } = endless();
    await expect(readCapped(stream, 1_000_000, 'image')).rejects.toThrow(/larger than/);
    expect(stats.pulled).toBeLessThanOrEqual(1_000_000 + 64 * 1024);
    expect(stats.cancelled).toBe(true);
  });
});

describe('audio caps', () => {
  it('reads only the requested range when the server ignores Range and sends an endless 200 with no length', async () => {
    const e = endless();
    stubFetch(() => new Response(e.stream, { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    const bytes = await fetchRange('https://audio.example.org/a.mp3', 3 * 1024 * 1024, 6 * 1024 * 1024 - 1);
    expect(bytes.length).toBe(3 * 1024 * 1024);
    expect(e.stats.pulled).toBeLessThanOrEqual(6 * 1024 * 1024 + 64 * 1024);
    expect(e.stats.cancelled).toBe(true);
  });
  it('ignores a lying Content-Length on a 206 and never reads past the range', async () => {
    const e = endless();
    stubFetch(() => new Response(e.stream, { status: 206, headers: { 'content-length': '10', 'content-type': 'audio/mpeg' } }));
    const bytes = await fetchRange('https://audio.example.org/a.mp3', 0, 1_048_575);
    expect(bytes.length).toBe(1_048_576);
    expect(e.stats.pulled).toBeLessThanOrEqual(1_048_576 + 64 * 1024);
  });
  it('refuses absurd ranges, endless chunk settings, too many chunks and implausible DASH indexes', async () => {
    await expect(fetchRange('https://audio.example.org/a.mp3', 0, 500 * 1024 * 1024)).rejects.toThrow(/range of that size/);
    expect(() => mp3Chunks(1e9, 0, 16000, 1000, 1000)).toThrow(/chunk settings/);
    expect(MAX_CHUNKS).toBeLessThan(200);
    stubFetch(() => new Response(new Uint8Array(1), { status: 206, headers: { 'content-type': 'audio/mp4', 'content-range': 'bytes 0-0/100000000' } }));
    await expect(
      planAudio('https://audio.example.org/a.m4a', 'audio/mp4', 100_000_000, { dash: { initRange: { start: 0, end: 50 * 1024 * 1024 }, indexRange: { start: 0, end: 10 } } }),
    ).rejects.toThrow(/implausible index/);
  });
});

describe('plate caps', () => {
  it('aborts an image download past the limit, whatever Content-Length says', async () => {
    const env = await seedHaul(makeEnv());
    const e = endless(256 * 1024, fakeJpeg());
    stubFetch((url) => (url.includes('huge.jpg') ? new Response(e.stream, { headers: { 'content-type': 'image/jpeg', 'content-length': '2000' } }) : new Response(fakeJpeg(), { headers: { 'content-type': 'image/jpeg' } })));
    await env.DB.prepare(
      `INSERT INTO plates (id, item_id, provider, provider_id, query, title, institution, licence, source_url, image_url, created_at) VALUES ('pl_h', 'it_jevons', 'commons', 'h', 'q', 't', 'Wikimedia Commons', 'Public domain', 'https://commons.example.org/w', 'https://upload.example.org/huge.jpg', '')`,
    ).run();
    await expect(choosePlate(env, 'pl_h')).rejects.toThrow(/larger than 16 MB|larger than 15 MB/);
    expect(e.stats.pulled).toBeLessThanOrEqual(16 * 1024 * 1024 + 256 * 1024);
    expect(e.stats.cancelled).toBe(true);
    expect(env.MEDIA.writes).toEqual([]);
  });
  it('caps candidates per search and per item', async () => {
    const env = await seedHaul(makeEnv());
    stubFetch(() => new Response(fakeJpeg(), { headers: { 'content-type': 'image/jpeg' } }));
    const many = (from: number, n: number): PlateCandidate[] =>
      Array.from({ length: n }, (_, i) => ({ provider: 'commons', providerId: String(from + i), title: `t${i}`, institution: 'Wikimedia Commons', licence: 'Public domain', sourceUrl: 'https://commons.example.org/w', imageUrl: `https://upload.example.org/${from + i}.jpg` }));
    expect(await storeCandidates(env, { itemId: 'it_jevons' }, 'q', 'editor', many(0, 50))).toBe(MAX_PER_SEARCH);
    let total = MAX_PER_SEARCH;
    for (let k = 1; k < 10; k++) total += await storeCandidates(env, { itemId: 'it_jevons' }, 'q', 'editor', many(k * 100, 50));
    expect(total).toBe(MAX_PLATES_PER_TARGET);
  });
});

describe('Browser Rendering request checks', () => {
  const publicDns = async () => ['93.184.216.34'];
  const rebinding = async () => ['10.0.0.7'];
  it('blocks internal addresses, internal names, odd schemes and hosts that resolve privately', async () => {
    expect(await vetBrowserRequest('https://example.org/page', publicDns)).toBeNull();
    expect(await vetBrowserRequest('data:image/png;base64,AAAA', publicDns)).toBeNull();
    expect(await vetBrowserRequest('http://169.254.169.254/latest/meta-data/', publicDns)).toMatch(/private|reserved/);
    expect(await vetBrowserRequest('http://[::ffff:127.0.0.1]/', publicDns)).toMatch(/private|reserved/);
    expect(await vetBrowserRequest('http://localhost:8787/api/me', publicDns)).toMatch(/Blocked/);
    expect(await vetBrowserRequest('file:///etc/passwd', publicDns)).toMatch(/scheme/);
    expect(await vetBrowserRequest('ws://example.org/socket', publicDns)).toMatch(/scheme/);
    expect(await vetBrowserRequest('https://rebind.example.net/', rebinding)).toMatch(/private address/);
    expect(await vetBrowserRequest('https://example.org:8443/', publicDns)).toMatch(/port/);
  });
});
