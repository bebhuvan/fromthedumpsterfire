// The Desk's request security: the Access lock (real JWT verification), cross-site refusal,
// content-type rules, the narrow public device route, response headers and inert file serving.

import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import app from '../src/index';
import { verifyOwner, AccessDenied } from '../src/access';
import { checkCsrf, escapeHtml, fileHeaders } from '../src/security';

const BASE = 'http://127.0.0.1:8787';

// A minimal env. D1 is a recorder that returns nothing (enough for routes that are refused early).
function env(over: Record<string, unknown> = {}) {
  const writes: string[] = [];
  const stmt = (sql: string) => ({
    bind: (..._a: unknown[]) => stmt(sql),
    run: async () => (writes.push(sql), { success: true }),
    first: async () => null,
    all: async () => ({ results: [] }),
  });
  return {
    writes,
    env: {
      ENVIRONMENT: 'preview',
      OWNER_EMAIL: 'owner@example.com',
      ACCESS_TEAM_DOMAIN: '',
      ACCESS_AUD: '',
      DB: { prepare: stmt, batch: async () => [] },
      ...over,
    },
  };
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'content-length': String(JSON.stringify(body).length), ...headers },
  body: JSON.stringify(body),
});

describe('Access lock', () => {
  it('refuses everything when Access is not configured (fail closed)', async () => {
    const { env: e } = env();
    const ui = await app.request(`${BASE}/`, {}, e);
    expect(ui.status).toBe(403);
    expect(await ui.text()).not.toContain('<script');
    const api = await app.request(`${BASE}/api/items`, {}, e);
    expect(api.status).toBe(403);
  });

  it('refuses a forged or missing assertion even when configured, and accepts only the owner', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const cfg = { teamDomain: 'team.cloudflareaccess.com', audience: 'aud-123', ownerEmail: 'owner@example.com' };
    const sign = (claims: Record<string, unknown>, key = privateKey) =>
      new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://team.cloudflareaccess.com').setAudience('aud-123').setExpirationTime('5m').sign(key);

    await expect(verifyOwner(null, cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    await expect(verifyOwner('not-a-jwt', cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    const other = await generateKeyPair('RS256');
    await expect(verifyOwner(await sign({ email: cfg.ownerEmail }, other.privateKey), cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    await expect(verifyOwner(await sign({ email: 'someone@else.com' }), cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    const wrongAud = await new SignJWT({ email: cfg.ownerEmail }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://team.cloudflareaccess.com').setAudience('other-app').setExpirationTime('5m').sign(privateKey);
    await expect(verifyOwner(wrongAud, cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    const base = () => new SignJWT({ email: cfg.ownerEmail }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://team.cloudflareaccess.com').setAudience('aud-123');
    // expired
    await expect(verifyOwner(await base().setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(privateKey), cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    // no exp claim at all
    await expect(verifyOwner(await base().setIssuedAt().sign(privateKey), cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    // wrong issuer
    await expect(verifyOwner(await new SignJWT({ email: cfg.ownerEmail }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('https://evil.cloudflareaccess.com').setAudience('aud-123').setIssuedAt().setExpirationTime('5m').sign(privateKey), cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    // alg none: header {alg:none}, valid-looking claims, empty signature
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ email: cfg.ownerEmail, iss: 'https://team.cloudflareaccess.com', aud: 'aud-123', iat: now, exp: now + 300 })}.`;
    await expect(verifyOwner(none, cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    // HS256 signed with the public key as a secret (algorithm confusion)
    const hs = await new SignJWT({ email: cfg.ownerEmail }).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setIssuer('https://team.cloudflareaccess.com').setAudience('aud-123').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(JSON.stringify(jwk)));
    await expect(verifyOwner(hs, cfg, keys)).rejects.toBeInstanceOf(AccessDenied);
    // the owner, case-insensitively
    await expect(verifyOwner(await sign({ email: 'owner@example.com', iat: now }), cfg, keys)).resolves.toEqual({ email: cfg.ownerEmail });
  });

  it('allows the local bypass only when ENVIRONMENT is exactly local, on localhost', async () => {
    for (const ENVIRONMENT of ['preview', 'production']) {
      const { env: e } = env({ DEV_AUTH_BYPASS: '1', ENVIRONMENT });
      expect((await app.request(`${BASE}/api/items`, {}, e)).status).toBe(403);
    }
    const { env: off } = env({ DEV_AUTH_BYPASS: '1', ENVIRONMENT: 'local' });
    expect((await app.request('https://fdf-desk-preview.example.workers.dev/api/items', {}, off)).status).toBe(403);
    const { env: on } = env({ DEV_AUTH_BYPASS: '1', ENVIRONMENT: 'local' });
    expect((await app.request(`${BASE}/api/items`, {}, on)).status).toBe(200);
  });

  it('refuses everything when ENVIRONMENT is unset or unknown', async () => {
    for (const ENVIRONMENT of [undefined, '', 'staging']) {
      const { env: e } = env({ DEV_AUTH_BYPASS: '1', ENVIRONMENT });
      expect((await app.request(`${BASE}/api/items`, {}, e)).status).toBe(503);
      expect((await app.request(`${BASE}/v1/devices`, json({ token: 'a'.repeat(40), platform: 'ios', enabled: true }), e)).status).toBe(503);
    }
  });

  it('ignores a spoofed Access email header without a signed assertion', async () => {
    const { env: e } = env({ ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123' });
    const res = await app.request(`${BASE}/api/items`, { headers: { 'cf-access-authenticated-user-email': 'owner@example.com' } }, e);
    expect(res.status).toBe(403);
  });

  it('keeps the public allowlist to exact method and path', async () => {
    const { env: e } = env();
    // GET on the device path used to skip the lock and fall through to the UI.
    for (const path of ['/v1/devices', '/v1/devices/', '/v1/devices/../api/items', '/v1/%64evices', '/V1/devices', '/v1/health/x', '/v1/updates/', '/v1/updates/asset/x', '/v1/updates/../api/items']) {
      const r = await app.request(`${BASE}${path}`, {}, e);
      expect([403, 404]).toContain(r.status);
      expect(await r.text()).not.toMatch(/<div id="root"|<script/);
    }
    expect((await app.request(`${BASE}/v1/health`, {}, e)).status).toBe(200);
    const put = await app.request(`${BASE}/v1/devices`, { ...json({ token: 'a'.repeat(40), platform: 'ios', enabled: true }), method: 'PUT' }, e);
    expect(put.status).toBe(403);
    const postUpdate = await app.request(`${BASE}/v1/updates`, json({}), e);
    expect(postUpdate.status).toBe(403);
  });
});

describe('cross-site requests', () => {
  const req = (path: string, init: RequestInit) => new Request(`${BASE}${path}`, init);
  const good = { 'content-type': 'application/json', 'x-desk': '1', 'sec-fetch-site': 'same-origin', origin: BASE };

  it('accepts a same-origin JSON write from the Desk', () => {
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: good, body: '{}' })).ok).toBe(true);
  });
  it('refuses cross-site, foreign-origin, header-less and non-JSON writes', () => {
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, 'sec-fetch-site': 'cross-site' }, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, 'sec-fetch-site': 'same-site' }, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
    const { origin: _o, ...noOrigin } = good;
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: noOrigin, body: '{}' })).status).toBe(403);
    const { 'sec-fetch-site': _s, ...bare } = noOrigin;
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: bare, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, origin: BASE + '.evil.example' }, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, origin: 'http://127.0.0.1:8787.evil.example' }, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, origin: 'null' }, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, 'content-type': '', 'content-length': '0' } })).status).toBe(415);
    expect(checkCsrf(req('/api/items/x', { method: 'DELETE', headers: { 'sec-fetch-site': 'same-origin' } })).status).toBe(403);
    const { 'x-desk': _x, ...noHeader } = good;
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: noHeader, body: '{}' })).status).toBe(403);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect(checkCsrf(req('/api/capture', { method: 'POST', headers: { ...good, 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' })).status).toBe(415);
    expect(checkCsrf(req('/api/notes', { method: 'POST', headers: { ...good, 'content-type': 'text/plain' }, body: 'x' })).status).toBe(415);
  });
  it('takes multipart on an item file upload, and only there', () => {
    const mp = { ...good, 'content-type': 'multipart/form-data; boundary=x' };
    expect(checkCsrf(req('/api/items/it_01abc/file', { method: 'POST', headers: mp, body: '' })).ok).toBe(true);
    expect(checkCsrf(req('/api/items/it_01abc/file', { method: 'POST', headers: good, body: '{}' })).status).toBe(415);
    expect(checkCsrf(req('/api/items/it_01abc/file', { method: 'POST', headers: { ...mp, origin: 'https://evil.example' }, body: '' })).status).toBe(403);
    expect(checkCsrf(req('/api/items/it_01abc/file/x', { method: 'POST', headers: mp, body: '' })).status).toBe(415);
    expect(checkCsrf(req('/api/items/it_01abc', { method: 'PATCH', headers: mp, body: '' })).status).toBe(415);
    // Adding a picture to an item: multipart, POST only.
    expect(checkCsrf(req('/api/items/it_01abc/picture', { method: 'POST', headers: mp, body: '' })).ok).toBe(true);
    expect(checkCsrf(req('/api/items/it_01abc/picture', { method: 'POST', headers: good, body: '{}' })).status).toBe(415);
    expect(checkCsrf(req('/api/items/it_01abc/blocks', { method: 'POST', headers: mp, body: '' })).status).toBe(415);
    // A shelf book's cover: multipart, POST only; its edits are JSON.
    expect(checkCsrf(req('/api/books/the-coal-question/cover', { method: 'POST', headers: mp, body: '' })).ok).toBe(true);
    expect(checkCsrf(req('/api/books/the-coal-question/cover', { method: 'POST', headers: good, body: '{}' })).status).toBe(415);
    // A Life source's PDF: multipart, POST only.
    expect(checkCsrf(req('/api/items/it_1/life/sources/eci-report/file', { method: 'POST', headers: mp, body: '' })).ok).toBe(true);
    expect(checkCsrf(req('/api/items/it_1/life/sources/eci-report/file', { method: 'POST', headers: good, body: '{}' })).status).toBe(415);
    expect(checkCsrf(req('/api/books/the-coal-question/cover', { method: 'PATCH', headers: mp, body: '' })).status).toBe(415);
    expect(checkCsrf(req('/api/books/the-coal-question/notes', { method: 'POST', headers: mp, body: '' })).status).toBe(415);
  });
  it('lets the share target in only as a same-origin or user-initiated navigation', () => {
    const mp = { 'content-type': 'multipart/form-data; boundary=x' };
    expect(checkCsrf(req('/share', { method: 'POST', headers: { ...mp, 'sec-fetch-site': 'none' }, body: '' })).ok).toBe(true);
    expect(checkCsrf(req('/share', { method: 'POST', headers: { ...mp, 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, body: '' })).ok).toBe(false);
    // Neither Sec-Fetch-Site nor Origin: refused (old browsers cannot be told apart from forgeries).
    expect(checkCsrf(req('/share', { method: 'POST', headers: mp, body: '' })).ok).toBe(false);
    expect(checkCsrf(req('/share', { method: 'POST', headers: { ...mp, 'sec-fetch-site': 'none', origin: 'https://evil.example' }, body: '' })).ok).toBe(false);
    expect(checkCsrf(req('/share', { method: 'POST', headers: { 'sec-fetch-site': 'none', 'content-type': 'application/x-www-form-urlencoded' }, body: 'url=x' })).ok).toBe(false);
  });
  it('rejects a cross-site write before any work is done, even with the local bypass', async () => {
    const { env: e, writes } = env({ DEV_AUTH_BYPASS: '1', ENVIRONMENT: 'local' });
    const res = await app.request(`${BASE}/api/capture`, json({ paste: 'https://example.com' }, { origin: 'https://evil.example', 'x-desk': '1' }), e);
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
  });
});

describe('POST /v1/devices (public)', () => {
  it('validates shape and platform and writes one row', async () => {
    const { env: e, writes } = env();
    expect((await app.request(`${BASE}/v1/devices`, json({ token: 'short', platform: 'android', enabled: true }), e)).status).toBe(400);
    expect((await app.request(`${BASE}/v1/devices`, json({ token: 'a'.repeat(40), platform: 'windows', enabled: true }), e)).status).toBe(400);
    expect((await app.request(`${BASE}/v1/devices`, json({ token: '<script>alert(1)</script>xxxxxxxxxxxx', platform: 'ios', enabled: true }), e)).status).toBe(400);
    expect(writes).toEqual([]);
    const ok = await app.request(`${BASE}/v1/devices`, json({ token: 'fcm:' + 'a'.repeat(60), platform: 'android', enabled: true }, { 'cf-connecting-ip': '203.0.113.9' }), e);
    expect(ok.status).toBe(200);
    expect(writes.length).toBe(1);
    expect(writes[0]).toMatch(/INSERT INTO devices/);
  });
  it('forgets a phone that turns notifications off', async () => {
    const { env: e, writes } = env();
    const res = await app.request(`${BASE}/v1/devices`, json({ token: 'fcm:' + 'c'.repeat(60), platform: 'android', enabled: false }), e);
    expect(res.status).toBe(200);
    expect(writes.length).toBe(1);
    expect(writes[0]).toMatch(/DELETE FROM devices WHERE token/);
  });
  it('refuses non-JSON bodies', async () => {
    const { env: e } = env();
    const res = await app.request(`${BASE}/v1/devices`, { method: 'POST', headers: { 'content-type': 'text/plain', 'content-length': '10' }, body: 'token=abc' }, e);
    expect(res.status).toBe(415);
  });
  it('rate limits per address', async () => {
    const { env: e } = env();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await app.request(`${BASE}/v1/devices`, json({ token: 'b'.repeat(40), platform: 'ios', enabled: false }, { 'cf-connecting-ip': '198.51.100.77' }), e);
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('output safety', () => {
  it('sets a strict CSP and nosniff on every Desk response', async () => {
    const { env: e } = env();
    const res = await app.request(`${BASE}/`, {}, e);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('wasm-unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    // WebAssembly only (resvg for chart pictures): never eval of strings.
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
  it('escapes text placed in HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>"\'&')).toBe('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  });
  it('serves stored files inert: HTML and SVG become sandboxed downloads', () => {
    for (const t of ['text/html', 'image/svg+xml', 'application/xhtml+xml', undefined]) {
      const h = fileHeaders(t, 'snap.html');
      expect(h['content-type']).toBe('application/octet-stream');
      expect(h['content-disposition']).toMatch(/^attachment/);
      expect(h['content-security-policy']).toMatch(/^sandbox/);
      expect(h['x-content-type-options']).toBe('nosniff');
    }
    expect(fileHeaders('application/pdf', 'a.pdf')['content-type']).toBe('application/pdf');
    expect(fileHeaders('image/png', 'a.png')['content-security-policy']).toMatch(/^sandbox/);
  });
});
