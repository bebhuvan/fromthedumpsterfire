// The published Haul bundle: the only contract between the publisher and the readers' app and site.
// Bundles are static JSON on R2, so every field here is final, verified copy.

import type { CodeRole, ContentType, Edition, Swatch } from './tokens';
import type { Chart } from './charts/types';

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
  /**
   * The note's words as plain paragraphs: every paragraph, heading and quoted paragraph of `body`,
   * links reduced to their words, embeds left out. Readers without `body` print these; search, feeds
   * and the highlight check read them.
   */
  paragraphs: string[];
  /**
   * The note as the editor set it out (added 2026-11-07): paragraphs with their links and italics,
   * section headings, quotations, and videos, podcasts and X posts set between the paragraphs. Built
   * at publish from the editor's text (fieldnote.ts), only by deleting marks, so the words are theirs;
   * each embed is resolved from the editor's link by code. Absent: print `paragraphs`.
   */
  body?: NoteBlock[];
  /** A sentence from the paragraphs to mark with the highlighter. */
  highlight?: string;
  route: RouteStep[];
}

/** A video, podcast or X post set in the field note, drawn as the same block an item carries. */
export type NoteEmbed = Extract<Block, { kind: 'video' | 'audio' | 'post' }>;
export const NOTE_EMBED_KINDS: readonly NoteEmbed['kind'][] = ['video', 'audio', 'post'];

/** One piece of a field note's body, in reading order. */
/** One piece of an item note's body: a paragraph or a quotation from the item's source. */
export type ItemNoteBlock = Extract<NoteBlock, { kind: 'paragraph' | 'quotation' }>;

export type NoteBlock =
  | { kind: 'paragraph'; runs: NoteRun[] }
  | { kind: 'heading'; text: string }
  | { kind: 'quotation'; paragraphs: NoteRun[][] }
  | NoteEmbed;

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
  /**
   * The page the note was checked against: a Wikipedia card's article (added 2026-10-31) or, from
   * 2026-11-14, a whole article or page the Desk fetched for the note (`isNoteUrl`). `cite` names it.
   */
  url?: string;
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
 * a model. Optional; older bundles have none (added 2026-10-24). A chart carries its data rows and is
 * drawn from them; its rules are in charts/validate.ts (added 2026-10-25).
 */
export type Block =
  | { kind: 'quote'; text: string; locator?: string }
  | { kind: 'code'; code: string; lang?: string; caption?: string; tokens?: CodeToken[] }
  | { kind: 'video'; provider: 'youtube' | 'vimeo'; id: string; title: string; start?: number; poster?: { url: string; width: number; height: number } }
  | { kind: 'audio'; provider: 'file' | 'spotify' | 'apple'; url: string; title: string; start?: number; seconds?: number }
  | { kind: 'image'; plate: Plate }
  | { kind: 'chart'; chart: Chart; images?: ChartImages }
  | PostBlock;
export type BlockKind = Block['kind'];
export const BLOCK_KINDS: readonly BlockKind[] = ['quote', 'code', 'video', 'audio', 'image', 'chart', 'post'];

/**
 * A social post set inside another item (added 2026-10-31): the words as the platform's own public
 * record gives them (X's oEmbed), who posted it and when, and the link to it. Drawn as a clipping by
 * the site and the app, never the platform's embed or script. `truncated` when the platform's record
 * stops short of the whole post (X ends long posts with "…"); readers are sent to the post for the rest.
 */
export type PostBlock = {
  kind: 'post';
  platform: 'x';
  url: string;
  author: string;
  handle: string;
  date?: string;
  text: string;
  truncated?: boolean;
};

/** An X post's canonical address, https://x.com/<handle>/status/<id>, or null for anything else. */
export function xPostUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|mobile)\./, '');
  if (host !== 'x.com' && host !== 'twitter.com') return null;
  const m = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})\/?$/.exec(u.pathname.replace(/\/(photo|video)\/\d+\/?$/, ''));
  return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
}

/**
 * A chart's pictures for the app, which has no SVG: the phone figure drawn from the same scene as the
 * website's SVG, at three times its size, once per theme, copied next to the bundle at publish.
 * The website draws the chart itself from the rows (added 2026-10-25).
 */
