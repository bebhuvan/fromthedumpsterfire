// Publish: assemble a Haul bundle from D1, gate it on every item's checks and the bundle
// invariants (packages/shared/src/validate.ts), then write hauls/NNN/vN/haul.json and the index to
// R2. A correction is a new version with a corrections entry; versions are never overwritten.
//
// Two buckets: MEDIA is private (uploads, voice notes, snapshots, chosen plates, book covers); FILES is
// public and holds only published bundles under hauls/, the shelf under shelf/ and data stories under data/. This module is the
// only writer to FILES: it copies the voice notes, plates, video posters, pictures and covers a bundle
// needs from MEDIA into FILES next to it, writes the share card and the charts' app pictures the Desk
// (or the terminal) drew, then writes the bundle and the index (or shelf/shelf.json, or a data
// story and data/index.json). It never writes hauls/, shelf/ or data/ to MEDIA.

import type { Audio, AudioFormat, Haul, HaulIndex, HaulSummary, Item, Plate, Rhyme, RouteStep, Thread, Title } from '@fdf/shared/haul';
import { AUDIO_FORMATS, PLAYS_ON_IOS, sourceDate } from '@fdf/shared/haul';
import { itemNote } from '@fdf/shared/fieldnote';
import { checkStyle } from '@fdf/shared/style';
import { findQuotation, isVerbatimAt } from '@fdf/shared/verbatim';
import { BUNDLE_VERSION, haulSlug } from '@fdf/shared/haul';
import { editionOf, type ContentType, type Swatch } from '@fdf/shared/tokens';
import { validateHaul, type BundleIssue } from '@fdf/shared/validate';
import type { Env } from './env';
import type { CheckRow, DraftRow, ExcerptRow, HaulRow, ItemRow, MarginalBody, NoteRow, WikiRow } from './db';
import { dateIst, nowIso, parseJson, sha256Hex, slugify } from './util';
import { imageSize, plateForBundle, type PlateRow } from './plates';
import { formatOfNote } from './voice';
import { threadsForHaul } from './connect';
import { blocksFor, blocksForBundle, type ChartPictures } from './blocks';
import { fieldNoteForBundle, type FieldNoteEmbeds } from './fieldnote';
import { drawChartPictures, type ChartDrawer } from './chartdraw';
import { chartKey, validateChart, type Chart } from '@fdf/shared/charts';
import { isPunctuated, startSeconds } from '@fdf/shared/quoting';
import {
  DATA_INDEX_PATH,
  indexEntry,
  STORY_BUNDLE_VERSION,
  STORY_SLUG,
  storyPath,
  validateDataIndex,
  validatePublishedStory,
  type DataIndex,
  type PublishedStory,
  type StoryHaul,
  picturePath,
  type StoryPicture,
} from '@fdf/shared/stories/published';
import { phonePicture, PICTURE_ZOOM, validateStory, type Story } from '@fdf/shared/stories';
import { sceneToSvg } from '@fdf/shared/charts';
import { SHELF_PATH, SHELF_VERSION, shelfOrder, validateShelf, type BookNote, type Shelf, type ShelfBook } from '@fdf/shared/shelf';
import { bookTitle, bookTitleText, linesFor, notesFor, shelfChanges, type BookRow } from './shelf';
import { lifeForBundle } from './lives';
import type { Life } from '@fdf/shared/haul';

/** Sources that are transcripts of speech, where punctuation decides whether a quote is printable. */
const TRANSCRIPTS = new Set(['captions-auto', 'captions', 'transcript', 'whisper']);

export const INDEX_PATH = 'hauls/index.json';

/** Item ids the website reserves for its own routes (/haul/1/note, /haul/1/thread/...). */
export const RESERVED_ITEM_IDS = new Set(['note', 'thread']);

/** Little words an item's address never ends on ("…hope-of-a-new" reads as cut off). */
const SLUG_TAIL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with']);
const ITEM_SLUG_MAX = 80;

/**
 * A bundle item id from a title, never one of the reserved route words. A title that fits keeps
 * every word; a longer one keeps its head before a colon or full stop when that says enough
 * ("anatomy-of-a-frontier-lab-agent-intrusion"), else is cut at a word and never ends on a little word.
 */
export function itemSlug(title: string): string {
  let s = slugify(title, ITEM_SLUG_MAX);
  if (slugify(title, 1000).length > ITEM_SLUG_MAX) {
    const head = title.split(/[:.?!;—–]\s/)[0] ?? title;
    const h = slugify(head, ITEM_SLUG_MAX);
    if (head !== title && h.split('-').length >= 3) s = h;
    const words = s.split('-');
    while (words.length > 1 && SLUG_TAIL_WORDS.has(words.at(-1)!)) words.pop();
    s = words.join('-');
  }
  return RESERVED_ITEM_IDS.has(s) ? `${s}-item` : s;
}

export interface PublishProblem {
  itemId?: string;
  itemTitle?: string;
  message: string;
}

export interface Assembled {
  haul: Haul;
  index: HaulIndex;
  problems: PublishProblem[];
  bundleErrors: BundleIssue[];
  warnings: BundleIssue[];
  /** Files to copy next to the bundle: [private MEDIA key, public FILES key under hauls/]. */
  copies: Array<[string, string]>;
  /** The share card to write next to the bundle, when the Desk sent a valid one. */
  card?: { key: string; bytes: Uint8Array };
  /** The app's chart pictures to write next to the bundle: [FILES key, PNG bytes]. */
  pictures: Array<[string, Uint8Array]>;
  /** The Desk items the bundle carries (recorded with the version, so each item knows it is published). */
  itemIds: string[];
}

/** The share card's size (Open Graph's 1.91:1). */
export const CARD_SIZE = { width: 1200, height: 630 } as const;
const CARD_MAX_BYTES = 2 * 1024 * 1024;

const DEFAULT_COLOPHON =
  'Chosen and annotated by Bhuvanesh, mostly by voice. Read, cross-linked and drafted with language models, then checked by hand. The serif is the editor; the blue sans is the machine. Every quotation was matched against its source and every link was fetched before publishing.';

export const defaultColophon = () => DEFAULT_COLOPHON;

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** A path a Haul publish may write in the public bucket: only under hauls/. */
export const isHaulPath = (key: string) => key.startsWith('hauls/') && !key.includes('..');
/** A path a shelf publish may write in the public bucket: only under shelf/. */
export const isShelfPath = (key: string) => key.startsWith('shelf/') && !key.includes('..');
/** A path a data story publish may write in the public bucket: only under data/. */
export const isStoryPath = (key: string) => key.startsWith('data/') && !key.includes('..');
/** A path in the public bucket. Only hauls/, shelf/ and data/ are ever written there. */
export const isPublicPath = (key: string) => isHaulPath(key) || isShelfPath(key) || isStoryPath(key);

