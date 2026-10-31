// Blocks: the rich media the editor adds to an item (Item.blocks in the bundle). Every rule that
// decides what may print is enforced here, server side, whatever the Desk sends:
//
// - quote and code blocks are excerpts. A quote is the source's own characters (found verbatim, or
//   the editor's selection at its offsets); code is matched with whitespace runs collapsed, since
//   extraction mangles indentation, and the editor's pasted code is what prints. An item without
//   stored source text takes neither: there is nothing to check them against.
// - video and audio embeds are resolved from the editor's link by code (provider, id, start), never
//   by a model. Titles come from the provider's oEmbed (or the editor); a video's poster is fetched,
//   measured and kept in MEDIA. Every fetch goes through guardedFetch with a byte cap.
// - pictures are uploaded or fetched (images only, capped), measured, kept in MEDIA, and carry the
//   credit and licence the editor states. publish.ts copies posters and pictures to FILES.
// - a post (an X post set inside the item) is resolved from the editor's link by code and its words
//   taken from X's public oEmbed record, never typed in or written by a model; the site and the app
//   draw it as a clipping, never with X's embed.

import { findCode, findVerbatim, isVerbatimAt } from '@fdf/shared/verbatim';
import { startSeconds } from '@fdf/shared/quoting';
import { codeLang, highlightCode } from '@fdf/shared/highlight';
import { xPostUrl, type Block, type BlockKind, type ChartImages, type Plate } from '@fdf/shared/haul';
import { chartKey, validateChart, type Chart } from '@fdf/shared/charts';
import type { Edition } from '@fdf/shared/tokens';
import type { Env } from './env';
import type { ItemRow, SourceRow } from './db';
import { guardedFetch } from './extract/guard';
import { fetchXPost } from './extract/sources';
import { USER_AGENT } from './extract/http';
import { readCapped, readJsonCapped } from './extract/stream';
import { imageSize, IMAGE_TYPES, MAX_IMAGE_BYTES, maybeResize } from './plates';
import { locatorFor } from './steps';
import { newId, nowIso, parseJson, truncate } from './util';

export interface BlockRow {
  id: string;
  item_id: string;
  kind: BlockKind;
  body: string;
  media_key: string | null;
  mime: string | null;
  status: 'kept' | 'cut';
  position: number;
  created_at: string;
  updated_at: string;
}

/** What a block row stores: the bundle Block without public URLs, plus where a quote sits. */
export type StoredBlock =
  | { kind: 'quote'; text: string; locator?: string; start: number; end: number }
  | { kind: 'code'; code: string; lang?: string; caption?: string; start: number; end: number }
  | { kind: 'video'; provider: 'youtube' | 'vimeo'; id: string; title: string; start?: number; poster?: { width: number; height: number }; link: string }
  | { kind: 'audio'; provider: 'file' | 'spotify' | 'apple'; url: string; title: string; start?: number; seconds?: number }
  | { kind: 'image'; caption: string; credit: string; licence: string; sourceUrl?: string; creator?: string; date?: string; width: number; height: number }
  | { kind: 'chart'; chart: Chart }
  | { kind: 'post'; platform: 'x'; url: string; author: string; handle: string; date?: string; text: string; truncated?: boolean };

/** An error the editor sees as it is: plain words, a 4xx status. */
export class BlockRefused extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

const refuse = (m: string, status = 422): never => {
  throw new BlockRefused(m, status);
};

const OEMBED_BYTES = 64 * 1024;
const POSTER_BYTES = 4 * 1024 * 1024;
export const MAX_BLOCKS_PER_ITEM = 24;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// ---------------------------------------------------------------- time stamps in links

/** Seconds from a link's time: "90", "90s", "1m30s", "1h2m3s", "1:30" or "1:02:14". Null if none. */
export function parseClock(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.floor(Number(t));
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (hms && (hms[1] || hms[2] || hms[3])) return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  return startSeconds(t);
}

// ---------------------------------------------------------------- video links

export interface VideoLink {
  provider: 'youtube' | 'vimeo';
  id: string;
  start?: number;
}

const YT_ID = /^[\w-]{11}$/;

/**
 * A YouTube or Vimeo link the editor pasted, as provider + id + start. YouTube: watch?v=, youtu.be/,
 * shorts/, embed/, live/, v/, with t= or start= (or #t=). Vimeo: vimeo.com/<id>, channels, groups,
 * showcases and player.vimeo.com/video/<id>, with #t= or ?t=. Anything else is refused.
 */
