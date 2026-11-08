// The per-item pipeline, as plain functions. The Workflow in workers/pipeline wraps each in a
// durable step; the Desk API calls some directly (re-check after an edit). Every step writes its
// output to D1 and returns only small values.

import { checkStyle, describeIssues } from '@fdf/shared/style';
import { findQuotation, findVerbatim, isVerbatimAt } from '@fdf/shared/verbatim';
import { itemNote } from '@fdf/shared/fieldnote';
import { countWords, excerptCap, ideaCount, isPunctuated, QUOTED_WHOLE, wantsIdeas } from '@fdf/shared/quoting';
import type { ContentType } from '@fdf/shared/tokens';
import type { Env } from './env';
import type { DraftRow, ExcerptRow, ItemRow, MarginalBody, SourceRow, WikiRow } from './db';
import { getItem, getSource, setStatus, upsertCheck } from './db';
import type { FetchOutcome, SourceMeta } from './ingest';
import { generateJson } from './models/router';
import { DRAFT_SYSTEM, draftSchema, JUDGE_SYSTEM, judgeSchema, READ_SYSTEM, readSchema, type DraftOutput, type ReadingCard } from './prompts';
import { checkLink } from './extract/http';
import { bestSentence, resolveWikiTopic } from './wiki';
import { loadRoutes, MAX_INLINE_PDF_BYTES, type DocumentInput } from './models/router';
import { newId, nowIso, parseJson, toBase64, truncate, wordCount } from './util';
import { pageAt } from './extract/pdf';
import { msToClock } from './extract/youtube';
import { rhymeQuoteRows } from './rhymes';
import { blockQuoteRows, blocksFor } from './blocks';
import { lifeLinks, lifeRow } from './lives';

const D1_TEXT_LIMIT = 1_500_000;

