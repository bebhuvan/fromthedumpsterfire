// Article extraction: Readability on linkedom, then the article HTML flattened to the plain-text
// form the Desk stores (paragraphs separated by blank lines, headings marked with "## ", verse
// line breaks kept). Excerpt offsets index into exactly this text.

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

// linkedom's DOM is untyped here: the Workers type set has no DOM lib, and mixing the two clashes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Document = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

export interface PageMeta {
  title?: string;
  creator?: string;
  siteName?: string;
  date?: string;
  description?: string;
  image?: string;
  canonical?: string;
  audio?: string;
  video?: string;
  lang?: string;
}

export interface ExtractedPage {
  text: string;
  meta: PageMeta;
  headings: Array<{ offset: number; text: string }>;
}

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGCAPTION', 'TR', 'DD', 'DT', 'ASIDE', 'HEADER', 'FOOTER', 'TABLE', 'UL', 'OL', 'FIGURE', 'MAIN', 'HR']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'IFRAME', 'BUTTON', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'NAV']);

function metaContent(doc: Document, ...selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const v = el?.getAttribute('content') ?? el?.getAttribute('href') ?? el?.getAttribute('src') ?? el?.getAttribute('datetime');
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function jsonLd(doc: Document): { date?: string; author?: string; headline?: string } {
  const out: { date?: string; author?: string; headline?: string } = {};
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(s.textContent ?? '');
      const nodes: unknown[] = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      for (const n of nodes as Array<Record<string, unknown>>) {
        if (!n || typeof n !== 'object') continue;
        out.date ??= (n.datePublished as string) ?? undefined;
        out.headline ??= (n.headline as string) ?? undefined;
        const a = n.author as unknown;
        const name = Array.isArray(a) ? (a[0] as { name?: string })?.name : (a as { name?: string })?.name ?? (typeof a === 'string' ? a : undefined);
        out.author ??= name;
      }
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  }
  return out;
}

export function readMeta(doc: Document, baseUrl: string): PageMeta {
  const ld = jsonLd(doc);
  const abs = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return undefined;
    }
  };
  return {
    title: metaContent(doc, 'meta[property="og:title"]', 'meta[name="twitter:title"]') ?? ld.headline ?? doc.querySelector('title')?.textContent?.trim(),
    creator: metaContent(doc, 'meta[name="author"]', 'meta[property="article:author"]', 'meta[name="citation_author"]') ?? ld.author,
    siteName: metaContent(doc, 'meta[property="og:site_name"]', 'meta[name="application-name"]'),
    date: metaContent(doc, 'meta[property="article:published_time"]', 'meta[name="citation_publication_date"]', 'meta[name="date"]', 'time[datetime]') ?? ld.date,
    description: metaContent(doc, 'meta[property="og:description"]', 'meta[name="description"]'),
    image: abs(metaContent(doc, 'meta[property="og:image"]')),
    canonical: abs(metaContent(doc, 'link[rel="canonical"]', 'meta[property="og:url"]')),
    audio: abs(metaContent(doc, 'meta[property="og:audio"]', 'meta[property="og:audio:url"]', 'audio source[src]', 'audio[src]')),
    video: abs(metaContent(doc, 'meta[property="og:video:url"]', 'meta[property="og:video"]')),
    lang: doc.documentElement?.getAttribute('lang') ?? undefined,
  };
}

/** Flatten an element tree into paragraphs. */
export function flatten(root: Element): { text: string; headings: Array<{ offset: number; text: string }> } {
  const blocks: string[] = [];
  const headings: Array<{ offset: number; text: string }> = [];
  let current = '';
  let currentHeading = false;

  const flush = () => {
    const t = current
      .replace(/[ \t\r\f\v ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
    if (t) {
      const offsetBefore = blocks.reduce((s, b) => s + b.length + 2, 0);
      if (currentHeading) {
        blocks.push(`## ${t.replace(/\n/g, ' ')}`);
        headings.push({ offset: offsetBefore, text: t.replace(/\n/g, ' ') });
      } else blocks.push(t);
    }
    current = '';
    currentHeading = false;
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      current += (node.textContent ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if (tag === 'BR') {
      current += '\n';
      return;
    }
    if (tag === 'IMG') return;
    // Footnote markers ("[12]", "[a]", "[citation needed]") are apparatus, not the author's text:
    // keeping them breaks verbatim matching of quotes that a reader (or a model) copies without them.
    if (tag === 'SUP' && /^\s*\[(\d{1,4}|[a-z]{1,2}|note \d+|[a-z][a-z ]{2,24})\]\s*$/i.test(el.textContent ?? '')) return;
    const block = BLOCK.has(tag);
    if (block) flush();
    if (/^H[1-6]$/.test(tag)) currentHeading = true;
    if (tag === 'LI') current += '• ';
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block) flush();
  };
  walk(root);
  flush();
  return { text: blocks.join('\n\n'), headings };
}

export function extractArticle(html: string, url: string): ExtractedPage {
  const { document } = parseHTML(html);
  const meta = readMeta(document as unknown as Document, url);
  let text = '';
  let headings: Array<{ offset: number; text: string }> = [];
  try {
    const clone = parseHTML(html).document as unknown as Document;
    const article = new Readability(clone, { charThreshold: 300, keepClasses: false }).parse();
    if (article?.content) {
      const { document: adoc } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
      const flat = flatten(adoc.body as unknown as Element);
      text = flat.text;
      headings = flat.headings;
      meta.title = meta.title ?? article.title ?? undefined;
      meta.creator = meta.creator ?? article.byline ?? undefined;
      meta.siteName = meta.siteName ?? article.siteName ?? undefined;
      meta.date = meta.date ?? article.publishedTime ?? undefined;
    }
  } catch {
    /* fall through to the whole-body fallback */
  }
  if (text.length < 200) {
    const body = (document as unknown as Document).body;
    if (body) {
      const flat = flatten(body as unknown as Element);
      if (flat.text.length > text.length) {
        text = flat.text;
        headings = flat.headings;
      }
    }
  }
  // Drop a leading heading that only repeats the title.
  if (meta.title && text.startsWith('## ')) {
    const first = text.split('\n\n', 1)[0]!.slice(3).trim();
    if (first.toLowerCase() === meta.title.toLowerCase()) {
      const cut = text.indexOf('\n\n');
      const removed = cut < 0 ? text.length : cut + 2;
      text = cut < 0 ? '' : text.slice(removed);
      headings = headings.filter((h) => h.offset >= removed).map((h) => ({ ...h, offset: h.offset - removed }));
    }
  }
  return { text, meta, headings };
}
