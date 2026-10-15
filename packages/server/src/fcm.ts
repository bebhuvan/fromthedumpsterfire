// Push through FCM HTTP v1. The service-account JSON lives in the FCM_SERVICE_ACCOUNT secret;
// the OAuth assertion is signed with WebCrypto (RS256) inside the Worker and exchanged for a
// short-lived access token, cached per isolate.

import type { Env } from './env';
import { base64UrlEncode, nowIso } from './util';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cached: { token: string; exp: number; email: string } | null = null;

function parseAccount(env: Env): ServiceAccount | null {
  if (!env.FCM_SERVICE_ACCOUNT) return null;
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Sign a Google OAuth JWT assertion for the service account. Exported for tests. */
export async function signAssertion(sa: ServiceAccount, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.exp > Date.now() + 60_000) return cached.token;
  const assertion = await signAssertion(sa);
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google OAuth refused the service account (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000, email: sa.client_email };
  return j.access_token;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

export interface PushReport {
  configured: boolean;
  sent: number;
  failed: number;
  disabled: number;
}

/** Send one notification to every enabled device. Unregistered tokens are disabled. */
export async function notifyAll(env: Env, msg: PushMessage): Promise<PushReport> {
  const sa = parseAccount(env);
  if (!sa) return { configured: false, sent: 0, failed: 0, disabled: 0 };
  const token = await accessToken(sa);
  const devices = (await env.DB.prepare('SELECT token, platform FROM devices WHERE enabled = 1').all<{ token: string; platform: string }>()).results;
  const report: PushReport = { configured: true, sent: 0, failed: 0, disabled: 0 };
  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const queue = [...devices];
  const worker = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: msg.title, body: msg.body },
            data: { url: msg.url },
            android: { priority: 'normal', notification: { channel_id: 'hauls' } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      });
      if (res.ok) {
        report.sent++;
        await env.DB.prepare('UPDATE devices SET last_sent_at = ?, last_error = NULL, failures = 0 WHERE token = ?').bind(nowIso(), d.token).run();
        continue;
      }
      const text = await res.text();
      const gone = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/i.test(text);
      if (gone) report.disabled++;
      else report.failed++;
      await env.DB.prepare(`UPDATE devices SET last_error = ?, failures = failures + 1, enabled = CASE WHEN ? THEN 0 ELSE enabled END, updated_at = ? WHERE token = ?`)
        .bind(`${res.status}: ${text.slice(0, 200)}`, gone ? 1 : 0, nowIso(), d.token)
        .run();
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, devices.length) }, worker));
  return report;
}