export function parseVideoLink(raw: string): VideoLink {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return refuse('That is not a link. Paste the address of a YouTube or Vimeo video.', 400);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') refuse('Only web links work here.', 400);
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const startOf = (...vals: Array<string | null>) => {
    for (const v of vals) {
      const s = parseClock(v);
      if (s != null) return s;
    }
    return null;
  };
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id: string | undefined;
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') id = parts[0];
    else if (parts[0] === 'watch') id = u.searchParams.get('v') ?? undefined;
    else if (['shorts', 'embed', 'live', 'v', 'e'].includes(parts[0] ?? '')) id = parts[1];
    else if (u.searchParams.get('v')) id = u.searchParams.get('v')!;
    if (!id || !YT_ID.test(id)) return refuse('That YouTube link does not name a video. Copy the link from the video itself (Share, then Copy link).', 400);
    const start = startOf(u.searchParams.get('t'), u.searchParams.get('start'), hash.get('t'));
    return { provider: 'youtube', id, ...(start ? { start } : {}) };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    // The video id is the first all-digit part; an unlisted video's hash follows it.
    const at = parts.findIndex((p) => /^\d{5,12}$/.test(p));
    if (at < 0) return refuse('That Vimeo link does not name a video.', 400);
    const next = parts[at + 1];
    if ((next && /^[0-9a-f]{6,}$/i.test(next) && host === 'vimeo.com') || u.searchParams.get('h')) {
      return refuse('This is an unlisted Vimeo video. Its player only plays with a private key, so readers could not watch it; ask for a public link.', 422);
    }
    const start = startOf(hash.get('t'), u.searchParams.get('t'));
    return { provider: 'vimeo', id: parts[at]!, ...(start ? { start } : {}) };
  }
  return refuse('Only YouTube and Vimeo videos can be embedded. Link other videos from the note instead.', 400);
}

// ---------------------------------------------------------------- audio links

export interface AudioLink {
  provider: 'file' | 'spotify' | 'apple';
  /** The address stored and published: an audio file, or the canonical episode or show link. */
  url: string;
  start?: number;
}

/**
 * A podcast or audio link: open.spotify.com episode or show links (any intl- prefix and tracking
 * dropped), podcasts.apple.com show or episode links (?i= kept), or an https link to an audio file.
 */
export function parseAudioLink(raw: string): AudioLink {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return refuse('That is not a link. Paste a Spotify or Apple Podcasts episode, or a link to an audio file.', 400);
  }
  const host = u.hostname.toLowerCase();
  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z-]+\/)?(episode|show)\/([A-Za-z0-9]{10,30})\/?$/.exec(u.pathname);
    if (!m) return refuse('Only Spotify episode or show links can be embedded (open.spotify.com/episode/…).', 400);
    const start = parseClock(u.searchParams.get('t'));
    return { provider: 'spotify', url: `https://open.spotify.com/${m[1]}/${m[2]}`, ...(start ? { start } : {}) };
  }
  if (host === 'podcasts.apple.com' || host === 'itunes.apple.com') {
    const m = /^\/([a-z]{2})\/podcast\/(?:([^/?#\s]+)\/)?(id\d+)\/?$/.exec(u.pathname);
    if (!m) return refuse('That Apple Podcasts link does not name a show or an episode.', 400);
    const ep = u.searchParams.get('i');
    const slug = m[2] ? `${m[2]}/` : '';
    return { provider: 'apple', url: `https://podcasts.apple.com/${m[1]}/podcast/${slug}${m[3]}${ep && /^\d+$/.test(ep) ? `?i=${ep}` : ''}` };
  }
  if (u.protocol !== 'https:') return refuse('An audio file must be on an https link.', 400);
  if (u.username || u.password) return refuse('Links with a login in them cannot be published.', 400);
  const start = parseClock(new URLSearchParams(u.hash.replace(/^#/, '')).get('t'));
  u.hash = '';
  return { provider: 'file', url: u.toString(), ...(start ? { start } : {}) };
}

// ---------------------------------------------------------------- fetching (guarded, capped)

type OEmbed = { title?: string; thumbnail_url?: string; thumbnail_width?: number; thumbnail_height?: number };
async function oembed(url: string): Promise<OEmbed | null> {
  const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, timeoutMs: 15_000 }).catch(() => null);
  if (!res) return null;
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  return readJsonCapped<OEmbed>(res.body, OEMBED_BYTES, 'oEmbed answer').catch(() => null);
}

/** Fetch an image (guarded, capped on the bytes read), measure it, and return its bytes. */
export async function fetchImage(url: string, max = MAX_IMAGE_BYTES): Promise<{ bytes: Uint8Array; width: number; height: number; mime: string; finalUrl: string }> {
  const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, timeoutMs: 30_000 }).catch((e: unknown) => refuse(`That link could not be fetched: ${e instanceof Error ? e.message : e}`));
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!res.ok) {
    await res.body?.cancel();
    return refuse(`The image link returned ${res.status}.`);
  }
  if (!IMAGE_TYPES.has(type)) {
    await res.body?.cancel();
    return refuse(`That link is ${type || 'not an image'}, not a JPEG, PNG, WebP or GIF. Link to the image file itself.`);
  }
  const bytes = await readCapped(res.body, max, 'image').catch((e: unknown) => refuse(e instanceof Error ? e.message : 'The image is too large'));
  const size = imageSize(bytes);
  if (!size) return refuse('That link did not return an image we can read.');
  return { bytes, ...size, finalUrl: (res as Response & { finalUrl?: string }).finalUrl ?? url };
}