/** Store the extracted source: snapshot and full text to R2, text and fields to D1. */
export async function storeSource(env: Env, itemId: string, outcome: Extract<FetchOutcome, { kind: 'text' }>): Promise<{ words: number }> {
  let snapshotKey: string | null = null;
  if (outcome.snapshot) {
    snapshotKey = `snapshots/${itemId}/source.${outcome.snapshot.ext}`;
    await env.MEDIA.put(snapshotKey, outcome.snapshot.bytes, { httpMetadata: { contentType: outcome.snapshot.contentType } });
  }
  const textKey = `snapshots/${itemId}/text.txt`;
  await env.MEDIA.put(textKey, outcome.text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
  const text = truncate(outcome.text, D1_TEXT_LIMIT);
  const meta: SourceMeta = { ...outcome.meta, ...(text.length < outcome.text.length ? { note: 'Source truncated for review; the full text is in the snapshot.' } : {}) };
  const words = wordCount(outcome.text);
  await env.DB.prepare(
    `INSERT INTO sources (item_id, text, extractor, word_count, snapshot_key, text_key, meta, fetched_at, edited)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (item_id) DO UPDATE SET text = excluded.text, extractor = excluded.extractor, word_count = excluded.word_count,
       snapshot_key = excluded.snapshot_key, text_key = excluded.text_key, meta = excluded.meta, fetched_at = excluded.fetched_at, edited = 0`,
  )
    .bind(itemId, text, outcome.extractor, words, snapshotKey, textKey, JSON.stringify(meta), nowIso())
    .run();
  await applyFields(env, itemId, outcome.fields);
  return { words };
}

/** Fill item fields the editor has not set. The editor's edits always win. */
export async function applyFields(env: Env, itemId: string, f: FetchOutcome['fields']): Promise<void> {
  await env.DB.prepare(
    `UPDATE items SET
       title = COALESCE(NULLIF(title, ''), ?),
       creator = COALESCE(creator, ?),
       source_name = COALESCE(NULLIF(source_name, ''), ?),
       source_date = COALESCE(NULLIF(source_date, ''), ?),
       minutes = COALESCE(minutes, ?),
       media = COALESCE(media, ?),
       canonical_url = COALESCE(?, canonical_url),
       locator = COALESCE(locator, ?),
       handle = COALESCE(NULLIF(handle, ''), ?),
       updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      f.title?.trim() || null,
      f.creator?.trim() ?? null,
      f.source_name?.trim() || null,
      f.source_date?.trim() || null,
      f.minutes ?? null,
      f.media ? JSON.stringify(f.media) : null,
      f.canonical_url ?? null,
      f.locator ?? null,
      f.handle?.trim() || null,
      nowIso(),
      itemId,
    )
    .run();
}

function itemHeader(item: ItemRow): string {
  return [
    `Type: ${item.type}`,
    item.title && `Title: ${item.title}`,
    item.creator && `By: ${item.creator}`,
    item.source_name && `Source: ${item.source_name}`,
    item.source_date && `Date: ${item.source_date}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------- read

const PDF_ATTACHED = 'The original PDF may be attached: use it for layout, tables, figures and captions. Copy every quotation from the SOURCE TEXT below, character for character.';

/**
 * The source PDF, for models that read PDFs natively, when the item came from one with a text
 * layer. The extracted text stays the source of truth: quotations are matched against it.
 */
export async function sourcePdf(env: Env, src: SourceRow): Promise<DocumentInput[]> {
  if (!src.snapshot_key?.endsWith('.pdf') || src.extractor === 'ocr') return [];
  const meta = parseJson<SourceMeta>(src.meta, {});
  const pages = meta.pages?.length ?? 0;
  if (!pages) return [];
  const obj = await env.MEDIA.get(src.snapshot_key);
  if (!obj) return [];
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.length > MAX_INLINE_PDF_BYTES) return [];
  return [{ mime: 'application/pdf', base64: toBase64(bytes), pages }];
}

export async function readItem(env: Env, itemId: string): Promise<{ queries: string[]; why?: Record<string, string> }> {
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  if (!item || !src) throw new Error('Item or source missing');
  await setStatus(env, itemId, 'reading');
  const max = loadRoutes(env).tasks.read.maxInputChars;
  const documents = await sourcePdf(env, src);
  const { data: raw, model } = await generateJson(env, {
    task: 'read',
    system: READ_SYSTEM,
    prompt: `${itemHeader(item)}${documents.length ? `\n\n${PDF_ATTACHED}` : ''}\n\nSOURCE TEXT:\n"""\n${truncate(src.text, max)}\n"""`,
    schema: readSchema,
    documents,
    itemId,
  });
  // List lengths are asked for in the schema's descriptions and trimmed here: one item too many is
  // not worth rejecting (and paying for) a whole answer.
  const data: ReadingCard = {
    ...raw,
    claims: raw.claims.slice(0, 8),
    mechanisms: raw.mechanisms.slice(0, 6),
    entities: raw.entities.slice(0, 12),
    events: raw.events.slice(0, 10),
    quotables: raw.quotables.slice(0, 8),
    furtherReading: raw.furtherReading.slice(0, 4),
  };
  // Quotables are only kept if they are really in the source.
  const quotables = data.quotables
    .map((q) => ({ ...q, found: findVerbatim(src.text, q.quote) }))
    .filter((q) => q.found)
    .map((q) => ({ quote: q.found!.text, start: q.found!.start, end: q.found!.end, why: q.why }));
  const card = { ...data, quotables };
  await env.DB.prepare(`DELETE FROM drafts WHERE item_id = ? AND kind = 'card'`).bind(itemId).run();
  await env.DB.prepare(
    `INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES (?, ?, 'card', ?, 'kept', ?, 0, ?, ?)`,
  )
    .bind(newId('dr_'), itemId, JSON.stringify(card), model, nowIso(), nowIso())
    .run();
  // Bibliographic fields from the card fill gaps only (pasted passages and OCR mostly).
  const b = data.bibliographic;
  await applyFields(env, itemId, { title: b.title || undefined, creator: b.creator || undefined, source_name: b.sourceName || undefined, source_date: b.date || undefined });
  // Further reading the reader chose for a curious reader comes first; entities only fill gaps.
  const clean = (q: string) => q.trim() && !/https?:|www\./i.test(q);
  const picked = data.furtherReading.filter((f) => clean(f.query));
  const why = Object.fromEntries(picked.map((f) => [f.query.trim(), f.why.trim()]));
  // Entities fill in only when the reader picked fewer than two: generic topics are what the
  // editor found dull, and fewer, better cards beat a full row.
  const fill = picked.length >= 2 ? [] : data.entities.map((e) => e.wikiQuery.trim()).filter(clean);
  const queries = [...new Set([...picked.map((f) => f.query.trim()), ...fill])];
  return { queries: queries.slice(0, 8), why };
}

// ---------------------------------------------------------------- wiki

export async function resolveWiki(env: Env, itemId: string, queries: string[], limit = 4, why: Record<string, string> = {}): Promise<{ cards: number }> {
  // A new reading replaces the cards the editor has not ticked, like any other proposal. Kept cards
  // stay, and so does any card a kept or edited note cites.
  const cited = (
    await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status IN ('kept', 'edited')`).bind(itemId).all<{ body: string }>()
  ).results
    .map((r) => parseJson<MarginalBody | null>(r.body, null))
    .flatMap((b) => (b?.cite.kind === 'wiki' ? [b.cite.cardId] : []));
  await env.DB.prepare(`DELETE FROM wiki_cards WHERE item_id = ? AND status = 'proposed' AND id NOT IN (SELECT value FROM json_each(?))`).bind(itemId, JSON.stringify(cited)).run();
  const existing = await env.DB.prepare('SELECT url FROM wiki_cards WHERE item_id = ?').bind(itemId).all<{ url: string }>();
  const seen = new Set(existing.results.map((r) => r.url));
  let position = existing.results.length;
  let added = 0;
  for (const q of queries) {
    if (added + existing.results.length >= limit) break;
    const s = await resolveWikiTopic(q).catch(() => null);
    if (!s || seen.has(s.url)) continue;
    seen.add(s.url);
    await env.DB.prepare(
      `INSERT INTO wiki_cards (id, item_id, query, title, summary, extract, url, revision, status, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
    )
      .bind(newId('wk_'), itemId, q, s.title, bestSentence(s.extract, why[q] ?? ''), s.extract, s.url, s.revision ?? null, position++, nowIso())
      .run();
    added++;
  }
  return { cards: added };
}

// ---------------------------------------------------------------- draft

interface DraftPieceFailure {
  what: string;
  why: string;
}

/** Check every machine-written piece of a draft: style, verbatim excerpts, real citations. */
export function auditDraft(out: DraftOutput, source: string, cards: Pick<WikiRow, 'title'>[], limits: DraftLimits = { excerptWords: 250, ideas: 0 }): DraftPieceFailure[] {
  const failures: DraftPieceFailure[] = [];
  const titles = new Set(cards.map((c) => c.title.toLowerCase()));
  out.titles.forEach((t, i) => {
    const r = checkStyle([t.text, t.italic].filter(Boolean).join(' '));
    if (!r.ok) failures.push({ what: `title ${i + 1}`, why: describeIssues(r.issues) });
  });
  out.excerpts.forEach((e, i) => {
    if (!findVerbatim(source, e.quote)) failures.push({ what: `excerpt ${i + 1}`, why: '- The quotation is not in the source word for word. Copy it exactly.' });
    const words = countWords(e.quote);
    // A little slack: the model counts words differently from us.
    if (words > Math.round(limits.excerptWords * 1.1)) failures.push({ what: `excerpt ${i + 1}`, why: `- It is ${words} words; this item allows at most ${limits.excerptWords}. Choose a shorter passage or one paragraph of it.` });
  });
  out.ideas.forEach((m, i) => {
    const r = checkStyle(m.idea);
    if (!r.ok) failures.push({ what: `idea ${i + 1}`, why: describeIssues(r.issues) });
    if (!findVerbatim(source, m.quote)) failures.push({ what: `idea ${i + 1}`, why: '- Its quotation is not in the source word for word. Copy one to three consecutive sentences exactly.' });
    else if (countWords(m.quote) > 90) failures.push({ what: `idea ${i + 1}`, why: '- Its quotation is too long. Quote at most three sentences.' });
  });
  out.marginalia.forEach((m, i) => {
    const r = checkStyle(m.text);
    if (!r.ok) failures.push({ what: `note ${i + 1}`, why: describeIssues(r.issues) });
    if (m.cite.kind === 'source' && !(m.cite.quote && findVerbatim(source, m.cite.quote))) {
      failures.push({ what: `note ${i + 1}`, why: '- Its cited quotation is not in the source word for word.' });
    }
    if (m.cite.kind === 'wiki' && !(m.cite.title && titles.has(m.cite.title.toLowerCase()))) {
      failures.push({ what: `note ${i + 1}`, why: '- It cites a Wikipedia article that was not provided. Cite one of the provided titles exactly.' });
    }
  });
  return failures;
}

export interface DraftLimits {
  /** Longest excerpt, in words (see excerptCap). */
  excerptWords: number;
  /** How many big ideas to draw out; 0 for most items. */
  ideas: number;
}

/** What this item may be given: the excerpt length guide and, for long items, a number of ideas. */
export function draftLimits(item: Pick<ItemRow, 'type' | 'minutes'>, sourceWords: number): DraftLimits {
  return { excerptWords: excerptCap(sourceWords), ideas: wantsIdeas(item.type as ContentType, sourceWords, item.minutes) ? ideaCount(sourceWords) : 0 };
}

/** Short quotations and posts print whole: the whole captured text becomes the excerpt, unless one is chosen. */
const WHOLE_MAX_WORDS = 400;
export async function quoteWhole(env: Env, item: Pick<ItemRow, 'id' | 'type' | 'locator'>, src: Pick<SourceRow, 'text' | 'word_count'>): Promise<boolean> {
  if (item.type === 'post' || !QUOTED_WHOLE.has(item.type as ContentType) || src.word_count > WHOLE_MAX_WORDS) return false;
  if (await env.DB.prepare('SELECT 1 FROM excerpts WHERE item_id = ? AND chosen = 1').bind(item.id).first()) return false;
  let start = 0;
  let end = src.text.length;
  while (start < end && /\s/.test(src.text[start]!)) start++;
  while (end > start && /\s/.test(src.text[end - 1]!)) end--;
  if (end <= start) return false;
  await env.DB.prepare(
    `INSERT INTO excerpts (id, item_id, start, end, text, locator, origin, chosen, verified, why, created_at) VALUES (?, ?, ?, ?, ?, ?, 'editor', 1, 1, ?, ?)`,
  )
    .bind(newId('ex_'), item.id, start, end, src.text.slice(start, end), item.locator ?? '', 'The whole of what you captured: a quotation or a post prints whole.', nowIso())
    .run();
  return true;
}

function failingIndexes(failures: DraftPieceFailure[], prefix: string): Set<number> {
  return new Set(failures.filter((f) => f.what.startsWith(prefix)).map((f) => Number(f.what.split(' ')[1]) - 1));
}

export async function draftItem(env: Env, itemId: string): Promise<{ titles: number; excerpts: number; notes: number; ideas: number; dropped: number; attempts: number }> {
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  if (!item || !src) throw new Error('Item or source missing');
  await setStatus(env, itemId, 'drafting');
  await quoteWhole(env, item, src);
  const cardRow = await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'card'`).bind(itemId).first<{ body: string }>();
  const card = parseJson<Partial<ReadingCard> & { quotables?: Array<{ quote: string }> }>(cardRow?.body, {});
  const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ? AND status != 'cut' ORDER BY position`).bind(itemId).all<WikiRow>()).results;
  const max = loadRoutes(env).tasks.draft.maxInputChars;
  const limits = draftLimits(item, src.word_count);
  const basePrompt = [
    itemHeader(item),
    `Excerpt length for this item: each passage between 50 and ${limits.excerptWords} words (the piece is ${src.word_count.toLocaleString('en-IN')} words).`,
    limits.ideas ? `Ideas for this item: give ${limits.ideas}.` : 'Ideas for this item: none. Return an empty list.',
    isPunctuated(src.text)
      ? ''
      : 'The source is a rough machine transcript without punctuation, so it has no sentences to count. For each idea quote 15 to 60 consecutive words; for each excerpt, one stretch of 80 words up to the limit. Copy the words exactly as they are, without adding punctuation.',
    item.why_text ? `The editor's note on why it is here (for your understanding only, never quote or rewrite it):\n${item.why_text}` : '',
    card.summary ? `Reading card summary: ${card.summary}` : '',
    card.quotables?.length ? `Lines the reader flagged:\n${card.quotables.map((q) => `- ${q.quote}`).join('\n')}` : '',
    cards.length
      ? `Wikipedia articles you may cite (by exact title):\n${cards.map((c) => `### ${c.title}\n${truncate(c.extract, 1500)}`).join('\n\n')}`
      : 'No Wikipedia articles are available; cite only the source.',
    `SOURCE TEXT:\n"""\n${truncate(src.text, max)}\n"""`,
  ]
    .filter(Boolean)
    .join('\n\n');

  let out: DraftOutput | null = null;
  let model = '';
  let failures: DraftPieceFailure[] = [];
  let attempts = 0;
  for (; attempts < 3; attempts++) {
    const feedback: string = attempts && out
      ? `\n\nYour previous draft had problems. Fix them and return the whole draft again.\n${failures.map((f) => `${f.what}:\n${f.why}`).join('\n')}\nPrevious draft:\n${JSON.stringify(out)}`
      : '';
    // The item and source are the same on every attempt: sent as cacheable context, with only the
    // feedback changing, so a redraft reads them from the provider's prompt cache.
    const r: { data: DraftOutput; model: string } = await generateJson(env, {
      task: 'draft',
      system: DRAFT_SYSTEM,
      context: basePrompt,
      prompt: feedback.trim() || 'Draft the apparatus for this item.',
      schema: draftSchema,
      itemId,
      temperature: attempts ? 0.3 : undefined,
    });
    out = { ...r.data, titles: r.data.titles.slice(0, 6), excerpts: r.data.excerpts.slice(0, 4), marginalia: r.data.marginalia.slice(0, 3), ideas: r.data.ideas.slice(0, Math.max(limits.ideas, 0)) };
    model = r.model;
    failures = auditDraft(out, src.text, cards, limits);
    if (failures.length === 0) break;
  }
  if (!out) throw new Error('No draft');
  attempts = Math.min(attempts + 1, 3);

  // Whatever still fails after regeneration is dropped; the editor never sees it.
  const badTitles = failingIndexes(failures, 'title');
  const badExcerpts = failingIndexes(failures, 'excerpt');
  const badNotes = failingIndexes(failures, 'note');
  const badIdeas = failingIndexes(failures, 'idea');
  const now = nowIso();

  // Kept and edited lines survive a redraft; proposals and the checker's rejections are replaced.
  await env.DB.prepare(`DELETE FROM drafts WHERE item_id = ? AND kind IN ('title', 'marginal', 'idea') AND status IN ('proposed', 'rejected')`).bind(itemId).run();
  await env.DB.prepare(`DELETE FROM excerpts WHERE item_id = ? AND origin = 'machine' AND chosen = 0`).bind(itemId).run();

  const stmts: D1PreparedStatement[] = [];
  out.titles.forEach((t, i) => {
    if (badTitles.has(i)) return;
    stmts.push(
      env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES (?, ?, 'title', ?, 'proposed', ?, ?, ?, ?)`).bind(
        newId('dr_'),
        itemId,
        JSON.stringify({ ...normaliseTitle(t), ...(t.angle ? { angle: t.angle } : {}) }),
        model,
        i,
        now,
        now,
      ),
    );
  });
  let excerpts = 0;
  out.excerpts.forEach((e, i) => {
    if (badExcerpts.has(i)) return;
    const found = findVerbatim(src.text, e.quote);
    if (!found) return;
    const hl = e.highlight ? findVerbatim(found.text, e.highlight) : null;
    excerpts++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO excerpts (id, item_id, start, end, text, highlight_start, highlight_end, locator, origin, chosen, verified, why, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'machine', 0, 1, ?, ?)`,
      ).bind(newId('ex_'), itemId, found.start, found.end, found.text, hl?.start ?? null, hl?.end ?? null, locatorFor(item, src, found.start), e.why?.trim() || null, now),
    );
  });
  let notes = 0;
  out.marginalia.forEach((m, i) => {
    if (badNotes.has(i)) return;
    let cite: MarginalBody['cite'];
    if (m.cite.kind === 'source') {
      const f = findVerbatim(src.text, m.cite.quote ?? '')!;
      cite = { kind: 'source', quote: f.text, start: f.start, end: f.end };
    } else {
      const c = cards.find((x) => x.title.toLowerCase() === m.cite.title!.toLowerCase())!;
      cite = { kind: 'wiki', title: c.title, cardId: c.id };
    }
    const body: MarginalBody = { text: m.text.trim(), cite, verdict: 'unchecked' };
    notes++;
    stmts.push(
      env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES (?, ?, 'marginal', ?, 'proposed', ?, ?, ?, ?)`).bind(
        newId('dr_'),
        itemId,
        JSON.stringify(body),
        model,
        i,
        now,
        now,
      ),
    );
  });
  let ideas = 0;
  // Ideas are kept in the order the piece makes them, so a long conversation reads as a map of it.
  const placed = out.ideas
    .map((m, i) => ({ m, i, f: badIdeas.has(i) ? null : findVerbatim(src.text, m.quote) }))
    .filter((x): x is { m: (typeof out.ideas)[number]; i: number; f: NonNullable<ReturnType<typeof findVerbatim>> } => Boolean(x.f))
    .sort((a, b) => a.f.start - b.f.start);
  placed.forEach(({ m, f }, i) => {
    const body: MarginalBody = { text: m.idea.trim(), cite: { kind: 'source', quote: f.text, start: f.start, end: f.end }, locator: locatorFor(item, src, f.start), verdict: 'unchecked' };
    ideas++;
    stmts.push(
      env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES (?, ?, 'idea', ?, 'proposed', ?, ?, ?, ?)`).bind(
        newId('dr_'),
        itemId,
        JSON.stringify(body),
        model,
        i,
        now,
        now,
      ),
    );
  });
  if (stmts.length) await env.DB.batch(stmts);
  const dropped = badTitles.size + badExcerpts.size + badNotes.size + badIdeas.size;
  await upsertCheck(env, itemId, 'drafting', dropped ? 'warn' : 'pass', {
    summary: dropped ? `${dropped} draft line${dropped === 1 ? '' : 's'} failed the house checks after ${attempts} tries and were dropped` : `Drafted in ${attempts} ${attempts === 1 ? 'try' : 'tries'}; every line passed the house checks`,
    rows: failures.map((f) => ({ label: f.what, detail: f.why })),
  });
  return { titles: out.titles.length - badTitles.size, excerpts, notes, ideas, dropped, attempts };
}

