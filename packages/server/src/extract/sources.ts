// Source-specific resolvers: podcasts (Apple lookup, RSS enclosures, pages with og:audio),
// X posts (oEmbed), arXiv (API + PDF), DOIs (Crossref), and plain audio files.

import { parseHTML } from 'linkedom';
import { fetchJson, fetchText } from './http';
import { flatten } from './html';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;

export interface PodcastEpisode {
  title: string;
  show: string;
  date?: string;
  audioUrl: string;
  seconds?: number;
  description?: string;
  pageUrl: string;
}

/** Apple Podcasts episode URL -> episode audio, through the iTunes lookup API. */
async function appleEpisode(url: URL): Promise<PodcastEpisode | null> {
  const podcastId = /id(\d+)/.exec(url.pathname)?.[1];
  const episodeId = url.searchParams.get('i');
  if (!podcastId) return null;
  const data = await fetchJson<{ results: Array<Record<string, any>> }>(
    `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcastEpisode&limit=300`,
  );
  const show = data.results.find((r) => r.wrapperType === 'track' && r.kind === 'podcast');
  const episodes = data.results.filter((r) => r.wrapperType === 'podcastEpisode');
  const ep = episodeId ? episodes.find((r) => String(r.trackId) === episodeId) : episodes[0];
  if (!ep?.episodeUrl) {
    if (episodeId && show?.feedUrl) return rssEpisode(show.feedUrl, { guidOrTitle: undefined, pageUrl: url.toString() });
    return null;
  }
  return {
    title: ep.trackName,
    show: ep.collectionName ?? show?.collectionName ?? '',
    date: ep.releaseDate?.slice(0, 10),
    audioUrl: ep.episodeUrl,
    seconds: ep.trackTimeMillis ? Math.round(ep.trackTimeMillis / 1000) : undefined,
    description: ep.description ?? ep.shortDescription,
    pageUrl: url.toString(),
  };
}

/** Latest (or matching) episode of an RSS feed. */
export async function rssEpisode(feedUrl: string, opts: { guidOrTitle?: string; pageUrl: string }): Promise<PodcastEpisode | null> {
  const { text } = await fetchText(feedUrl);
  const { document } = parseHTML(text.replace(/<\?xml[^>]*>/, ''));
  const show = document.querySelector('channel > title')?.textContent?.trim() ?? '';
  const items: El[] = Array.from(document.querySelectorAll('item'));
  const match = opts.guidOrTitle
    ? items.find((i) => i.querySelector('guid')?.textContent?.includes(opts.guidOrTitle!) || i.querySelector('title')?.textContent?.includes(opts.guidOrTitle!))
    : items[0];
  const enc = match?.querySelector('enclosure');
  const audioUrl = enc?.getAttribute('url');
  if (!match || !audioUrl) return null;
  const dur = match.querySelector('itunes\\:duration, duration')?.textContent ?? '';
  const parts: number[] = dur.split(':').map(Number);
  const seconds = parts.length > 1 ? parts.reduce((s, p) => s * 60 + p, 0) : Number(dur) || undefined;
  return {
    title: match.querySelector('title')?.textContent?.trim() ?? '',
    show,
    date: match.querySelector('pubDate')?.textContent ? new Date(match.querySelector('pubDate')!.textContent!).toISOString().slice(0, 10) : undefined,
    audioUrl,
    seconds,
    description: match.querySelector('description')?.textContent?.replace(/<[^>]+>/g, ' ').trim(),
    pageUrl: opts.pageUrl,
  };
}

