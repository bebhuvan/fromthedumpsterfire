// The fetch step: resolve whatever was captured to clean source text plus bibliographic fields.
// Long audio comes back as a plan for chunked transcription, which the workflow runs step by step.

import type { Media } from '@fdf/shared/haul';
import type { SourceKind } from '@fdf/shared/detect';
import type { Env } from './env';
import { fetchBytes, decode, type Fetched } from './extract/http';
import { mediumFromFeed, mediumTarget, paywallMarker, PaywalledError, RouteMissError, substackFromApi, substackFromFeed, substackPageBody, substackTarget, wordpressFromApi, wordpressHints, wordpressTarget, type PlatformArticle } from './extract/platforms';
import { fetchSnapshot, latestSnapshot, savePageNow, type WaybackCopy } from './extract/wayback';
import { extractArticle } from './extract/html';
import { browserAvailable, renderPage } from './extract/browser';

/** Below this many characters of extracted text, a page is tried in a real browser (when bound). */
export const MIN_STATIC_TEXT = 600;
import { extractPdf } from './extract/pdf';
import { fetchYouTube, msToClock } from './extract/youtube';
import { fetchArxiv, fetchDoi, fetchXPost, resolvePodcast } from './extract/sources';
import { planAudio, type AudioPlan } from './extract/audio';
import { wikiKeyFromUrl, wikiSummary } from './wiki';
import { generateJson } from './models/router';
import { ocrSchema } from './prompts';
import { OCR_SYSTEM } from './prompts';
import { errorMessage, FatalError, readingMinutes, toBase64, wordCount } from './util';
import { isPunctuated } from '@fdf/shared/quoting';

export interface SourceMeta {
  pages?: number[];
  headings?: Array<{ offset: number; text: string }>;
  times?: Array<{ offset: number; ms: number }>;
  lang?: string;
  description?: string;
  image?: string;
  captionsAuto?: boolean;
  /** Auto-captions without punctuation (older YouTube uploads). */
  roughCaptions?: boolean;
  note?: string;
  /** Where the text came from when it was not the page itself: a platform API or feed, or an archived copy. */
  via?: { route: string; label: string; url?: string; at?: string };
}

export interface ItemFields {
  title?: string;
  creator?: string;
  source_name?: string;
  source_date?: string;
  minutes?: number;
  media?: Media;
  canonical_url?: string;
  locator?: string;
}

