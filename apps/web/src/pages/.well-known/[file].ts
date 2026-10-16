import type { APIRoute, GetStaticPaths } from 'astro';
import { appleAppSiteAssociation, assetLinks } from '../../lib/applinks';

export const getStaticPaths = (() => {
  const out: { params: { file: string }; props: { body: string } }[] = [];
  const android = assetLinks(process.env.ANDROID_CERT_SHA256);
  if (android) out.push({ params: { file: 'assetlinks.json' }, props: { body: android } });
  const apple = appleAppSiteAssociation(process.env.APPLE_APP_ID);
  if (apple) out.push({ params: { file: 'apple-app-site-association' }, props: { body: apple } });
  return out;
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response((props as { body: string }).body, { headers: { 'content-type': 'application/json' } });
