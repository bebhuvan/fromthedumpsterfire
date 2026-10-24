// Capture-time detection: what kind of thing was pasted, dropped or shared, and how to fetch it.
// The editorial type (ContentType) is a guess the editor can correct; the source kind decides
// which extractor runs and is fixed by the input.

import type { ContentType } from './tokens';

export type SourceKind =
  | 'article'
  | 'pdf'
  | 'youtube'
  | 'video'
  | 'podcast'
  | 'audio'
  | 'x'
  | 'arxiv'
  | 'doi'
  | 'wikipedia'
  | 'text'
  | 'image';

export interface Detected {
  kind: SourceKind;
  type: ContentType;
  url?: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'“”‘’)\]]+[^\s<>"'“”‘’)\].,;:!?]/gi;

/** Every distinct http(s) URL in a block of pasted text, in order. */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0];
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/** True when the text is nothing but URLs (and whitespace or list punctuation). */
export function isOnlyUrls(text: string): boolean {
  const rest = text.replace(URL_RE, '').replace(/[\s,;•*\-–—\d.)]+/g, '');
  return rest.length === 0 && extractUrls(text).length > 0;
}

export function detectUrl(raw: string): Detected {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: 'article', type: 'essay', url: raw };
  }
  const host = url.hostname.replace(/^(www|m|mobile)\./, '');
  const path = url.pathname.toLowerCase();
  const href = url.toString();

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    return { kind: 'youtube', type: 'video', url: href };
  }
  if (host === 'vimeo.com' || host === 'ted.com' || host.endsWith('.ted.com')) {
    return { kind: 'video', type: host.includes('ted.com') ? 'talk' : 'video', url: href };
  }
  if (
    host === 'podcasts.apple.com' ||
    (host === 'open.spotify.com' && /^\/(intl-[a-z-]+\/)?episode\//.test(path)) ||
    host === 'overcast.fm' ||
    host === 'pca.st' ||
    host === 'pocketcasts.com' ||
    host === 'castro.fm' ||
    host === 'podcasts.google.com'
  ) {
    return { kind: 'podcast', type: 'podcast', url: href };
  }
  if (/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/.test(path)) return { kind: 'audio', type: 'podcast', url: href };
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return { kind: 'video', type: 'video', url: href };
  if ((host === 'x.com' || host === 'twitter.com' || host === 'nitter.net') && /\/status\/\d+/.test(path)) {
    return { kind: 'x', type: 'social', url: href };
  }
  if (isSocialPost(host, path)) return { kind: 'article', type: 'social', url: href };
  if (host === 'arxiv.org' || host === 'export.arxiv.org') return { kind: 'arxiv', type: 'paper', url: href };
  if (host === 'doi.org' || host === 'dx.doi.org') return { kind: 'doi', type: 'paper', url: href };
  if (/\.pdf$/.test(path) || path.endsWith('/pdf')) {
    return { kind: 'pdf', type: 'paper', url: href };
  }
  if (/(^|\.)(biorxiv|medrxiv|ssrn|semanticscholar|openreview|nber|acm|ieee|jstor|springer|nature|science|pnas|plos)\.(org|com|net)$/.test(host)) {
    return { kind: 'article', type: 'paper', url: href };
  }
  if (host.endsWith('wikipedia.org') && path.startsWith('/wiki/')) return { kind: 'wikipedia', type: 'rabbit-hole', url: href };
  if (host.endsWith('substack.com') || host === 'medium.com' || host.endsWith('.medium.com')) {
    return { kind: 'article', type: 'essay', url: href };
  }
  return { kind: 'article', type: 'essay', url: href };
}

/**
 * A single post on a social platform (not a profile or a feed): Bluesky (bsky.app/profile/<h>/post/<id>),
 * Substack Notes (substack.com/@<user>/note/<id>, or /note/c-<id>), Threads (threads.net or
 * threads.com /@<user>/post/<id>) and Mastodon-style servers (/@<user>/<numeric id>).
 */
function isSocialPost(host: string, path: string): boolean {
  if (host === 'bsky.app') return /^\/profile\/[^/]+\/post\/[a-z0-9]+\/?$/.test(path);
  if (host === 'substack.com' || host.endsWith('.substack.com')) return /^\/(@[^/]+\/)?note\/c?-?[\w-]+\/?$/.test(path);
  if (host === 'threads.net' || host === 'threads.com') return /^\/@[^/]+\/post\/[\w-]+\/?$/.test(path);
  // Mastodon and its kin: any server, a user's post is /@user/<id> (ids are long numbers).
  return /^\/@[\w.-]+(@[\w.-]+)?\/\d{6,}\/?$/.test(path);
}

/** A pasted passage: short, broken lines read as a poem; anything else is a passage. */
export function detectText(text: string): Detected {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const avg = lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length);
  const poem = lines.length >= 3 && avg < 60;
  return { kind: 'text', type: poem ? 'poem' : 'passage' };
}

export function detectFile(name: string, mime: string): Detected | { kind: 'voice' } {
  const lower = name.toLowerCase();
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return { kind: 'pdf', type: 'paper' };
  if (mime.startsWith('image/')) return { kind: 'image', type: 'passage' };
  if (mime.startsWith('audio/') || /\.(m4a|mp3|wav|ogg|opus|webm|aac)$/.test(lower)) return { kind: 'voice' };
  return { kind: 'text', type: 'passage' };
}

/**
 * Canonicalise a URL for de-duplication: drop tracking parameters, fragments and trailing slashes.
 */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src|s$|si$|igshid|feature$|cmpid|share|smid)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.replace(/^(www|m|mobile)\./, '');
    if (u.hostname === 'twitter.com') u.hostname = 'x.com';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return raw.trim();
  }
}
