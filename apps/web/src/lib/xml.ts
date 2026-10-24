// RSS and sitemap generation. Every value is escaped; nothing from a bundle is emitted raw.

import { haulSlug, type Haul } from '@fdf/shared/haul';
import { typeLabel } from '@fdf/shared/tokens';
import { bookUpdated, type Shelf } from '@fdf/shared/shelf';
import {
  absolute,
  EDITOR_NAME,
  findItemAcrossHauls,
  haulLastmod,
  paths,
  rfc822,
  safeHref,
  SITE,
  SITE_DESCRIPTION,
  SITE_NAME,
  titleText,
} from './site';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

function haulFeedHtml(h: Haul, allHauls: Haul[]): string {
  const parts: string[] = [];
  parts.push(`<p><em>${esc(h.deck)}</em></p>`);

  const note = h.fieldNote;
  parts.push(`<h2>${esc(titleText(note.title))}</h2>`);
  for (const p of note.paragraphs) {
    parts.push(`<p>${esc(p)}</p>`);
  }
  if (note.route.length) {
    const steps = note.route
      .map((s) => {
        const who = s.by === 'machine' ? 'Machine' : EDITOR_NAME;
        const text = esc(s.text);
        const link = s.itemId
          ? `<a href="${esc(absolute(paths.item(h.number, s.itemId)))}">${text}</a>`
          : text;
        return `<li><strong>${esc(s.day)} (${esc(who)}):</strong> ${link}</li>`;
      })
      .join('');
    parts.push(`<h3>The route</h3><ol>${steps}</ol>`);
  }

  parts.push(`<h2>In Haul ${esc(haulSlug(h.number))}</h2>`);
  for (const item of h.items) {
    const itemUrl = absolute(paths.item(h.number, item.id));
    const srcUrl = safeHref(item.media?.url ?? item.source.url);
    const srcLabel = `${esc(item.source.name)}, ${esc(item.source.date)}`;
    const srcHtml = srcUrl ? `<a href="${esc(srcUrl)}">${srcLabel}</a>` : srcLabel;

    parts.push(
      `<h3><a href="${esc(itemUrl)}">${esc(titleText(item.title))}</a> — ${esc(item.creator)}</h3>`,
      `<p><small>${esc(typeLabel[item.type])} · ${srcHtml}</small></p>`,
      `<p>${esc(item.why.text)} — <em>${esc(EDITOR_NAME)}</em></p>`,
    );
    if (item.startHere) {
      const at = item.startHere.url ? `<a href="${esc(item.startHere.url)}">${esc(item.startHere.at)}</a>` : esc(item.startHere.at);
      parts.push(`<p><strong>Start here:</strong> ${at}${item.startHere.note ? ` (${esc(item.startHere.note)})` : ''}</p>`);
    }

    if (item.excerpt) {
      const paras = item.excerpt.text.split(/\n\s*\n/).filter((x) => x.trim());
      parts.push(`<blockquote>${paras.map((x) => `<p>${esc(x)}</p>`).join('')}</blockquote>`);
    }
    if (item.rhyme) {
      parts.push(
        `<blockquote><p><strong>${esc(item.rhyme.then.year)}:</strong> ${esc(item.rhyme.then.quote)} (${esc(item.rhyme.then.cite)})</p></blockquote>`,
        `<p><em>Machine bridge:</em> ${esc(item.rhyme.bridge)}</p>`,
        `<blockquote><p><strong>${esc(item.rhyme.now.year)}:</strong> ${esc(item.rhyme.now.quote)} (${esc(item.rhyme.now.cite)})</p></blockquote>`,
      );
    }
    if (item.marginalia.length) {
      const notes = item.marginalia
        .map((m) => `<li>${esc(m.text)} <cite>(${esc(m.cite)})</cite></li>`)
        .join('');
      parts.push(`<ul>${notes}</ul>`);
    }
    if (item.ideas?.length) {
      const ideas = item.ideas
        .map((m) => `<li><p>${esc(m.text)}</p>${m.quote ? `<blockquote><p>${esc(m.quote)}</p></blockquote>` : ''}${m.locator ? `<p><cite>${esc(m.locator)}</cite></p>` : ''}${m.reaction ? `<p><em>${esc(m.reaction)}</em> — ${esc(EDITOR_NAME)}</p>` : ''}</li>`)
        .join('');
      parts.push(`<p><em>The big ideas (machine, each checked against the source):</em></p><ol>${ideas}</ol>`);
    }
  }

  for (const t of h.threads) {
    const threadUrl = absolute(paths.thread(h.number, t.id));
    const pts = t.points
      .map((pt) => {
        const target = findItemAcrossHauls(pt.itemId, h, allHauls);
        const title = target
          ? `<a href="${esc(absolute(paths.item(target.haul.number, target.item.id)))}">${esc(pt.title)}</a>`
          : esc(pt.title);
        return `<li><strong>${esc(pt.year)} — ${title}:</strong> ${esc(pt.gist)}</li>`;
      })
      .join('');
    parts.push(
      `<h2>Thread: <a href="${esc(threadUrl)}">${esc(titleText(t.title))}</a></h2>`,
      `<p>${esc(t.summary)}</p>`,
      `<ol>${pts}</ol>`,
    );
  }

  parts.push(`<hr/><p><small>${esc(h.colophon)}</small></p>`);
  return parts.join('\n');
}

