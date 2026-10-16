// RSS and sitemap generation. Every value is escaped; nothing from a bundle is emitted raw.

import type { Haul } from '@fdf/shared/haul';
import { absolute, paths, rfc822, SITE, SITE_DESCRIPTION, SITE_NAME, titleText } from './site';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export function rss(hauls: Haul[]): string {
  const items = hauls
    .map((h) => {
      const url = absolute(paths.haul(h.number));
      const contents = h.items.map((i) => `${titleText(i.title)} (${i.creator})`).join('; ');
      return [
        '<item>',
        `<title>${esc(`Haul ${h.number}: ${titleText(h.title)}`)}</title>`,
        `<link>${esc(url)}</link>`,
        `<guid isPermaLink="true">${esc(url)}</guid>`,
        `<pubDate>${rfc822(h.publishedAt)}</pubDate>`,
        `<description>${esc(`${h.deck} In this Haul: ${contents}.`)}</description>`,
        '</item>',
      ].join('');
    })
    .join('\n');
  const updated = hauls[0] ? rfc822(hauls[0].publishedAt) : new Date(0).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE_NAME)}</title>
<link>${esc(SITE + '/')}</link>
<atom:link href="${esc(absolute(paths.feed))}" rel="self" type="application/rss+xml"/>
<description>${esc(SITE_DESCRIPTION)}</description>
<language>en-in</language>
<lastBuildDate>${updated}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

export function sitemap(hauls: Haul[]): string {
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: absolute(paths.home), lastmod: hauls[0]?.publishedAt.slice(0, 10) },
    { loc: absolute(paths.archive) },
    { loc: absolute(paths.threads) },
    { loc: absolute(paths.search) },
    { loc: absolute(paths.about) },
  ];
  for (const h of hauls) {
    const lastmod = (h.corrections?.at(-1)?.date ?? h.publishedAt).slice(0, 10);
    urls.push({ loc: absolute(paths.haul(h.number)), lastmod });
    for (const i of h.items) urls.push({ loc: absolute(paths.item(h.number, i.id)), lastmod });
    for (const t of h.threads) urls.push({ loc: absolute(paths.thread(h.number, t.id)), lastmod });
  }
  const body = urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
