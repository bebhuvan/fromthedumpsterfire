// The published Haul bundle: the only contract between the publisher and the readers' app and site.
// Bundles are static JSON on R2, so every field here is final, verified copy.

import type { CodeRole, ContentType, Edition, Swatch } from './tokens';

export const BUNDLE_VERSION = 1;

/** A title whose last phrase is set in italic, e.g. "What cheap things" + "cost". */
export interface Title {
  text: string;
  italic?: string;
}

/** Container of a published voice note. m4a (AAC in MP4), mp3 and wav play on Android and iOS; mp4 (Opus in MP4), webm and ogg play on Android only. */
export type AudioFormat = 'm4a' | 'mp3' | 'wav' | 'mp4' | 'webm' | 'ogg';
export const AUDIO_FORMATS: readonly AudioFormat[] = ['m4a', 'mp3', 'wav', 'mp4', 'webm', 'ogg'];
export const PLAYS_ON_IOS: ReadonlySet<AudioFormat> = new Set(['m4a', 'mp3', 'wav']);

export interface Audio {
  url: string;
  seconds: number;
  /** Absent in older bundles (treat as playable everywhere). Readers on iOS skip webm and ogg. */
  format?: AudioFormat;
}

export interface HaulSummary {
  number: number;
  title: Title;
  deck: string;
  publishedAt: string; // ISO date
  swatch: Swatch;
  edition?: Edition;
  itemCount: number;
  /** Path relative to the files base, e.g. "hauls/001/v1/haul.json". */
  path: string;
}

export interface HaulIndex {
  bundleVersion: number;
  updatedAt: string;
  hauls: HaulSummary[]; // newest first
}

export interface RouteStep {
  day: string;
  text: string;
  by: 'editor' | 'machine';
  itemId?: string;
}

export interface FieldNote {
  title: Title;
  audio?: Audio;
  paragraphs: string[];
  /** A sentence from the paragraphs to mark with the highlighter. */
  highlight?: string;
  route: RouteStep[];
}

export interface Excerpt {
  text: string;
  /** Substring of text the editor underlined. */
  highlight?: string;
  locator: string;
}

/** A public-domain image. Never generated; the licence is what the holding institution states. */
export interface Plate {
  url: string;
  width: number;
  height: number;
  caption: string;
  /** Who holds the work, e.g. "Art Institute of Chicago" or "Wikimedia Commons". */
  credit: string;
  licence: string;
  /** The work's own page at the institution (added 2026-10; optional in older bundles). */
  sourceUrl?: string;
  creator?: string;
  date?: string;
}

export interface Marginal {
  text: string;
  cite: string;
}

/**
 * One of the big ideas of a long talk, podcast or paper, in the machine's voice, with the passage
 * where the source states it (verbatim) and where to find it. Optional; older bundles have none.
 */
export interface Idea {
  text: string;
  quote: string;
  locator: string;
  /** The editor's own line on this idea, verbatim (added 2026-10-17). */
  reaction?: string;
}

/** Where to start a long piece, chosen by the editor: a time or page, their few words, a deep link. */
export interface StartHere {
  at: string;
  note?: string;
  /** A link to that moment, when the platform has one (YouTube's t=). */
  url?: string;
}

export interface WikiCard {
  title: string;
  summary: string;
  url: string;
}

