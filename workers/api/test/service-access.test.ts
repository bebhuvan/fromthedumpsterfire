import { describe, expect, it, vi, afterEach } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import { verifyEditor, verifyOwner, serviceRequestAllowed } from '../src/access';
import app from '../src/index';
import { makeEnv } from '../../../packages/server/test/fake-env';
import { seedHaul } from '../../../packages/server/test/seed';

const cfg = { teamDomain: 'team.cloudflareaccess.com', audience: 'aud-123', ownerEmail: 'owner@example.org', serviceClientIds: 'draft.access,publisher.access', servicePublishClientIds: 'publisher.access' };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'service-test', alg: 'RS256' };
const keys = createLocalJWKSet({ keys: [jwk] });
const sign = (claims: Record<string, unknown>, audience = cfg.audience, expires = '5m') => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(`https://${cfg.teamDomain}`).setAudience(audience).setIssuedAt().setExpirationTime(expires).sign(privateKey);
const service = { type: 'app', sub: '', common_name: 'draft.access' };
afterEach(() => vi.unstubAllGlobals());

describe('Access service principals', () => {
  it('accepts only an explicitly allowed signed app service assertion, preserving owner access', async () => {
    const token = await sign(service);
    expect(await verifyEditor(token, cfg, keys)).toEqual({ kind: 'service', id: 'draft.access', canPublish: false });
    expect(await verifyEditor(await sign({ ...service, common_name: 'publisher.access' }), cfg, keys)).toMatchObject({ canPublish: true });
    expect(await verifyEditor(await sign({ email: 'OWNER@example.org' }), cfg, keys)).toEqual({ kind: 'owner', id: 'owner@example.org', canPublish: true });
    await expect(verifyOwner(token, cfg, keys)).rejects.toThrow();
    await expect(verifyEditor(token, { ...cfg, serviceClientIds: '' }, keys)).rejects.toThrow();
    await expect(verifyEditor(token, { ...cfg, ownerEmail: '' }, keys)).rejects.toThrow();
    await expect(verifyEditor(token, { ...cfg, audience: '' }, keys)).rejects.toThrow();
    for (const claims of [{ ...service, common_name: 'stranger.access' }, { ...service, sub: 'user' }, { ...service, type: 'org' }, { ...service, email: 'someone@example.org' }]) await expect(verifyEditor(await sign(claims), cfg, keys)).rejects.toThrow();
    await expect(verifyEditor(await sign(service, 'another-app'), cfg, keys)).rejects.toThrow();
    await expect(verifyEditor(await sign(service, cfg.audience, '-2m'), cfg, keys)).rejects.toThrow();
  });

  it('refuses service UI/settings/deletion/publish access and encoded or ambiguous paths', () => {
    const draft = { kind: 'service' as const, id: 'draft.access', canPublish: false };
    expect(serviceRequestAllowed(draft, 'POST', '/api/capture')).toBe(true);
    expect(serviceRequestAllowed(draft, 'GET', '/api/hauls/hl_1/preview')).toBe(true);
    for (const [method, path] of [['GET', '/'], ['GET', '/files/notes/x'], ['GET', '/api/settings'], ['GET', '/api/settings/'], ['DELETE', '/api/items/it_x'], ['POST', '/api/hauls/hl_x/publish'], ['POST', '/api/shelf/publish/'], ['POST', '/api/hauls/x/%70ublish'], ['POST', '/api//hauls/x/publish']]) expect(serviceRequestAllowed(draft, method!, path!)).toBe(false);
    expect(serviceRequestAllowed({ ...draft, canPublish: true }, 'POST', '/api/hauls/x/publish')).toBe(true);
  });

  it('enforces service permissions in the actual Worker middleware, not just the CLI', async () => {
    // The Worker resolves the real signed JWT using a stubbed JWKS endpoint.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } }));
    const env = await seedHaul(makeEnv(undefined, { ENVIRONMENT: 'preview', ACCESS_TEAM_DOMAIN: cfg.teamDomain, ACCESS_AUD: cfg.audience, OWNER_EMAIL: cfg.ownerEmail, ACCESS_SERVICE_CLIENT_IDS: cfg.serviceClientIds, ACCESS_SERVICE_PUBLISH_CLIENT_IDS: cfg.servicePublishClientIds }));
    await env.DB.prepare('INSERT INTO haul_items (haul_id, item_id, position) VALUES (?, ?, 0)').bind('hl_1', 'it_jevons').run();
    const headers = { 'cf-access-jwt-assertion': await sign(service), origin: 'https://desk.example.org', 'x-desk': '1', 'content-type': 'application/json' };
    const request = (method: string, path: string, body?: unknown) => app.request('https://desk.example.org' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }, env);
    expect((await request('GET', '/api/items')).status).toBe(200);
    expect((await request('GET', '/api/settings')).status).toBe(403);
    expect((await request('POST', '/api/hauls/hl_x/publish', { confirm: true })).status).toBe(403);
    expect((await request('POST', '/api/shelf/publish', { confirm: true })).status).toBe(403);
    expect((await request('DELETE', '/api/items/it_x')).status).toBe(403);
    expect((await request('GET', '/')).status).toBe(403);
    const spoof = await app.request('https://desk.example.org/api/items', { headers: { 'cf-access-client-id': 'draft.access', 'cf-access-client-secret': 'fake' } }, env);
    expect(spoof.status).toBe(403);
    // Scope comes from the server allowlist, not a client's confirmation flag.
    const pub = { ...headers, 'cf-access-jwt-assertion': await sign({ ...service, common_name: 'publisher.access' }) };
    expect((await app.request('https://desk.example.org/api/hauls/hl_1/publish', { method: 'POST', headers: pub, body: JSON.stringify({ confirm: true }) }, env)).status).toBe(200);
    expect(env.FILES.objects.has('hauls/001/v1/haul.json')).toBe(true);
  });
});