function citeLabel(b: MarginalBody, item: ItemRow): string {
  if (b.cite.kind === 'wiki') return `Wikipedia: ${b.cite.title}`;
  return item.source_name ? `${item.source_name}, the piece itself` : 'The piece itself';
}

export async function readIndex(env: Env): Promise<HaulIndex> {
  const obj = await env.FILES.get(INDEX_PATH);
  if (!obj) return { bundleVersion: BUNDLE_VERSION, updatedAt: nowIso(), hauls: [] };
  return (await obj.json()) as HaulIndex;
}

async function haulItemRows(env: Env, haulId: string): Promise<ItemRow[]> {
  return (await env.DB.prepare('SELECT i.* FROM haul_items hi JOIN items i ON i.id = hi.item_id WHERE hi.haul_id = ? ORDER BY hi.position').bind(haulId).all<ItemRow>()).results;
}

/** Each item's id in the bundle: a slug of its title, unique in the Haul, never a reserved word. */
export function bundleItemIds(items: Pick<ItemRow, 'id' | 'title' | 'title_choice'>[]): Map<string, string> {
  const idFor = new Map<string, string>();
  const used = new Set<string>();
  for (const it of items) {
    const t = parseJson<Title | null>(it.title_choice, null)?.text ?? it.title ?? 'item';
    let s = itemSlug(t);
    const base = s;
    for (let k = 2; used.has(s); k++) s = `${base}-${k}`;
    used.add(s);
    idFor.set(it.id, s);
  }
  return idFor;
}