export interface Snapshot {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

export type FetchOutcome =
  | { kind: 'text'; text: string; extractor: string; meta: SourceMeta; fields: ItemFields; snapshot?: Snapshot }
  | { kind: 'audio'; plan: AudioPlan; extractor: string; meta: SourceMeta; fields: ItemFields; preface?: string };

export interface CapturedItem {
  id: string;
  kind: SourceKind;
  type: string;
  url: string | null;
  file_key: string | null;
  capture_text: string | null;
  source_name: string | null;
  title: string | null;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function yearOrDate(s?: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 40);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Statuses that mean "not to you, not now" rather than "no such page": worth another route. */
const REFUSED = new Set([401, 403, 406, 429, 451, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 529]);
/** Gone from the site, maybe not from the archive. */
const GONE = new Set([404, 410]);

/** A bot check or challenge page served in place of the article. We never try to pass one. */
export function isBotCheck(page: Fetched, html: string): boolean {
  if (page.headers?.get('cf-mitigated') === 'challenge') return true;
  if (html.length > 400_000) return false;
  const title = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(html)?.[1] ?? '';
  return /just a moment|attention required|are you a robot|verify you are human|security check|access denied|please enable (javascript and )?cookies/i.test(title);
}

const VIA_LABEL: Record<string, string> = {
  'substack-api': "Read through Substack's post API",
  'substack-feed': "Read from the newsletter's RSS feed",
  'wordpress-api': "Read through the site's WordPress API",
  'medium-feed': "Read from the author's Medium RSS feed",
};

function platformOutcome(a: PlatformArticle, url: string): FetchOutcome {
  // The platform has cut out the post itself, so a short one is whole (an aside, a link post).
  if (a.text.trim().length < 20) throw new RouteMissError(`${VIA_LABEL[a.route]} gave no readable text`);
  const words = wordCount(a.text);
  return {
    kind: 'text',
    text: a.text,
    extractor: a.route,
    meta: { headings: a.headings, description: a.description, image: a.image, via: { route: a.route, label: VIA_LABEL[a.route]!, url: a.from } },
    fields: {
      title: a.title,
      creator: a.creator,
      source_name: a.siteName ?? host(url),
      source_date: yearOrDate(a.date),
      minutes: readingMinutes(words),
      canonical_url: a.canonical,
      media: a.audio ? { kind: 'audio', url: a.audio, label: 'Listen' } : undefined,
    },
    snapshot: { bytes: new TextEncoder().encode(`<!doctype html><meta charset="utf-8"><title>${(a.title ?? '').replace(/</g, '&lt;')}</title><article>${a.html}</article>`), contentType: 'text/html; charset=utf-8', ext: 'html' },
  };
}

/** Try one platform route; a miss is noted and returns null, a paywall stops everything. */
async function attempt(tried: string[], label: string, fn: () => Promise<PlatformArticle>, url: string): Promise<FetchOutcome | null> {
  try {
    const out = platformOutcome(await fn(), url);
    console.log(JSON.stringify({ event: 'fetch-route', route: label, url, words: wordCount((out as { text: string }).text) }));
    return out;
  } catch (e) {
    if (e instanceof PaywalledError) throw e;
    tried.push(`${label}: ${errorMessage(e).slice(0, 160)}`);
    return null;
  }
}

/** Routes we can choose from the address alone, before touching the page. */
async function platformFirst(url: string, tried: string[]): Promise<FetchOutcome | null> {
  const sub = substackTarget(url);
  if (sub) {
    let refused = !sub.guess;
    const viaApi = await attempt(tried, 'Substack API', async () => {
      try {
        return await substackFromApi(sub);
      } catch (e) {
        // A custom domain that refuses us is likely Substack too; a 404 or HTML means it is not.
        if (e instanceof RouteMissError && REFUSED.has(e.status)) refused = true;
        else if (sub.guess) refused = false;
        throw e;
      }
    }, url);
    if (viaApi) return viaApi;
    if (refused || !sub.guess) {
      const viaFeed = await attempt(tried, 'Substack feed', () => substackFromFeed(sub, url), url);
      if (viaFeed) return viaFeed;
    }
  }
  const med = mediumTarget(url);
  if (med && !med.guess) {
    const viaFeed = await attempt(tried, 'Medium feed', () => mediumFromFeed(med), url);
    if (viaFeed) return viaFeed;
  }
  const wp = wordpressTarget(url);
  if (wp && !wp.guess) {
    const viaApi = await attempt(tried, 'WordPress API', () => wordpressFromApi(wp, url), url);
    if (viaApi) return viaApi;
  }
  return null;
}

/** The page refused us: platform guesses not yet tried, then the Wayback Machine. */
async function afterRefusal(url: string, why: string, status: number, tried: string[], opts: { save: boolean }): Promise<FetchOutcome | null> {
  if (!GONE.has(status)) {
    const wp = wordpressTarget(url);
    if (wp?.guess) {
      const viaApi = await attempt(tried, 'WordPress API', () => wordpressFromApi(wp, url), url);
      if (viaApi) return viaApi;
    }
    const med = mediumTarget(url);
    if (med?.guess) {
      const viaFeed = await attempt(tried, 'Medium feed', () => mediumFromFeed(med), url);
      if (viaFeed) return viaFeed;
    }
  }
  const fromCopy = (copy: WaybackCopy | null): FetchOutcome | null => {
    if (!copy) return null;
    const ex = extractArticle(copy.html, url);
    const sub = substackPageBody(copy.html);
    if (sub) Object.assign(ex, sub);
    const paywall = paywallMarker(copy.html);
    if (paywall) throw new PaywalledError(`${paywall}; the archived copy has only the public preview. Paste the text or upload a PDF if you have it`);
    if (ex.text.length < 400 || isBotCheck({ url: copy.raw, status: 200, contentType: 'text/html', bytes: new Uint8Array() }, copy.html)) {
      tried.push(`Wayback copy of ${copy.archivedAt.slice(0, 10)}: no readable article in it`);
      return null;
    }
    const words = wordCount(ex.text);
    const day = yearOrDate(copy.archivedAt);
    console.log(JSON.stringify({ event: 'fetch-route', route: copy.saved ? 'wayback-saved' : 'wayback', url, words, archived: copy.timestamp }));
    const canonical = ex.meta.canonical && host(ex.meta.canonical) === host(url) ? ex.meta.canonical : undefined;
    return {
      kind: 'text',
      text: ex.text,
      extractor: 'wayback',
      meta: {
        headings: ex.headings,
        lang: ex.meta.lang,
        description: ex.meta.description,
        image: ex.meta.image,
        via: {
          route: copy.saved ? 'wayback-saved' : 'wayback',
          label: `From the Wayback Machine's ${copy.saved ? 'fresh capture' : 'copy'} of ${day} (the site ${why})`,
          url: copy.url,
          at: copy.archivedAt,
        },
      },
      fields: {
        title: ex.meta.title,
        creator: ex.meta.creator,
        source_name: ex.meta.siteName ?? host(url),
        source_date: yearOrDate(ex.meta.date),
        minutes: readingMinutes(words),
        canonical_url: canonical,
      },
      snapshot: { bytes: new TextEncoder().encode(copy.html), contentType: 'text/html; charset=utf-8', ext: 'html' },
    };
  };
  try {
    const latest = await latestSnapshot(url);
    if (latest) {
      const got = fromCopy(await fetchSnapshot(latest.timestamp, latest.original));
      if (got) return got;
    } else tried.push('Wayback Machine: no copy yet');
  } catch (e) {
    if (e instanceof PaywalledError) throw e;
    tried.push(`Wayback Machine: ${errorMessage(e).slice(0, 160)}`);
  }
  // A page that is gone cannot be saved now; one that refuses us can be, by the archive.
  if (GONE.has(status) || !opts.save) return null;
  try {
    const saved = await savePageNow(url);
    if (!saved.ok) {
      tried.push(saved.reason);
      return null;
    }
    return fromCopy(await fetchSnapshot(saved.timestamp, saved.original, true));
  } catch (e) {
    if (e instanceof PaywalledError) throw e;
    tried.push(`Save Page Now: ${errorMessage(e).slice(0, 160)}`);
    return null;
  }
}

const refusalWords = (status: number) =>
  status === 429 ? 'too many requests' : status === 403 || status === 401 ? 'forbidden' : GONE.has(status) ? 'not found' : status === 0 ? 'no answer' : status >= 500 ? 'unavailable' : 'refused';

async function fromArticleUrl(env: Env, url: string): Promise<FetchOutcome> {
  const tried: string[] = [];
  const early = await platformFirst(url, tried);
  if (early) return early;

  let page: Fetched | null = null;
  let pageError = '';
  try {
    page = await fetchBytes(url, { browser: true, maxBytes: 15 * 1024 * 1024 });
  } catch (e) {
    if (e && typeof e === 'object' && 'fatal' in e) throw e; // blocked address, too large
    pageError = errorMessage(e).slice(0, 160);
  }
  let html = page && page.status < 400 && !page.contentType.includes('application/pdf') ? decode(page.bytes, page.contentType) : '';
  const botCheck = page ? isBotCheck(page, html || decode(page.bytes.subarray(0, 200_000), page.contentType)) : false;
  const status = page ? (botCheck && page.status < 400 ? 403 : page.status) : 0;

  if (!page || botCheck || REFUSED.has(status) || GONE.has(status)) {
    const why = page ? `${botCheck ? 'showed a bot check' : `refused the Desk: ${status}, ${refusalWords(status)}`}` : `did not answer: ${pageError}`;
    const rescued = await afterRefusal(url, why, status, tried, { save: true });
    if (rescued) return rescued;
    const detail = tried.length ? ` Tried: ${tried.join('; ')}.` : '';
    const site = host(url) || 'The site';
    // Too many requests, briefly unavailable, or a capture still in progress: worth another try
    // (the fetch step retries with backoff, and a capture that lands meanwhile is found then).
    if (!page || status === 429 || status >= 500 || tried.some((t) => /still working/.test(t)))
      throw new Error(`${site} refused the fetch for now (${status || 'no answer'}: ${refusalWords(status)}).${detail}`);
    if (GONE.has(status)) throw new FatalError(`The page returned ${status}, and the Wayback Machine has no readable copy.${detail}`);
    throw new FatalError(`${site} ${botCheck ? 'answered with a bot check' : `refused the fetch (${status}: ${refusalWords(status)})`}.${detail}`);
  }
  if (page.status >= 400) throw new FatalError(`The page returned ${page.status}`);
  if (page.contentType.includes('application/pdf')) return fromPdfBytes(env, page.bytes, page.url, undefined);
  let ex = extractArticle(html, page.url);
  const paywall = paywallMarker(html);
  if (paywall) throw new PaywalledError(`${paywall}; only the public preview is readable. Paste the text or upload a PDF if you have it`);
  let extractor: string = ex.reader;
  const sub = substackPageBody(html);
  if (sub) {
    ex = { ...ex, ...sub };
    extractor = 'substack-page';
  }
  // A WordPress site says where its API is; the API has the post alone, with its authors.
  const hints = wordpressHints(html);
  if (hints) {
    const wp = wordpressTarget(page.url, hints);
    if (wp) {
      const viaApi = await attempt(tried, 'WordPress API', () => wordpressFromApi(wp, page!.url), url);
      // A membership plugin can trim the API's copy of a long post; keep the page when the API has
      // much less of a long one. Short posts read from the page carry share bars and menus.
      const pageWords = wordCount(ex.text);
      if (viaApi && viaApi.kind === 'text' && (pageWords < 300 || wordCount(viaApi.text) >= pageWords * 0.5)) return viaApi;
    }
  }
  if (ex.text.length < 400) {
    // Some sites serve a stub to browsers without JS but the real text to plain agents.
    const alt = await fetchBytes(url, { maxBytes: 15 * 1024 * 1024 }).catch(() => null);
    if (alt && alt.status < 400) {
      const altHtml = decode(alt.bytes, alt.contentType);
      const altEx = extractArticle(altHtml, alt.url);
      if (altEx.text.length > ex.text.length) {
        ex = altEx;
        html = altHtml;
        page = alt;
        extractor = altEx.reader;
      }
    }
  }
  if (ex.text.length < MIN_STATIC_TEXT && browserAvailable(env)) {
    // The page may build its text with JavaScript: render it (guarded; see extract/browser.ts).
    const rendered = await renderPage(env, page.url).catch((e) => {
      console.warn(JSON.stringify({ event: 'browser-render-failed', error: String(e).slice(0, 200) }));
      return null;
    });
    if (rendered) {
      const rEx = extractArticle(rendered.html, rendered.url);
      console.log(JSON.stringify({ event: 'browser-rendered', url: rendered.url, html: rendered.html.length, text: rEx.text.length, before: ex.text.length, blocked: rendered.blocked.slice(0, 5), blockedCount: rendered.blocked.length }));
      if (rEx.text.length > ex.text.length) {
        ex = rEx;
        html = rendered.html;
        page = { ...page, url: rendered.url, contentType: 'text/html; charset=utf-8' };
        extractor = 'browser';
      }
    }
  }
  if (ex.text.length < 80) throw new FatalError(`Could not find readable text on this page (it may need ${browserAvailable(env) ? 'a login' : 'JavaScript or a login'})`);
  const words = wordCount(ex.text);
  const media: Media | undefined = ex.meta.audio
    ? { kind: 'audio', url: ex.meta.audio, label: 'Listen' }
    : undefined;
  return {
    kind: 'text',
    text: ex.text,
    extractor,
    meta: { headings: ex.headings, lang: ex.meta.lang, description: ex.meta.description, image: ex.meta.image },
    fields: {
      title: ex.meta.title,
      creator: ex.meta.creator,
      source_name: ex.meta.siteName ?? host(page.url),
      source_date: yearOrDate(ex.meta.date),
      minutes: readingMinutes(words),
      canonical_url: ex.meta.canonical,
      media,
    },
    snapshot: { bytes: new TextEncoder().encode(html), contentType: 'text/html; charset=utf-8', ext: 'html' },
  };
}

async function fromPdfBytes(env: Env, bytes: Uint8Array, url: string | null, name?: string): Promise<FetchOutcome> {
  const pdf = await extractPdf(env, bytes, name);
  return {
    kind: 'text',
    text: pdf.text,
    extractor: pdf.extractor,
    meta: { pages: pdf.pages, ...(pdf.extractor === 'ocr' ? { note: 'Transcribed from a scanned PDF by a model. Check it against the PDF before you excerpt.' } : {}) },
    fields: {
      // No filename fallback: the reading card supplies a real title when the PDF has none.
      title: pdf.meta.title,
      creator: pdf.meta.creator,
      source_name: url ? host(url) : undefined,
      source_date: pdf.meta.date?.slice(0, 4),
      minutes: readingMinutes(wordCount(pdf.text)),
    },
    snapshot: { bytes, contentType: 'application/pdf', ext: 'pdf' },
  };
}

export async function fetchSource(env: Env, item: CapturedItem): Promise<FetchOutcome> {
  const url = item.url ?? '';
  // A PDF the editor uploaded to an item captured by link (a paper behind a download block) is
  // read in place of fetching the link; the link stays as the item's source.
  if (item.file_key && item.kind !== 'image' && item.kind !== 'pdf') {
    const obj = await env.MEDIA.get(item.file_key);
    if (!obj) throw new FatalError('The uploaded PDF is missing from storage');
    return fromPdfBytes(env, new Uint8Array(await obj.arrayBuffer()), item.url, obj.customMetadata?.name ?? 'upload.pdf');
  }
  switch (item.kind) {
    case 'text': {
      const text = (item.capture_text ?? '').trim();
      if (!text) throw new FatalError('Nothing was pasted');
      return {
        kind: 'text',
        text,
        extractor: 'pasted',
        meta: {},
        fields: { minutes: readingMinutes(wordCount(text)), locator: item.source_name ?? undefined },
      };
    }

    case 'image': {
      if (!item.file_key) throw new FatalError('No image was uploaded');
      const obj = await env.MEDIA.get(item.file_key);
      if (!obj) throw new FatalError('The uploaded image is missing from storage');
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const mime = obj.httpMetadata?.contentType ?? 'image/jpeg';
      const { data } = await generateJson(env, {
        task: 'ocr',
        system: OCR_SYSTEM,
        prompt: `Transcribe the page in this image.${item.capture_text ? ` The editor's note about it: ${item.capture_text}` : ''}`,
        schema: ocrSchema,
        images: [{ mime, base64: toBase64(bytes) }],
        itemId: item.id,
      });
      if (!data.text.trim()) throw new FatalError('No text could be read from this image');
      return {
        kind: 'text',
        text: data.text.trim(),
        extractor: 'ocr',
        meta: { note: 'Transcribed from an image by a model. Check it against the image before you excerpt.' },
        fields: {
          title: data.title || undefined,
          creator: data.creator || undefined,
          locator: data.page ? `p. ${data.page}` : undefined,
          minutes: readingMinutes(wordCount(data.text)),
        },
      };
    }

    case 'pdf': {
      if (item.file_key) {
        const obj = await env.MEDIA.get(item.file_key);
        if (!obj) throw new FatalError('The uploaded PDF is missing from storage');
        const name = obj.customMetadata?.name ?? 'upload.pdf';
        return fromPdfBytes(env, new Uint8Array(await obj.arrayBuffer()), item.url, name);
      }
      const r = await fetchBytes(url, { browser: true });
      if (r.status >= 400) throw new FatalError(`The PDF link returned ${r.status}`);
      if (!r.contentType.includes('pdf') && !(r.bytes[0] === 0x25 && r.bytes[1] === 0x50)) return fromArticleUrl(env, url);
      return fromPdfBytes(env, r.bytes, r.url, decodeURIComponent(new URL(r.url).pathname.split('/').pop() ?? 'source.pdf'));
    }

    case 'arxiv': {
      const paper = await fetchArxiv(url);
      const fields: ItemFields = {
        title: paper.title,
        creator: paper.authors.length > 3 ? `${paper.authors[0]} and others` : paper.authors.join(', '),
        source_name: 'arXiv',
        source_date: paper.date?.slice(0, 4),
        canonical_url: paper.absUrl,
        locator: 'Abstract',
      };
      try {
        const r = await fetchBytes(paper.pdfUrl!, {});
        const pdf = await fromPdfBytes(env, r.bytes, paper.pdfUrl!, `${paper.title}.pdf`);
        if (pdf.kind === 'text') return { ...pdf, extractor: `arxiv+${pdf.extractor}`, fields: { ...pdf.fields, ...fields, minutes: pdf.fields.minutes } };
      } catch {
        /* the abstract alone is still a usable source */
      }
      const text = `## Abstract\n\n${paper.abstract ?? ''}`;
      return { kind: 'text', text, extractor: 'arxiv', meta: { headings: [{ offset: 0, text: 'Abstract' }] }, fields: { ...fields, minutes: readingMinutes(wordCount(text)) } };
    }

    case 'doi': {
      const paper = await fetchDoi(url);
      const fields: ItemFields = {
        title: paper.title,
        creator: paper.authors.length > 3 ? `${paper.authors[0]} and others` : paper.authors.join(', '),
        source_name: paper.venue,
        source_date: paper.date?.slice(0, 4),
        canonical_url: paper.absUrl,
      };
      if (paper.pdfUrl) {
        try {
          const r = await fetchBytes(paper.pdfUrl, { browser: true });
          if (r.status < 400 && r.contentType.includes('pdf')) {
            const pdf = await fromPdfBytes(env, r.bytes, paper.pdfUrl, `${paper.title}.pdf`);
            return { ...pdf, fields: { ...pdf.fields, ...fields } };
          }
        } catch {
          /* fall through */
        }
      }
      try {
        const page = await fromArticleUrl(env, url);
        if (page.kind === 'text' && page.text.length > 1500) return { ...page, fields: { ...page.fields, ...fields } };
      } catch {
        /* fall through to the abstract */
      }
      if (!paper.abstract) throw new FatalError('No open text or abstract found for this DOI');
      const text = `## Abstract\n\n${paper.abstract}`;
      return { kind: 'text', text, extractor: 'crossref', meta: {}, fields: { ...fields, locator: 'Abstract', minutes: readingMinutes(wordCount(text)) } };
    }

    case 'x': {
      const post = await fetchXPost(url);
      if (!post.text) throw new FatalError('The post has no text (or is not public)');
      return {
        kind: 'text',
        text: post.text,
        extractor: 'oembed',
        meta: {},
        fields: {
          title: post.text.split('\n')[0]!.slice(0, 90),
          creator: post.author,
          source_name: 'X',
          source_date: post.date,
          minutes: 1,
          canonical_url: post.url,
          locator: post.handle ? `@${post.handle}` : 'Post',
        },
      };
    }

    case 'wikipedia': {
      const key = wikiKeyFromUrl(url);
      const page = await fromArticleUrl(env, url);
      if (page.kind !== 'text') return page;
      const sum = key ? await wikiSummary(key) : null;
      return { ...page, fields: { ...page.fields, title: sum?.title ?? page.fields.title?.replace(/ - Wikipedia$/, ''), source_name: 'Wikipedia', creator: '' } };
    }

    case 'youtube': {
      const yt = await fetchYouTube(url);
      const fields: ItemFields = {
        title: yt.title,
        creator: yt.author,
        source_name: 'YouTube',
        source_date: yearOrDate(yt.publishDate),
        minutes: yt.seconds ? Math.max(1, Math.round(yt.seconds / 60)) : undefined,
        media: { kind: 'video', url: `https://www.youtube.com/watch?v=${yt.id}`, label: yt.seconds ? `Watch · ${msToClock(yt.seconds * 1000)}` : 'Watch' },
        canonical_url: `https://www.youtube.com/watch?v=${yt.id}`,
        locator: 'Transcript',
      };
      // Captions are instant and free, so they are always used when they exist. YouTube punctuates
      // auto-captions on recent uploads; older ones have no punctuation and keep every "uh". Those
      // are marked, and their quotes print as times only. (Whisper on the audio is not a fix here:
      // YouTube's stream links refuse a Workflow step that runs from another address, 403, seen
      // 2026-10-17.)
      if (yt.captions) {
        const rough = yt.captions.auto && !isPunctuated(yt.captions.text);
        return {
          kind: 'text',
          text: yt.captions.text,
          extractor: yt.captions.auto ? 'captions-auto' : 'captions',
          meta: {
            times: yt.captions.times,
            captionsAuto: yt.captions.auto,
            roughCaptions: rough || undefined,
            description: yt.description.slice(0, 2000),
            ...(rough ? { note: 'Auto-captions without punctuation: excerpts read rough, and ideas print with their time instead of the caption text.' } : {}),
          },
          fields,
        };
      }
      if (yt.audio) {
        const plan = await planAudio(yt.audio.url, yt.audio.mime, yt.audio.bytes, { dash: yt.audio.dash, seconds: yt.seconds || undefined });
        return { kind: 'audio', plan, extractor: 'whisper', meta: { description: yt.description.slice(0, 2000) }, fields };
      }
      if (yt.description.trim().length > 200) {
        return { kind: 'text', text: yt.description.trim(), extractor: 'description', meta: { note: 'No captions or audio were available; this is the video description.' }, fields: { ...fields, locator: 'Description' } };
      }
      throw new FatalError(`No captions or audio available for this video${yt.reason ? ` (${yt.reason})` : ''}`);
    }

    case 'podcast':
    case 'audio': {
      const ep = item.kind === 'podcast' ? await resolvePodcast(url) : { title: decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'Audio'), show: host(url), audioUrl: url, pageUrl: url } as const;
      if (!ep) throw new FatalError('Could not find the episode audio. Try the show page or a direct MP3 link.');
      const seconds = 'seconds' in ep ? ep.seconds : undefined;
      const plan = await planAudio(ep.audioUrl, undefined, undefined, { seconds: seconds || undefined });
      return {
        kind: 'audio',
        plan,
        extractor: 'whisper',
        meta: { description: 'description' in ep ? ep.description?.slice(0, 2000) : undefined },
        fields: {
          title: ep.title,
          creator: ep.show,
          source_name: ep.show,
          source_date: 'date' in ep ? yearOrDate(ep.date) : undefined,
          minutes: seconds ? Math.max(1, Math.round(seconds / 60)) : undefined,
          media: { kind: 'audio', url: ep.pageUrl.startsWith('https://') ? ep.pageUrl : ep.audioUrl, label: seconds ? `Listen · ${msToClock(seconds * 1000)}` : 'Listen' },
          locator: 'Transcript',
        },
      };
    }

    case 'video': {
      const page = await fromArticleUrl(env, url).catch(() => null);
      const media: Media = { kind: 'video', url, label: 'Watch' };
      if (page && page.kind === 'text') return { ...page, fields: { ...page.fields, media, locator: 'Page' } };
      throw new FatalError('Could not read this video page. Paste a transcript as a passage, or add a voice note.');
    }

    case 'article':
    default:
      return fromArticleUrl(env, url);
  }
}