export interface ChartImages {
  light: { url: string; width: number; height: number };
  dark: { url: string; width: number; height: number };
  /** The share card (added 2026-10-26): the chart whole with its title and credit, for social posts. */
  share?: { url: string; width: number; height: number };
}

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

/**
 * Lives (added 2026-10-27): a profile of one person, written by a model from named, fetched sources.
 * Machine prose throughout, so every factual line carries citations to the sources listed with it;
 * the Desk checked each citation word for word against the stored text (and every figure in the line
 * against its quotes) before the editor approved the profile. The quotes themselves stay on the Desk:
 * the bundle carries where each line comes from, not a second copy of the books (see life.ts).
 */
export interface LifeCite {
  /** The id of one of life.sources. */
  source: string;
  /** Where in it: a chapter, page or section, as a reader would look it up. */
  at?: string;
}

/** One machine sentence or caption and where it comes from. Nothing uncited ships. */
export interface LifeLine {
  text: string;
  cites: LifeCite[];
}

export interface LifeSource {
  id: string;
  /** Who made it, named: "Ramachandra Guha", "Election Commission of India". */
  author: string;
  title: string;
  /** Book, report, article or reference: set in italic when it is a whole work. */
  kind: 'book' | 'report' | 'article' | 'reference';
  publisher?: string;
  year?: string;
  /** Where the text was read (fetched by code), e.g. an extract reproduced by a magazine. */
  url: string;
  /** How it was read when that is not the work itself: "An extract at The Caravan, 2014". */
  via?: string;
  /** The work itself, to buy or borrow, when the text was read elsewhere. */
  workUrl?: string;
}

/** A book or document for the reader to go on to. Named, never only linked. */
export interface LifeReading {
  author: string;
  title: string;
  kind: LifeSource['kind'];
  publisher?: string;
  year?: string;
  url?: string;
}

/**
 * The shape of a Life, over the type of its lines and citations: the bundle's Life below, and the
 * Desk's draft (life.ts), whose lines carry their verbatim quotes and the editor's ticks.
 */
export interface LifeShape<L, C> {
  /** The person, as they are known. */
  name: string;
  born?: { year: number; place?: string; cites: C[] };
  died?: { year: number; place?: string; cites: C[] };
  /** One line saying who they were: "India's first Chief Election Commissioner". */
  epithet: L;
  /** The profile in short titled sections. Headings are labels and carry no facts or figures. */
  sections: Array<{ heading: string; paragraphs: L[][] }>;
  /** The person's own words, verbatim as a source records them: the page's pull quote. */
  words?: { text: string; context: L; cites: C[] };
  /** A life in dates. */
  dates: Array<{ year: string; line: L }>;
  /** A few numbers, each traced to its source: "176 million" over what it counts. */
  figures?: { title: string; rows: Array<{ value: string; line: L }> };
  sources: LifeSource[];
  reading: LifeReading[];
  /** The model that wrote it, as the label names it: "Claude". */
  writer: string;
}

export type Life = LifeShape<LifeLine, LifeCite>;