export function rss(hauls: Haul[]): string {
  const items = hauls
    .map((h) => {
      const url = absolute(paths.haul(h.number));
      const contents = h.items.map((i) => `${titleText(i.title)} (${i.creator})`).join('; ');
      const categories = [...new Set(h.items.flatMap((i) => i.wiki.map((w) => w.title)))];
      const catTags = categories.map((c) => `<category>${esc(c)}</category>`).join('');
      const fullHtml = haulFeedHtml(h, hauls);
      return [
        '<item>',
        `<title>${esc(`Haul ${h.number}: ${titleText(h.title)}`)}</title>`,
        `<link>${esc(url)}</link>`,
        `<guid isPermaLink="true">${esc(url)}</guid>`,
        `<pubDate>${rfc822(h.publishedAt)}</pubDate>`,
        `<dc:creator>${esc(EDITOR_NAME)}</dc:creator>`,
        catTags,
        `<description>${esc(`${h.deck} In this Haul: ${contents}.`)}</description>`,
        `<content:encoded>${esc(fullHtml)}</content:encoded>`,
        '</item>',
      ].join('');
    })
    .join('\n');
  const updated = hauls[0] ? rfc822(hauls[0].publishedAt) : new Date(0).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
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

export function sitemap(hauls: Haul[], shelf?: Shelf | null): string {
  const latestMod = hauls.length
    ? hauls.map(haulLastmod).sort().at(-1)
    : undefined;
  const urls: { loc: string; lastmod?: string }[] = [
    { loc: absolute(paths.home), lastmod: latestMod },
    { loc: absolute(paths.archive), lastmod: latestMod },
    { loc: absolute(paths.threads), lastmod: latestMod },
    { loc: absolute(paths.search), lastmod: latestMod },
    { loc: absolute(paths.about) },
    { loc: absolute(paths.llms), lastmod: latestMod },
    { loc: absolute(paths.llmsFull), lastmod: latestMod },
  ];
  if (shelf?.books.length) {
    urls.push({ loc: absolute(paths.shelf), lastmod: shelf.updatedAt.slice(0, 10) });
    for (const b of shelf.books) urls.push({ loc: absolute(paths.book(b.id)), lastmod: (bookUpdated(b) || shelf.updatedAt).slice(0, 10) });
  }
  for (const h of hauls) {
    const lastmod = haulLastmod(h);
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