export async function assembleHaul(env: Env, haulId: string, opts: { correction?: string; card?: Uint8Array; cards?: Record<string, Uint8Array>; chartPictures?: ChartPictures; drawer?: ChartDrawer } = {}): Promise<Assembled> {
  const h = await env.DB.prepare('SELECT * FROM hauls WHERE id = ?').bind(haulId).first<HaulRow>();
  if (!h) throw new Error('No such Haul');
  const problems: PublishProblem[] = [];
  const copies: Array<[string, string]> = [];
  const warnings: BundleIssue[] = [];
  const version = h.status === 'published' ? h.version + 1 : 1;
  const slug = haulSlug(h.number);
  const filesBase = env.FILES_BASE.replace(/\/$/, '');
  const edition = editionOf(h.number, h.edition ?? undefined);
  // Charts' pictures (the app's two and the share card): drawn here at publish with the drawer the
  // Desk Worker hands in; a preview, which has none, only notes that they come at publish.
  const pictures: Array<[string, Uint8Array]> = [];
  const chartNotes: string[] = [];
  const drawn: ChartPictures | undefined = opts.drawer ? new Map() : opts.chartPictures;
  const site = (env.SITE_BASE ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  const items = await haulItemRows(env, haulId);
  const idFor = bundleItemIds(items);
  // A Book item's shelf link is written as Item.shelf; the book must exist, and should be on the
  // published shelf so the reader's link lands (a warning only: publish the shelf after).
  const published = await readShelf(env);

  const noteById = async (id: string | null) => (id ? env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>() : null);

  /** A voice note as published audio, with its real format. Android-only formats publish with a warning. */
  const audioFor = (note: NoteRow, to: string, path: string, label: string): Audio => {
    const format: AudioFormat = formatOfNote(note);
    const key = `${to}.${format}`;
    copies.push([note.audio_key, key]);
    if (!PLAYS_ON_IOS.has(format)) warnings.push({ path, rule: 'audio-format', message: `${label} is ${format}, which plays on Android only. Re-record it in Safari or upload an m4a or mp3 for iOS readers.` });
    return { url: `${filesBase}/${key}`, seconds: Math.round(note.seconds ?? 0), format };
  };

  /** The chosen plate, copied next to the bundle. */
  const plateFor = async (decision: string | null, to: string, label: string, itemId?: string): Promise<Plate | undefined> => {
    if (!decision || decision === 'none') return undefined;
    const p = await env.DB.prepare(`SELECT * FROM plates WHERE id = ? AND status = 'chosen'`).bind(decision).first<PlateRow>();
    if (!p || !p.r2_key || !p.width || !p.height) {
      problems.push({ itemId, itemTitle: label, message: 'the chosen plate is missing; pick it again or choose no plate' });
      return undefined;
    }
    const key = `${to}.${IMAGE_EXT[p.mime ?? ''] ?? 'jpg'}`;
    copies.push([p.r2_key, key]);
    return plateForBundle(p, `${filesBase}/${key}`);
  };

  const bundleItems: Item[] = [];
  for (const it of items) {
    const label = it.title ?? it.url ?? it.id;
    const checks = (await env.DB.prepare('SELECT * FROM checks WHERE item_id = ?').bind(it.id).all<CheckRow>()).results;
    for (const c of checks) {
      if (c.status === 'fail' && ['links', 'quotes', 'citations', 'style', 'why'].includes(c.name)) {
        problems.push({ itemId: it.id, itemTitle: label, message: `${c.name}: ${parseJson<{ summary?: string }>(c.detail, {}).summary ?? 'failed'}` });
      }
    }
    if (!checks.some((c) => c.name === 'links')) problems.push({ itemId: it.id, itemTitle: label, message: 'links have not been checked yet' });

    const ex = await env.DB.prepare('SELECT * FROM excerpts WHERE item_id = ? AND chosen = 1').bind(it.id).first<ExcerptRow>();
    const notes = (
      await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status IN ('kept', 'edited') ORDER BY position`).bind(it.id).all<DraftRow>()
    ).results.map((d) => parseJson<MarginalBody | null>(d.body, null)).filter((b): b is MarginalBody => Boolean(b));
    for (const n of notes) if (n.verdict !== 'supported') problems.push({ itemId: it.id, itemTitle: label, message: `a kept note is not confirmed by its source ("${n.text.slice(0, 50)}…")` });
    // Machine notes and ideas publish only when the editor ticked them; the rest are left out.
    const src = await env.DB.prepare('SELECT text, extractor FROM sources WHERE item_id = ?').bind(it.id).first<{ text: string; extractor: string }>();
    // Transcripts without punctuation (older auto-captions, fetched or uploaded) keep every "uh":
    // ideas cite the moment instead of printing the words.
    const roughText = Boolean(src && TRANSCRIPTS.has(src.extractor) && !isPunctuated(src.text));
    const ideas = (
      await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind = 'idea' AND status IN ('kept', 'edited') ORDER BY position`).bind(it.id).all<DraftRow>()
    ).results
      .map((d) => parseJson<MarginalBody | null>(d.body, null))
      .filter((b): b is MarginalBody => Boolean(b))
      // In the order the piece makes them, whenever each was drafted.
      .sort((a, b) => (a.cite.kind === 'source' ? a.cite.start : 0) - (b.cite.kind === 'source' ? b.cite.start : 0));
    for (const n of ideas) {
      if (n.verdict !== 'supported') problems.push({ itemId: it.id, itemTitle: label, message: `a kept idea is not confirmed by its source ("${n.text.slice(0, 50)}…")` });
      if (n.cite.kind !== 'source' || !src || !isVerbatimAt(src.text, n.cite, n.cite.quote)) problems.push({ itemId: it.id, itemTitle: label, message: `a kept idea's quotation no longer matches the source ("${n.text.slice(0, 50)}…")` });
    }
    const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ? AND status = 'kept' ORDER BY position`).bind(it.id).all<WikiRow>()).results;
    // A note checked against a Wikipedia card links to that card's article, whether or not the card is kept.
    const cardUrl = new Map(
      (await env.DB.prepare('SELECT id, url FROM wiki_cards WHERE item_id = ?').bind(it.id).all<Pick<WikiRow, 'id' | 'url'>>()).results.map((c) => [c.id, c.url]),
    );
    const wikiUrl = (n: MarginalBody) => {
      const url = n.cite.kind === 'wiki' ? cardUrl.get(n.cite.cardId) : undefined;
      return url && /^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(url) ? { url } : {};
    };
    // Links the editor wrote into the note ("words" (https://…) or [words](https://…)) print as links on
    // those words; lifting them out only deletes the marks around the words. A quotation set out in
    // the note ("> " lines) must be in this item's source word for word, as any excerpt.
    const why = itemNote(it.why_text ?? '');
    for (const q of why.quotations) {
      if (!src?.text || !findQuotation(src.text, q))
        problems.push({ itemId: it.id, itemTitle: label, message: `a quotation in your note is not in the source word for word ("${q.slice(0, 60)}${q.length > 60 ? '…' : ''}")` });
    }
    const conns = (
      await env.DB.prepare('SELECT c.*, i.title AS to_title, i.title_choice AS to_choice FROM connections c JOIN items i ON i.id = c.to_item_id WHERE c.item_id = ?').bind(it.id).all<{
        type: string;
        note: string;
        to_item_id: string;
        to_title: string | null;
        to_choice: string | null;
      }>()
    ).results.filter((c) => idFor.has(c.to_item_id));

    const whyNote = it.why_audio ? await noteById(it.why_note_id) : null;
    const whyAudio = whyNote ? audioFor(whyNote, `hauls/${slug}/audio/${idFor.get(it.id)}-why`, `items[${bundleItems.length}].why.audio`, `The voice note on "${label}"`) : undefined;
    const plate = await plateFor(it.plate, `hauls/${slug}/plates/${idFor.get(it.id)}`, label, it.id);
    const rhyme = it.kind === 'rhyme' ? await rhymeFor(env, it, label, problems) : undefined;
    if (it.type === 'image' && !plate) problems.push({ itemId: it.id, itemTitle: label, message: 'a Picture needs its picture: add it with its credit and licence' });
    // The editor's blocks, in order: quotes and code re-verified, code highlighted, posters and
    // pictures copied next to the bundle.
    const blockRows = await blocksFor(env, it.id);
    if (opts.drawer && drawn) {
      let figure = 0;
      for (const r of blockRows) {
        if (r.status !== 'kept' || r.kind !== 'chart') continue;
        const b = parseJson<{ kind: 'chart'; chart: Chart } | null>(r.body, null);
        if (!b || !validateChart(b.chart).ok) continue;
        figure++;
        const key = chartKey(b.chart, edition);
        if (drawn.has(key)) continue;
        const address = site ? `${site}/haul/${h.number}/${idFor.get(it.id)}` : undefined;
        try {
          drawn.set(key, drawChartPictures(opts.drawer, b.chart, edition, { haul: h.number, figure, ...(address ? { address } : {}) }));
        } catch (e) {
          problems.push({ itemId: it.id, itemTitle: label, message: `the chart "${b.chart.title}" could not be drawn for the app (${e instanceof Error ? e.message : String(e)})` });
        }
      }
    }
    const bb = blocksForBundle(blockRows, src?.text ?? null, `hauls/${slug}/media/${idFor.get(it.id)}`, filesBase, { edition, pictures: drawn, warnings: chartNotes });
    copies.push(...bb.copies);
    pictures.push(...(bb.pictures ?? []));
    for (const m of bb.problems) problems.push({ itemId: it.id, itemTitle: label, message: m });

    let shelf: string | undefined;
    if (it.type === 'book' && it.shelf_id) {
      const book = await env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(it.shelf_id).first<{ id: string }>();
      if (!book) problems.push({ itemId: it.id, itemTitle: label, message: 'this book points to a shelf book that is gone; link it again or unlink it' });
      else {
        shelf = book.id;
        if (!published?.books.some((b) => b.id === book.id))
          warnings.push({ path: `items[${bundleItems.length}].shelf`, rule: 'shelf', message: `"${label}" points to the shelf, but the published shelf does not have this book yet. Publish the shelf so the link lands.` });
      }
    }

    // A Life prints only as the editor approved it, checked again against its stored sources.
    let life: Life | undefined;
    if (it.type === 'life') {
      const lf = await lifeForBundle(env, it.id);
      for (const m of lf.problems) problems.push({ itemId: it.id, itemTitle: label, message: m });
      life = lf.life;
    }

    const title = parseJson<Title | null>(it.title_choice, null) ?? { text: it.title ?? '' };
    const item: Item = {
      id: idFor.get(it.id)!,
      type: it.type as ContentType,
      title: title.italic ? { text: title.text, italic: title.italic } : { text: title.text },
      creator: it.creator ?? '',
      source: { name: it.source_name ?? '', date: sourceDate(it.source_date ?? ''), url: it.canonical_url || it.url || '' },
      ...(it.minutes ? { minutes: it.minutes } : {}),
      why: { text: why.text, ...(why.links.length ? { links: why.links } : {}), ...(why.body ? { body: why.body } : {}), ...(whyAudio ? { audio: whyAudio } : {}) },
      ...(ex
        ? {
            excerpt: {
              text: ex.text,
              ...(ex.highlight_start != null && ex.highlight_end != null ? { highlight: ex.text.slice(ex.highlight_start, ex.highlight_end) } : {}),
              locator: ex.locator ?? it.locator ?? '',
            },
          }
        : {}),
      ...(it.media ? { media: JSON.parse(it.media) } : {}),
      ...(rhyme ? { rhyme } : {}),
      ...(plate ? { plate } : {}),
      marginalia: notes.map((n) => ({ text: n.text, cite: citeLabel(n, it), ...wikiUrl(n) })),
      ...(ideas.length
        ? {
            ideas: ideas.map((n) => ({
              text: n.text,
              quote: n.cite.kind === 'source' && !roughText ? n.cite.quote.replace(/\s*\n\s*/g, ' ') : '',
              locator: n.locator ?? '',
              ...(n.reaction?.trim() ? { reaction: n.reaction.trim() } : {}),
            })),
          }
        : {}),
      ...(it.start_at?.trim() ? { startHere: startHereFor(it) } : {}),
      ...(bb.blocks.length ? { blocks: bb.blocks } : {}),
      ...(it.year != null ? { year: it.year } : {}),
      ...(it.handle?.trim() ? { handle: it.handle.trim() } : {}),
      ...(it.recipient?.trim() ? { recipient: it.recipient.trim() } : {}),
      ...(it.place?.trim() ? { place: it.place.trim() } : {}),
      ...(shelf ? { shelf } : {}),
      ...(life ? { life } : {}),
      wiki: cards.map((c) => ({ title: c.title, summary: c.summary, url: c.url })),
      connections: conns.map((c) => ({
        type: c.type,
        title: parseJson<Title | null>(c.to_choice, null)?.text ?? c.to_title ?? '',
        note: c.note,
        itemId: idFor.get(c.to_item_id)!,
      })),
    };
    bundleItems.push(item);
  }

  const route = parseJson<Array<RouteStep & { itemRef?: string }>>(h.route, []).map((r) => {
    const step: RouteStep = { day: r.day, text: r.text, by: r.by };
    const ref = r.itemRef ?? r.itemId;
    if (ref && idFor.has(ref)) step.itemId = idFor.get(ref);
    return step;
  });

  // The field note: the editor's text set out as its body, its embeds' posters copied next to the bundle.
  const fn = fieldNoteForBundle(h.fn_body, parseJson<FieldNoteEmbeds>(h.fn_embeds ?? '{}', {}), `hauls/${slug}/media/field-note`, filesBase);
  copies.push(...fn.copies);
  for (const m of fn.problems) problems.push({ message: m });

  const fnNote = await noteById(h.fn_note_id);
  const fnAudio = fnNote ? audioFor(fnNote, `hauls/${slug}/audio/field-note`, 'fieldNote.audio', 'The field-note recording') : undefined;
  const cover = await plateFor(h.cover_plate, `hauls/${slug}/plates/cover`, 'The cover');
  const threads: Thread[] = await threadsForHaul(env, items.map((i) => i.id), idFor);

  const previous = (
    await env.DB.prepare('SELECT * FROM haul_versions WHERE haul_id = ? ORDER BY version').bind(haulId).all<{ correction: string | null; published_at: string; version: number }>()
  ).results;
  const corrections = previous.filter((p) => p.correction).map((p) => ({ date: dateIst(p.published_at), text: p.correction! }));
  if (version > 1) {
    if (!opts.correction?.trim()) problems.push({ message: 'A correction needs a note saying what changed' });
    else corrections.push({ date: dateIst(nowIso()), text: opts.correction.trim() });
  }

  // The share card, drawn by the Desk in the editor's browser: kept only if it is a PNG of the right
  // size. Anything else is left out with a warning; the site falls back to a plate or its default.
  let card: Assembled['card'];
  if (opts.card) {
    const size = opts.card.byteLength <= CARD_MAX_BYTES ? imageSize(opts.card) : null;
    if (size?.mime === 'image/png' && size.width === CARD_SIZE.width && size.height === CARD_SIZE.height) card = { key: `hauls/${slug}/v${version}/card.png`, bytes: opts.card };
    else warnings.push({ path: 'card', rule: 'card', message: `The share card was not a ${CARD_SIZE.width} × ${CARD_SIZE.height} PNG under 2 MB; published without one.` });
  }

  const publishedAt = h.published_at ? dateIst(h.published_at) : dateIst(nowIso());
  const haulTitle: Title = h.title_italic ? { text: h.title_text, italic: h.title_italic } : { text: h.title_text };
  const haul: Haul = {
    bundleVersion: BUNDLE_VERSION,
    number: h.number,
    version,
    title: haulTitle,
    deck: h.deck,
    publishedAt,
    swatch: h.swatch as Swatch,
    // Written out even when the editor left the default, so every reader shows the same ink.
    edition,
    ...(card ? { card: { url: `${filesBase}/${card.key}`, ...CARD_SIZE } } : {}),
    ...(cover ? { cover } : {}),
    fieldNote: {
      title: h.fn_title_italic ? { text: h.fn_title_text, italic: h.fn_title_italic } : { text: h.fn_title_text },
      ...(fnAudio ? { audio: fnAudio } : {}),
      paragraphs: fn.paragraphs,
      ...(fn.body ? { body: fn.body } : {}),
      ...(h.fn_highlight?.trim() ? { highlight: h.fn_highlight.trim() } : {}),
      route,
    },
    items: bundleItems,
    threads,
    colophon: h.colophon.trim() || DEFAULT_COLOPHON,
    ...(corrections.length ? { corrections } : {}),
  };

  const current = await readIndex(env);
  const entry: HaulSummary = {
    number: h.number,
    title: haulTitle,
    deck: h.deck,
    publishedAt,
    swatch: h.swatch as Swatch,
    edition: editionOf(h.number, h.edition ?? undefined),
    itemCount: bundleItems.length,
    path: `hauls/${slug}/v${version}/haul.json`,
  };
  const index: HaulIndex = {
    bundleVersion: BUNDLE_VERSION,
    updatedAt: nowIso(),
    hauls: [...current.hauls.filter((x) => x.number !== h.number), entry].sort((a, b) => b.number - a.number),
  };

  // Each item's share card, drawn by the Desk the same way and kept under the same rule; an item
  // without one is previewed by its chart's card, its plate or the Haul's card.
  const itemCards = new Set<string>();
  for (const it of haul.items) {
    const bytes = opts.cards?.[it.id];
    if (!bytes) continue;
    const size = bytes.byteLength <= CARD_MAX_BYTES ? imageSize(bytes) : null;
    if (size?.mime !== 'image/png' || size.width !== CARD_SIZE.width || size.height !== CARD_SIZE.height) {
      warnings.push({ path: `items.${it.id}.card`, rule: 'card', message: `The share card for ${it.id} was not a ${CARD_SIZE.width} × ${CARD_SIZE.height} PNG under 2 MB; published without one.` });
      continue;
    }
    const key = `hauls/${slug}/v${version}/cards/${it.id}.png`;
    pictures.push([key, bytes]);
    it.card = { url: `${filesBase}/${key}`, ...CARD_SIZE };
    itemCards.add(it.id);
  }
  for (const id of Object.keys(opts.cards ?? {})) if (!itemCards.has(id) && !haul.items.some((i) => i.id === id)) warnings.push({ path: 'items', rule: 'card', message: `A share card for ${id}, which is not in this Haul, was left out.` });

  for (const m of chartNotes) warnings.push({ path: 'items', rule: 'chart-pictures', message: m });
  const report = validateHaul(haul, index, { filesBase });
  const carried = new Set(bundleItems.map((b) => b.id));
  const itemIds = items.filter((it) => carried.has(idFor.get(it.id)!)).map((it) => it.id);
  return { haul, index, problems, bundleErrors: report.errors, warnings: [...warnings, ...report.warnings], copies, pictures, itemIds, ...(card ? { card } : {}) };
}

export interface PublishResult {
  ok: boolean;
  version?: number;
  path?: string;
  url?: string;
  problems: PublishProblem[];
  bundleErrors: BundleIssue[];
  warnings: BundleIssue[];
}

export async function publishHaul(env: Env, haulId: string, opts: { correction?: string; dryRun?: boolean; card?: Uint8Array; cards?: Record<string, Uint8Array>; chartPictures?: ChartPictures; drawer?: ChartDrawer } = {}): Promise<PublishResult> {
  const a = await assembleHaul(env, haulId, opts);
  const base = { problems: a.problems, bundleErrors: a.bundleErrors, warnings: a.warnings };
  if (a.problems.length || a.bundleErrors.length || opts.dryRun) return { ok: !a.problems.length && !a.bundleErrors.length, ...base };

  const path = `hauls/${haulSlug(a.haul.number)}/v${a.haul.version}/haul.json`;
  // Versions are immutable: refuse to overwrite one that exists.
  if (await env.FILES.head(path)) return { ok: false, ...base, problems: [{ message: `${path} already exists; publish a correction instead` }] };

  // Copy every asset first; a missing one stops the publish before the bundle points at it.
  for (const [from, to] of a.copies) {
    if (!isHaulPath(to)) throw new Error(`Refusing to publish outside hauls/: ${to}`);
    const obj = await env.MEDIA.get(from);
    if (!obj) return { ok: false, ...base, problems: [{ message: `A file the bundle needs is missing from storage (${from})` }] };
    await env.FILES.put(to, obj.body, { httpMetadata: { contentType: obj.httpMetadata?.contentType, cacheControl: 'public, max-age=31536000, immutable' } });
  }
  if (a.card) {
    if (!isHaulPath(a.card.key)) throw new Error(`Refusing to publish outside hauls/: ${a.card.key}`);
    await env.FILES.put(a.card.key, a.card.bytes, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
  }
  for (const [key, bytes] of a.pictures) {
    if (!isHaulPath(key)) throw new Error(`Refusing to publish outside hauls/: ${key}`);
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
  }
  const body = JSON.stringify(a.haul, null, 2);
  await env.FILES.put(path, body, { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' } });
  await env.FILES.put(INDEX_PATH, JSON.stringify(a.index, null, 2), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=60' } });

  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO haul_versions (haul_id, version, path, correction, sha256, published_at, item_ids) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      haulId,
      a.haul.version,
      path,
      a.haul.version > 1 ? opts.correction!.trim() : null,
      await sha256Hex(body),
      now,
      JSON.stringify(a.itemIds),
    ),
    env.DB.prepare(`UPDATE hauls SET status = 'published', version = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`).bind(a.haul.version, now, now, haulId),
  ]);
  // One notification per Haul: only the first version is announced.
  if (a.haul.version === 1) await env.INGEST_QUEUE.send({ kind: 'notify', haulId, version: 1 });
  return { ok: true, version: a.haul.version, path, url: `${env.FILES_BASE.replace(/\/$/, '')}/${path}`, ...base };
}

interface RhymeRow {
  item_id: string;
  then_item_id: string | null;
  then_year: string;
  then_quote: string | null;
  then_start: number | null;
  then_end: number | null;
  then_cite: string;
  now_item_id: string | null;
  now_year: string;
  now_quote: string | null;
  now_start: number | null;
  now_end: number | null;
  now_cite: string;
  bridge: string;
}

/** A Rhymes item's pair, re-verified word for word against both stored sources at publish time. */
async function rhymeFor(env: Env, it: ItemRow, label: string, problems: PublishProblem[]): Promise<Rhyme | undefined> {
  const r = await env.DB.prepare('SELECT * FROM rhymes WHERE item_id = ?').bind(it.id).first<RhymeRow>();
  if (!r) {
    problems.push({ itemId: it.id, itemTitle: label, message: 'this Rhyme has no then/now pair yet' });
    return undefined;
  }
  const ends = { then: 'then', now: 'now' } as const;
  const out: Partial<Rhyme> = {};
  for (const end of Object.values(ends)) {
    const srcId = r[`${end}_item_id`];
    const quote = r[`${end}_quote`];
    const start = r[`${end}_start`];
    const stop = r[`${end}_end`];
    const src = srcId ? await env.DB.prepare('SELECT text FROM sources WHERE item_id = ?').bind(srcId).first<{ text: string }>() : null;
    if (!src || !quote || start == null || stop == null || !isVerbatimAt(src.text, { start, end: stop }, quote)) {
      problems.push({ itemId: it.id, itemTitle: label, message: `the "${end}" quote is not matched word for word against its fetched source` });
      continue;
    }
    if (!r[`${end}_year`].trim() || !r[`${end}_cite`].trim()) problems.push({ itemId: it.id, itemTitle: label, message: `the "${end}" end needs a year and a citation` });
    out[end] = { year: r[`${end}_year`].trim(), quote, cite: r[`${end}_cite`].trim() };
  }
  const bridge = r.bridge.trim();
  if (!bridge) problems.push({ itemId: it.id, itemTitle: label, message: 'this Rhyme needs a bridge' });
  else if (!checkStyle(bridge).ok) problems.push({ itemId: it.id, itemTitle: label, message: 'the bridge fails the house style check' });
  return out.then && out.now ? { then: out.then, now: out.now, bridge } : undefined;
}

/** The editor's "start here", with a link to that moment on YouTube (other hosts have no deep link). */
export function startHereFor(it: Pick<ItemRow, 'start_at' | 'start_note' | 'media' | 'url' | 'canonical_url'>): { at: string; note?: string; url?: string } {
  const at = it.start_at!.trim();
  const note = it.start_note?.trim();
  const secs = startSeconds(at);
  const media = parseJson<{ url?: string } | null>(it.media, null);
  const base = media?.url ?? it.canonical_url ?? it.url ?? '';
  let url: string | undefined;
  if (secs != null && /^https:\/\/(www\.)?youtube\.com\/watch\?/.test(base)) {
    const u = new URL(base);
    u.searchParams.set('t', `${secs}s`);
    url = u.toString();
  }
  return { at, ...(note ? { note } : {}), ...(url ? { url } : {}) };
}

// ---------------------------------------------------------------- the shelf

/** The published shelf, or null before the first publish (or if it cannot be read). */
export async function readShelf(env: Env): Promise<Shelf | null> {
  const obj = await env.FILES.get(SHELF_PATH);
  if (!obj) return null;
  try {
    return (await obj.json()) as Shelf;
  } catch {
    return null;
  }
}

export interface ShelfAssembled {
  shelf: Shelf;
  /** Plain messages; any one stops the publish. */
  problems: string[];
  warnings: string[];
  /** What this publish changes against the published shelf. */
  changes: string[];
  /** Files to copy: [private MEDIA key, public FILES key under shelf/]. */
  copies: Array<[string, string]>;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** A validateShelf message with the book's title in place of its index: "The Coal Question: author: name the author". */
export function plainShelfError(shelf: Shelf, e: string): string {
  const m = /^books\[(\d+)\](?:\.([^:]*))?: (.*)$/.exec(e);
  if (!m) return e;
  const b = shelf.books[Number(m[1])];
  const name = (b?.title && [b.title.text, b.title.italic].filter(Boolean).join(' ')) || b?.id || `Book ${Number(m[1]) + 1}`;
  const where = (m[2] ?? '').replace(/(notes|lines|hauls)\[(\d+)\]/g, (_, k: string, j: string) => `${k.slice(0, -1)} ${Number(j) + 1}`).replace(/\./g, ' ');
  return `${name}: ${where ? `${where}: ` : ''}${m[3]}`;
}

/**
 * Where each shelf book appeared in a published Haul, from the published bundles themselves: an
 * item's Item.shelf, or (for a link made after that Haul was published) the linked item found in the
 * bundle by its id. A link the bundle does not show is a warning, never invented.
 */
async function shelfHauls(env: Env, bookIds: Set<string>, warnings: string[]): Promise<Map<string, { number: number; itemId: string }[]>> {
  const out = new Map<string, { number: number; itemId: string }[]>();
  const add = (bookId: string, number: number, itemId: string) => {
    const list = out.get(bookId) ?? [];
    if (!list.some((x) => x.number === number && x.itemId === itemId)) list.push({ number, itemId });
    out.set(bookId, list);
  };
  const hauls = (await env.DB.prepare(`SELECT id, number FROM hauls WHERE status = 'published' ORDER BY number`).all<{ id: string; number: number }>()).results;
  for (const h of hauls) {
    const v = await env.DB.prepare('SELECT path FROM haul_versions WHERE haul_id = ? ORDER BY version DESC LIMIT 1').bind(h.id).first<{ path: string }>();
    const obj = v ? await env.FILES.get(v.path) : null;
    const bundle = obj ? ((await obj.json().catch(() => null)) as Haul | null) : null;
    if (!bundle?.items) {
      warnings.push(`Haul ${h.number}'s published bundle could not be read, so its books are not linked from the shelf.`);
      continue;
    }
    for (const it of bundle.items) {
      if (!it.shelf) continue;
      if (bookIds.has(it.shelf)) add(it.shelf, h.number, it.id);
      else warnings.push(`Haul ${h.number}'s "${it.title.text}" points to the shelf book "${it.shelf}", which is not on the shelf; its link will not land.`);
    }
    const rows = await haulItemRows(env, h.id);
    const idFor = bundleItemIds(rows);
    for (const r of rows) {
      if (!r.shelf_id || !bookIds.has(r.shelf_id)) continue;
      const found = bundle.items.find((i) => i.id === idFor.get(r.id));
      if (found?.shelf && found.shelf !== r.shelf_id) continue; // the bundle names another book; it stands until a correction
      if (found && found.type === 'book') add(r.shelf_id, h.number, found.id);
      else warnings.push(`"${r.title ?? r.id}" in Haul ${h.number} points to a shelf book, but the published Haul does not show it as that book; publish a correction of Haul ${h.number}.`);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.number - b.number || a.itemId.localeCompare(b.itemId));
  return out;
}

