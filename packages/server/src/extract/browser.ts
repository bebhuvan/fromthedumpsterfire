// Rendered HTML for pages that only show their text after JavaScript runs, via Cloudflare Browser
// Rendering (the BROWSER binding). Off when the binding is missing.
//
// SSRF: the starting URL passes the full guard (scheme, port, hostname, every resolved address)
// before the browser opens it. The browser then fetches subresources itself, from Cloudflare's
// network, outside guardedFetch; as defence in depth every request the page makes is checked against
// the static URL rules (scheme, port, credentials, internal names, private IP literals) and aborted
// if it fails, and the final URL after any redirect is checked again before its HTML is used.

import puppeteer from '@cloudflare/puppeteer';
import type { Env } from '../env';
import { assertPublicDestination, assertPublicUrl } from './guard';

export const browserAvailable = (env: Pick<Env, 'BROWSER'>) => Boolean(env.BROWSER);

const NAV_TIMEOUT_MS = 30_000;
const MAX_HTML = 15 * 1024 * 1024;

export async function renderPage(env: Env, url: string): Promise<{ html: string; url: string }> {
  if (!env.BROWSER) throw new Error('Browser Rendering is not configured');
  await assertPublicDestination(url);
  const browser = await puppeteer.launch(env.BROWSER as never);
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      try {
        assertPublicUrl(req.url());
        // Media and fonts are never needed for text.
        if (['media', 'font'].includes(req.resourceType())) return void req.abort();
        void req.continue();
      } catch {
        void req.abort();
      }
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
    const finalUrl = page.url();
    await assertPublicDestination(finalUrl);
    const html = await page.content();
    if (html.length > MAX_HTML) throw new Error('The rendered page is too large');
    return { html, url: finalUrl };
  } finally {
    await browser.close().catch(() => {});
  }
}
