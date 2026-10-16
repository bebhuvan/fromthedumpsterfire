// Android App Links and iOS Universal Links for the reader app. Generated only when the signing
// fingerprint / app id are provided at build time; nothing is ever invented.
//   ANDROID_CERT_SHA256  release signing certificate SHA-256, colon-separated hex (comma for several)
//   APPLE_APP_ID         TEAMID.com.fromthedumpsterfire.app

export const ANDROID_PACKAGE = 'com.fromthedumpsterfire.app';
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const APPLE_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;

export function assetLinks(certs: string | undefined): string | null {
  const list = (certs ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!list.length) return null;
  for (const c of list) if (!FINGERPRINT.test(c)) throw new Error(`ANDROID_CERT_SHA256: "${c}" is not a SHA-256 fingerprint`);
  return JSON.stringify([
    { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: list } },
  ]);
}

export function appleAppSiteAssociation(appId: string | undefined): string | null {
  const id = (appId ?? '').trim();
  if (!id) return null;
  if (!APPLE_ID.test(id)) throw new Error(`APPLE_APP_ID: "${id}" is not TEAMID.bundle.id`);
  return JSON.stringify({ applinks: { details: [{ appIDs: [id], components: [{ '/': '/haul/*' }] }] } });
}