/** Titles set their last phrase in italic: { text: "What cheap things", italic: "cost" }. Models often repeat the phrase in both. */
export function normaliseTitle(t: { text: string; italic?: string }): { text: string; italic?: string } {
  let text = t.text.trim().replace(/\s+/g, ' ');
  const italic = t.italic?.trim().replace(/\s+/g, ' ');
  if (!italic || italic.toLowerCase() === text.toLowerCase()) return { text };
  if (text.toLowerCase().endsWith(italic.toLowerCase())) text = text.slice(0, text.length - italic.length).trim();
  else if (!text) return { text: italic };
  return text ? { text, italic } : { text: italic };
}

/** A default locator for an offset: PDF page, transcript time, nearest heading, or the item's own. */
export function locatorFor(item: Pick<ItemRow, 'locator' | 'type'>, src: { meta: string | null }, offset: number): string {
  const meta = parseJson<SourceMeta>(src.meta, {});
  if (meta.pages && meta.pages.length > 1) return `p. ${pageAt(meta.pages, offset)}`;
  if (meta.times?.length) {
    let t = meta.times[0]!;
    for (const x of meta.times) if (x.offset <= offset) t = x;
    return `at ${msToClock(t.ms)}`;
  }
  if (meta.headings?.length) {
    let h: { offset: number; text: string } | null = null;
    for (const x of meta.headings) if (x.offset <= offset) h = x;
    if (h) return truncate(h.text, 60);
  }
  return item.locator ?? '';
}

