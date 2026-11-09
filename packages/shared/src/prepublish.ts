// Where an item stands (on the Desk, in a Haul, published) and what is wrong or doubtful about it
// before its Haul goes out. Pure functions: the Desk Worker runs them over what it has stored, and
// the Desk shows the results with a link to the place each one is fixed. None of them blocks a
// publish (publish.ts and validateHaul decide that); they catch what the editor would want to know.

import { noteParts } from './fieldnote';
import { haulSlug } from './haul';
import type { ContentType } from './tokens';
import { normalisedForMatch } from './verbatim';

// ---------------------------------------------------------------- where it stands

export interface StandingInput {
  archived: boolean;
  haul: { number: number; status: 'draft' | 'published'; version: number } | null;
  /** The latest published version of its Haul that carries the item, if any. */
  publishedIn: number | null;
}

export interface Standing {
  state: 'desk' | 'archived' | 'haul' | 'published' | 'next-version';
  text: string;
  detail?: string;
}

export function itemStanding({ archived, haul, publishedIn }: StandingInput): Standing {
  if (!haul) return archived ? { state: 'archived', text: 'Archived, not in a Haul' } : { state: 'desk', text: 'On the Desk, not in a Haul' };
  const name = `Haul ${haulSlug(haul.number)}`;
  if (haul.status !== 'published') return { state: 'haul', text: `In ${name}, not yet published` };
  if (publishedIn == null)
    return { state: 'next-version', text: `In ${name}, not yet published`, detail: `${name} is out; this item reaches readers when you publish a correction.` };
  return { state: 'published', text: `Published in ${name}, version ${publishedIn}`, detail: 'Changes you make now reach readers only when you publish a correction.' };
}

// ---------------------------------------------------------------- before publishing

export interface ItemForCheck {
  title: string;
  type: ContentType;
  creator: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  year: number | null;
  url: string | null;
  minutes: number | null;
  why: string;
  source: { text: string; wordCount: number } | null;
  /** Wikipedia cards the editor ticked: these print. */
  keptCards: Array<{ id: string; title: string; extract: string }>;
  pending: { notes: number; ideas: number; cards: number };
}

/** Where the editor fixes it: a part of the item page, or the Haul's suggestions page. */
export type FixAt = 'details' | 'why' | 'source' | 'notes' | 'suggestions';

export interface Issue {
  kind: 'maker' | 'quotation' | 'teaser' | 'date' | 'wiki' | 'unticked';
  /** 'wrong' should be fixed before publishing; 'doubt' is worth a look. */
  severity: 'wrong' | 'doubt';
  message: string;
  fix: FixAt;
}

export function itemIssues(it: ItemForCheck): Issue[] {
  const src = it.source?.text ? normalisedForMatch(it.source.text) : '';
  return [...makerIssues(it), ...dateIssues(it), ...teaserIssues(it), ...quotationIssues(it.why, src), ...wikiIssues(it, src), ...untickedIssues(it.pending)];
}

/** Where things are published, not who made them. Lowercase, compared after folding. */
const PLATFORMS = new Set(
  [
    'substack', 'medium', 'youtube', 'wordpress', 'blogspot', 'blogger', 'ghost', 'tumblr', 'x', 'twitter', 'instagram', 'facebook',
    'tiktok', 'threads', 'bluesky', 'mastodon', 'linkedin', 'reddit', 'spotify', 'apple podcasts', 'soundcloud', 'vimeo', 'wikipedia',
    'wikimedia commons', 'internet archive', 'archive.org', 'github', 'hacker news', 'buttondown', 'beehiiv', 'patreon', 'google',
    'google books', 'project gutenberg', 'jstor', 'arxiv', 'ssrn', 'scribd', 'pdf',
  ],
);

const fold = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}.]+/gu, ' ').trim();

function hostLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).hostname.replace(/^www\./, '').split('.');
    return parts.length > 2 && parts.at(-2) !== 'co' ? parts.at(-2)! : parts[0]!;
  } catch {
    return null;
  }
}

function makerIssues(it: ItemForCheck): Issue[] {
  const who = it.creator?.trim() ?? '';
  if (!who) return [{ kind: 'maker', severity: 'wrong', message: 'No maker named. Every work names the person who made it.', fix: 'details' }];
  const f = fold(who);
  const host = hostLabel(it.url);
  if (PLATFORMS.has(f) || /\.(com|org|net|io|co|in|substack)\b/.test(f) || (host && who.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === host.replace(/-/g, '')))
    return [{ kind: 'maker', severity: 'wrong', message: `Credited to "${who}", which is where it was published, not who made it. Name the author.`, fix: 'details' }];
  if (it.sourceName && fold(it.sourceName) === f)
    return [{ kind: 'maker', severity: 'doubt', message: `The maker and the source are both "${who}". Is that a person, or the publication?`, fix: 'details' }];
  return [];
}

function dateIssues(it: ItemForCheck): Issue[] {
  if (it.sourceDate?.trim() || it.year != null) return [];
  return [{ kind: 'date', severity: 'wrong', message: 'No date. The piece prints with when it was made or published.', fix: 'details' }];
}

/** What a paywall or sign-up wall leaves in place of the piece. */
const TEASER =
  /subscribe to (?:continue|keep) reading|this post is for paid subscribers|keep reading with a \d+-day free trial|already (?:a|have an?) (?:paid )?(?:subscriber|account)\?\s*(?:sign|log) in|(?:become|upgrade to) a (?:paid )?(?:member|subscriber) to (?:read|continue|unlock)|to continue reading,? (?:please )?(?:subscribe|sign in|log in|register)|reached your (?:free )?(?:article|story) limit|create a free account to (?:continue|keep) reading|this (?:article|story) is for (?:subscribers|members) only|members-only (?:post|story)/i;

