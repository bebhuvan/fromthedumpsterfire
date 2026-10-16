// Rendered HTML for pages that only show their text after JavaScript runs, via Cloudflare Browser
// Rendering (the BROWSER binding).
//
// Off by default. It runs only when the BROWSER binding exists AND the BROWSER_FALLBACK var is "on".
//
// SSRF: every request the page makes, including the first navigation, every redirect hop and every
// frame, passes through request interception and must pass the same checks as guardedFetch: http or
// https only (data: and blob: are allowed because they make no network request), default ports, no
// credentials, no internal hostnames or private/reserved IP literals, and the hostname must resolve
// (DNS over HTTPS) only to public addresses. Anything else is aborted. The final URL is checked
// again before its HTML is used.
//
// What interception cannot cover, and why the feature is opt-in: WebSocket connections are not
// intercepted by the DevTools protocol, and the browser does its own DNS lookup after ours, so a
// host that rebinds between the two lookups could in principle reach an address we did not see.
// The browser runs on Cloudflare's network, which has no route into a private network of ours,
// so the exposure is small; still, keep it off unless JS-only pages matter.

import puppeteer from '@cloudflare/puppeteer';
import type { Env } from '../env';
import { assertPublicDestination, assertPublicUrl, type Resolver } from './guard';

export const browserAvailable = (env: Pick<Env, 'BROWSER' | 'BROWSER_FALLBACK'>) => Boolean(env.BROWSER) && env.BROWSER_FALLBACK === 'on';

const NAV_TIMEOUT_MS = 30_000;
const MAX_HTML = 15 * 1024 * 1024;
const MAX_REQUESTS = 300;

/**
 * Decide whether the page may make one request. Exported for tests. Returns a reason when blocked.
 * `resolve` is the DoH resolver (cached per host by the guard).
 */
export async function vetBrowserRequest(url: string, resolve?: Resolver): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'not a URL';
  }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return null;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `scheme ${u.protocol}`;
  try {
    assertPublicUrl(u);
    await assertPublicDestination(u, resolve);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'blocked';
  }
}

export async function renderPage(env: Env, url: string, resolve?: Resolver): Promise<{ html: string; url: string; blocked: string[] }> {
  if (!browserAvailable(env)) throw new Error('Browser Rendering is off (needs the BROWSER binding and BROWSER_FALLBACK=on)');
  const first = await vetBrowserRequest(url, resolve);
  if (first) throw new Error(`Blocked URL: ${first}`);
  const browser = await puppeteer.launch(env.BROWSER as never);
  const blocked: string[] = [];
  let count = 0;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      void (async () => {
        try {
          count++;
          const reason = count > MAX_REQUESTS ? 'too many requests' : ['media', 'font', 'websocket', 'eventsource', 'manifest'].includes(req.resourceType()) ? 'not needed for text' : await vetBrowserRequest(req.url(), resolve);
          if (reason) {
            blocked.push(`${req.url().slice(0, 120)}: ${reason}`);
            await req.abort();
          } else await req.continue();
        } catch {
          await req.abort().catch(() => {});
        }
      })();
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
    const finalUrl = page.url();
    const last = await vetBrowserRequest(finalUrl, resolve);
    if (last) throw new Error(`Blocked URL after redirects: ${last}`);
    const html = await page.content();
    if (html.length > MAX_HTML) throw new Error('The rendered page is too large');
    return { html, url: finalUrl, blocked };
  } finally {
    await browser.close().catch(() => {});
  }
}