/** The video's own title and poster, from YouTube's or Vimeo's oEmbed. */
export async function resolveVideo(v: VideoLink): Promise<{ title: string; poster: { bytes: Uint8Array; width: number; height: number; mime: string } | null; link: string }> {
  const link = v.provider === 'youtube' ? `https://www.youtube.com/watch?v=${v.id}` : `https://vimeo.com/${v.id}`;
  const meta = await oembed(v.provider === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}` : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(link)}`);
  const title = meta?.title?.replace(/\s+/g, ' ').trim();
  if (!title) return refuse(`${v.provider === 'youtube' ? 'YouTube' : 'Vimeo'} does not know this video, or does not let it be embedded (it may be private or removed).`);
  const posterUrl = v.provider === 'youtube' ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : meta?.thumbnail_url;
  let poster: { bytes: Uint8Array; width: number; height: number; mime: string } | null = null;
  if (posterUrl && /^https:\/\//.test(posterUrl)) poster = await fetchImage(posterUrl, POSTER_BYTES).catch(() => null);
  return { title: truncate(title, 200), poster, link };
}

/** An audio file link must answer with an audio type: HEAD first, then a one-byte ranged GET. */
export async function checkAudioFile(url: string): Promise<string> {
  const isAudio = (t: string) => t.startsWith('audio/') || t === 'application/ogg';
  const typeOf = (r: Response) => (r.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const head = await guardedFetch(url, { method: 'HEAD', headers: { 'user-agent': USER_AGENT, accept: 'audio/*' }, timeoutMs: 15_000 }).catch(() => null);
  if (head) {
    await head.body?.cancel();
    if (head.ok && isAudio(typeOf(head))) return typeOf(head);
  }
  const get = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'audio/*', range: 'bytes=0-1' }, timeoutMs: 15_000 }).catch(() => null);
  if (!get) return refuse('That audio link did not answer.');
  await get.body?.cancel();
  const t = typeOf(get);
  if (!get.ok) return refuse(`That audio link returned ${get.status}.`);
  if (!isAudio(t)) return refuse(`That link is ${t || 'not audio'}, not an audio file. Link to the .mp3 or .m4a itself.`);
  return t;
}

// ---------------------------------------------------------------- reading and writing rows

export async function blocksFor(env: Env, itemId: string): Promise<BlockRow[]> {
  return (await env.DB.prepare('SELECT * FROM blocks WHERE item_id = ? ORDER BY position, created_at').bind(itemId).all<BlockRow>()).results;
}

/** A block as the Desk shows it (the stored body, parsed; the picture or poster through the Desk). */
export function blockView(b: BlockRow) {
  return { ...b, body: parseJson<StoredBlock | null>(b.body, null), image: b.media_key ? `/api/blocks/${b.id}/media` : null };
}