// ---------------------------------------------------------------- judge

/**
 * Check machine notes and ideas against their cited evidence with the judge model. A proposal the
 * checker does not fully support is set aside ('rejected') and never shown to the editor, the same
 * rule as prose that fails the house style. A line the editor kept or edited keeps its status and
 * shows the verdict, so the editor can fix their own wording.
 */
export async function judgeNotes(env: Env, itemId: string, onlyDraftId?: string): Promise<{ checked: number; rejected: number }> {
  const src = await getSource(env, itemId);
  if (!src) return { checked: 0, rejected: 0 };
  const rows = (
    await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind IN ('marginal', 'idea') AND status NOT IN ('cut', 'rejected') ORDER BY kind, position`).bind(itemId).all<DraftRow>()
  ).results.filter((r) => !onlyDraftId || r.id === onlyDraftId);
  if (!rows.length) return { checked: 0, rejected: 0 };
  const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ?`).bind(itemId).all<WikiRow>()).results;
  const evidence = (b: MarginalBody, kind: string) => {
    if (b.cite.kind === 'source') {
      // The cited line plus context. An idea sums up a stretch of a talk or paper around its quote,
      // so it is judged against that stretch (about two minutes of speech either side).
      const pad = kind === 'idea' ? 2500 : 600;
      const from = Math.max(0, b.cite.start - pad);
      const to = Math.min(src.text.length, b.cite.end + pad);
      return `From the source: """${src.text.slice(from, to)}"""`;
    }
    const cid = b.cite.cardId;
    const c = cards.find((x) => x.id === cid);
    return c ? `From Wikipedia, "${c.title}": """${c.extract}"""` : 'No evidence available.';
  };
  const bodies = rows.map((r) => parseJson<MarginalBody>(r.body, { text: '', cite: { kind: 'source', quote: '', start: 0, end: 0 } }));
  const prompt = bodies.map((b, i) => `${rows[i]!.kind === 'idea' ? 'NOTE (an idea from the piece)' : 'NOTE'} ${i}: ${b.text}\nEVIDENCE ${i}: ${evidence(b, rows[i]!.kind)}`).join('\n\n');
  const { data } = await generateJson(env, { task: 'judge', system: JUDGE_SYSTEM, prompt, schema: judgeSchema, itemId });
  const stmts: D1PreparedStatement[] = [];
  let rejected = 0;
  bodies.forEach((b, i) => {
    const v = data.verdicts.find((x) => x.index === i);
    const next: MarginalBody = { ...b, verdict: v?.verdict ?? 'unchecked', reason: v?.reason ?? 'The checker returned no verdict.' };
    delete next.corrected;
    const row = rows[i]!;
    // Only what the checker confirmed is offered; no verdict counts as not confirmed.
    const reject = row.status === 'proposed' && next.verdict !== 'supported';
    if (reject) rejected++;
    stmts.push(env.DB.prepare('UPDATE drafts SET body = ?, status = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), reject ? 'rejected' : row.status, nowIso(), row.id));
  });
  await env.DB.batch(stmts);
  return { checked: rows.length, rejected };
}

// ---------------------------------------------------------------- checks

export interface CheckSummary {
  status: 'pass' | 'warn' | 'fail';
  summary: string;
  rows: Array<{ label: string; status: 'pass' | 'warn' | 'fail'; detail?: string }>;
}

const worst = (rows: CheckSummary['rows']): CheckSummary['status'] =>
  rows.some((r) => r.status === 'fail') ? 'fail' : rows.some((r) => r.status === 'warn') ? 'warn' : 'pass';

export async function runChecks(env: Env, itemId: string, opts: { links?: boolean } = {}): Promise<Record<string, CheckSummary>> {
  const item = await getItem(env, itemId);
  if (!item) throw new Error('No such item');
  const src = await getSource(env, itemId);
  const results: Record<string, CheckSummary> = {};

  // Links: the source, the media link and every Wikipedia card that is not cut.
  if (opts.links !== false) {
    const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ? AND status != 'cut'`).bind(itemId).all<WikiRow>()).results;
    const media = parseJson<{ url?: string } | null>(item.media, null);
    const targets = [
      ...(item.canonical_url || item.url ? [{ label: 'Source', url: (item.canonical_url || item.url)! }] : []),
      ...(media?.url ? [{ label: 'Media', url: media.url }] : []),
      ...cards.map((c) => ({ label: `Wikipedia: ${c.title}`, url: c.url, id: c.id })),
      // A Life's sources and further reading.
      ...(item.type === 'life' ? await lifeLinks(env, itemId) : []),
      // Videos, recordings and posts the editor added: readers follow these links too.
      ...(await blocksFor(env, itemId)).flatMap((r) => {
        if (r.status !== 'kept' || (r.kind !== 'video' && r.kind !== 'audio' && r.kind !== 'post')) return [];
        const b = parseJson<{ link?: string; url?: string; title?: string; author?: string } | null>(r.body, null);
        const url = r.kind === 'video' ? b?.link : b?.url;
        const label = r.kind === 'post' ? `Post: ${b?.author ?? url}` : `${r.kind === 'video' ? 'Video' : 'Audio'}: ${b?.title ?? url}`;
        return url ? [{ label, url }] : [];
      }),
    ];
    const rows: CheckSummary['rows'] = [];
    for (const t of targets) {
      const r = await checkLink(t.url);
      const blocked = [401, 403, 406, 429, 999].includes(r.status);
      rows.push({ label: t.label, status: r.ok ? 'pass' : blocked ? 'warn' : 'fail', detail: r.ok ? `${r.status}` : blocked ? `${r.status}: the site refused our checker; open it yourself` : r.status ? `returned ${r.status}` : 'did not respond' });
      if ('id' in t && t.id) await env.DB.prepare('UPDATE wiki_cards SET http_status = ?, checked_at = ? WHERE id = ?').bind(r.status, nowIso(), t.id).run();
    }
    if (!item.url && !item.canonical_url) rows.push({ label: 'Source link', status: 'fail', detail: 'Add an https link to the original (readers always get one)' });
    const ok = rows.filter((r) => r.status === 'pass').length;
    results.links = { status: worst(rows), summary: `${ok} of ${rows.length} links resolve`, rows };
  }

  // Quotes: the chosen excerpt is the source, character for character, at its offsets. A Rhyme's
  // two quotes are each checked against their own fetched source instead.
  if (item.kind === 'rhyme') {
    const rows = await rhymeQuoteRows(env, itemId);
    const ok = rows.filter((r) => r.status === 'pass').length;
    results.quotes = { status: worst(rows), summary: `${ok} of ${rows.length} rhyme checks pass`, rows };
  } else {
    const ex = await env.DB.prepare('SELECT * FROM excerpts WHERE item_id = ? AND chosen = 1').bind(itemId).first<ExcerptRow>();
    const rows: CheckSummary['rows'] = [];
    if (!ex) rows.push({ label: 'Excerpt', status: 'warn', detail: 'No excerpt chosen yet (optional for some items)' });
    else if (!src) rows.push({ label: 'Excerpt', status: 'fail', detail: 'No source text to check against' });
    else {
      const ok = isVerbatimAt(src.text, ex, ex.text);
      rows.push({ label: 'Excerpt', status: ok ? 'pass' : 'fail', detail: ok ? 'Found word for word in the source' : 'Not found at its place in the source; select it again' });
      if (ex.highlight_start != null && ex.highlight_end != null) {
        const okH = ex.highlight_start >= 0 && ex.highlight_end <= ex.text.length && ex.highlight_start < ex.highlight_end;
        rows.push({ label: 'Highlight', status: okH ? 'pass' : 'fail', detail: okH ? 'Inside the excerpt' : 'Outside the excerpt' });
      }
      await env.DB.prepare('UPDATE excerpts SET verified = ? WHERE id = ?').bind(ok ? 1 : 0, ex.id).run();
    }
    // Pull quotes and code blocks are excerpts too: each must still be in the source.
    rows.push(...blockQuoteRows(await blocksFor(env, itemId), src?.text ?? null));
    results.quotes = { status: worst(rows), summary: rows[0]!.detail ?? '', rows };
  }

  // Style and citations of the machine notes and ideas that will ship: the ones the editor kept or
  // edited. Proposals the editor has not ticked are simply not published, so they are not counted.
  {
    const notes = (
      await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind IN ('marginal', 'idea') AND status IN ('kept', 'edited') ORDER BY kind DESC, position`).bind(itemId).all<DraftRow>()
    ).results;
    const styleRows: CheckSummary['rows'] = [];
    const citeRows: CheckSummary['rows'] = [];
    for (const [i, n] of notes.entries()) {
      const b = parseJson<MarginalBody | null>(n.body, null);
      if (!b) continue;
      const label = `${n.kind === 'idea' ? 'Idea' : 'Note'} ${i + 1}`;
      const s = checkStyle(b.text);
      styleRows.push({ label, status: s.ok ? (s.issues.length ? 'warn' : 'pass') : 'fail', detail: s.issues.map((x) => x.message).join(' ') || 'Clean' });
      const hasCite = b.cite.kind === 'source' ? Boolean(src && isVerbatimAt(src.text, b.cite, b.cite.quote)) : Boolean(b.cite.cardId);
      const verdict = b.verdict ?? 'unchecked';
      const status = !hasCite ? 'fail' : verdict === 'supported' ? 'pass' : verdict === 'unchecked' ? 'warn' : 'fail';
      citeRows.push({
        label,
        status,
        detail: !hasCite ? 'Its citation no longer matches the evidence' : verdict === 'supported' ? (b.cite.kind === 'wiki' ? `Checked against Wikipedia: ${b.cite.title}` : 'Checked against the source') : verdict === 'unchecked' ? 'Not checked yet' : `Checker: ${verdict}. ${b.reason ?? ''}`,
      });
    }
    const titleRows = (
      await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'title' AND status NOT IN ('cut', 'rejected')`).bind(itemId).all<{ body: string }>()
    ).results.map((t, i) => {
      const tt = parseJson<{ text: string; italic?: string }>(t.body, { text: '' });
      const s = checkStyle([tt.text, tt.italic].filter(Boolean).join(' '));
      return { label: `Title option ${i + 1}`, status: s.ok ? 'pass' : 'fail', detail: s.issues.map((x) => x.message).join(' ') || 'Clean' } as const;
    });
    const sRows = [...styleRows, ...titleRows];
    results.style = { status: worst(sRows), summary: sRows.length ? `${sRows.filter((r) => r.status === 'pass').length} of ${sRows.length} machine lines pass the style check` : 'No machine prose yet', rows: sRows };
    results.citations = {
      status: worst(citeRows),
      summary: citeRows.length ? `${citeRows.filter((r) => r.status === 'pass').length} of ${citeRows.length} kept notes and ideas checked against their sources` : 'No machine notes kept',
      rows: citeRows,
    };
  }

  // A Life: its profile, approved by the editor (the lines themselves are checked in lives.ts).
  if (item.type === 'life') {
    const row = await lifeRow(env, itemId);
    const problems = parseJson<string[]>(row?.problems, []);
    const status = !row ? 'fail' : row.approved_at ? 'pass' : 'warn';
    results.life = {
      status,
      summary: !row ? 'No profile yet' : row.approved_at ? 'Profile approved' : problems.length ? `${problems.length} problems before it can be approved` : 'Read the profile and approve it',
      rows: problems.map((p) => ({ label: 'Profile', status: 'fail' as const, detail: p })),
    };
  }

  // The editor's own note.
  {
    const ok = Boolean(item.why_text?.trim());
    // A quotation the note sets out ("> " lines) is the source's words: each must be found there.
    const quoted = ok ? itemNote(item.why_text!).quotations : [];
    const qRows: CheckSummary['rows'] = quoted.map((q, i) => {
      const found = Boolean(src?.text && findQuotation(src.text, q));
      return { label: `Quotation ${i + 1} in your note`, status: found ? 'pass' : 'fail', detail: found ? 'Found word for word in the source' : `Not in the source word for word: "${truncate(q, 80)}"` };
    });
    const missing = qRows.filter((r) => r.status === 'fail').length;
    results.why = {
      status: !ok || missing ? 'fail' : 'pass',
      summary: !ok ? "No \"why it's here\" yet" : missing ? `${missing} of ${qRows.length} quotations in your note are not in the source` : 'Your note is in',
      rows: [{ label: "Why it's here", status: ok ? 'pass' : 'fail' }, ...qRows],
    };
  }

  for (const [name, r] of Object.entries(results)) await upsertCheck(env, itemId, name, r.status, { summary: r.summary, rows: r.rows });
  return results;
}