export async function resolvePodcast(raw: string): Promise<PodcastEpisode | null> {
  const url = new URL(raw);
  if (url.hostname === 'podcasts.apple.com') return appleEpisode(url);
  // Other players (Overcast, Pocket Casts, Castro, show pages): look for an audio link in the page.
  const page = await fetchText(raw, { browser: true });
  const { document } = parseHTML(page.text);
  const audio =
    document.querySelector('meta[property="og:audio"]')?.getAttribute('content') ??
    document.querySelector('meta[property="og:audio:url"]')?.getAttribute('content') ??
    document.querySelector('audio source')?.getAttribute('src') ??
    document.querySelector('audio')?.getAttribute('src') ??
    /https?:\/\/[^"'\s]+\.(?:mp3|m4a)(?:\?[^"'\s]*)?/.exec(page.text)?.[0];
  if (!audio) return null;
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? document.querySelector('title')?.textContent ?? '';
  return {
    title: title.trim(),
    show: document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? url.hostname,
    audioUrl: new URL(audio, raw).toString(),
    description: document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? undefined,
    pageUrl: raw,
  };
}

export interface XPost {
  text: string;
  author: string;
  handle?: string;
  date?: string;
  url: string;
}

/** X/Twitter post text through the public oEmbed endpoint. */
export async function fetchXPost(raw: string): Promise<XPost> {
  const url = raw.replace('://twitter.com', '://x.com').replace('://www.x.com', '://x.com');
  const data = await fetchJson<{ html: string; author_name: string; author_url?: string; url: string }>(
    `https://publish.twitter.com/oembed?omit_script=1&dnt=true&hide_thread=false&url=${encodeURIComponent(url)}`,
  );
  const { document } = parseHTML(`<html><body>${data.html}</body></html>`);
  const p = document.querySelector('blockquote p');
  // Drop trailing t.co/pic links: they are not part of the words.
  for (const a of (p ? Array.from(p.querySelectorAll('a')) : []) as El[]) {
    if (/^(pic\.twitter\.com|https?:\/\/t\.co)/.test(a.textContent ?? '')) a.remove();
  }
  const text = p ? flatten(p as unknown as Element).text.trim() : '';
  const links: El[] = Array.from(document.querySelectorAll('blockquote > a'));
  const date = links.at(-1)?.textContent?.trim();
  return {
    text,
    author: data.author_name,
    handle: data.author_url?.split('/').pop(),
    date,
    url: data.url ?? url,
  };
}

export interface PaperMeta {
  title: string;
  authors: string[];
  date?: string;
  abstract?: string;
  pdfUrl?: string;
  venue?: string;
  absUrl: string;
}

export function arxivId(raw: string): string | null {
  const m = /arxiv\.org\/(?:abs|pdf|html)\/([\w.\-/]+?)(?:v\d+)?(?:\.pdf)?$/.exec(raw.split(/[?#]/)[0]!);
  return m?.[1] ?? null;
}

export async function fetchArxiv(raw: string): Promise<PaperMeta> {
  const id = arxivId(raw);
  if (!id) throw new Error('Not an arXiv paper URL');
  const { text } = await fetchText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
  const { document } = parseHTML(text.replace(/<\?xml[^>]*>/, ''));
  const entry = document.querySelector('entry');
  if (!entry) throw new Error('arXiv has no record of this paper');
  const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
  return {
    title: clean(entry.querySelector('title')?.textContent),
    authors: (Array.from(entry.querySelectorAll('author name')) as El[]).map((n) => clean(n.textContent)),
    date: clean(entry.querySelector('published')?.textContent).slice(0, 10) || undefined,
    abstract: clean(entry.querySelector('summary')?.textContent),
    pdfUrl: `https://arxiv.org/pdf/${id}`,
    venue: 'arXiv',
    absUrl: `https://arxiv.org/abs/${id}`,
  };
}

export async function fetchDoi(raw: string): Promise<PaperMeta> {
  const doi = decodeURIComponent(new URL(raw).pathname.slice(1));
  const data = await fetchJson<{ message: Record<string, any> }>(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const m = data.message;
  const parts: number[] | undefined = m.issued?.['date-parts']?.[0];
  return {
    title: (m.title?.[0] ?? '').trim(),
    authors: (m.author ?? []).map((a: { given?: string; family?: string; name?: string }) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')),
    date: parts ? parts.map((p) => String(p).padStart(2, '0')).join('-') : undefined,
    abstract: m.abstract ? String(m.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined,
    pdfUrl: (m.link ?? []).find((l: { 'content-type'?: string; URL: string }) => l['content-type'] === 'application/pdf')?.URL,
    venue: m['container-title']?.[0] ?? m.publisher,
    absUrl: `https://doi.org/${doi}`,
  };
}