async function insertBlock(env: Env, itemId: string, body: StoredBlock, media?: { key: string; mime: string }, id = newId('bk_')): Promise<string> {
  const n = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(position) AS p FROM blocks WHERE item_id = ?').bind(itemId).first<{ n: number; p: number | null }>();
  if ((n?.n ?? 0) >= MAX_BLOCKS_PER_ITEM) refuse(`An item takes at most ${MAX_BLOCKS_PER_ITEM} additions.`, 409);
  const now = nowIso();
  await env.DB.prepare('INSERT INTO blocks (id, item_id, kind, body, media_key, mime, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, itemId, body.kind, JSON.stringify(body), media?.key ?? null, media?.mime ?? null, (n?.p ?? -1) + 1, now, now)
    .run();
  return id;
}

async function sourceOrRefuse(env: Env, item: ItemRow, what: string): Promise<Pick<SourceRow, 'text' | 'meta'>> {
  if (item.kind === 'rhyme') refuse(`A Rhyme has no source of its own, so it takes no ${what}.`, 409);
  const src = await env.DB.prepare('SELECT text, meta FROM sources WHERE item_id = ?').bind(item.id).first<Pick<SourceRow, 'text' | 'meta'>>();
  if (!src?.text.trim()) {
    return refuse(`This item has no source text to check ${what} against. ${what === 'code' ? 'Code' : 'A pull quote'} must be found word for word in the piece; paste the piece's text first (or fetch it again).`, 409);
  }
  return src;
}

// ---------------------------------------------------------------- adding each kind

export type QuoteInput = { start: number; end: number; text: string; locator?: string } | { text: string; locator?: string };

/** A pull quote: the editor's selection at its offsets, or pasted text found verbatim in the source. */
export async function addQuote(env: Env, item: ItemRow, b: QuoteInput): Promise<string> {
  const src = await sourceOrRefuse(env, item, 'a pull quote');
  let span: { start: number; end: number; text: string } | null = null;
  if ('start' in b) {
    let { start, end } = b;
    while (start < end && /\s/.test(src.text[start] ?? '')) start++;
    while (end > start && /\s/.test(src.text[end - 1] ?? '')) end--;
    const text = src.text.slice(start, end);
    if (text && text === b.text.trim()) span = { start, end, text };
    else refuse('That selection does not match the source text; select it again.', 409);
  } else {
    span = findVerbatim(src.text, b.text);
    if (!span) refuse('That quote is not in the source word for word. Copy it from the piece itself (or select it in the reader).');
  }
  if (span!.text.length > 1200) refuse('A pull quote is a line or two (under 1,200 characters); use the excerpt for a longer passage.');
  const locator = b.locator?.trim() || locatorFor(item, src, span!.start) || undefined;
  return insertBlock(env, item.id, { kind: 'quote', text: span!.text, start: span!.start, end: span!.end, ...(locator ? { locator } : {}) });
}

/** Code: matched against the source with whitespace runs collapsed; the editor's paste prints. */
export async function addCode(env: Env, item: ItemRow, b: { code: string; lang?: string; caption?: string }): Promise<string> {
  const src = await sourceOrRefuse(env, item, 'code');
  const code = trimCode(b.code);
  if (!code.trim()) refuse('Paste some code.', 400);
  const found = findCode(src.text, code);
  if (!found) refuse('That code is not in the source. It must match the piece (spacing aside); copy it from the original.');
  if (b.lang && !codeLang(b.lang)) refuse(`Unknown language "${b.lang}".`, 400);
  return insertBlock(env, item.id, {
    kind: 'code',
    code,
    ...(b.lang ? { lang: codeLang(b.lang)! } : {}),
    ...(b.caption?.trim() ? { caption: b.caption.trim() } : {}),
    start: found!.start,
    end: found!.end,
  });
}

/** Keep the editor's indentation; drop blank lines at the ends and trailing spaces on each line. */
export function trimCode(code: string): string {
  return code.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
}

export async function addVideo(env: Env, item: ItemRow, b: { url: string; start?: string }): Promise<string> {
  const v = parseVideoLink(b.url);
  const start = b.start?.trim() ? parseClock(b.start) : v.start;
  if (b.start?.trim() && start == null) refuse('Start at a time like 42:06 or 1:02:14.', 400);
  const r = await resolveVideo(v);
  const id = newId('bk_');
  let media: { key: string; mime: string } | undefined;
  if (r.poster) {
    media = { key: `blocks/${id}/poster.${EXT[r.poster.mime] ?? 'jpg'}`, mime: r.poster.mime };
    await env.MEDIA.put(media.key, r.poster.bytes, { httpMetadata: { contentType: r.poster.mime } });
  }
  return insertBlock(
    env,
    item.id,
    { kind: 'video', provider: v.provider, id: v.id, title: r.title, link: r.link, ...(start ? { start } : {}), ...(r.poster ? { poster: { width: r.poster.width, height: r.poster.height } } : {}) },
    media,
    id,
  );
}

export async function addAudio(env: Env, item: ItemRow, b: { url: string; title?: string; start?: string }): Promise<string> {
  const a = parseAudioLink(b.url);
  const start = b.start?.trim() ? parseClock(b.start) : a.start;
  if (b.start?.trim() && start == null) refuse('Start at a time like 42:06 or 1:02:14.', 400);
  let title = b.title?.replace(/\s+/g, ' ').trim();
  if (a.provider === 'file') await checkAudioFile(a.url);
  if (!title && a.provider === 'spotify') title = (await oembed(`https://open.spotify.com/oembed?url=${encodeURIComponent(a.url)}`))?.title?.replace(/\s+/g, ' ').trim();
  if (!title) refuse(a.provider === 'spotify' ? 'Spotify did not give a title for that link (is it public?). Type the episode title.' : 'Type the episode or recording title; this host does not say it.', 400);
  return insertBlock(env, item.id, { kind: 'audio', provider: a.provider, url: a.url, title: truncate(title!, 200), ...(start ? { start } : {}) });
}

export interface PictureMeta {
  caption?: string;
  credit: string;
  licence: string;
  sourceUrl?: string;
  creator?: string;
  date?: string;
}

/** Measure and store a picture's bytes (upload or fetched link) in MEDIA; resized when huge. Also used for shelf covers. */
export async function storePicture(env: Env, key: (ext: string) => string, bytes: Uint8Array, source?: string): Promise<{ key: string; mime: string; width: number; height: number; bytes: number }> {
  let size = imageSize(bytes);
  if (!size || !EXT[size.mime]) refuse('That file is not a JPEG, PNG, WebP or GIF we can read. (HEIC from an iPhone: share it as JPEG.)', 415);
  const resized = await maybeResize(env, bytes, size!.width);
  if (resized.bytes !== bytes) {
    const s2 = imageSize(resized.bytes);
    if (s2) {
      bytes = resized.bytes;
      size = s2;
    }
  }
  const k = key(EXT[size!.mime]!);
  await env.MEDIA.put(k, bytes, { httpMetadata: { contentType: size!.mime }, ...(source ? { customMetadata: { source: source.slice(0, 500) } } : {}) });
  return { key: k, mime: size!.mime, width: size!.width, height: size!.height, bytes: bytes.byteLength };
}

/** Where the picture came from: the editor's page link, else the image link it was fetched from. An upload must say. */
export function sourced(m: PictureMeta, input: { bytes?: Uint8Array; url?: string }): PictureMeta {
  if (m.sourceUrl?.trim()) return m;
  if (!input.bytes && input.url?.trim()) return { ...m, sourceUrl: input.url.trim() };
  return refuse('Say where you found the picture (a link to its page or post), so readers can follow it to the person who made it.', 400);
}

/** The credit rule for every picture (blocks, a Picture item's plate, a shelf book's cover). */
export function checkPictureMeta(m: PictureMeta): Required<Pick<PictureMeta, 'credit' | 'licence'>> & PictureMeta {
  const credit = m.credit?.trim();
  const licence = m.licence?.trim();
  if (!credit) refuse('Say whose picture it is (the credit): the artist, photographer or holder.', 400);
  if (!licence) refuse('State the licence: "public domain", "CC BY 4.0", or for a meme "© the creator, shown for commentary".', 400);
  // The house rule: every picture names who made it and where it came from, so a reader can always
  // follow it back to the person (DECISIONS 2026-10-24).
  if (!m.creator?.trim()) refuse('Name who made the picture: the artist, photographer or poster. Write “Unknown” only if nobody can say.', 400);
  if (m.sourceUrl?.trim() && !/^https:\/\//.test(m.sourceUrl.trim())) refuse('The link to the picture’s page must be https.', 400);
  return { ...m, credit: credit!, licence: licence! };
}

/** A picture block: an uploaded file, or an image link fetched through the guard. */
export async function addPicture(env: Env, item: ItemRow, input: { bytes?: Uint8Array; url?: string } & PictureMeta): Promise<string> {
  const m = sourced(checkPictureMeta(input), input);
  const id = newId('bk_');
  const got = input.bytes ? { bytes: input.bytes, finalUrl: undefined } : input.url ? await fetchImage(input.url) : refuse('Upload a picture or give a link to one.', 400);
  const stored = await storePicture(env, (ext) => `blocks/${id}/image.${ext}`, got.bytes, got.finalUrl);
  return insertBlock(
    env,
    item.id,
    {
      kind: 'image',
      caption: m.caption?.trim() ?? '',
      credit: m.credit,
      licence: m.licence,
      width: stored.width,
      height: stored.height,
      ...(m.sourceUrl?.trim() ? { sourceUrl: m.sourceUrl.trim() } : {}),
      ...(m.creator?.trim() ? { creator: m.creator.trim() } : {}),
      ...(m.date?.trim() ? { date: m.date.trim() } : {}),
    },
    { key: stored.key, mime: stored.mime },
    id,
  );
}

/**
 * The picture itself, for a Picture item (artwork, photo or meme): stored as the item's chosen plate,
 * so it prints as the mounted print and the Plates panel shows it. The editor's credit and licence
 * stand in for an institution's.
 */
export async function setPicturePlate(env: Env, item: ItemRow, input: { bytes?: Uint8Array; url?: string } & PictureMeta): Promise<string> {
  const m = sourced(checkPictureMeta(input), input);
  const id = newId('pl_');
  const got = input.bytes ? { bytes: input.bytes, finalUrl: undefined } : input.url ? await fetchImage(input.url) : refuse('Upload a picture or give a link to one.', 400);
  const stored = await storePicture(env, (ext) => `plates/${id}.${ext}`, got.bytes, got.finalUrl);
  const title = (m.caption?.trim() || item.title || 'Picture').slice(0, 300);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE plates SET status = 'candidate' WHERE item_id = ? AND status = 'chosen'`).bind(item.id),
    env.DB.prepare(
      `INSERT INTO plates (id, item_id, provider, provider_id, query, query_by, title, creator, date, institution, licence, source_url, image_url, width, height, caption, status, check_status, checked_at, r2_key, mime, bytes, created_at)
       VALUES (?, ?, 'editor', ?, '', 'editor', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chosen', 200, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      item.id,
      id,
      title,
      m.creator?.trim() || null,
      m.date?.trim() || null,
      m.credit,
      m.licence,
      m.sourceUrl?.trim() ?? '',
      got.finalUrl ?? '',
      stored.width,
      stored.height,
      m.caption?.trim() ?? '',
      now,
      stored.key,
      stored.mime,
      stored.bytes,
      now,
    ),
    env.DB.prepare('UPDATE items SET plate = ?, updated_at = ? WHERE id = ?').bind(id, now, item.id),
  ]);
  return id;
}

