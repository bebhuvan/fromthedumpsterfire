// The published Haul bundle: the only contract between the publisher and the readers' app and site.
// Bundles are static JSON on R2, so every field here is final, verified copy.

import type { ContentType, Swatch } from './tokens';

export const BUNDLE_VERSION = 1;

/** A title whose last phrase is set in italic, e.g. "What cheap things" + "cost". */
export interface Title {
  text: string;
  italic?: string;
}

export interface Audio {
  url: string;
  seconds: number;
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

export interface Plate {
  url: string;
  width: number;
  height: number;
  caption: string;
  credit: string;
  licence: string;
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
  fieldNote: FieldNote;
  items: Item[];
  threads: Thread[];
  colophon: string;
}

export const haulSlug = (n: number) => String(n).padStart(3, '0');