/**
 * Build the shelf from D1: every book with its notes (newest first) and lines, covers and published
 * recordings pointed at their FILES copies under shelf/, the Hauls each book appeared in, ordered with
 * shelfOrder and checked with validateShelf against FILES_BASE.
 */
export async function assembleShelf(env: Env): Promise<ShelfAssembled> {
  const filesBase = env.FILES_BASE.replace(/\/$/, '');
  const problems: string[] = [];
  const warnings: string[] = [];
  const copies: Array<[string, string]> = [];
  const rows = (await env.DB.prepare('SELECT * FROM books').all<BookRow>()).results;
  const hauls = await shelfHauls(env, new Set(rows.map((r) => r.id)), warnings);
  const books: ShelfBook[] = [];
  for (const b of rows) {
    const name = bookTitleText(b);
    const notes: BookNote[] = [];
    for (const n of await notesFor(env, b.id)) {
      let audio: Audio | undefined;
      if (n.publish_audio && n.audio_key && n.note_id) {
        const format: AudioFormat = (AUDIO_FORMATS as readonly string[]).includes(n.format ?? '') ? (n.format as AudioFormat) : 'webm';
        const key = `shelf/audio/${b.id}-${n.note_id.toLowerCase()}.${format}`;
        copies.push([n.audio_key, key]);
        if (!PLAYS_ON_IOS.has(format)) warnings.push(`${name}: the recording with the note of ${n.date} is ${format}, which plays on Android only. Re-record it in Safari or upload an m4a or mp3 for iOS readers.`);
        audio = { url: `${filesBase}/${key}`, seconds: Math.round(n.seconds ?? 0), format };
      }
      notes.push({ date: n.date, ...(n.at ? { at: n.at } : {}), text: n.text, ...(audio ? { audio } : {}) });
    }
    const lines = (await linesFor(env, b.id)).map((l) => ({ text: l.text, ...(l.locator ? { locator: l.locator } : {}) }));
    let cover: Plate | undefined;
    if (b.cover_key) {
      if (!b.cover_width || !b.cover_height || !b.cover_credit?.trim() || !b.cover_licence?.trim()) problems.push(`${name}: the cover is missing its size, credit or licence; add it again`);
      else {
        const stem = (b.cover_key.split('/').pop() ?? 'cover').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
        const key = `shelf/covers/${b.id}-${stem}.${IMAGE_EXT[b.cover_mime ?? ''] ?? 'jpg'}`;
        copies.push([b.cover_key, key]);
        cover = {
          url: `${filesBase}/${key}`,
          width: b.cover_width,
          height: b.cover_height,
          caption: b.cover_caption ?? '',
          credit: b.cover_credit,
          licence: b.cover_licence,
          ...(b.cover_source_url ? { sourceUrl: b.cover_source_url } : {}),
          ...(b.cover_creator ? { creator: b.cover_creator } : {}),
          ...(b.cover_date ? { date: b.cover_date } : {}),
        };
      }
    }
    const inHauls = hauls.get(b.id) ?? [];
    books.push({
      id: b.id,
      title: bookTitle(b),
      author: b.author,
      ...(b.year != null ? { year: b.year } : {}),
      ...(b.publisher ? { publisher: b.publisher } : {}),
      ...(b.url ? { url: b.url } : {}),
      status: b.status,
      ...(b.started ? { started: b.started } : {}),
      ...(b.finished ? { finished: b.finished } : {}),
      ...(cover ? { cover } : {}),
      ...(b.spine ? { spine: b.spine } : {}),
      notes,
      lines,
      ...(inHauls.length ? { hauls: inHauls } : {}),
    });
  }
  const shelf: Shelf = { bundleVersion: SHELF_VERSION, updatedAt: nowIso(), books: shelfOrder(books) };
  for (const e of validateShelf(shelf, { filesBase })) problems.push(plainShelfError(shelf, e));
  return { shelf, problems, warnings, changes: shelfChanges(await readShelf(env), shelf), copies };
}

