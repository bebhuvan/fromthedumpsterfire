// Article extraction: Defuddle on linkedom (Readability as the fallback), then the article HTML
// flattened to the plain-text form the Desk stores (paragraphs separated by blank lines, headings
// marked with "## ", verse line breaks kept). Excerpt offsets index into exactly this text.
//
// Defuddle won a side-by-side on 19 real pages (2026-10-18): fewer share bars and footers, whole
// paragraphs where Readability split footnote markers out, real author names where the page meta
// has a profile URL. Readability is kept for pages where Defuddle finds much less.

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import Defuddle from 'defuddle';

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
  /** Which reader found the article: 'defuddle', 'readability', or 'page' (the whole body). */
  reader: 'defuddle' | 'readability' | 'page';
}

// Furniture no article contains: dialogs and pop-ups (a login-limit box, a cookie wall), anything
// the site hides until its scripts run or leaves out of print, and "also read" boxes set inside
// the article body. Removed before either reader looks at the page.
const CLUTTER = [
  'dialog',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '[hidden]',
  '[v-cloak]',
  '[class*="popup"]',
  '[id*="popup"]',
  '[class*="modal"]',
  '.print-hide',
  '.no-print',
  '.d-print-none',
  '.hidden-print',
  '[class*="also-read"]',
  '[class*="sponsor"]',
].join(',');

// Whole paragraphs that are site furniture, matched exactly (a sentence that merely contains
// "share" is left alone).
const FURNITURE =
  /^(share|share this( post| article)?|subscribe|subscribed|sign up|sign in|log in|log out|leave a comment|comments?|no posts|like|restack|listen|copy link|print|advertisement|read more|ready for more\?|\d+ \/ \d+|terms (&|and) conditions.*|looks like you are already logged in.*|sponsored by:.*)$/i;

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
    if (t && t !== '•' && !FURNITURE.test(t)) {
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
    // A footnote's back-link ("↩") is apparatus too.
    if (tag === 'A' && /^\s*[↩↑⤴]\uFE0E?\s*$/.test(el.textContent ?? '')) return;
    const block = BLOCK.has(tag);
    // A list item's bullet stays with the paragraph inside it.
    if (block && current.trim() !== '•') flush();
    if (/^H[1-6]$/.test(tag)) currentHeading = true;
    if (tag === 'LI') current += '• ';
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block) flush();
  };
  walk(root);
  flush();
  return { text: blocks.join('\n\n'), headings };
}

const HEAD_TAGS = new Set(['META', 'TITLE', 'LINK', 'STYLE', 'SCRIPT', 'BASE', 'NOSCRIPT', 'TEMPLATE']);

/**
 * The page as a document. HTML may leave out <body> (and <html>, <head>); linkedom then leaves the
 * body empty and hangs the content off the root, so such pages are rebuilt with explicit tags.
 */
export function parsePage(html: string): Document {
  const { document } = parseHTML(html);
  if (/<body[\s>]/i.test(html)) return document;
  const root = (document as Document).documentElement;
  if (!root) return document;
  const nodes: Node[] = root.tagName?.toUpperCase() === 'HTML' ? Array.from(root.childNodes) : [root];
  let head = '';
  let body = '';
  let inBody = false;
  for (const n of nodes) {
    const tag = n.nodeType === 1 ? n.tagName.toUpperCase() : '';
    if (tag === 'HEAD') head += n.innerHTML;
    else if (!inBody && (HEAD_TAGS.has(tag) || (n.nodeType === 3 && !(n.textContent ?? '').trim()) || n.nodeType === 8)) head += n.toString();
    else {
      inBody = true;
      body += n.toString();
    }
  }
  const lang = root.getAttribute?.('lang');
  return parseHTML(`<!doctype html><html${lang ? ` lang="${lang.replace(/"/g, '')}"` : ''}><head>${head}</head><body>${body}</body></html>`).document;
}

