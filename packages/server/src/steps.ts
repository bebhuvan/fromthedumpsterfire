// The per-item pipeline, as plain functions. The Workflow in workers/pipeline wraps each in a
// durable step; the Desk API calls some directly (re-check after an edit). Every step writes its
// output to D1 and returns only small values.

import { checkStyle, describeIssues } from '@fdf/shared/style';
import { findVerbatim, isVerbatimAt } from '@fdf/shared/verbatim';
import type { Env } from './env';
import type { DraftRow, ExcerptRow, ItemRow, MarginalBody, WikiRow } from './db';
import { getItem, getSource, setStatus, upsertCheck } from './db';
import type { FetchOutcome, SourceMeta } from './ingest';
import { generateJson } from './models/router';
import { DRAFT_SYSTEM, draftSchema, JUDGE_SYSTEM, judgeSchema, READ_SYSTEM, readSchema, type DraftOutput, type ReadingCard } from './prompts';
import { checkLink } from './extract/http';
import { firstSentence, resolveWikiTopic } from './wiki';
import { loadRoutes } from './models/router';
import { newId, nowIso, parseJson, truncate, wordCount } from './util';
import { pageAt } from './extract/pdf';
import { msToClock } from './extract/youtube';
import { rhymeQuoteRows } from './rhymes';

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

export async function readItem(env: Env, itemId: string): Promise<{ queries: string[] }> {
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  if (!item || !src) throw new Error('Item or source missing');
  await setStatus(env, itemId, 'reading');
  const max = loadRoutes(env).tasks.read.maxInputChars;
  const { data, model } = await generateJson(env, {
    task: 'read',
    system: READ_SYSTEM,
    prompt: `${itemHeader(item)}\n\nSOURCE TEXT:\n"""\n${truncate(src.text, max)}\n"""`,
    schema: readSchema,
    itemId,
  });
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
  const queries = [...new Set(data.entities.map((e) => e.wikiQuery.trim()).filter((q) => q && !/https?:|www\./i.test(q)))];
  return { queries: queries.slice(0, 8) };
}

// ---------------------------------------------------------------- wiki

