// Publish an over-the-air JS update of the reader app (expo-updates protocol 1), or roll phones back
// to the build they installed. Runs on the editor's laptop, where the signing key lives.
//
//   node --experimental-strip-types scripts/publish-app-update.ts [--rollback]
//
// Production only: the preview Worker sits wholly behind Access, so a phone cannot reach it.
//
// 1. Exports the app's JS bundle and assets for Android (EXPO_PUBLIC_USE_SEED=0, as launch builds).
// 2. Resolves the runtime version (the native fingerprint) exactly as the build did, so the update
//    reaches only the APKs whose native code it fits. A native change needs a new APK, not this.
// 3. Uploads each file to R2 under app-updates/assets/<sha256> (skipping ones already there).
// 4. Signs the manifest with the private key (default ~/.config/fdf/app-updates/private-key.pem,
//    or FDF_UPDATE_KEY) and stores it, last, as app-updates/android/<runtime>.json.
// 5. Checks the live route: the signature verifies against apps/mobile/certs/certificate.pem and
//    every asset downloads with the hash the manifest promises.
//
// Phones fetch the update in the background on launch and run it from the next cold start.

import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, createSign, createVerify, X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP = join(ROOT, 'apps/mobile');
const PLATFORM = 'android';
const target = { base: 'https://api.fromthedumpsterfire.com', bucket: 'fdf-media' };

const MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  json: 'application/json',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

const args = process.argv.slice(2);
const rollback = args.includes('--rollback');
const KEYID = 'main';
const keyPath = process.env.FDF_UPDATE_KEY ?? join(homedir(), '.config/fdf/app-updates/private-key.pem');
if (!existsSync(keyPath)) throw new Error(`No signing key at ${keyPath}`);
const privateKey = readFileSync(keyPath, 'utf8');
const cert = new X509Certificate(readFileSync(join(APP, 'certs/certificate.pem')));
if (!createPublicKey(privateKey).equals(cert.publicKey)) throw new Error('The signing key does not match apps/mobile/certs/certificate.pem');

// The same environment launch APKs are built with.
const childEnv = { ...process.env, EXPO_PUBLIC_USE_SEED: '0' };
const run = (cmd: string, argv: string[], cwd = APP) => execFileSync(cmd, argv, { cwd, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
const sign = (body: string) => createSign('RSA-SHA256').update(body, 'utf8').sign(privateKey, 'base64');
const part = (kind: 'manifest' | 'directive', value: unknown) => {
  const body = JSON.stringify(value);
  return { kind, body, signature: sign(body), keyid: KEYID };
};
const r2put = (key: string, file: string, type: string) =>
  run('npx', ['wrangler', 'r2', 'object', 'put', `${target.bucket}/${key}`, '--file', file, '--content-type', type, '--remote'], ROOT);

const runtime = (JSON.parse(run('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', PLATFORM])) as { runtimeVersion: string }).runtimeVersion;
if (!/^[A-Za-z0-9._-]{1,128}$/.test(runtime)) throw new Error(`Unexpected runtime version: ${runtime}`);
console.log(`runtime ${runtime}`);

const work = mkdtempSync(join(tmpdir(), 'fdf-update-'));
try {
  const writeJson = (name: string, value: unknown) => {
    const f = join(work, name);
    writeFileSync(f, JSON.stringify(value));
    return f;
  };
  // "No update" is the same signed directive for every runtime.
  r2put('app-updates/no-update.json', writeJson('no-update.json', part('directive', { type: 'noUpdateAvailable' })), 'application/json');

  let pointer;
  if (rollback) {
    pointer = part('directive', { type: 'rollBackToEmbedded', parameters: { commitTime: new Date().toISOString() } });
  } else {
    const out = join(work, 'dist');
    run('npx', ['expo', 'export', '--platform', PLATFORM, '--output-dir', out]);
    const meta = JSON.parse(readFileSync(join(out, 'metadata.json'), 'utf8')) as {
      fileMetadata: Record<string, { bundle: string; assets: Array<{ path: string; ext: string }> }>;
    };
    const files = meta.fileMetadata[PLATFORM]!;
    const expoClient = JSON.parse(run('npx', ['expo', 'config', '--type', 'public', '--json']));

    const describe = async (path: string, ext: string, launch: boolean) => {
      const bytes = readFileSync(join(out, path));
      const hex = createHash('sha256').update(bytes).digest('hex');
      const contentType = launch ? 'application/javascript' : (MIME[ext.toLowerCase()] ?? 'application/octet-stream');
      const url = `${target.base}/v1/updates/asset?h=${hex}`;
      const have = await fetch(url, { method: 'HEAD' });
      if (have.status !== 200) r2put(`app-updates/assets/${hex}`, join(out, path), contentType);
      return {
        hash: createHash('sha256').update(bytes).digest('base64url'),
        key: createHash('md5').update(bytes).digest('hex'),
        contentType,
        fileExtension: launch ? '.bundle' : `.${ext}`,
        url,
        uploaded: have.status !== 200,
      };
    };
    const launchAsset = await describe(files.bundle, 'bundle', true);
    const assets = [];
    for (const a of files.assets) assets.push(await describe(a.path, a.ext, false));
    const strip = ({ uploaded: _u, ...rest }: typeof launchAsset) => rest;
    const digest = createHash('sha256').update([runtime, launchAsset.hash, ...assets.map((a) => a.hash)].join('\n')).digest('hex');
    const manifest = {
      id: `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`,
      createdAt: new Date().toISOString(),
      runtimeVersion: runtime,
      launchAsset: strip(launchAsset),
      assets: assets.map(strip),
      metadata: {},
      extra: { expoClient },
    };
    const sent = [launchAsset, ...assets].filter((a) => a.uploaded).length;
    console.log(`update ${manifest.id}: bundle + ${assets.length} assets (${sent} uploaded, ${1 + assets.length - sent} already there)`);
    pointer = part('manifest', manifest);
  }
  // The pointer goes last, so a phone never sees a manifest whose files are not yet stored.
  r2put(`app-updates/${PLATFORM}/${runtime}.json`, writeJson('pointer.json', pointer), 'application/json');

  // Check what a phone will see.
  const res = await fetch(`${target.base}/v1/updates`, {
    headers: { 'expo-protocol-version': '1', 'expo-platform': PLATFORM, 'expo-runtime-version': runtime, accept: 'multipart/mixed', 'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"' },
  });
  const text = await res.text();
  const [head, ...rest] = text.split('\r\n\r\n');
  const body = rest.join('\r\n\r\n').replace(/\r\n--[^\r\n]+--\r\n$/, '');
  const sig = /expo-signature: sig="([^"]+)"/.exec(head ?? '')?.[1];
  if (res.status !== 200 || body !== pointer.body) throw new Error(`Live route did not return the stored ${pointer.kind} (status ${res.status})`);
  if (!sig || !createVerify('RSA-SHA256').update(body, 'utf8').verify(cert.publicKey, sig, 'base64')) throw new Error('Live signature does not verify against the certificate');
  if (pointer.kind === 'manifest') {
    const m = JSON.parse(body) as { launchAsset: { url: string; hash: string }; assets: Array<{ url: string; hash: string }> };
    for (const a of [m.launchAsset, ...m.assets]) {
      const r = await fetch(a.url);
      const got = createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('base64url');
      if (!r.ok || got !== a.hash) throw new Error(`Asset ${a.url} is missing or does not match its hash`);
    }
  }
  console.log(`live: ${pointer.kind === 'manifest' ? 'manifest' : 'roll-back directive'} served, signature verified${pointer.kind === 'manifest' ? ', every asset matches its hash' : ''}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