export interface Item {
  id: string;
  type: ContentType;
  title: Title;
  creator: string;
  source: { name: string; date: string; url: string };
  minutes?: number;
  /**
   * The editor's note. `text` is the plain words (links lifted out into `links`); `body`, when the
   * note sets out quotations or italic titles (added 2026-11-08), is the note as written: paragraphs
   * and quotations, each quotation matched word for word against the item's source at publish.
   */
  why: { text: string; audio?: Audio; links?: NoteLink[]; body?: ItemNoteBlock[] };
  excerpt?: Excerpt;
  rhyme?: Rhyme;
  media?: Media;
  plate?: Plate;
  /** Its share card (1200 x 630 PNG on the files host), drawn by the Desk at publish (added 2026-10-31). */
  card?: { url: string; width: number; height: number };
  marginalia: Marginal[];
  /** Big ideas, for long items (added 2026-10-17). */
  ideas?: Idea[];
  /** The editor's "start here" for a long item (added 2026-10-17). */
  startHere?: StartHere;
  wiki: WikiCard[];
  connections: Connection[];
  /** Rich media: pull quotes, code, video, podcast and audio embeds, pictures (added 2026-10-24), charts (2026-10-25). */
  blocks?: Block[];
  /** The year the work was made, when source.date does not say it (the Haul's fingerprint uses it). */
  year?: number;
  /** A post's handle on its platform, e.g. "@visakanv" (social posts). */
  handle?: string;
  /** Who a letter was written to. */
  recipient?: string;
  /** Where a letter was written or a speech given. */
  place?: string;
  /** For a book: its id on the shelf (shelf.ts), where the editor's notes on it live. */
  shelf?: string;
  /** For a Life: the profile (added 2026-10-27). Its portrait, if one cleared the credit rule, is the item's plate. */
  life?: Life;
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
  /**
   * The Haul's share card (1200x630 PNG): its number, title and fingerprint, drawn by the Desk in the
   * editor's browser at publish and copied next to the bundle. Link previews use it (added 2026-10-24).
   */
  card?: { url: string; width: number; height: number };
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
  // A source named after its maker ("W. B. Yeats, Michael Robartes and the Dancer") names the maker once.
  const named = item.source.name.trim();
  const where = who && named.startsWith(`${who}, `) ? named.slice(who.length + 2) : named;
  const titled = [item.title.text, item.title.italic].filter(Boolean).join(' ').trim();
  const place = where && where !== titled && where !== who ? where : '';
  const url = item.media?.url ?? item.source.url;
  // Things that are not read: a tool is visited, a picture seen, a book looked up.
  if (item.type === 'tool') return `Visit ${titled}`;
  if (item.type === 'life') return place ? `Read ${who ? `${who}’s ` : ''}${place}` : 'The sources';
  if (item.type === 'chart') return place ? `The data at ${place}` : 'The data behind the chart';
  if (item.type === 'image') return place ? `See it in ${place}` : 'See the original';
  if (item.type === 'book') return place ? `The book at ${place}` : 'More on the book';
  if (item.type === 'quote') return place ? `Where ${who || 'it'} said it: ${place}` : 'Where it comes from';
  if (item.type === 'letter') return place ? `Read the letter at ${place}` : 'Read the whole letter';
  if (item.type === 'social') return `Read ${who ? `${who}’s` : 'the'} post${place ? ` on ${place}` : ''}`;
  // The media label carries a duration ("Watch · 59:48"); keep it after the name.
  const dur = item.media?.label.match(/·\s*(.+)$/)?.[1];
  const media = item.media?.kind;
  const host = /^https?:\/\/([^/]+)/.exec(url)?.[1]?.replace(/^www\./, '') ?? '';
  const watchHost = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host);
  const listenHost = /(^|\.)(open\.spotify\.com|podcasts\.apple\.com)$/.test(host);
  const verb =
    media === 'video' || item.type === 'video' || item.type === 'talk' || watchHost
      ? 'Watch'
      : media === 'audio' || item.type === 'podcast' || listenHost
        ? 'Listen to'
        : 'Read';
  const prep = verb === 'Read' ? 'in' : 'on';
  const subject = who || (verb === 'Read' ? 'the original' : 'it');
  const venue = watchHost && verb === 'Watch' && !/youtube|vimeo/i.test(place) ? (host.includes('vimeo') ? 'Vimeo' : 'YouTube') : place;
  return [`${verb} ${subject}${venue ? ` ${prep} ${venue}` : ''}`, dur].filter(Boolean).join(' · ');
}

/**
 * The credit line under a picture: who made it, who holds it, the licence. The house rule is to
 * name people; the link to where it came from (plate.sourceUrl) goes beside it.
 */
export function creditLine(plate: Pick<Plate, 'credit' | 'licence' | 'creator' | 'date'>, opts: { maker?: string; noBy?: boolean } = {}): string {
  const by = opts.noBy ? '' : (plate.creator || opts.maker || '').trim();
  const holder = plate.credit.trim() && plate.credit.trim() !== by ? plate.credit.trim() : '';
  const licence = plate.licence.charAt(0).toUpperCase() + plate.licence.slice(1);
  // "Unknown photographer, 1953." reads as a credit; "By Unknown photographer" does not.
  const made = by ? `${/^(unknown|anonymous)\b/i.test(by) ? by.charAt(0).toUpperCase() + by.slice(1) : `By ${by}`}${plate.date ? `, ${plate.date}` : ''}.` : '';
  return [made, holder ? `${holder}.` : '', `${licence}.`].filter(Boolean).join(' ');
}