// ---------------------------------------------------------------- posts

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** X's "October 30, 2026" in the house's "30 October 2026"; anything else as given. */
export function houseDate(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  const m = t ? /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(t) : null;
  return m && MONTHS.includes(m[1]!) ? `${Number(m[2])} ${m[1]} ${m[3]}` : t || undefined;
}

/**
 * An X post inside the item: the link is checked by code, and the words, author and date come from
 * X's own public record of it (oEmbed). X gives long posts only to "…"; such a post is marked
 * truncated and readers are sent to it for the rest.
 */
export async function addPost(env: Env, item: ItemRow, b: { url: string }): Promise<string> {
  const url = xPostUrl(b.url);
  if (!url) return refuse('Paste the link to one post on X (x.com/<name>/status/<number>).', 400);
  const post = await fetchXPost(url).catch(() => refuse('X does not show this post publicly (it may be private, deleted or from a protected account).'));
  const text = post.text.trim();
  const handle = post.handle?.replace(/^@/, '');
  if (!text) return refuse('X gives no words for this post (a picture or video alone). Add the picture with its credit instead.');
  if (!post.author?.trim() || !handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return refuse('X did not say who posted this.');
  const date = houseDate(post.date);
  return insertBlock(env, item.id, {
    kind: 'post',
    platform: 'x',
    url: `https://x.com/${handle}/status/${url.split('/').pop()}`,
    author: truncate(post.author.replace(/\s+/g, ' ').trim(), 120),
    handle,
    text,
    ...(date ? { date } : {}),
    ...(/(…|\.\.\.)$/.test(text) ? { truncated: true } : {}),
  });
}

// ---------------------------------------------------------------- charts

/**
 * A chart (packages/shared/src/charts): checked by the honesty validator before it is stored, and
 * again at publish. Its data rows are stored with it; the website and the app draw only from them.
 */
export function checkChart(chart: Chart): { warnings: string[] } {
  const r = validateChart(chart);
  if (!r.ok) refuse(`The chart cannot be kept yet:\n${r.errors.slice(0, 12).map((e) => `• ${e.message}${e.path !== 'chart' ? ` (${e.path.replace(/^chart\.?/, '')})` : ''}`).join('\n')}`);
  return { warnings: r.warnings.map((w) => w.message) };
}

export async function addChart(env: Env, item: ItemRow, chart: Chart): Promise<{ id: string; warnings: string[] }> {
  const { warnings } = checkChart(chart);
  return { id: await insertBlock(env, item.id, { kind: 'chart', chart }), warnings };
}

/** Replace a chart's spec (the editor edited its words, data or form); checked again. */
export async function replaceChart(env: Env, row: BlockRow, chart: Chart): Promise<{ warnings: string[] }> {
  if (row.kind !== 'chart') refuse('That block is not a chart.', 409);
  const { warnings } = checkChart(chart);
  await env.DB.prepare('UPDATE blocks SET body = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify({ kind: 'chart', chart }), nowIso(), row.id).run();
  return { warnings };
}

// ---------------------------------------------------------------- editing, ordering, removing

export interface BlockPatch {
  locator?: string;
  caption?: string;
  lang?: string | null;
  code?: string;
  title?: string;
  start?: string;
  credit?: string;
  licence?: string;
  sourceUrl?: string;
  creator?: string;
  date?: string;
  status?: 'kept' | 'cut';
}

export async function patchBlock(env: Env, row: BlockRow, p: BlockPatch): Promise<void> {
  const b = parseJson<StoredBlock | null>(row.body, null);
  if (!b) refuse('This block is damaged; remove it and add it again.', 409);
  const next: StoredBlock = { ...b! } as StoredBlock;
  if (next.kind === 'quote' && p.locator !== undefined) next.locator = p.locator.trim() || undefined;
  if (next.kind === 'code') {
    if (p.caption !== undefined) next.caption = p.caption.trim() || undefined;
    if (p.lang !== undefined) {
      if (p.lang && !codeLang(p.lang)) refuse(`Unknown language "${p.lang}".`, 400);
      next.lang = p.lang ? codeLang(p.lang) : undefined;
    }
    if (p.code !== undefined) {
      const item = (await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(row.item_id).first<ItemRow>())!;
      const src = await sourceOrRefuse(env, item, 'code');
      const code = trimCode(p.code);
      const found = findCode(src.text, code);
      if (!found) refuse('That code is not in the source. It must match the piece (spacing aside).');
      Object.assign(next, { code, start: found!.start, end: found!.end });
    }
  }
  if ((next.kind === 'video' || next.kind === 'audio') && p.title !== undefined) {
    if (!p.title.trim()) refuse('A title cannot be empty.', 400);
    next.title = truncate(p.title.replace(/\s+/g, ' ').trim(), 200);
  }
  if ((next.kind === 'video' || next.kind === 'audio') && p.start !== undefined) {
    const s = p.start.trim() ? parseClock(p.start) : 0;
    if (s == null) refuse('Start at a time like 42:06 or 1:02:14.', 400);
    next.start = s || undefined;
  }
  if (next.kind === 'image') {
    const m = checkPictureMeta({ credit: p.credit ?? next.credit, licence: p.licence ?? next.licence, sourceUrl: p.sourceUrl ?? next.sourceUrl, creator: p.creator ?? next.creator });
    next.credit = m.credit;
    next.licence = m.licence;
    if (p.caption !== undefined) next.caption = p.caption.trim();
    if (p.sourceUrl !== undefined) next.sourceUrl = p.sourceUrl.trim() || undefined;
    if (p.creator !== undefined) next.creator = p.creator.trim() || undefined;
    if (p.date !== undefined) next.date = p.date.trim() || undefined;
  }
  await env.DB.prepare('UPDATE blocks SET body = ?, status = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(next), p.status ?? row.status, nowIso(), row.id)
    .run();
}

/** Put an item's blocks in the given order; the list must name each of them exactly once. */
export async function reorderBlocks(env: Env, itemId: string, ids: string[]): Promise<void> {
  const have = (await blocksFor(env, itemId)).map((b) => b.id);
  if (ids.length !== have.length || new Set(ids).size !== ids.length || !ids.every((id) => have.includes(id))) refuse('The order must list each of this item’s blocks once.', 400);
  await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE blocks SET position = ? WHERE id = ? AND item_id = ?').bind(i, id, itemId)));
}

export async function deleteBlock(env: Env, row: BlockRow): Promise<void> {
  await env.DB.prepare('DELETE FROM blocks WHERE id = ?').bind(row.id).run();
  if (row.media_key) await env.MEDIA.delete(row.media_key);
}

// ---------------------------------------------------------------- checks and publishing

/** Each kept quote and code block, re-checked against the stored source (for the Quotes check). */
export function blockQuoteRows(blocks: BlockRow[], source: string | null): Array<{ label: string; status: 'pass' | 'fail'; detail: string }> {
  const rows: Array<{ label: string; status: 'pass' | 'fail'; detail: string }> = [];
  for (const [i, r] of blocks.filter((x) => x.status === 'kept' && (x.kind === 'quote' || x.kind === 'code')).entries()) {
    const b = parseJson<StoredBlock | null>(r.body, null);
    const label = `${r.kind === 'quote' ? 'Pull quote' : 'Code'} ${i + 1}`;
    const ok = Boolean(b && source && (b.kind === 'quote' ? isVerbatimAt(source, b, b.text) : b.kind === 'code' ? findCode(source, b.code) : false));
    rows.push({ label, status: ok ? 'pass' : 'fail', detail: ok ? 'Found word for word in the source' : 'No longer found in the source; remove it and add it again' });
  }
  return rows;
}

/** A chart's pictures, drawn at publish (chartdraw.ts), by chartKey: the app's two and the share card. */
export type ChartPictures = Map<string, { light: Uint8Array; dark: Uint8Array; share?: Uint8Array }>;

/** The app's pictures are the phone figure (375 wide) at three times: 1125 px wide PNGs. */
export const CHART_PICTURE = { width: 1125, maxHeight: 4000, maxBytes: 3 * 1024 * 1024 } as const;
/** The share card: 1080 px wide. */
export const CHART_SHARE = { width: 1080, maxHeight: 6000, maxBytes: 4 * 1024 * 1024 } as const;

export interface BundleBlocks {
  blocks: Block[];
  /** Chart pictures to write next to the bundle: [FILES key, PNG bytes]. */
  pictures?: Array<[string, Uint8Array]>;
  /** [MEDIA key, FILES key] pairs to copy next to the bundle. */
  copies: Array<[string, string]>;
  problems: string[];
}

/**
 * The item's kept blocks as they go into the bundle, in order: quotes re-verified, code tokens
 * computed with highlightCode, posters and pictures pointed at their FILES copies under `to`.
 */
export function blocksForBundle(
  rows: BlockRow[],
  source: string | null,
  to: string,
  filesBase: string,
  charts: { edition: Edition; pictures?: ChartPictures; warnings?: string[] } = { edition: 'oxblood' },
): BundleBlocks {
  const out: BundleBlocks = { blocks: [], copies: [], problems: [], pictures: [] };
  let n = 0;
  for (const r of rows) {
    if (r.status !== 'kept') continue;
    const b = parseJson<StoredBlock | null>(r.body, null);
    if (!b) {
      out.problems.push('a block is damaged; remove it');
      continue;
    }
    n++;
    const file = (suffix: string) => {
      const key = `${to}-${n}${suffix}.${EXT[r.mime ?? ''] ?? 'jpg'}`;
      out.copies.push([r.media_key!, key]);
      return `${filesBase}/${key}`;
    };
    switch (b.kind) {
      case 'quote':
        if (!source || !isVerbatimAt(source, b, b.text)) {
          out.problems.push(`a pull quote no longer matches the source ("${b.text.slice(0, 50)}…")`);
          continue;
        }
        out.blocks.push({ kind: 'quote', text: b.text, ...(b.locator ? { locator: b.locator } : {}) });
        break;
      case 'code':
        if (!source || !findCode(source, b.code)) {
          out.problems.push(`a code block no longer matches the source ("${b.code.slice(0, 40)}…")`);
          continue;
        }
        out.blocks.push({ kind: 'code', code: b.code, ...(b.lang ? { lang: b.lang } : {}), ...(b.caption ? { caption: b.caption } : {}), tokens: highlightCode(b.code, b.lang) });
        break;
      case 'video':
        out.blocks.push({
          kind: 'video',
          provider: b.provider,
          id: b.id,
          title: b.title,
          ...(b.start ? { start: b.start } : {}),
          ...(r.media_key && b.poster ? { poster: { url: file('-poster'), width: b.poster.width, height: b.poster.height } } : {}),
        });
        break;
      case 'audio':
        out.blocks.push({ kind: 'audio', provider: b.provider, url: b.url, title: b.title, ...(b.start ? { start: b.start } : {}), ...(b.seconds ? { seconds: b.seconds } : {}) });
        break;
      case 'post':
        out.blocks.push({ kind: 'post', platform: b.platform, url: b.url, author: b.author, handle: b.handle, text: b.text, ...(b.date ? { date: b.date } : {}), ...(b.truncated ? { truncated: true } : {}) });
        break;
      case 'image': {
        if (!r.media_key) {
          out.problems.push('a picture is missing its file; add it again');
          continue;
        }
        const plate: Plate = {
          url: file(''),
          width: b.width,
          height: b.height,
          caption: b.caption,
          credit: b.credit,
          licence: b.licence,
          ...(b.sourceUrl ? { sourceUrl: b.sourceUrl } : {}),
          ...(b.creator ? { creator: b.creator } : {}),
          ...(b.date ? { date: b.date } : {}),
        };
        out.blocks.push({ kind: 'image', plate });
        break;
      }
      case 'chart': {
        const r = validateChart(b.chart);
        if (!r.ok) {
          out.problems.push(`the chart "${b.chart.title || 'untitled'}" fails its checks: ${r.errors[0]!.message}`);
          continue;
        }
        // The app's pictures: drawn from exactly this chart and this Haul's ink, else the publish waits.
        const key = chartKey(b.chart, charts.edition);
        const pic = charts.pictures?.get(key);
        let images: ChartImages | undefined;
        if (pic) {
          const bad = (['light', 'dark'] as const).find((s) => {
            const size = imageSize(pic[s]);
            return !size || size.mime !== 'image/png' || size.width !== CHART_PICTURE.width || size.height > CHART_PICTURE.maxHeight || pic[s].byteLength > CHART_PICTURE.maxBytes;
          });
          if (bad) out.problems.push(`the app picture of the chart "${b.chart.title}" is not a ${CHART_PICTURE.width} px wide PNG; draw it again`);
          else {
            images = { light: { url: '', width: 0, height: 0 }, dark: { url: '', width: 0, height: 0 } };
            for (const s of ['light', 'dark'] as const) {
              // The chart's key is in the name: files under hauls/ are cached as immutable, so a changed
              // chart must get a new address rather than overwrite the old picture.
              const k = `${to}-${n}-chart-${key}-${s}.png`;
              out.pictures!.push([k, pic[s]]);
              const size = imageSize(pic[s])!;
              images[s] = { url: `${filesBase}/${k}`, width: size.width, height: size.height };
            }
            // The share card, when it was drawn: a PNG of its own width, linked under the chart.
            const card = pic.share ? imageSize(pic.share) : null;
            if (pic.share && card && card.mime === 'image/png' && card.width === CHART_SHARE.width && card.height <= CHART_SHARE.maxHeight && pic.share.byteLength <= CHART_SHARE.maxBytes) {
              const k = `${to}-${n}-chart-${key}-share.png`;
              out.pictures!.push([k, pic.share]);
              images.share = { url: `${filesBase}/${k}`, width: card.width, height: card.height };
            } else if (pic.share) out.problems.push(`the share picture of the chart "${b.chart.title}" is not a ${CHART_SHARE.width} px wide PNG`);
          }
        } else if (charts.pictures) out.problems.push(`the chart "${b.chart.title}" has no pictures for the app; publish it again`);
        else charts.warnings?.push(`The chart "${b.chart.title}" gets its app pictures when it is published.`);
        out.blocks.push({ kind: 'chart', chart: b.chart, ...(images ? { images } : {}) });
        break;
      }
    }
  }
  return out;
}