/** The edge types the Desk offers and the judge model may assign. Older bundles may carry other labels. */
export const EDGE_TYPES = ['Answers', 'Extends', 'Contradicts', 'Precedent of', 'Same mechanism', 'Rhymes with', 'Cites'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export interface Connection {
  /** Typed edge label, e.g. "Answers", "Same mechanism". */
  type: string;
  title: string;
  note: string;
  itemId?: string;
  threadId?: string;
}

export interface Rhyme {
  then: { year: string; quote: string; cite: string };
  now: { year: string; quote: string; cite: string };
  bridge: string;
}

export interface Media {
  kind: 'video' | 'audio';
  url: string;
  label: string;
}

/** One run of highlighted code: its role ('' for plain) and its exact text. Joined, they are the code. */
export type CodeToken = [role: CodeRole | '', text: string];

/**
 * Rich media the editor adds to an item, printed after the note and the excerpt in every form.
 * Quotes and code are excerpts too: each is matched word for word against the stored source text
 * before it can ship. Video and podcast embeds are resolved from the editor's link by code, never by
 * a model. Optional; older bundles have none (added 2026-10-24).
 */
export type Block =
  | { kind: 'quote'; text: string; locator?: string }
  | { kind: 'code'; code: string; lang?: string; caption?: string; tokens?: CodeToken[] }
  | { kind: 'video'; provider: 'youtube' | 'vimeo'; id: string; title: string; start?: number; poster?: { url: string; width: number; height: number } }
  | { kind: 'audio'; provider: 'file' | 'spotify' | 'apple'; url: string; title: string; start?: number; seconds?: number }
  | { kind: 'image'; plate: Plate };
export type BlockKind = Block['kind'];
export const BLOCK_KINDS: readonly BlockKind[] = ['quote', 'code', 'video', 'audio', 'image'];

/** The player's address for an embed: youtube-nocookie, Vimeo's player, Spotify's or Apple's embed. */
export function embedSrc(b: Extract<Block, { kind: 'video' | 'audio' }>): string | undefined {
  if (b.kind === 'video') {
    if (!/^[\w-]{6,20}$/.test(b.id)) return undefined;
    const t = b.start ? Math.floor(b.start) : 0;
    return b.provider === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${b.id}?rel=0${t ? `&start=${t}` : ''}`
      : `https://player.vimeo.com/video/${b.id}?dnt=1${t ? `#t=${t}s` : ''}`;
  }
  if (b.provider === 'spotify') {
    const m = /^https:\/\/open\.spotify\.com\/(episode|show)\/([A-Za-z0-9]{10,30})/.exec(b.url);
    return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : undefined;
  }
  if (b.provider === 'apple') {
    const m = /^https:\/\/podcasts\.apple\.com\/([a-z]{2}\/podcast\/[^?#\s]+)(\?i=\d+)?/.exec(b.url);
    return m ? `https://embed.podcasts.apple.com/${m[1]}${m[2] ?? ''}` : undefined;
  }
  return undefined;
}

/** The link to watch a video on its own site, at its start time. */
export function videoHref(b: Extract<Block, { kind: 'video' }>): string {
  const t = b.start ? Math.floor(b.start) : 0;
  return b.provider === 'youtube' ? `https://www.youtube.com/watch?v=${b.id}${t ? `&t=${t}s` : ''}` : `https://vimeo.com/${b.id}${t ? `#t=${t}s` : ''}`;
}

export interface Item {
  id: string;
  type: ContentType;
  title: Title;
  creator: string;
  source: { name: string; date: string; url: string };
  minutes?: number;
  why: { text: string; audio?: Audio };
  excerpt?: Excerpt;
  rhyme?: Rhyme;
  media?: Media;
  plate?: Plate;
  marginalia: Marginal[];
  /** Big ideas, for long items (added 2026-10-17). */
  ideas?: Idea[];
  /** The editor's "start here" for a long item (added 2026-10-17). */
  startHere?: StartHere;
  wiki: WikiCard[];
  connections: Connection[];
  /** Rich media: pull quotes, code, video, podcast and audio embeds, pictures (added 2026-10-24). */
  blocks?: Block[];
  /** The year the work was made, when source.date does not say it (the Haul's fingerprint uses it). */
  year?: number;
  /** A post's handle on its platform, e.g. "@visakanv" (social posts). */
  handle?: string;
  /** Who a letter was written to. */
  recipient?: string;
  /** Where a letter was written or a speech given. */
  place?: string;
}

/** The year a work comes from: its own year if given, else the first year in its date, else the rhyme's "then". */
export function itemYear(item: Pick<Item, 'year' | 'source' | 'rhyme'>, fallback?: number): number | undefined {
  if (item.year && Number.isInteger(item.year)) return item.year;
  const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(item.source?.date ?? '');
  if (m) return Number(m[1]);
  const r = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(item.rhyme?.now.year ?? '');
  return r ? Number(r[1]) : fallback;
}

export interface ThreadPoint {
  year: string;
  title: string;
  gist: string;
  edge: string;
  inHaul: boolean;
  itemId?: string;
}

export interface Thread {
  id: string;
  title: Title;
  summary: string;
  points: ThreadPoint[];
  provenance: string;
}

export interface Haul {
  bundleVersion: number;
  number: number;
  version: number;
  title: Title;
  deck: string;
  publishedAt: string;
  swatch: Swatch;
  /** The Haul's edition colour (tokens.ts). Absent: editionOf(number). */
  edition?: Edition;
  /** A public-domain cover plate (optional). */
  cover?: Plate;
  fieldNote: FieldNote;
  items: Item[];
  threads: Thread[];
  colophon: string;
  /** Visible changelog. A correction publishes a new bundle version with an entry here. */
  corrections?: { date: string; text: string }[];
}

export const haulSlug = (n: number) => String(n).padStart(3, '0');

/**
 * The link to the original, naming the person who made it: "Read Amy Scarpignato in The
 * Conversation", "Watch Andrej Karpathy on YouTube · 59:48". The house rule is to name people,
 * never only link them. A rabbit hole is Wikipedia's, so it keeps its own invitation.
 */
export function sourceAction(item: Pick<Item, 'type' | 'creator' | 'source' | 'media' | 'title'>): string {
  if (item.type === 'rabbit-hole') return 'Go down the hole';
  const who = item.creator.trim();
  const where = item.source.name.trim();
  const titled = [item.title.text, item.title.italic].filter(Boolean).join(' ').trim();
  const place = where && where !== titled && where !== who ? where : '';
  // The media label carries a duration ("Watch · 59:48"); keep it after the name.
  const dur = item.media?.label.match(/·\s*(.+)$/)?.[1];
  const media = item.media?.kind;
  const verb = media === 'video' || item.type === 'video' || item.type === 'talk' ? 'Watch' : media === 'audio' || item.type === 'podcast' ? 'Listen to' : 'Read';
  const prep = verb === 'Read' ? 'in' : 'on';
  const subject = who || (verb === 'Read' ? 'the original' : 'it');
  return [`${verb} ${subject}${place ? ` ${prep} ${place}` : ''}`, dur].filter(Boolean).join(' · ');
}