/** A link in the editor's note: words that appear in the note, and the address the editor gave them. */
export interface NoteLink {
  text: string;
  url: string;
}

/** One stretch of a note's paragraph; `url` when those words are a link. */
export interface NoteRun {
  text: string;
  url?: string;
  /** Set in italic: a title the editor wrote between asterisks (field notes, added 2026-11-07). */
  em?: boolean;
}

// A link written into the note itself: "words" (https://…) or [words](https://…).
const INLINE_LINK = /"([^"\n]{1,200})"\s*\((https?:\/\/[^\s()]+)\)|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s()]+)\)/g;

/**
 * The editor's note with any links written into it lifted out: the words stay, the quote marks,
 * brackets and address around them go. Only deletes, so the editor's words are never changed.
 */
export function noteLinks(text: string): { text: string; links: NoteLink[] } {
  const links: NoteLink[] = [];
  const out = text.replace(INLINE_LINK, (_m, qa: string | undefined, qu: string | undefined, ma: string | undefined, mu: string | undefined) => {
    const words = (qa ?? ma ?? '').trim();
    links.push({ text: words, url: (qu ?? mu)! });
    return words;
  });
  return { text: out, links };
}

/** The note as plain words (for descriptions, captions and search), links reduced to their words. */
export const notePlain = (why: Pick<Item['why'], 'text'>) => noteLinks(why.text).text;

/**
 * The note as the reader sees it: paragraphs (split on a blank line) of runs, the linked words marked
 * with their address. Links come from `why.links` and, for notes written before that field, from the
 * text itself. Each link marks the first place its words appear, once. Only http and https addresses
 * become links.
 */
