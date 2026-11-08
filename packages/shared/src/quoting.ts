// How much of a source the magazine quotes, and when a piece is long enough to need its big ideas
// drawn out instead of one excerpt. Shared by the pipeline (what the machine proposes) and the Desk
// (the guide beside the editor's selection).
//
// No statute sets a safe length. Fair dealing in India (s. 52, criticism and review) and fair use in
// the US both weigh how much of the work is taken, whether the quote could stand in for reading the
// original, and whether it serves commentary. So the guide is proportional: a few paragraphs (up to
// 400 words), never more than a fifth of the piece, and always beside the editor's note and a link.
// (Raised from 250 words and about a seventh on 2026-11-08, the editor's call: "bigger quotes".)
// It is a guide shown to the editor, never a block: a public-domain text can be quoted at length.

import type { ContentType } from './tokens';

/** Upper bound on a proposed excerpt, in words, whatever the length of the piece. */
export const EXCERPT_MAX_WORDS = 400;
/** Share of the whole piece an excerpt may take. */
export const EXCERPT_MAX_SHARE = 0.2;
/** Below this, a passage is a line, not an excerpt; short pieces still get this much. */
export const EXCERPT_MIN_WORDS = 50;

/** Words as the Desk and the pipeline both count them. */
export function countWords(s: string): number {
  return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
}

/** The longest excerpt the guide allows for a piece of this many words. */
export function excerptCap(sourceWords: number): number {
  return Math.max(EXCERPT_MIN_WORDS, Math.min(EXCERPT_MAX_WORDS, Math.round(sourceWords * EXCERPT_MAX_SHARE)));
}

export interface ExcerptAdvice {
  words: number;
  cap: number;
  /** Share of the whole piece, 0 to 1. */
  share: number;
  over: boolean;
  message: string;
}

/** Types printed whole: a quotation is its own excerpt, a social post is quoted as a clipping. */
export const QUOTED_WHOLE: ReadonlySet<ContentType> = new Set(['quote', 'social', 'post']);

/** What the Desk says beside an excerpt. Posts and quotations are quoted whole (as an embed would show them). */
export function excerptAdvice(excerpt: string, sourceWords: number, type?: ContentType): ExcerptAdvice {
  const words = countWords(excerpt);
  const cap = excerptCap(sourceWords);
  const share = sourceWords ? words / sourceWords : 0;
  const over = !(type && QUOTED_WHOLE.has(type)) && words > cap;
  const pct = `${Math.round(share * 100)}% of the piece`;
  const message = over
    ? `${words} words, ${pct}. The guide is ${cap} for a piece this long; quote less unless the text is in the public domain.`
    : `${words} words, ${pct}. Within the guide (${cap}).`;
  return { words, cap, share, over, message };
}

/** Types that are heard or read at length, where one excerpt cannot stand for the piece. */
const LONG_FORM: ReadonlySet<ContentType> = new Set(['talk', 'video', 'podcast', 'paper', 'speech']);
/** Types that never get big ideas: a line, a post, a picture, a tool are not arguments to summarise. */
const NO_IDEAS: ReadonlySet<ContentType> = new Set(['quote', 'social', 'image', 'tool']);

/** Draw out the big ideas for long talks, podcasts, videos and papers, or any very long text. */
export function wantsIdeas(type: ContentType, sourceWords: number, minutes?: number | null): boolean {
  if (sourceWords < 1500 || NO_IDEAS.has(type)) return false;
  if (LONG_FORM.has(type)) return (minutes ?? 0) >= 20 || sourceWords >= 3000;
  return sourceWords >= 6000;
}

/**
 * How many ideas the machine proposes: about one per fifteen minutes of talk (2,250 words), at least
 * three, at most twelve (a three-hour podcast). The editor ticks the ones worth printing, usually
 * five to eight; unticked ones cost nothing and never print.
 */
export function ideaCount(sourceWords: number): number {
  return Math.max(3, Math.min(12, Math.round(sourceWords / 2250)));
}

/** "42:06", "1:02:14" or "p. 12": where a reader should start a long piece. */
export const START_AT = /^(?:(?:\d{1,2}:)?\d{1,2}:\d{2}|p\. ?\d{1,4})$/;

/** Seconds into a recording for a time like "1:02:14", or null for a page. */
export function startSeconds(at: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(at.trim());
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/**
 * Whether a caption text is punctuated like prose. Ordinary prose ends a sentence every 80 to 150
 * characters; YouTube's older auto-captions (for example a 2023 talk: one full stop in 64,000
 * characters) have almost none. Two sentence ends per 1,000 characters separates them cleanly.
 */
export function isPunctuated(text: string): boolean {
  if (text.length < 400) return true;
  const ends = text.match(/[.!?](?=\s+[A-Z0-9"“'‘])/g)?.length ?? 0;
  return ends / (text.length / 1000) >= 2;
}