/** Article-like types, where a short fetch usually means only the opening came through. */
const PROSE: ReadonlySet<ContentType> = new Set(['essay', 'post', 'paper']);

function teaserIssues(it: ItemForCheck): Issue[] {
  if (!it.source) return [];
  const m = TEASER.exec(it.source.text);
  if (m)
    return [{ kind: 'teaser', severity: 'wrong', message: `The stored text looks like a paywall's teaser ("${m[0]}"), not the whole piece. Read it from your library copy, paste the text, or upload a PDF.`, fix: 'source' }];
  const expected = (it.minutes ?? 0) * 200;
  if (PROSE.has(it.type) && expected > 0 && it.source.wordCount < expected / 2)
    return [{ kind: 'teaser', severity: 'doubt', message: `Only ${it.source.wordCount.toLocaleString('en-IN')} words were fetched for a ${it.minutes}-minute read. Is it the whole piece?`, fix: 'source' }];
  return [];
}

const wordsIn = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
const QUOTED = /["“”‘’]/;

/**
 * A quotation from the piece set as a plain paragraph prints as the editor's own words. A whole
 * paragraph found word for word in the source is wrong; a long sentence found there, outside
 * quotation marks, is a doubt. `src` is the source already normalised for matching.
 */
export function quotationIssues(why: string, src: string): Issue[] {
  if (!src || !why.trim()) return [];
  const out: Issue[] = [];
  for (const p of noteParts(why)) {
    if (p.kind !== 'paragraph') continue;
    const bare = p.text.replace(/^["“'‘]+|["”'’]+$/g, '').trim();
    if (wordsIn(bare) >= 8 && src.includes(normalisedForMatch(bare))) {
      out.push({ kind: 'quotation', severity: 'wrong', message: `"${clip(bare)}" is word for word from the piece but set as your words. Start the line with "> " so it prints as a quotation.`, fix: 'why' });
      continue;
    }
    for (const s of p.text.split(/(?<=[.!?])\s+(?=[\p{Lu}"“])/u)) {
      if (wordsIn(s) < 12 || QUOTED.test(s.replace(/(?<=\p{L})[’'](?=\p{L})/gu, ''))) continue;
      if (src.includes(normalisedForMatch(s))) {
        out.push({ kind: 'quotation', severity: 'doubt', message: `"${clip(s)}" reads word for word from the piece. If you are quoting it, put it in quotation marks or on a "> " line.`, fix: 'why' });
      }
    }
  }
  return out;
}

const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'list', 'history', 'film', 'book', 'novel', 'song', 'album']);

function wikiIssues(it: ItemForCheck, src: string): Issue[] {
  const out: Issue[] = [];
  const context = `${src} ${normalisedForMatch(`${it.why} ${it.title}`)}`;
  for (const c of it.keptCards) {
    if (/\(disambiguation\)/i.test(c.title) || /\bmay (?:also )?refer to\b/i.test(c.extract)) {
      out.push({ kind: 'wiki', severity: 'wrong', message: `The Wikipedia card "${c.title}" is a list of meanings, not an article. Untick it or add the specific article.`, fix: 'notes' });
      continue;
    }
    const words = normalisedForMatch(c.title.replace(/\s*\(.*?\)\s*/g, ' '))
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.length && !words.some((w) => context.includes(w)))
      out.push({ kind: 'wiki', severity: 'doubt', message: `The Wikipedia card "${c.title}" is not mentioned in the piece or your note. Is it on topic?`, fix: 'notes' });
  }
  return out;
}

function untickedIssues(p: ItemForCheck['pending']): Issue[] {
  const parts = [
    p.notes && `${p.notes} margin note${p.notes === 1 ? '' : 's'}`,
    p.ideas && `${p.ideas} big idea${p.ideas === 1 ? '' : 's'}`,
    p.cards && `${p.cards} Wikipedia card${p.cards === 1 ? '' : 's'}`,
  ].filter((x): x is string => Boolean(x));
  if (!parts.length) return [];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]!;
  const n = p.notes + p.ideas + p.cards;
  return [{ kind: 'unticked', severity: 'doubt', message: `${list} ${n === 1 ? 'is' : 'are'} waiting for a tick. Only ticked ones print.`, fix: 'suggestions' }];
}

// ---------------------------------------------------------------- the publish check, in plain words

/** A bundle path from validateHaul ("items[2].why.text") as a place the editor knows. */
export function plainPath(path: string): { item?: number; where: string } {
  const m = /^items\[(\d+)\]\.?(.*)$/.exec(path);
  if (m) return { item: Number(m[1]), where: ITEM_FIELDS.find(([re]) => re.test(m[2]!))?.[1] ?? m[2]! };
  return { where: HAUL_FIELDS.find(([re]) => re.test(path))?.[1] ?? path };
}

const ITEM_FIELDS: Array<[RegExp, string]> = [
  [/^why/, 'your note'],
  [/^excerpt/, 'the excerpt'],
  [/^title/, 'the title'],
  [/^creator/, 'the maker'],
  [/^source\.date/, 'the date'],
  [/^source/, 'the source'],
  [/^plate/, 'the plate'],
  [/^marginalia/, 'a margin note'],
  [/^ideas/, 'a big idea'],
  [/^blocks/, 'something added to the item'],
];

const HAUL_FIELDS: Array<[RegExp, string]> = [
  [/^title/, 'The cover title'],
  [/^deck/, 'The deck'],
  [/^fieldNote\.title/, "The field note's title"],
  [/^fieldNote/, 'The field note'],
  [/^cover/, 'The cover plate'],
  [/^route/, 'The route'],
  [/^threads/, 'A thread'],
];
