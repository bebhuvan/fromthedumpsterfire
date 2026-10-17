// Over-the-air updates for the reader app: the expo-updates protocol, version 1
// (https://docs.expo.dev/technical-specs/expo-updates-1/), served from MEDIA under `app-updates/`.
//
// `scripts/publish-app-update.ts` runs on the editor's laptop: it exports the JS bundle, uploads every
// asset under its SHA-256, and writes one pointer per platform and runtime version holding the
// manifest (or a roll-back directive) and its RSA signature. The signing key never leaves the
// laptop; this Worker relays the stored body and signature byte for byte, and the app refuses
// anything its embedded certificate does not verify. The runtime version is the native fingerprint,
// so a JS update only ever reaches the builds it was made for.

export const UPDATES_PREFIX = 'app-updates/';

/** What the publish script stores at `app-updates/<platform>/<runtime>.json` (and `no-update.json`). */
export interface StoredPart {
  kind: 'manifest' | 'directive';
  /** The exact JSON string that was signed. */
  body: string;
  /** Base64 RSA-SHA256 signature of `body`. */
  signature: string;
  keyid: string;
}

const PLATFORMS = new Set(['android', 'ios']);
const RUNTIME = /^[A-Za-z0-9._-]{1,128}$/;
const ASSET = /^[0-9a-f]{64}$/;
const BOUNDARY = 'fdf-update-part';

const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'cache-control': 'private, max-age=0',
};

export const pointerKey = (platform: string, runtime: string) => `${UPDATES_PREFIX}${platform}/${runtime}.json`;
export const assetKey = (sha256hex: string) => `${UPDATES_PREFIX}assets/${sha256hex}`;
const NO_UPDATE_KEY = `${UPDATES_PREFIX}no-update.json`;

function multipart(name: StoredPart['kind'], part: StoredPart): Response {
  const body =
    `--${BOUNDARY}\r\n` +
    `content-type: application/json; charset=utf-8\r\n` +
    `content-disposition: form-data; name="${name}"\r\n` +
    `expo-signature: sig="${part.signature}", keyid="${part.keyid}"\r\n\r\n` +
    `${part.body}\r\n--${BOUNDARY}--\r\n`;
  return new Response(body, { status: 200, headers: { ...PROTOCOL_HEADERS, 'content-type': `multipart/mixed; boundary=${BOUNDARY}` } });
}

async function readPart(bucket: R2Bucket, key: string): Promise<StoredPart | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const p = (await obj.json()) as StoredPart;
  return p && typeof p.body === 'string' && typeof p.signature === 'string' ? p : null;
}

/** GET /v1/updates: the newest update for this platform and runtime, or "no update". */
export async function manifestResponse(req: Request, bucket: R2Bucket): Promise<Response> {
  const h = req.headers;
  const platform = h.get('expo-platform') ?? '';
  const runtime = h.get('expo-runtime-version') ?? '';
  if (!PLATFORMS.has(platform)) return Response.json({ error: 'expo-platform must be android or ios' }, { status: 400 });
  if (!RUNTIME.test(runtime)) return Response.json({ error: 'Missing or malformed expo-runtime-version' }, { status: 400 });
  if (h.get('expo-protocol-version') !== '1') return Response.json({ error: 'Only expo-updates protocol 1 is served' }, { status: 400 });

  const current = h.get('expo-current-update-id');
  const part = await readPart(bucket, pointerKey(platform, runtime));
  if (part) {
    // Nothing new: the phone already runs this update (or, for a roll-back, its embedded build).
    const id = part.kind === 'manifest' ? (JSON.parse(part.body) as { id?: string }).id : h.get('expo-embedded-update-id');
    if (!current || !id || current.toLowerCase() !== id.toLowerCase()) return multipart(part.kind, part);
  }
  const none = await readPart(bucket, NO_UPDATE_KEY);
  if (none) return multipart('directive', none);
  return new Response(null, { status: 204, headers: PROTOCOL_HEADERS });
}

/** GET /v1/updates/asset?h=<sha256 hex>: one immutable bundle or asset file. */
export async function assetResponse(req: Request, bucket: R2Bucket): Promise<Response> {
  const hash = new URL(req.url).searchParams.get('h') ?? '';
  if (!ASSET.test(hash)) return Response.json({ error: 'Expected ?h=<sha256 hex>' }, { status: 400 });
  const obj = await bucket.get(assetKey(hash));
  if (!obj) return Response.json({ error: 'Not found' }, { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-disposition': 'attachment',
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
