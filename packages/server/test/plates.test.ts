// Plates: the public-domain gate, image measurement, captions from metadata, and choosing a plate
// (guarded fetch, copy to private storage, decision recorded) with the network stubbed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { choosePlate, cleanCommonsCreator, cleanCommonsTitle, commonsIsPublicDomain, defaultCaption, imageSize, interleave, storeCandidates } from '../src/plates';
import { makeEnv } from './fake-env';
import { fakeJpeg, seedHaul } from './seed';

afterEach(() => vi.unstubAllGlobals());

describe('the public-domain gate (Wikimedia Commons)', () => {
  const m = (short: string, code: string, copyrighted = 'False') => ({ LicenseShortName: { value: short }, License: { value: code }, Copyrighted: { value: copyrighted } });
  it('accepts only public domain and CC0', () => {
    expect(commonsIsPublicDomain(m('Public domain', 'pd'))).toEqual({ ok: true, licence: 'Public domain' });
    expect(commonsIsPublicDomain(m('PD-old-70', 'pd'))).toEqual({ ok: true, licence: 'Public domain' });
    expect(commonsIsPublicDomain(m('CC0', 'cc0', 'True'))).toEqual({ ok: true, licence: 'CC0' });
    expect(commonsIsPublicDomain(m('CC BY-SA 4.0', 'cc-by-sa-4.0', 'True')).ok).toBe(false);
    expect(commonsIsPublicDomain(m('CC BY 2.0', 'cc-by-2.0', 'True')).ok).toBe(false);
    expect(commonsIsPublicDomain(m('Public domain', 'pd', 'True')).ok).toBe(false);
    expect(commonsIsPublicDomain(m('', '', '')).ok).toBe(false);
  });
});

describe('image measurement and captions', () => {
  it('reads JPEG and PNG dimensions from the bytes', () => {
    expect(imageSize(fakeJpeg(1200, 905))).toEqual({ width: 1200, height: 905, mime: 'image/jpeg' });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 843);
    new DataView(png.buffer).setUint32(20, 600);
    expect(imageSize(png)).toEqual({ width: 843, height: 600, mime: 'image/png' });
    expect(imageSize(new TextEncoder().encode('<html>not an image</html>'))).toBeNull();
  });
  it('builds the caption from the institution metadata only', () => {
    expect(defaultCaption({ title: 'The Silent Highwayman.', creator: 'Punch', date: '1858' })).toBe('The Silent Highwayman. Punch, 1858.');
    expect(defaultCaption({ title: 'Untitled' })).toBe('Untitled.');
  });
  it('cleans Commons titles and creators', () => {
    expect(cleanCommonsTitle("Steam engine - Mr. Watt's double steam engine from his specification of 1782 LCCN2006691752")).toBe("Steam engine - Mr. Watt's double steam engine from his specification of 1782");
    expect(cleanCommonsTitle('Victoria Embankment (21177395802)')).toBe('Victoria Embankment');
    expect(cleanCommonsCreator('Unknown author Unknown author')).toBeUndefined();
    expect(cleanCommonsCreator('Punch Punch')).toBe('Punch');
    expect(cleanCommonsCreator('William Lionel Wyllie')).toBe('William Lionel Wyllie');
  });
  it('interleaves providers', () => {
    expect(interleave<string | number | boolean>([[1, 2, 3], ['a'], [true, false]], 5)).toEqual([1, 'a', true, 2, false]);
  });
});

function stubNet(routes: Record<string, () => Response>) {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] });
    for (const [prefix, r] of Object.entries(routes)) if (url.startsWith(prefix)) return r();
    return new Response('not found', { status: 404 });
  });
}

describe('storing and choosing', () => {
  it('stores only candidates whose image fetch-checks, then copies the chosen one into MEDIA', async () => {
    const env = await seedHaul(makeEnv());
    stubNet({
      'https://upload.example.org/good.jpg': () => new Response(fakeJpeg(1280, 880), { headers: { 'content-type': 'image/jpeg' } }),
      'https://upload.example.org/html.jpg': () => new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } }),
      'https://commons.example.org/wiki/': () => new Response('ok'),
    });
    const base = { institution: 'Wikimedia Commons', licence: 'Public domain', sourceUrl: 'https://commons.example.org/wiki/File:x.jpg' };
    const added = await storeCandidates(env, { itemId: 'it_jevons' }, 'coal engine', 'machine', [
      { ...base, provider: 'commons', providerId: '1', title: 'A steam engine', imageUrl: 'https://upload.example.org/good.jpg' },
      { ...base, provider: 'commons', providerId: '2', title: 'A challenge page', imageUrl: 'https://upload.example.org/html.jpg' },
      { ...base, provider: 'commons', providerId: '3', title: 'A private address', imageUrl: 'http://127.0.0.1/x.jpg' },
    ]);
    expect(added).toBe(1);
    const row = await env.DB.prepare('SELECT * FROM plates').first<{ id: string; width: number; height: number; caption: string }>();
    expect(row).toMatchObject({ width: 1280, height: 880, caption: 'A steam engine.' });
    // The same candidate twice is not stored twice.
    expect(await storeCandidates(env, { itemId: 'it_jevons' }, 'again', 'editor', [{ ...base, provider: 'commons', providerId: '1', title: 'A steam engine', imageUrl: 'https://upload.example.org/good.jpg' }])).toBe(0);

    const chosen = await choosePlate(env, row!.id);
    expect(chosen).toMatchObject({ status: 'chosen', r2_key: `plates/${row!.id}.jpg`, mime: 'image/jpeg' });
    expect(env.MEDIA.objects.has(`plates/${row!.id}.jpg`)).toBe(true);
    expect(env.FILES.writes).toEqual([]);
    expect((await env.DB.prepare(`SELECT plate FROM items WHERE id = 'it_jevons'`).first<{ plate: string }>())!.plate).toBe(row!.id);
  });
});
