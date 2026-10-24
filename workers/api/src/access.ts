// The in-Worker lock behind Cloudflare Access. Access at the edge decides who can reach the Desk;
// this check permits only the owner or explicitly allowlisted service clients, so a widened
// policy, a missing Access app or a forgotten route cannot expose the Desk. Unconfigured means
// locked: with no team domain or AUD every request is refused.

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccessConfig {
  teamDomain?: string;
  audience?: string;
  ownerEmail?: string;
  /** Comma-separated Access service-token Client IDs. Empty means no machine access. */
  serviceClientIds?: string;
  /** Subset of serviceClientIds allowed to publish. All others can only prepare drafts. */
  servicePublishClientIds?: string;
}

export class AccessDenied extends Error {}

let jwks: { domain: string; get: JWTVerifyGetKey } | null = null;

function keysFor(domain: string): JWTVerifyGetKey {
  if (!jwks || jwks.domain !== domain) jwks = { domain, get: createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`)) };
  return jwks.get;
}

export function readAssertion(headers: Headers): string | null {
  const h = headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const cookie = headers.get('cookie') ?? '';
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m?.[1] ?? null;
}

export async function verifyOwner(token: string | null, cfg: AccessConfig, resolveKey?: JWTVerifyGetKey): Promise<{ email: string }> {
  const identity = await verifyEditor(token, { ...cfg, serviceClientIds: '', servicePublishClientIds: '' }, resolveKey);
  return { email: identity.id };
}

export interface EditorIdentity { kind: 'owner' | 'service'; id: string; canPublish: boolean }

const clientIds = (s?: string) => new Set((s ?? '').split(',').map((x) => x.trim()).filter(Boolean));

/** Both human and machine identities must be signed by Access for this exact application. */
export async function verifyEditor(token: string | null, cfg: AccessConfig, resolveKey?: JWTVerifyGetKey): Promise<EditorIdentity> {
  const domain = cfg.teamDomain?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = cfg.audience?.trim();
  const owner = cfg.ownerEmail?.trim().toLowerCase();
  if (!domain || !aud || !owner) throw new AccessDenied('The Desk is locked: Access is not configured for this deployment');
  if (!token) throw new AccessDenied('No Access assertion');
  try {
    const { payload } = await jwtVerify(token, resolveKey ?? keysFor(domain), {
      issuer: `https://${domain}`,
      audience: aud,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat'],
      clockTolerance: 30,
    });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    // A service assertion has type=app, an empty subject, no email, and common_name=Client ID.
    // Never trust the raw CF-Access-Client-Id header; only the verified JWT identifies a client.
    if (payload.common_name !== undefined || payload.sub === '') {
      if (payload.type !== 'app' || payload.sub !== '' || payload.email !== undefined || typeof payload.common_name !== 'string') throw new AccessDenied('Malformed service assertion');
      if (!clientIds(cfg.serviceClientIds).has(payload.common_name)) throw new AccessDenied('Service client is not allowed');
      return { kind: 'service', id: payload.common_name, canPublish: clientIds(cfg.servicePublishClientIds).has(payload.common_name) };
    }
    if (!email || email !== owner) throw new AccessDenied('Not the owner');
    return { kind: 'owner', id: email, canPublish: true };
  } catch (e) {
    if (e instanceof AccessDenied) throw e;
    throw new AccessDenied('The Access assertion did not verify');
  }
}

/** Machines operate the editorial API, never the UI, settings or permanent deletion routes. */
export function serviceRequestAllowed(identity: EditorIdentity, method: string, path: string): boolean {
  if (identity.kind === 'owner') return true;
  if (!/^\/api\/[A-Za-z0-9/_-]+$/.test(path) || path.includes('//') || !['GET', 'POST', 'PUT', 'PATCH'].includes(method)) return false;
  path = path.replace(/\/+$/, '');
  if (path === '/api/settings' || path.startsWith('/api/settings/')) return false;
  if (path.endsWith('/publish') && !identity.canPublish) return false;
  return true;
}

/**
 * Local development only. All three must hold: ENVIRONMENT is exactly "local" (wrangler.jsonc sets
 * "preview" or "production" for every deployed env, so only workers/api/.dev.vars can make it
 * "local"), DEV_AUTH_BYPASS is "1", and the request is to localhost.
 */
export function devBypassAllowed(env: { DEV_AUTH_BYPASS?: string; ENVIRONMENT?: string }, url: URL): boolean {
  return env.ENVIRONMENT === 'local' && env.DEV_AUTH_BYPASS === '1' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

export const KNOWN_ENVIRONMENTS = new Set(['local', 'preview', 'production']);
