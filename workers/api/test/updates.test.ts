// Over-the-air updates: the manifest relay, its signature, "no update", and immutable assets.

import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { assetKey, pointerKey, type StoredPart } from '../src/updates';

const BASE = 'http://127.0.0.1:8787';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sign = (body: string) => createSign('RSA-SHA256').update(body, 'utf8').sign(privateKey, 'base64');
const part = (kind: StoredPart['kind'], body: unknown): StoredPart => {
  const s = JSON.stringify(body);
  return { kind, body: s, signature: sign(s), keyid: 'main' };
};

function bucket(objects: Record<string, { text: string; type?: string }>) {
  return {
    get: async (key: string) => {
      const o = objects[key];
      if (!o) return null;
      return { body: o.text, httpMetadata: { contentType: o.type }, json: async () => JSON.parse(o.text) };
    },
  };
}

const RUNTIME = 'fd374857b93fd066eeb53060ced31633bde5eb7e';
const MANIFEST = { id: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', createdAt: '2026-10-17T09:00:00.000Z', runtimeVersion: RUNTIME, launchAsset: {}, assets: [], metadata: {}, extra: {} };
const headers = (over: Record<string, string> = {}) => ({
  'expo-protocol-version': '1',
  'expo-platform': 'android',
  'expo-runtime-version': RUNTIME,
  accept: 'multipart/mixed',
  ...over,
});
const env = (objects: Record<string, { text: string; type?: string }>) => ({
  ENVIRONMENT: 'preview',
  OWNER_EMAIL: 'x@example.com',
  ACCESS_TEAM_DOMAIN: '',
  ACCESS_AUD: '',
  MEDIA: bucket(objects),
});

function parse(text: string) {
  const [head, ...rest] = text.split('\r\n\r\n');
  const body = rest.join('\r\n\r\n').replace(/\r\n--fdf-update-part--\r\n$/, '');
  const sig = /expo-signature: sig="([^"]+)", keyid="main"/.exec(head!)?.[1];
  const name = /name="(\w+)"/.exec(head!)?.[1];
  return { body, sig, name };
}

describe('GET /v1/updates (public)', () => {
  const stored = { [pointerKey('android', RUNTIME)]: { text: JSON.stringify(part('manifest', MANIFEST)) } };

  it('relays the stored manifest byte for byte, with a signature the certificate key verifies', async () => {
    const res = await app.request(`${BASE}/v1/updates`, { headers: headers() }, env(stored));
    expect(res.status).toBe(200);
    expect(res.headers.get('expo-protocol-version')).toBe('1');
    expect(res.headers.get('expo-sfv-version')).toBe('0');
    expect(res.headers.get('cache-control')).toBe('private, max-age=0');
    expect(res.headers.get('content-type')).toBe('multipart/mixed; boundary=fdf-update-part');
    const p = parse(await res.text());
    expect(p.name).toBe('manifest');
    expect(JSON.parse(p.body)).toEqual(MANIFEST);
    expect(createVerify('RSA-SHA256').update(p.body, 'utf8').verify(publicKey, p.sig!, 'base64')).toBe(true);
  });

  it('says "no update" to a phone already on it, and to a runtime with nothing published', async () => {
    const withNone = { ...stored, 'app-updates/no-update.json': { text: JSON.stringify(part('directive', { type: 'noUpdateAvailable' })) } };
    for (const h of [headers({ 'expo-current-update-id': MANIFEST.id.toUpperCase() }), headers({ 'expo-runtime-version': 'other-build' })]) {
      const p = parse(await (await app.request(`${BASE}/v1/updates`, { headers: h }, env(withNone))).text());
      expect(p.name).toBe('directive');
      expect(JSON.parse(p.body)).toEqual({ type: 'noUpdateAvailable' });
    }
    const empty = await app.request(`${BASE}/v1/updates`, { headers: headers({ 'expo-runtime-version': 'other-build' }) }, env({}));
    expect(empty.status).toBe(204);
  });

  it('serves a roll-back directive until the phone is back on its embedded build', async () => {
    const back = { [pointerKey('android', RUNTIME)]: { text: JSON.stringify(part('directive', { type: 'rollBackToEmbedded', parameters: { commitTime: '2026-10-17T10:00:00.000Z' } })) } };
    const p = parse(await (await app.request(`${BASE}/v1/updates`, { headers: headers({ 'expo-current-update-id': 'abc', 'expo-embedded-update-id': 'def' }) }, env(back))).text());
    expect(p.name).toBe('directive');
    const done = await app.request(`${BASE}/v1/updates`, { headers: headers({ 'expo-current-update-id': 'def', 'expo-embedded-update-id': 'def' }) }, env(back));
    expect(done.status).toBe(204);
  });

  it('refuses malformed requests and never reads outside its prefix', async () => {
    for (const h of [headers({ 'expo-platform': 'web' }), headers({ 'expo-runtime-version': '../hauls/index' }), headers({ 'expo-protocol-version': '0' })]) {
      expect((await app.request(`${BASE}/v1/updates`, { headers: h }, env(stored))).status).toBe(400);
    }
  });
});

describe('GET /v1/updates/asset (public)', () => {
  const h = 'a'.repeat(64);
  it('serves stored assets as immutable downloads, by hash only', async () => {
    const e = env({ [assetKey(h)]: { text: 'console.log(1)', type: 'application/javascript' } });
    const res = await app.request(`${BASE}/v1/updates/asset?h=${h}`, {}, e);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('console.log(1)');
    expect((await app.request(`${BASE}/v1/updates/asset?h=${'b'.repeat(64)}`, {}, e)).status).toBe(404);
    for (const bad of ['../x', 'A'.repeat(64), 'a'.repeat(63)]) {
      expect((await app.request(`${BASE}/v1/updates/asset?h=${encodeURIComponent(bad)}`, {}, e)).status).toBe(400);
    }
  });
});
