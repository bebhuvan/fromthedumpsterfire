// The published Haul bundle: the only contract between the publisher and the readers' app and site.
// Bundles are static JSON on R2, so every field here is final, verified copy.

import type { ContentType, Swatch } from './tokens';

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
  wiki: WikiCard[];
  connections: Connection[];
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
