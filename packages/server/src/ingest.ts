// The fetch step: resolve whatever was captured to clean source text plus bibliographic fields.
// Long audio comes back as a plan for chunked transcription, which the workflow runs step by step.

import type { Media } from '@fdf/shared/haul';
import type { SourceKind } from '@fdf/shared/detect';
import type { Env } from './env';
import { fetchBytes, decode } from './extract/http';
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
import { FatalError, readingMinutes, toBase64, wordCount } from './util';

export interface SourceMeta {
  pages?: number[];
  headings?: Array<{ offset: number; text: string }>;
  times?: Array<{ offset: number; ms: number }>;
  lang?: string;
  description?: string;
  image?: string;
  captionsAuto?: boolean;
  note?: string;
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

async function fromArticleUrl(env: Env, url: string): Promise<FetchOutcome> {
  let page = await fetchBytes(url, { browser: true, maxBytes: 15 * 1024 * 1024 });
  if (page.status >= 400) throw new FatalError(`The page returned ${page.status}`);
  if (page.contentType.includes('application/pdf')) return fromPdfBytes(env, page.bytes, page.url, undefined);
  let html = decode(page.bytes, page.contentType);
  let ex = extractArticle(html, page.url);
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
      }
    }
  }
  let extractor = 'readability';
  if (ex.text.length < MIN_STATIC_TEXT && browserAvailable(env)) {
    // The page may build its text with JavaScript: render it (guarded; see extract/browser.ts).
    const rendered = await renderPage(env, page.url).catch((e) => {
      console.warn(JSON.stringify({ event: 'browser-render-failed', error: String(e).slice(0, 200) }));
      return null;
    });
    if (rendered) {
      const rEx = extractArticle(rendered.html, rendered.url);
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
    meta: { pages: pdf.pages },
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
      if (yt.captions) {
        return {
          kind: 'text',
          text: yt.captions.text,
          extractor: yt.captions.auto ? 'captions-auto' : 'captions',
          meta: { times: yt.captions.times, captionsAuto: yt.captions.auto, description: yt.description.slice(0, 2000) },
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