export function noteParagraphs(why: Pick<Item['why'], 'text' | 'links'>): NoteRun[][] {
  const lifted = noteLinks(why.text);
  const links = [...(why.links ?? []), ...lifted.links].filter((l) => l.text && /^https?:\/\//i.test(l.url));
  const used = new Set<NoteLink>();
  return lifted.text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((para) => {
      const runs: NoteRun[] = [];
      let rest = para;
      for (;;) {
        let first: { at: number; link: NoteLink } | undefined;
        for (const link of links) {
          if (used.has(link)) continue;
          const at = rest.indexOf(link.text);
          if (at >= 0 && (!first || at < first.at)) first = { at, link };
        }
        if (!first) break;
        used.add(first.link);
        if (first.at) runs.push({ text: rest.slice(0, first.at) });
        runs.push({ text: first.link.text, url: first.link.url });
        rest = rest.slice(first.at + first.link.text.length);
      }
      if (rest) runs.push({ text: rest });
      return runs;
    });
}

/** The note as blocks: its body when it has one, else its paragraphs (with their links). */
export function noteBlocks(why: Pick<Item['why'], 'text' | 'links' | 'body'>): ItemNoteBlock[] {
  return why.body ?? noteParagraphs(why).map((runs) => ({ kind: 'paragraph' as const, runs }));
}

/**
 * Straight quotation marks set as curly ones, for display only: the stored words stay as they were
 * matched (the verbatim check already reads both forms as the same). An apostrophe inside a word
 * becomes ’; a mark, double or single, opens after a space or bracket and closes elsewhere.
 */
export function curlQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{—–-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(\p{L})'(\p{L})/gu, '$1’$2')
    .replace(/(\p{L}s)'(?=\s|[.,;:!?)]|$)/gu, '$1’')
    .replace(/(^|[\s([{—–“-])'(?=\p{L})/gu, '$1‘')
    .replace(/'/g, '’');
}

/** How long a quotation runs: a line or two is set large, a paragraph as a pull quote, more as an extract. */
export function quoteLength(text: string): 'short' | 'medium' | 'long' {
  const words = text.split(/\s+/).filter(Boolean).length;
  return words <= 30 ? 'short' : words <= 80 ? 'medium' : 'long';
}

/**
 * How a transcript sets the speaker's words: a line or two large, in display type past the column;
 * anything longer as an extract (reading size, opening mark, rule, credit). Five paragraphs of Caro in
 * 46px display serif read as a wall of the editor's type (Haul 002). Shared with the app.
 */
export function speechSetting(text: string): 'line' | 'extract' {
  return quoteLength(text) === 'short' ? 'line' : 'extract';
}

/**
 * A long quotation's lead: the words set large before the rest follows in the reading type. The
 * editor's highlight when it opens the quotation, else the opening clauses up to a comma or semicolon
 * once there are eight words or more (never past thirty). `lead + rest` is always the whole text, so
 * nothing is cut or changed; with no clean break there is no lead.
 */
export function quoteLead(text: string, highlight?: string): { lead: string; rest: string } | null {
  const t = text.trimStart();
  if (highlight && t.startsWith(highlight) && highlight.split(/\s+/).length <= 30) return { lead: highlight, rest: t.slice(highlight.length) };
  const re = /[,;:—](?=\s)|[.!?](?=\s)/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const words = t.slice(0, m.index + 1).split(/\s+/).length;
    if (words > 30) break;
    if (words >= 8) return { lead: t.slice(0, m.index + 1), rest: t.slice(m.index + 1) };
  }
  return null;
}

/**
 * A short sample of a passage for a preview (the cover's specimens, 2026-11-10): its first sentence,
 * whole, when that is 40 words or fewer; else its opening clauses (quoteLead); else its first 30 words.
 * `cut` says the passage goes on; `ellipsis` says the sample stops mid-sentence, the only time a
 * preview should end on "…" (a whole sentence ends on its own stop). Words are never changed, only
 * where the sample stops. Shared by the website and the app so both show the same line.
 */
export function quoteSample(text: string, maxWords = 40): { text: string; cut: boolean; ellipsis: boolean } {
  const s = sample(text, maxWords);
  return { ...s, ellipsis: s.cut && !/[.!?]["'”’)]*$/.test(s.text) };
}

function sample(text: string, maxWords: number): { text: string; cut: boolean } {
  const t = text.trim().replace(/\s*\n\s*/g, ' ');
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  // The first real sentence end: not after a lone letter ("Q.", "A.", an initial) and not before four
  // words (a transcript's "Q." once became the whole sample).
  const ends = /[.!?]["'”’)]*(?=\s+["“‘(]?[A-Z0-9]|\s*$)/g;
  let first = t;
  for (let m = ends.exec(t); m; m = ends.exec(t)) {
    const upto = t.slice(0, m.index + m[0].length);
    if (/(?:^|\s)[A-Za-z]\.$/.test(t.slice(0, m.index + 1)) || count(upto) < 4) continue;
    first = upto;
    break;
  }
  if (count(first) <= maxWords) return { text: first, cut: first.length < t.length };
  const lead = quoteLead(t);
  if (lead) return { text: lead.lead, cut: true };
  return { text: t.split(/\s+/).slice(0, 30).join(' '), cut: true };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A source's date as a reader says it: a machine timestamp ("2026-10-24T19:40:00 JST+0900",
 * "2026-10-24") becomes "24 October 2026", read in the source's own day (no time-zone shift); any
 * date already written for people ("1859", "Autumn 1892", "22 October 2026") is left as it is.
 */
export function sourceDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?(?:\s*[A-Z]{2,5}(?:[+-]\d{2}:?\d{2})?)?)?$/.exec(date.trim());
  if (!m) return date;
  const month = MONTH_NAMES[Number(m[2]) - 1];
  const day = Number(m[3]);
  return month && day >= 1 && day <= 31 ? `${day} ${month} ${m[1]}` : date;
}

/** A bundle with every source date said as a reader says it (sourceDate); for bundles published before it. */
export function tidyDates<T extends { items: { source: { date: string } }[] }>(haul: T): T {
  for (const item of haul.items) item.source.date = sourceDate(item.source.date);
  return haul;
}

/**
 * A quotation's lead set one clause to a line when it falls into short clauses ("It was the best of
 * times, / it was the worst of times,"): two to four clauses, each at most thirty characters, broken
 * after a comma, semicolon or colon. Display only: the lines joined with spaces are the lead. Null when
 * the lead does not fall that way, and it wraps as prose. `longest` sizes the type to fill the measure.
 */
export function leadLines(lead: string): { lines: string[]; longest: number } | null {
  const lines = (lead.match(/[^,;:]+(?:[,;:]+|$)/g) ?? []).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 4 || lines.join(' ') !== lead.trim().replace(/\s+/g, ' ')) return null;
  const longest = Math.max(...lines.map((l) => l.length));
  return longest <= 30 ? { lines, longest } : null;
}
