#!/usr/bin/env node
// One-time service-access provisioning. See docs/EDITORIAL.md. No credentials in argv or output.
import { parseArgs, parseEnv } from 'node:util';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { TARGETS } from './client.mjs';
import { provisionAccess } from './provision.mjs';

let adminToken;
let phase = 'setup';
try {
  const { values: v } = parseArgs({ options: { profile: { type: 'string', default: 'production' }, scope: { type: 'string', default: 'draft' }, name: { type: 'string' }, config: { type: 'string' }, 'admin-config': { type: 'string' }, 'cf-auth': { type: 'boolean' }, apply: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (v.help) {
    console.log('npm run editorial:setup -- [--profile production|preview] [--scope draft|publish] [--name SESSION] [--cf-auth | --admin-config FILE] [--config NEW-FILE] [--apply]\n--cf-auth uses the separate authenticated cf CLI (not Wrangler). Admin config: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (optional FDF_ACCESS_APP_ID). Dry run by default. See docs/EDITORIAL.md.');
  } else {
    if (!['production', 'preview'].includes(v.profile) || !['draft', 'publish'].includes(v.scope)) throw new Error('Use profile production|preview and scope draft|publish');
    const root = resolve(import.meta.dirname, '../..');
    const config = resolve(v.config ?? join(homedir(), '.config/fdf/editorial', `${v.profile}.env`));
    if (existsSync(config) || existsSync(config + '.receipt.json')) throw new Error('Credential output already exists. Use a new --config path; never overwrite an active credential.');
    let saved = {};
    if (v['admin-config']) {
      if (statSync(v['admin-config']).mode & 0o077) throw new Error('Admin config must be chmod 600');
      saved = parseEnv(readFileSync(v['admin-config'], 'utf8'));
    }
    const settings = { ...saved, ...process.env };
    adminToken = settings.CLOUDFLARE_API_TOKEN;
    if (v['cf-auth']) {
      if (adminToken || v['admin-config']) throw new Error('Choose --cf-auth or an admin token/config, not both');
      // Let the official CLI refresh its own OAuth login. Capture output privately: whoami can
      // contain account details, and auth failures must never expose subprocess diagnostics.
      phase = 'cf-auth';
      execFileSync('npm', ['exec', '--yes', '--package=cf', '--', 'cf', 'auth', 'whoami'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
      const cf = JSON.parse(readFileSync(join(homedir(), '.config/cloudflare/config/default.json'), 'utf8'));
      if (!cf.oauth_token || !Number.isFinite(Date.parse(cf.expiration_time)) || Date.parse(cf.expiration_time) <= Date.now()) throw new Error('cf login has expired; run cf auth login --no-browser, then retry setup');
      adminToken = cf.oauth_token;
    }
    const account = settings.CLOUDFLARE_ACCOUNT_ID ?? '169758eb3d46dcbb6dba025317257426';
    if (!adminToken) throw new Error('Use --cf-auth, or set CLOUDFLARE_API_TOKEN via the environment or --admin-config. Access applications/policies and service-token edit permissions are required.');
    if (!/^[a-f0-9]{32}$/.test(account)) throw new Error('Invalid account ID');
    const base = `https://api.cloudflare.com/client/v4/accounts/${account}/access`;
    const api = async (path, method = 'GET', data) => {
      let res;
      try {
        res = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
      } catch { throw new Error(`Cloudflare ${method} response unavailable; inspect Access before rerunning setup (a write may have completed)`); }
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(`Cloudflare refused ${method} ${path} (HTTP ${res.status}). Check account and Access permissions. No API response or secret was printed.`);
      return body;
    };
    if (v.apply) {
      // Build before creating Access resources; failure prints no subprocess diagnostic with secrets.
      phase = 'build';
      execFileSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--outdir', join(root, '.wrangler/editorial-setup-check'), '-c', join(root, 'workers/api/wrangler.jsonc'), '--env', v.profile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    }
    const result = await provisionAccess({ api, origin: TARGETS[v.profile], appId: settings.FDF_ACCESS_APP_ID, name: v.name ?? `FDF editorial ${v.profile} ${new Date().toISOString().slice(0, 10)}`, scope: v.scope, apply: v.apply, saveCredential: async ({ origin, clientId, clientSecret, receipt }) => {
      mkdirSync(dirname(config), { recursive: true, mode: 0o700 });
      let created = false;
      try {
        writeFileSync(config, `FDF_DESK_URL=${origin}\nFDF_ACCESS_CLIENT_ID=${clientId}\nFDF_ACCESS_CLIENT_SECRET=${clientSecret}\n`, { mode: 0o600, flag: 'wx' });
        created = true;
        writeFileSync(config + '.receipt.json', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      } catch (e) { if (created) unlinkSync(config); throw e; }
    } });
    console.log(JSON.stringify({ ...result, credentialFile: config, next: result.apply ? `Add clientId to ACCESS_SERVICE_CLIENT_IDS${v.scope === 'publish' ? ' and ACCESS_SERVICE_PUBLISH_CLIENT_IDS' : ''} in the Desk env vars, preserving existing IDs; deploy the Desk, then run editorial status. Existing owner policies are preserved. See docs/EDITORIAL.md.` : 'Dry run only. Add --apply to create this credential and its Service Auth policy.' }, null, 2));
  }
} catch (e) {
  const message = e?.cmd || e?.spawnargs ? phase === 'cf-auth' ? 'cf authentication check failed; run cf auth login --no-browser, then retry setup.' : 'Worker dry-run failed; run the documented dry-run to inspect build diagnostics.' : e.message;
  console.error(JSON.stringify({ error: adminToken ? message.split(adminToken).join('[redacted]') : message }));
  process.exitCode = 1;
}