function cleaned(html: string): Document {
  const doc = parsePage(html);
  for (const el of Array.from(doc.querySelectorAll(CLUTTER)) as Element[]) if (el.tagName.toUpperCase() !== 'BODY' && el.tagName.toUpperCase() !== 'HTML') el.remove();
  return doc;
}

const looksLikeUrl = (s?: string | null) => !!s && /^(https?:\/\/|www\.)/i.test(s.trim());
const fromHtml = (html: string) => flatten(parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.body as unknown as Element);

export function extractArticle(html: string, url: string): ExtractedPage {
  const meta = readMeta(parsePage(html), url);
  // A profile URL is not an author's name.
  if (looksLikeUrl(meta.creator)) meta.creator = undefined;
  let text = '';
  let headings: Array<{ offset: number; text: string }> = [];
  let reader: ExtractedPage['reader'] = 'page';

  let d: { text: string; headings: typeof headings } | null = null;
  try {
    // No async extractors: Defuddle would otherwise fetch from third-party APIs itself, outside
    // guardedFetch.
    const out = new Defuddle(cleaned(html), { url, useAsync: false }).parse();
    if (out.content) d = fromHtml(out.content);
    if (out.author && !looksLikeUrl(out.author)) meta.creator = meta.creator ?? out.author;
    meta.title = meta.title ?? (out.title || undefined);
    meta.siteName = meta.siteName ?? (out.site || undefined);
    meta.date = meta.date ?? (out.published || undefined);
  } catch {
    /* fall through to Readability */
  }
  let r: { text: string; headings: typeof headings } | null = null;
  try {
    const article = new Readability(cleaned(html), { charThreshold: 300, keepClasses: false }).parse();
    if (article?.content) {
      r = fromHtml(article.content);
      if (article.byline && !looksLikeUrl(article.byline)) meta.creator = meta.creator ?? article.byline;
      meta.title = meta.title ?? article.title ?? undefined;
      meta.siteName = meta.siteName ?? article.siteName ?? undefined;
      meta.date = meta.date ?? article.publishedTime ?? undefined;
    }
  } catch {
    /* fall through */
  }
  // Defuddle unless it found much less than Readability (it dropped part of the article).
  if (d && d.text.length >= 200 && (!r || d.text.length >= r.text.length * 0.6)) {
    ({ text, headings } = d);
    reader = 'defuddle';
  } else if (r && r.text.length >= (d?.text.length ?? 0)) {
    ({ text, headings } = r);
    reader = 'readability';
  } else if (d) {
    ({ text, headings } = d);
    reader = 'defuddle';
  }
  if (text.length < 200) {
    const body = cleaned(html).body;
    if (body) {
      const flat = flatten(body as unknown as Element);
      if (flat.text.length > text.length) {
        text = flat.text;
        headings = flat.headings;
        reader = 'page';
      }
    }
  }
  // Drop a leading heading that only repeats the title.
  if (meta.title && text.startsWith('## ')) {
    const first = text.split('\n\n', 1)[0]!.slice(3).trim();
    const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (bare(first) === bare(meta.title)) {
      const cut = text.indexOf('\n\n');
      const removed = cut < 0 ? text.length : cut + 2;
      text = cut < 0 ? '' : text.slice(removed);
      headings = headings.filter((h) => h.offset >= removed).map((h) => ({ ...h, offset: h.offset - removed }));
    }
  }
  return { text, meta, headings, reader };
}

/**
 * A platform's article body (an API's HTML, a feed's content) in the same stored form as a page:
 * no Readability pass, since the platform has already cut the article out. `strip` removes
 * platform furniture (subscribe boxes, share bars) before flattening.
 */
export function fragmentText(html: string, strip: string[] = []): { text: string; headings: Array<{ offset: number; text: string }> } {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const body = (document as unknown as Document).body;
  for (const sel of strip) for (const el of Array.from(body.querySelectorAll(sel)) as Element[]) el.remove();
  return flatten(body as unknown as Element);
}

/** Plain text of a small HTML string (a title with entities or tags). */
export function plainText(html: string | undefined | null): string {
  if (!html) return '';
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return ((document as unknown as Document).body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
