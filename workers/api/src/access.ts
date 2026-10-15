// The in-Worker lock behind Cloudflare Access. Access at the edge decides who can reach the Desk;
// this check makes the Worker refuse anything Access did not sign for the one owner, so a widened
// policy, a missing Access app or a forgotten route cannot expose the Desk. Unconfigured means
// locked: with no team domain or AUD every request is refused.

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccessConfig {
  teamDomain?: string;
  audience?: string;
  ownerEmail?: string;
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
    });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (email !== owner) throw new AccessDenied('Not the owner');
    return { email };
  } catch (e) {
    if (e instanceof AccessDenied) throw e;
    throw new AccessDenied('The Access assertion did not verify');
  }
}

/** Local development only: never in production, never on a non-local host. */
export function devBypassAllowed(env: { DEV_AUTH_BYPASS?: string; ENVIRONMENT: string }, url: URL): boolean {
  return env.DEV_AUTH_BYPASS === '1' && env.ENVIRONMENT !== 'production' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}