export async function resolveWiki(env: Env, itemId: string, queries: string[], limit = 5): Promise<{ cards: number }> {
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
      .bind(newId('wk_'), itemId, q, s.title, firstSentence(s.extract), s.extract, s.url, s.revision ?? null, position++, nowIso())
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
export function auditDraft(out: DraftOutput, source: string, cards: Pick<WikiRow, 'title'>[]): DraftPieceFailure[] {
  const failures: DraftPieceFailure[] = [];
  const titles = new Set(cards.map((c) => c.title.toLowerCase()));
  out.titles.forEach((t, i) => {
    const r = checkStyle([t.text, t.italic].filter(Boolean).join(' '));
    if (!r.ok) failures.push({ what: `title ${i + 1}`, why: describeIssues(r.issues) });
  });
  out.excerpts.forEach((e, i) => {
    if (!findVerbatim(source, e.quote)) failures.push({ what: `excerpt ${i + 1}`, why: '- The quotation is not in the source word for word. Copy it exactly.' });
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

function failingIndexes(failures: DraftPieceFailure[], prefix: string): Set<number> {
  return new Set(failures.filter((f) => f.what.startsWith(prefix)).map((f) => Number(f.what.split(' ')[1]) - 1));
}

export async function draftItem(env: Env, itemId: string): Promise<{ titles: number; excerpts: number; notes: number; dropped: number; attempts: number }> {
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  if (!item || !src) throw new Error('Item or source missing');
  await setStatus(env, itemId, 'drafting');
  const cardRow = await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'card'`).bind(itemId).first<{ body: string }>();
  const card = parseJson<Partial<ReadingCard> & { quotables?: Array<{ quote: string }> }>(cardRow?.body, {});
  const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ? AND status != 'cut' ORDER BY position`).bind(itemId).all<WikiRow>()).results;
  const max = loadRoutes(env).tasks.draft.maxInputChars;
  const basePrompt = [
    itemHeader(item),
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
    const r: { data: DraftOutput; model: string } = await generateJson(env, { task: 'draft', system: DRAFT_SYSTEM, prompt: basePrompt + feedback, schema: draftSchema, itemId, temperature: attempts ? 0.3 : undefined });
    out = r.data;
    model = r.model;
    failures = auditDraft(r.data, src.text, cards);
    if (failures.length === 0) break;
  }
  if (!out) throw new Error('No draft');
  attempts = Math.min(attempts + 1, 3);

  // Whatever still fails after regeneration is dropped; the editor never sees it.
  const badTitles = failingIndexes(failures, 'title');
  const badExcerpts = failingIndexes(failures, 'excerpt');
  const badNotes = failingIndexes(failures, 'note');
  const now = nowIso();

  await env.DB.prepare(`DELETE FROM drafts WHERE item_id = ? AND kind IN ('title', 'marginal') AND status = 'proposed'`).bind(itemId).run();
  await env.DB.prepare(`DELETE FROM excerpts WHERE item_id = ? AND origin = 'machine' AND chosen = 0`).bind(itemId).run();

  const stmts: D1PreparedStatement[] = [];
  out.titles.forEach((t, i) => {
    if (badTitles.has(i)) return;
    stmts.push(
      env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES (?, ?, 'title', ?, 'proposed', ?, ?, ?, ?)`).bind(
        newId('dr_'),
        itemId,
        JSON.stringify(normaliseTitle(t)),
        model,
        i,
        now,
        now,
      ),
    );
  });
  let excerpts = 0;
  out.excerpts.forEach((e) => {
    const found = findVerbatim(src.text, e.quote);
    if (!found) return;
    const hl = e.highlight ? findVerbatim(found.text, e.highlight) : null;
    excerpts++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO excerpts (id, item_id, start, end, text, highlight_start, highlight_end, locator, origin, chosen, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'machine', 0, 1, ?)`,
      ).bind(newId('ex_'), itemId, found.start, found.end, found.text, hl?.start ?? null, hl?.end ?? null, locatorFor(item, src, found.start), now),
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
  if (stmts.length) await env.DB.batch(stmts);
  const dropped = badTitles.size + badExcerpts.size + badNotes.size;
  await upsertCheck(env, itemId, 'drafting', dropped ? 'warn' : 'pass', {
    summary: dropped ? `${dropped} draft line${dropped === 1 ? '' : 's'} failed the house checks after ${attempts} tries and were dropped` : `Drafted in ${attempts} ${attempts === 1 ? 'try' : 'tries'}; every line passed the house checks`,
    rows: failures.map((f) => ({ label: f.what, detail: f.why })),
  });
  return { titles: out.titles.length - badTitles.size, excerpts, notes, dropped, attempts };
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

/** Check machine notes against their cited evidence with the judge model. */
export async function judgeNotes(env: Env, itemId: string, onlyDraftId?: string): Promise<{ checked: number }> {
  const src = await getSource(env, itemId);
  if (!src) return { checked: 0 };
  const rows = (
    await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status != 'cut' ORDER BY position`).bind(itemId).all<DraftRow>()
  ).results.filter((r) => !onlyDraftId || r.id === onlyDraftId);
  if (!rows.length) return { checked: 0 };
  const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ?`).bind(itemId).all<WikiRow>()).results;
  const evidence = (b: MarginalBody) => {
    if (b.cite.kind === 'source') {
      // The cited line plus a little context on either side.
      const from = Math.max(0, b.cite.start - 600);
      const to = Math.min(src.text.length, b.cite.end + 600);
      return `From the source: """${src.text.slice(from, to)}"""`;
    }
    const cid = b.cite.cardId;
    const c = cards.find((x) => x.id === cid);
    return c ? `From Wikipedia, "${c.title}": """${c.extract}"""` : 'No evidence available.';
  };
  const bodies = rows.map((r) => parseJson<MarginalBody>(r.body, { text: '', cite: { kind: 'source', quote: '', start: 0, end: 0 } }));
  const prompt = bodies.map((b, i) => `NOTE ${i}: ${b.text}\nEVIDENCE ${i}: ${evidence(b)}`).join('\n\n');
  const { data } = await generateJson(env, { task: 'judge', system: JUDGE_SYSTEM, prompt, schema: judgeSchema, itemId });
  const stmts: D1PreparedStatement[] = [];
  bodies.forEach((b, i) => {
    const v = data.verdicts.find((x) => x.index === i);
    const next: MarginalBody = { ...b, verdict: v?.verdict ?? 'unchecked', reason: v?.reason ?? 'The checker returned no verdict.' };
    // A correction may only narrow the note: short, in house style, never longer than the original by much.
    if (v?.verdict === 'partly' && v.corrected && checkStyle(v.corrected).ok && v.corrected.length <= b.text.length * 1.3 + 20) next.corrected = v.corrected.trim();
    else delete next.corrected;
    stmts.push(env.DB.prepare('UPDATE drafts SET body = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), nowIso(), rows[i]!.id));
  });
  await env.DB.batch(stmts);
  return { checked: rows.length };
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
    ];
    const rows: CheckSummary['rows'] = [];
    for (const t of targets) {
      const r = await checkLink(t.url);
      const blocked = [401, 403, 429, 999].includes(r.status);
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
    results.quotes = { status: worst(rows), summary: rows[0]!.detail ?? '', rows };
  }

  // Style and citations of the machine notes that will ship (kept or edited) or are waiting.
  {
    const notes = (
      await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status != 'cut' ORDER BY position`).bind(itemId).all<DraftRow>()
    ).results;
    const styleRows: CheckSummary['rows'] = [];
    const citeRows: CheckSummary['rows'] = [];
    for (const [i, n] of notes.entries()) {
      const b = parseJson<MarginalBody | null>(n.body, null);
      if (!b) continue;
      const label = `Note ${i + 1}${n.status === 'proposed' ? ' (waiting on you)' : ''}`;
      const s = checkStyle(b.text);
      styleRows.push({ label, status: s.ok ? (s.issues.length ? 'warn' : 'pass') : 'fail', detail: s.issues.map((x) => x.message).join(' ') || 'Clean' });
      const hasCite = b.cite.kind === 'source' ? Boolean(src && isVerbatimAt(src.text, b.cite, b.cite.quote)) : Boolean(b.cite.cardId);
      const verdict = b.verdict ?? 'unchecked';
      const status = !hasCite ? 'fail' : verdict === 'supported' ? (n.status === 'proposed' ? 'warn' : 'pass') : verdict === 'unchecked' ? 'warn' : 'fail';
      citeRows.push({
        label,
        status,
        detail: !hasCite ? 'Its citation no longer matches the evidence' : verdict === 'supported' ? (b.cite.kind === 'wiki' ? `Checked against Wikipedia: ${b.cite.title}` : 'Checked against the source') : verdict === 'unchecked' ? 'Not checked yet' : `Checker: ${verdict}. ${b.reason ?? ''}`,
      });
    }
    const titleRows = (
      await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'title' AND status != 'cut'`).bind(itemId).all<{ body: string }>()
    ).results.map((t, i) => {
      const tt = parseJson<{ text: string; italic?: string }>(t.body, { text: '' });
      const s = checkStyle([tt.text, tt.italic].filter(Boolean).join(' '));
      return { label: `Title option ${i + 1}`, status: s.ok ? 'pass' : 'fail', detail: s.issues.map((x) => x.message).join(' ') || 'Clean' } as const;
    });
    const sRows = [...styleRows, ...titleRows];
    results.style = { status: worst(sRows), summary: sRows.length ? `${sRows.filter((r) => r.status === 'pass').length} of ${sRows.length} machine lines pass the style check` : 'No machine prose yet', rows: sRows };
    results.citations = {
      status: worst(citeRows),
      summary: citeRows.length ? `${citeRows.filter((r) => r.status === 'pass').length} of ${citeRows.length} notes cited and checked` : 'No machine notes',
      rows: citeRows,
    };
  }

  // The editor's own note.
  {
    const ok = Boolean(item.why_text?.trim());
    results.why = { status: ok ? 'pass' : 'fail', summary: ok ? 'Your note is in' : "No \"why it's here\" yet", rows: [{ label: "Why it's here", status: ok ? 'pass' : 'fail' }] };
  }

  for (const [name, r] of Object.entries(results)) await upsertCheck(env, itemId, name, r.status, { summary: r.summary, rows: r.rows });
  return results;
}