export interface ShelfPublishResult {
  ok: boolean;
  version?: number;
  path?: string;
  url?: string;
  books: number;
  problems: string[];
  warnings: string[];
  changes: string[];
}

/** Publish the shelf: copy covers and recordings to FILES under shelf/, then write shelf/shelf.json. */
export async function publishShelf(env: Env, opts: { dryRun?: boolean } = {}): Promise<ShelfPublishResult> {
  const a = await assembleShelf(env);
  const base = { books: a.shelf.books.length, problems: a.problems, warnings: a.warnings, changes: a.changes };
  if (a.problems.length || opts.dryRun) return { ok: !a.problems.length, ...base };
  // Copy every file first; a missing one stops the publish before the shelf points at it. Names are
  // unique per file (a new cover or recording gets a new name), so a copy already there is the same.
  for (const [from, to] of a.copies) {
    if (!isShelfPath(to)) throw new Error(`Refusing to publish outside shelf/: ${to}`);
    if (await env.FILES.head(to)) continue;
    const obj = await env.MEDIA.get(from);
    if (!obj) return { ok: false, ...base, problems: [`A file the shelf needs is missing from storage (${from}); add it again.`] };
    await env.FILES.put(to, obj.body, { httpMetadata: { contentType: obj.httpMetadata?.contentType, cacheControl: IMMUTABLE } });
  }
  const body = JSON.stringify(a.shelf, null, 2);
  await env.FILES.put(SHELF_PATH, body, { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=60' } });
  const last = await env.DB.prepare('SELECT MAX(version) AS v FROM shelf_versions').first<{ v: number | null }>();
  const version = (last?.v ?? 0) + 1;
  await env.DB.prepare('INSERT INTO shelf_versions (version, sha256, books, published_at) VALUES (?, ?, ?, ?)').bind(version, await sha256Hex(body), a.shelf.books.length, nowIso()).run();
  return { ok: true, version, path: SHELF_PATH, url: `${env.FILES_BASE.replace(/\/$/, '')}/${SHELF_PATH}`, ...base };
}

// ---------------------------------------------------------------- data stories

/** The published index of data stories, or an empty one before the first publish (or if it cannot be read). */
export async function readDataIndex(env: Env): Promise<DataIndex> {
  const r = await dataIndexState(env);
  return r.index ?? { bundleVersion: STORY_BUNDLE_VERSION, updatedAt: nowIso(), stories: [] };
}

/**
 * The published data index, or why it cannot be trusted. Only a bucket with no data/ at all starts a
 * fresh index: an index that cannot be read or fails validation, or story files with no index, stop a
 * publish, so a damaged index never replaces the Atlas with one story and reused numbers.
 */
async function dataIndexState(env: Env): Promise<{ index: DataIndex | null; problem?: string }> {
  const obj = await env.FILES.get(DATA_INDEX_PATH);
  if (!obj) {
    const any = await env.FILES.list({ prefix: 'data/', limit: 1 });
    if (any.objects.length) return { index: null, problem: `${DATA_INDEX_PATH} is missing but data/ holds published stories; restore the index before publishing.` };
    return { index: { bundleVersion: STORY_BUNDLE_VERSION, updatedAt: nowIso(), stories: [] } };
  }
  const index = (await obj.json().catch(() => null)) as DataIndex | null;
  const errs = index ? validateDataIndex(index) : ['not JSON'];
  if (errs.length) return { index: null, problem: `${DATA_INDEX_PATH} cannot be trusted (${errs.slice(0, 3).join('; ')}); fix it before publishing.` };
  return { index };
}

/** A quotation as the reader sees it: whitespace and quotation marks made plain, for an exact match. */
const plainQuote = (t: string) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();

export interface StoryPublishResult {
  ok: boolean;
  problems: string[];
  warnings: string[];
  version?: number;
  number?: number;
  path?: string;
  url?: string;
  /** What this publish writes and changes, in plain words. */
  changes?: string[];
}

/**
 * The published Haul an item is in, as the reader reaches it: its number and the item's id, slug and
 * title in that Haul's latest bundle. Null (with a warning) when no published bundle shows the item.
 */
async function storyHaul(env: Env, item: ItemRow, warnings: string[]): Promise<StoryHaul | undefined> {
  const h = await env.DB.prepare(`SELECT h.id, h.number FROM haul_items hi JOIN hauls h ON h.id = hi.haul_id WHERE hi.item_id = ? AND h.status = 'published'`).bind(item.id).first<{ id: string; number: number }>();
  if (!h) {
    warnings.push('The item is in no published Haul, so the story publishes without a link to it. Publish it again after its Haul goes out.');
    return undefined;
  }
  const v = await env.DB.prepare('SELECT path FROM haul_versions WHERE haul_id = ? ORDER BY version DESC LIMIT 1').bind(h.id).first<{ path: string }>();
  const obj = v ? await env.FILES.get(v.path) : null;
  const bundle = obj ? ((await obj.json().catch(() => null)) as Haul | null) : null;
  const slug = bundleItemIds(await haulItemRows(env, h.id)).get(item.id);
  const found = bundle?.items?.find((i) => i.id === slug);
  if (!found) {
    warnings.push(`Haul ${h.number}'s published bundle does not show this item, so the story publishes without a link to it. Publish a correction of Haul ${h.number}, then the story again.`);
    return undefined;
  }
  return { number: h.number, itemId: item.id, itemSlug: found.id, itemTitle: [found.title.text, found.title.italic].filter(Boolean).join(' ') };
}

/**
 * Publish a data story (docs/DATA-STORIES.md, "Publishing"): the editor's standfirst and margin notes
 * found unchanged in the item's stored note, every quotation found word for word in the item's stored
 * source, the grammar's rules (validateStory), then data/<slug>/v<N>/story.json (never overwritten)
 * and data/index.json. Any problem stops it; a dry run returns what it would write and writes nothing.
 */
export async function publishStory(env: Env, input: { story: Story; slug: string; itemId: string }, opts: { dryRun?: boolean; drawer?: ChartDrawer } = {}): Promise<StoryPublishResult> {
  const { story, slug, itemId } = input;
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!STORY_SLUG.test(slug)) return { ok: false, problems: [`The slug "${slug}" must be lowercase words joined by hyphens.`], warnings };
  const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(itemId).first<ItemRow>();
  if (!item) return { ok: false, problems: [`No item ${itemId}.`], warnings };
  // The editor's words are his stored note on the item, as he wrote or dictated it.
  const editorText = item.why_text ?? '';
  if (!editorText.trim()) problems.push('The item has no note of yours; the standfirst and margin notes must be found in it.');
  try {
    problems.push(...validateStory(story, editorText));
  } catch {
    return { ok: false, problems: [...problems, 'The story is not in the expected shape (docs/DATA-STORIES.md).'], warnings };
  }
  const src = await env.DB.prepare('SELECT text FROM sources WHERE item_id = ?').bind(item.id).first<{ text: string }>();
  for (const p of story.plates) {
    if (!p.quote) continue;
    // One unbroken run of the source's words: no ellipses stitching passages together.
    if (/…|\.\.\./.test(p.quote.text)) problems.push(`Plate "${p.name}": a story's quotation is one unbroken passage, with no ellipsis.`);
    else if (!src?.text || !plainQuote(src.text).includes(plainQuote(p.quote.text))) problems.push(`Plate "${p.name}": the quotation is not in the item's source word for word ("${p.quote.text.slice(0, 60)}${p.quote.text.length > 60 ? '…' : ''}").`);
  }
  const haul = await storyHaul(env, item, warnings);

  const state = await dataIndexState(env);
  if (!state.index) return { ok: false, problems: [...problems, state.problem!], warnings };
  const current = state.index;
  const existing = current.stories.find((s) => s.slug === slug);
  const now = nowIso();
  const number = existing?.number ?? Math.max(0, ...current.stories.map((s) => s.number)) + 1;
  const version = (existing?.version ?? 0) + 1;
  const published: PublishedStory = {
    bundleVersion: STORY_BUNDLE_VERSION,
    slug,
    number,
    version,
    publishedAt: existing?.publishedAt ?? now,
    updatedAt: now,
    ...(haul ? { haul } : {}),
    story,
  };
  // The app's pictures: each plate's phone figure with its key, light and dark (drawn only for a real
  // publish, by the Desk's resvg drawer, as chart pictures are). Without a drawer the app shows none.
  const pictureFiles: Array<[string, Uint8Array]> = [];
  if (!problems.length && !opts.dryRun && opts.drawer) {
    const filesBase = env.FILES_BASE.replace(/\/$/, '');
    const pictures: Record<string, { light: StoryPicture; dark: StoryPicture }> = {};
    for (const p of story.plates) {
      try {
        const scene = phonePicture(p);
        const size = { width: Math.round(scene.width * PICTURE_ZOOM), height: Math.ceil(scene.height * PICTURE_ZOOM) };
        const pic = (scheme: 'light' | 'dark'): StoryPicture => {
          const key = picturePath(slug, version, p.key, scheme);
          pictureFiles.push([key, opts.drawer!.png(sceneToSvg(scene, { scheme, edition: story.edition }), PICTURE_ZOOM)]);
          return { url: `${filesBase}/${key}`, ...size };
        };
        pictures[p.key] = { light: pic('light'), dark: pic('dark') };
      } catch (e) {
        problems.push(`Plate "${p.name}": its picture could not be drawn (${e instanceof Error ? e.message : String(e)}).`);
      }
    }
    published.pictures = pictures;
  } else if (!opts.drawer) warnings.push('No drawer: the app will show this story without its plates\' pictures.');
  if (!problems.length) problems.push(...validatePublishedStory(published, { filesBase: env.FILES_BASE }));
  const index: DataIndex = {
    bundleVersion: STORY_BUNDLE_VERSION,
    updatedAt: now,
    stories: [...current.stories.filter((s) => s.slug !== slug), indexEntry(published)].sort((a, b) => b.number - a.number),
  };
  if (!problems.length) problems.push(...validateDataIndex(index).map((e) => `The index: ${e}`));
  const path = storyPath(slug, version);
  if (!isStoryPath(path) || !isStoryPath(DATA_INDEX_PATH)) throw new Error(`Refusing to publish outside data/: ${path}`);
  if (await env.FILES.head(path)) problems.push(`${path} is already published and is never overwritten; the index is out of step with the bucket.`);
  const changes = [
    existing ? `Version ${version} of Atlas No. ${number}, "${story.title}" (was version ${existing.version}).` : `The first publish of "${story.title}", Atlas No. ${number}.`,
    `Writes ${path} and ${DATA_INDEX_PATH}.`,
  ];
  const base = { problems, warnings, version, number, path, changes };
  if (problems.length || opts.dryRun) return { ok: !problems.length, ...base };
  for (const [key, png] of pictureFiles) {
    if (!isStoryPath(key)) throw new Error(`Refusing to publish outside data/: ${key}`);
    if (await env.FILES.head(key)) continue;
    await env.FILES.put(key, png, { httpMetadata: { contentType: 'image/png', cacheControl: IMMUTABLE } });
  }
  await env.FILES.put(path, JSON.stringify(published, null, 2), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: IMMUTABLE } });
  await env.FILES.put(DATA_INDEX_PATH, JSON.stringify(index, null, 2), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=60' } });
  return { ok: true, ...base, url: `${env.FILES_BASE.replace(/\/$/, '')}/${path}` };
}
