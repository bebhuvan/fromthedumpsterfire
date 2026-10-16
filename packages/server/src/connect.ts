// Machine-suggested connections and Threads.
//
// 1. embed: source text in overlapping chunks, plus the reading card, embedded with Workers AI
//    (bge-m3) into Vectorize. Chunk offsets live in D1, so a neighbour's text is read back from the
//    stored source, never from the index.
// 2. candidates: Vectorize neighbours, shared Wikipedia cards and shared mechanisms from the reading
//    cards, across every item with a source (published archive items included). Pairs already judged
//    or already connected are skipped, so no pair is paid for twice.
// 3. judge: a stronger model types each candidate edge and must quote BOTH ends. Each quote is matched
//    verbatim against that item's stored source text; the justification passes the style check. Any
//    failure drops the edge. Confidence is stored. The editor approves (with a note in their own
//    words), rejects (a negative example for later judging) or leaves it.
// 4. threads: connected components of kept connections (large ones split at their weakest edges) are
//    offered to the editor with a machine-drafted title, summary and one-line gists, style-checked.

import { EDGE_TYPES, type Thread, type ThreadPoint, type Title } from '@fdf/shared/haul';
import { checkStyle, describeIssues } from '@fdf/shared/style';
import { findVerbatim } from '@fdf/shared/verbatim';
import type { Env } from './env';
import type { ItemRow } from './db';
import { getItem, getSource } from './db';
import { embedTexts, generateJson, loadRoutes } from './models/router';
import { CONNECT_SYSTEM, connectSchema, THREAD_SYSTEM, threadSchema, type ConnectOutput, type ReadingCard } from './prompts';
import { newId, nowIso, parseJson, slugify, truncate } from './util';

// ---------------------------------------------------------------- chunking

export interface Span {
  start: number;
  end: number;
}

/**
 * Split text into chunks of about `size` characters that end at a paragraph or sentence break where
 * possible, overlapping by about `overlap`. Long sources are sampled evenly down to `max` chunks so a
 * book costs the same as an essay.
 */
export function chunkText(text: string, size = 1200, overlap = 150, max = 120): Span[] {
  const spans: Span[] = [];
  const n = text.length;
  let start = 0;
  while (start < n) {
    let end = Math.min(n, start + size);
    if (end < n) {
      const window = text.slice(start + Math.floor(size * 0.6), end);
      const para = window.lastIndexOf('\n\n');
      const sent = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
      const cut = para >= 0 ? para + 2 : sent >= 0 ? sent + 2 : -1;
      if (cut >= 0) end = start + Math.floor(size * 0.6) + cut;
    }
    // Trim edge whitespace so offsets point at text.
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s]!)) s++;
    while (e > s && /\s/.test(text[e - 1]!)) e--;
    if (e - s >= 40) spans.push({ start: s, end: e });
    if (end >= n) break;
    start = Math.max(end - overlap, start + 1);
  }
  if (spans.length <= max) return spans;
  const out: Span[] = [];
  for (let i = 0; i < max; i++) out.push(spans[Math.floor((i * spans.length) / max)]!);
  return out;
}

function cardText(item: ItemRow, card: Partial<ReadingCard>): string {
  return truncate(
    [
      item.title,
      item.creator && `by ${item.creator}`,
      item.source_date,
      card.summary,
      card.claims?.length ? `Claims: ${card.claims.join(' ')}` : '',
      card.mechanisms?.length ? `Mechanisms: ${card.mechanisms.join('; ')}` : '',
      card.entities?.length ? `About: ${card.entities.map((e) => e.name).join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    6000,
  );
}

async function readingCard(env: Env, itemId: string): Promise<Partial<ReadingCard>> {
  const row = await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'card'`).bind(itemId).first<{ body: string }>();
  return parseJson<Partial<ReadingCard>>(row?.body, {});
}

// ---------------------------------------------------------------- candidates

export interface Candidate {
  otherId: string;
  score: number;
  vector: number;
  entities: string[];
  mechanisms: string[];
  /** Matching passages: offsets into each item's source text. */
  mine: Span[];
  theirs: Span[];
}

/** Embed an item's source and card into Vectorize, then look for candidates with the fresh vectors. */
export async function embedAndFindCandidates(env: Env, itemId: string): Promise<{ embedded: number; candidates: Candidate[]; vectorRoute: boolean }> {
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  if (!item || !src) throw new Error('Item or source missing');
  const card = await readingCard(env, itemId);
  if (!env.VECTORS) return { embedded: 0, candidates: await findCandidates(env, itemId, null), vectorRoute: false };

  const old = (await env.DB.prepare('SELECT id FROM chunks WHERE item_id = ?').bind(itemId).all<{ id: string }>()).results.map((r) => r.id);
  if (old.length) await env.VECTORS.deleteByIds(old);
  await env.DB.prepare('DELETE FROM chunks WHERE item_id = ?').bind(itemId).run();

  const spans = chunkText(src.text);
  const texts = [cardText(item, card), ...spans.map((s) => src.text.slice(s.start, s.end))];
  const { vectors, model } = await embedTexts(env, texts, { itemId });
  const ids = [`${itemId}:card`, ...spans.map((_, i) => `${itemId}:${i}`)];
  const now = nowIso();
  for (let i = 0; i < ids.length; i += 500) {
    await env.VECTORS.upsert(
      ids.slice(i, i + 500).map((id, k) => ({ id, values: vectors[i + k]!, metadata: { itemId, kind: i + k === 0 ? 'card' : 'chunk' } })),
    );
  }
  const stmts = ids.map((id, i) =>
    env.DB.prepare('INSERT INTO chunks (id, item_id, n, kind, start, end, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
      id,
      itemId,
      i - 1,
      i === 0 ? 'card' : 'chunk',
      i === 0 ? null : spans[i - 1]!.start,
      i === 0 ? null : spans[i - 1]!.end,
      model,
      now,
    ),
  );
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));

  // Query with the card and an even sample of chunks (fresh vectors may not be queryable by id yet).
  const sample = [0, ...evenSample(spans.length, 8).map((i) => i + 1)];
  const queries = sample.map((i) => ({ vector: vectors[i]!, span: i === 0 ? null : spans[i - 1]! }));
  return { embedded: ids.length, candidates: await findCandidates(env, itemId, queries), vectorRoute: true };
}

function evenSample(n: number, k: number): number[] {
  if (n <= k) return [...Array(n).keys()];
  return [...Array(k).keys()].map((i) => Math.floor(((i + 0.5) * n) / k));
}

/** Items a new item may connect to: anything with a source, unless archived outside a published Haul. */
async function eligibleOthers(env: Env, itemId: string): Promise<Set<string>> {
  const rows = (
    await env.DB.prepare(
      `SELECT i.id FROM items i JOIN sources s ON s.item_id = i.id
       WHERE i.id != ? AND i.kind != 'rhyme' AND (i.archived = 0 OR EXISTS (SELECT 1 FROM haul_items hi JOIN hauls h ON h.id = hi.haul_id WHERE hi.item_id = i.id AND h.status = 'published'))`,
    )
      .bind(itemId)
      .all<{ id: string }>()
  ).results;
  return new Set(rows.map((r) => r.id));
}

export const pairKey = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

const normMech = (m: string) => m.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Thresholds: a vector neighbour must be this similar (cosine, bge-m3) to count on its own. */
export const VECTOR_MIN = 0.6;
export const MAX_CANDIDATES = 4;

export async function findCandidates(env: Env, itemId: string, queries: Array<{ vector: number[]; span: Span | null }> | null): Promise<Candidate[]> {
  const eligible = await eligibleOthers(env, itemId);
  if (!eligible.size) return [];
  const byOther = new Map<string, Candidate>();
  const get = (id: string) => {
    let c = byOther.get(id);
    if (!c) byOther.set(id, (c = { otherId: id, score: 0, vector: 0, entities: [], mechanisms: [], mine: [], theirs: [] }));
    return c;
  };

  // Route 1: embedding neighbours.
  if (env.VECTORS) {
    const qs =
      queries ??
      // Re-runs from the Desk: query by the stored vectors' ids.
      (await env.DB.prepare(`SELECT id, start, end FROM chunks WHERE item_id = ? ORDER BY n`).bind(itemId).all<{ id: string; start: number | null; end: number | null }>()).results.map((r) => ({
        id: r.id,
        span: r.start == null ? null : { start: r.start, end: r.end! },
      }));
    const picked = queries ? qs : [qs[0], ...evenSample(qs.length - 1, 8).map((i) => qs[i + 1])].filter(Boolean);
    const matchedChunkIds = new Map<string, { other: string; score: number; mine: Span | null }>();
    for (const q of picked as Array<{ vector?: number[]; id?: string; span: Span | null }>) {
      const opts = { topK: 20, returnMetadata: 'all' as const, filter: { itemId: { $ne: itemId } } };
      const res = q.vector ? await env.VECTORS.query(q.vector, opts) : await env.VECTORS.queryById(q.id!, opts);
      for (const m of res.matches) {
        const other = String((m.metadata as { itemId?: string } | undefined)?.itemId ?? m.id.split(':')[0]);
        if (other === itemId || !eligible.has(other)) continue;
        const c = get(other);
        if (m.score > c.vector) c.vector = m.score;
        const prev = matchedChunkIds.get(m.id);
        if (!prev || prev.score < m.score) matchedChunkIds.set(m.id, { other, score: m.score, mine: q.span });
      }
    }
    // The best two matching passages per pair, both ends, read back from D1 offsets.
    const best = [...matchedChunkIds.entries()].sort((a, b) => b[1].score - a[1].score);
    for (const [chunkId, m] of best) {
      const c = byOther.get(m.other)!;
      if (c.theirs.length >= 2 || chunkId.endsWith(':card')) continue;
      const row = await env.DB.prepare('SELECT start, end FROM chunks WHERE id = ?').bind(chunkId).first<{ start: number | null; end: number | null }>();
      if (row?.start != null && row.end != null) c.theirs.push({ start: row.start, end: row.end });
      if (m.mine && !c.mine.some((s) => s.start === m.mine!.start)) c.mine.push(m.mine);
    }
  }

  // Route 2: shared Wikipedia cards (entities), any item, not cut.
  const shared = (
    await env.DB.prepare(
      `SELECT b.item_id AS other, b.title FROM wiki_cards a JOIN wiki_cards b ON a.url = b.url AND b.item_id != a.item_id
       WHERE a.item_id = ? AND a.status != 'cut' AND b.status != 'cut'`,
    )
      .bind(itemId)
      .all<{ other: string; title: string }>()
  ).results;
  for (const s of shared) if (eligible.has(s.other) && !get(s.other).entities.includes(s.title)) get(s.other).entities.push(s.title);

  // Route 3: shared abstract mechanisms from the reading cards.
  const mine = new Set(((await readingCard(env, itemId)).mechanisms ?? []).map(normMech).filter(Boolean));
  if (mine.size) {
    const cards = (await env.DB.prepare(`SELECT item_id, body FROM drafts WHERE kind = 'card' AND item_id != ?`).bind(itemId).all<{ item_id: string; body: string }>()).results;
    for (const row of cards) {
      if (!eligible.has(row.item_id)) continue;
      const theirs = (parseJson<Partial<ReadingCard>>(row.body, {}).mechanisms ?? []).filter((m) => mine.has(normMech(m)));
      if (theirs.length) get(row.item_id).mechanisms.push(...theirs);
    }
  }

  // Skip pairs already judged or already connected either way.
  const out: Candidate[] = [];
  for (const c of byOther.values()) {
    const [a, b] = pairKey(itemId, c.otherId);
    const judged = await env.DB.prepare('SELECT 1 FROM judged_pairs WHERE a = ? AND b = ?').bind(a, b).first();
    if (judged) continue;
    const linked = await env.DB.prepare('SELECT 1 FROM connections WHERE (item_id = ? AND to_item_id = ?) OR (item_id = ? AND to_item_id = ?)').bind(itemId, c.otherId, c.otherId, itemId).first();
    if (linked) continue;
    c.score = c.vector + 0.08 * c.entities.length + 0.1 * c.mechanisms.length;
    if (c.vector >= VECTOR_MIN || c.entities.length || c.mechanisms.length) out.push(c);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, MAX_CANDIDATES);
}

// ---------------------------------------------------------------- judging

export interface VerifiedEdge {
  fromId: string;
  toId: string;
  type: string;
  note: string;
  from: { quote: string; start: number; end: number };
  to: { quote: string; start: number; end: number };
  confidence: number;
}

export const CONFIDENCE_MIN = 0.5;

/**
 * Check one verdict against the two sources. Returns the edge (quotes re-anchored to the sources'
 * own characters) or the reasons it fails. Pure, so it is tested directly.
 */
export function verifyVerdict(
  v: ConnectOutput['verdicts'][number],
  a: { id: string; text: string },
  b: { id: string; text: string },
): { edge: VerifiedEdge | null; problems: string[] } {
  const problems: string[] = [];
  if (v.type === 'none') return { edge: null, problems: [] };
  if (!(EDGE_TYPES as readonly string[]).includes(v.type)) problems.push(`unknown type "${v.type}"`);
  const qa = findVerbatim(a.text, v.quoteA);
  const qb = findVerbatim(b.text, v.quoteB);
  if (!qa) problems.push('the quotation from piece A is not in piece A word for word');
  if (!qb) problems.push('the quotation from piece B is not in piece B word for word');
  if ((qa && qa.text.length > 600) || (qb && qb.text.length > 600)) problems.push('a quotation is longer than two sentences');
  const style = checkStyle(v.note);
  if (!v.note.trim()) problems.push('no justification');
  else if (!style.ok) problems.push(`the justification breaks the house style: ${describeIssues(style.issues).replace(/\n/g, ' ')}`);
  if (v.confidence < CONFIDENCE_MIN) problems.push('confidence below threshold');
  if (problems.length || !qa || !qb) return { edge: null, problems };
  const A = { quote: qa.text, start: qa.start, end: qa.end };
  const B = { quote: qb.text, start: qb.start, end: qb.end };
  const forward = v.direction !== 'b_to_a';
  return {
    edge: {
      fromId: forward ? a.id : b.id,
      toId: forward ? b.id : a.id,
      type: v.type,
      note: v.note.trim(),
      from: forward ? A : B,
      to: forward ? B : A,
      confidence: v.confidence,
    },
    problems: [],
  };
}

function itemLine(it: ItemRow, card: Partial<ReadingCard>): string {
  return [
    `"${it.title ?? it.url ?? it.id}"${it.creator ? ` by ${it.creator}` : ''}${it.source_date ? ` (${it.source_date})` : ''}, ${it.type}`,
    card.summary ? `Summary: ${card.summary}` : '',
    card.mechanisms?.length ? `Mechanisms: ${card.mechanisms.join('; ')}` : '',
    card.claims?.length ? `Claims: ${card.claims.slice(0, 5).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function passages(text: string, spans: Span[], card: Partial<ReadingCard> & { quotables?: Array<{ quote: string }> }, budget: number): string {
  const parts: string[] = [];
  for (const s of spans.slice(0, 2)) parts.push(text.slice(s.start, s.end));
  for (const q of card.quotables?.slice(0, 4) ?? []) if (!parts.some((p) => p.includes(q.quote))) parts.push(q.quote);
  if (!parts.length) parts.push(text.slice(0, 1500));
  let out = '';
  for (const p of parts) {
    if (out.length + p.length > budget) break;
    out += `«${p}»\n`;
  }
  return out || `«${text.slice(0, budget)}»`;
}

/** Judge candidates for an item; store verified edges as proposed suggestions. */
export async function judgeCandidates(env: Env, itemId: string, candidates: Candidate[]): Promise<{ judged: number; kept: number; dropped: number }> {
  if (!candidates.length) return { judged: 0, kept: 0, dropped: 0 };
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  if (!item || !src) throw new Error('Item or source missing');
  const card = await readingCard(env, itemId);
  const others = await Promise.all(
    candidates.map(async (c) => ({ c, item: (await getItem(env, c.otherId))!, src: (await getSource(env, c.otherId))!, card: await readingCard(env, c.otherId) })),
  );
  const live = others.filter((o) => o.item && o.src);
  const per = Math.floor(loadRoutes(env).tasks.connect.maxInputChars / Math.max(1, live.length) / 2) - 600;

  // Recent rejections teach the judge what the editor does not want.
  const rejected = (
    await env.DB.prepare(
      `SELECT s.type, s.note, a.title AS a_title, b.title AS b_title FROM suggestions s JOIN items a ON a.id = s.from_item_id JOIN items b ON b.id = s.to_item_id
       WHERE s.status = 'rejected' ORDER BY s.updated_at DESC LIMIT 5`,
    ).all<{ type: string; note: string; a_title: string | null; b_title: string | null }>()
  ).results;
  const negatives = rejected.length
    ? `\n\nThe editor rejected these earlier suggestions as too loose. Do not propose links like them:\n${rejected.map((r) => `- ${r.a_title} / ${r.b_title}: "${r.type}", ${r.note}`).join('\n')}`
    : '';

  const pairBlock = (o: (typeof live)[number], i: number) =>
    [
      `PAIR ${i}`,
      `PIECE A: ${itemLine(item, card)}`,
      `Passages from A:\n${passages(src.text, o.c.mine, card as never, per)}`,
      `PIECE B: ${itemLine(o.item, o.card)}`,
      `Passages from B:\n${passages(o.src.text, o.c.theirs, o.card as never, per)}`,
      o.c.entities.length ? `Both have Wikipedia cards for: ${o.c.entities.join('; ')}` : '',
      o.c.mechanisms.length ? `Shared mechanisms: ${o.c.mechanisms.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const results = new Map<number, VerifiedEdge | null>();
  const failures = new Map<number, string[]>();
  let pending = live.map((_, i) => i);
  let model = '';
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const feedback =
      attempt && failures.size
        ? `\n\nYour previous answer for these pairs failed our checks. Fix them or answer "none":\n${pending.map((i) => `PAIR ${i}: ${failures.get(i)!.join('; ')}`).join('\n')}`
        : '';
    const prompt = pending.map((i) => pairBlock(live[i]!, i)).join('\n\n') + negatives + feedback;
    const r = await generateJson(env, { task: 'connect', system: CONNECT_SYSTEM, prompt, schema: connectSchema, itemId });
    model = r.model;
    const next: number[] = [];
    for (const i of pending) {
      const v = r.data.verdicts.find((x) => x.pair === i);
      if (!v || v.type === 'none') {
        results.set(i, null);
        continue;
      }
      const o = live[i]!;
      const { edge, problems } = verifyVerdict(v, { id: itemId, text: src.text }, { id: o.item.id, text: o.src.text });
      if (edge) results.set(i, edge);
      else if (problems.length === 1 && problems[0] === 'confidence below threshold') results.set(i, null);
      else {
        failures.set(i, problems);
        next.push(i);
      }
    }
    pending = next;
  }

  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  let kept = 0;
  live.forEach((o, i) => {
    const edge = results.get(i);
    const [a, b] = pairKey(itemId, o.item.id);
    const outcome = edge ? 'edge' : results.has(i) ? 'none' : 'dropped';
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO judged_pairs (a, b, outcome, at) VALUES (?, ?, ?, ?)').bind(a, b, outcome, now));
    if (!edge) return;
    kept++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO suggestions (id, from_item_id, to_item_id, type, note, from_quote, from_start, from_end, to_quote, to_start, to_end, confidence, routes, status, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)`,
      ).bind(
        newId('sg_'),
        edge.fromId,
        edge.toId,
        edge.type,
        edge.note,
        edge.from.quote,
        edge.from.start,
        edge.from.end,
        edge.to.quote,
        edge.to.start,
        edge.to.end,
        edge.confidence,
        JSON.stringify({ vector: Number(o.c.vector.toFixed(3)), entities: o.c.entities, mechanisms: o.c.mechanisms }),
        model,
        now,
        now,
      ),
    );
  });
  if (stmts.length) await env.DB.batch(stmts);
  return { judged: live.length, kept, dropped: live.length - kept - [...results.values()].filter((x) => x === null).length };
}

// ---------------------------------------------------------------- editor actions

export interface SuggestionRow {
  id: string;
  from_item_id: string;
  to_item_id: string;
  type: string;
  note: string;
  editor_note: string | null;
  from_quote: string;
  from_start: number;
  from_end: number;
  to_quote: string;
  to_start: number;
  to_end: number;
  confidence: number;
  routes: string;
  status: 'proposed' | 'approved' | 'rejected';
  connection_id: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Keep a suggestion. The published note is the editor's: they write it, or explicitly adopt the
 * machine's sentence as theirs. Both quotes are re-verified first.
 */
export async function approveSuggestion(env: Env, id: string, editorNote: string, type?: string): Promise<SuggestionRow> {
  const s = await env.DB.prepare('SELECT * FROM suggestions WHERE id = ?').bind(id).first<SuggestionRow>();
  if (!s) throw Object.assign(new Error('No such suggestion'), { status: 404 });
  const note = editorNote.trim();
  if (note.length < 2) throw Object.assign(new Error('Write the connection note in your own words (or adopt the machine sentence) before keeping it'), { status: 400 });
  const t = type ?? s.type;
  if (!(EDGE_TYPES as readonly string[]).includes(t)) throw Object.assign(new Error('Unknown connection type'), { status: 400 });
  const [fa, fb] = await Promise.all([getSource(env, s.from_item_id), getSource(env, s.to_item_id)]);
  if (!fa || fa.text.slice(s.from_start, s.from_end) !== s.from_quote || !fb || fb.text.slice(s.to_start, s.to_end) !== s.to_quote) {
    throw Object.assign(new Error('A quote no longer matches its source (the text changed); this suggestion cannot be kept'), { status: 409 });
  }
  const now = nowIso();
  const cid = s.connection_id ?? newId('cn_');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM connections WHERE id = ?').bind(cid),
    env.DB.prepare('INSERT INTO connections (id, item_id, to_item_id, type, note, created_at, suggestion_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(cid, s.from_item_id, s.to_item_id, t, note, now, s.id),
    env.DB.prepare(`UPDATE suggestions SET status = 'approved', editor_note = ?, type = ?, connection_id = ?, updated_at = ? WHERE id = ?`).bind(note, t, cid, now, s.id),
  ]);
  return (await env.DB.prepare('SELECT * FROM suggestions WHERE id = ?').bind(id).first<SuggestionRow>())!;
}

export async function setSuggestionStatus(env: Env, id: string, status: 'rejected' | 'proposed'): Promise<SuggestionRow> {
  const s = await env.DB.prepare('SELECT * FROM suggestions WHERE id = ?').bind(id).first<SuggestionRow>();
  if (!s) throw Object.assign(new Error('No such suggestion'), { status: 404 });
  const stmts = [env.DB.prepare('UPDATE suggestions SET status = ?, connection_id = NULL, updated_at = ? WHERE id = ?').bind(status, nowIso(), id)];
  if (s.connection_id) stmts.unshift(env.DB.prepare('DELETE FROM connections WHERE id = ?').bind(s.connection_id));
  await env.DB.batch(stmts);
  return (await env.DB.prepare('SELECT * FROM suggestions WHERE id = ?').bind(id).first<SuggestionRow>())!;
}

// ---------------------------------------------------------------- threads: clustering

export interface Edge {
  a: string;
  b: string;
}

/** Connected components of an undirected graph, each sorted, largest first. */
export function components(edges: Edge[]): string[][] {
  const adj = adjacency(edges);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop()!;
      comp.push(n);
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) (seen.add(m), stack.push(m));
    }
    out.push(comp.sort());
  }
  return out.sort((x, y) => y.length - x.length || x[0]!.localeCompare(y[0]!));
}

function adjacency(edges: Edge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const { a, b } of edges) {
    if (a === b) continue;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return adj;
}

/**
 * Split a large component into tight groups: repeatedly remove the edge whose ends share the fewest
 * neighbours (a bridge between two groups shares none), until every piece is at most `max` nodes.
 * Deterministic, and it never splits a clique.
 */
export function splitComponent(nodes: string[], edges: Edge[], max: number): string[][] {
  const set = new Set(nodes);
  let live = edges.filter((e) => set.has(e.a) && set.has(e.b) && e.a !== e.b);
  for (;;) {
    const comps = components(live);
    const covered = new Set(comps.flat());
    const singles = nodes.filter((n) => !covered.has(n)).map((n) => [n]);
    const big = comps.find((c) => c.length > max);
    if (!big || !live.length) return [...comps, ...singles].sort((x, y) => y.length - x.length);
    const inBig = new Set(big);
    const adj = adjacency(live);
    const shared = (e: Edge) => [...(adj.get(e.a) ?? [])].filter((x) => adj.get(e.b)?.has(x)).length;
    const candidates = live.filter((e) => inBig.has(e.a));
    let weakest = candidates[0]!;
    let low = Infinity;
    for (const e of candidates) {
      const k = shared(e);
      const key = `${e.a}|${e.b}`;
      if (k < low || (k === low && key < `${weakest.a}|${weakest.b}`)) {
        low = k;
        weakest = e;
      }
    }
    live = live.filter((e) => e !== weakest);
  }
}

export const THREAD_MIN = 3;
export const THREAD_MAX = 12;

/** Clusters for Threads: components of kept edges, large ones split at their weakest edges; small ones dropped. */
export function threadClusters(edges: Edge[]): string[][] {
  const out: string[][] = [];
  for (const comp of components(edges)) {
    if (comp.length < THREAD_MIN) continue;
    if (comp.length <= THREAD_MAX) out.push(comp);
    else for (const g of splitComponent(comp, edges, THREAD_MAX)) if (g.length >= THREAD_MIN) out.push(g.sort());
  }
  return out;
}

// ---------------------------------------------------------------- threads: drafting

export interface ThreadRow {
  id: string;
  slug: string;
  title_text: string;
  title_italic: string | null;
  summary: string;
  points: string;
  item_ids: string;
  status: 'proposed' | 'approved' | 'rejected';
  edited: number;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredPoint {
  itemId: string;
  year: string;
  gist: string;
  edge: string;
}

/** A four-digit year from a date string ("7 March 1986", "1865", "ca. 1890"). */
export function yearOf(s: string | null | undefined): string {
  const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(s ?? '');
  return m ? m[1]! : '';
}

async function keptEdges(env: Env): Promise<Array<Edge & { type: string; fromId: string; toId: string }>> {
  const rows = (await env.DB.prepare('SELECT item_id, to_item_id, type FROM connections').all<{ item_id: string; to_item_id: string; type: string }>()).results;
  return rows.map((r) => ({ a: r.item_id, b: r.to_item_id, type: r.type, fromId: r.item_id, toId: r.to_item_id }));
}

/** Propose Threads for clusters that no thread (in any state) already covers exactly. */
export async function suggestThreads(env: Env, opts: { max?: number } = {}): Promise<{ clusters: number; drafted: string[] }> {
  const edges = await keptEdges(env);
  const clusters = threadClusters(edges);
  const existing = new Set((await env.DB.prepare('SELECT item_ids FROM threads').all<{ item_ids: string }>()).results.map((r) => r.item_ids));
  const drafted: string[] = [];
  for (const cl of clusters) {
    if (drafted.length >= (opts.max ?? 3)) break;
    const key = JSON.stringify(cl);
    if (existing.has(key)) continue;
    const id = await draftThread(env, cl, edges);
    if (id) drafted.push(id);
  }
  return { clusters: clusters.length, drafted };
}

async function draftThread(env: Env, itemIds: string[], edges: Array<Edge & { type: string; fromId: string; toId: string }>): Promise<string | null> {
  const items = (await Promise.all(itemIds.map((id) => getItem(env, id)))).filter((x): x is ItemRow => Boolean(x));
  const cards = new Map(await Promise.all(items.map(async (it) => [it.id, await readingCard(env, it.id)] as const)));
  const yearFor = (it: ItemRow) => yearOf(it.source_date) || yearOf(cards.get(it.id)?.bibliographic?.date) || '';
  const inCluster = new Set(itemIds);
  const local = edges.filter((e) => inCluster.has(e.a) && inCluster.has(e.b));
  const titleOf = (it: ItemRow) => parseJson<Title | null>(it.title_choice, null)?.text ?? it.title ?? it.id;
  const prompt = [
    'PIECES:',
    ...items.map((it) => `[${it.id}] ${titleOf(it)}${it.creator ? `, ${it.creator}` : ''}${yearFor(it) ? `, ${yearFor(it)}` : ''}. ${truncate(cards.get(it.id)?.summary ?? '', 400)}`),
    '',
    'CONNECTIONS:',
    ...local.map((e) => `[${e.fromId}] ${e.type} [${e.toId}]`),
    '',
    'Use the ids in square brackets for points.',
  ].join('\n');

  let feedback = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, model } = await generateJson(env, { task: 'thread', system: THREAD_SYSTEM, prompt: prompt + feedback, schema: threadSchema });
    const title = { text: data.title.text.trim(), italic: data.title.italic?.trim() || undefined };
    const issues = [
      { what: 'title', r: checkStyle([title.text, title.italic].filter(Boolean).join(' ')) },
      { what: 'summary', r: checkStyle(data.summary) },
      ...data.points.map((p) => ({ what: `gist for ${p.itemId}`, r: checkStyle(p.gist) })),
    ].filter((x) => !x.r.ok);
    if (issues.length && attempt < 2) {
      feedback = `\n\nYour previous answer broke the house style:\n${issues.map((i) => `${i.what}: ${describeIssues(i.r.issues)}`).join('\n')}\nWrite it again.`;
      continue;
    }
    if (issues.some((i) => i.what === 'title' || i.what === 'summary')) return null; // still failing: dropped
    const gists = new Map(data.points.filter((p) => checkStyle(p.gist).ok).map((p) => [p.itemId, p.gist.trim()]));
    const ordered = [...items].sort((x, y) => (yearFor(x) || '9999').localeCompare(yearFor(y) || '9999') || x.captured_at.localeCompare(y.captured_at));
    const points: StoredPoint[] = ordered.map((it, i) => {
      const prev = ordered.slice(0, i).reverse();
      const e = prev.map((p) => local.find((x) => (x.a === it.id && x.b === p.id) || (x.b === it.id && x.a === p.id))).find(Boolean) ?? local.find((x) => x.a === it.id || x.b === it.id);
      return { itemId: it.id, year: yearFor(it), gist: gists.get(it.id) ?? '', edge: e?.type ?? '' };
    });
    const now = nowIso();
    const id = newId('th_');
    let slug = slugify([title.text, title.italic].filter(Boolean).join(' '), 40);
    for (let k = 2; await env.DB.prepare('SELECT 1 FROM threads WHERE slug = ?').bind(slug).first(); k++) slug = `${slugify(title.text, 36)}-${k}`;
    await env.DB.prepare(
      `INSERT INTO threads (id, slug, title_text, title_italic, summary, points, item_ids, status, edited, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', 0, ?, ?, ?)`,
    )
      .bind(id, slug, title.text, title.italic ?? null, data.summary.trim(), JSON.stringify(points), JSON.stringify(itemIds), model, now, now)
      .run();
    return id;
  }
  return null;
}

// ---------------------------------------------------------------- threads: publishing

/** The provenance line readers see (machine voice): how many links were proposed and kept. */
export async function threadProvenance(env: Env, itemIds: string[]): Promise<string> {
  const qs = itemIds.map(() => '?').join(',');
  const s = await env.DB.prepare(
    `SELECT COUNT(*) AS proposed, SUM(status = 'approved') AS kept FROM suggestions WHERE from_item_id IN (${qs}) AND to_item_id IN (${qs})`,
  )
    .bind(...itemIds, ...itemIds)
    .first<{ proposed: number; kept: number | null }>();
  const own = await env.DB.prepare(`SELECT COUNT(*) AS n FROM connections WHERE suggestion_id IS NULL AND item_id IN (${qs}) AND to_item_id IN (${qs})`)
    .bind(...itemIds, ...itemIds)
    .first<{ n: number }>();
  const proposed = s?.proposed ?? 0;
  const kept = s?.kept ?? 0;
  const parts: string[] = [];
  if (proposed) parts.push(`The machine proposed ${proposed} link${proposed === 1 ? '' : 's'} among these pieces. The editor kept ${kept}, each with a passage quoted from both ends.`);
  if (own?.n) parts.push(`The editor added ${own.n} link${own.n === 1 ? '' : 's'} of their own.`);
  parts.push('The machine grouped the kept links into this thread; the editor named it.');
  return parts.join(' ');
}

/** Approved threads that touch this Haul, as bundle threads. Points outside the Haul carry no itemId. */
export async function threadsForHaul(env: Env, haulItemIds: string[], idFor: Map<string, string>): Promise<Thread[]> {
  const inHaul = new Set(haulItemIds);
  const rows = (await env.DB.prepare(`SELECT * FROM threads WHERE status = 'approved' ORDER BY created_at`).all<ThreadRow>()).results;
  const out: Thread[] = [];
  for (const t of rows) {
    const points = parseJson<StoredPoint[]>(t.points, []);
    if (!points.some((p) => inHaul.has(p.itemId))) continue;
    const bundlePoints: ThreadPoint[] = [];
    for (const p of points) {
      const it = await getItem(env, p.itemId);
      if (!it) continue;
      const here = inHaul.has(p.itemId) && idFor.has(p.itemId);
      const title = parseJson<Title | null>(it.title_choice, null)?.text ?? it.title ?? '';
      bundlePoints.push({
        year: p.year || 'Undated',
        title: [title, it.creator && !title.includes(it.creator) ? it.creator : ''].filter(Boolean).join(', ') || 'Untitled',
        gist: p.gist,
        edge: p.edge,
        inHaul: here,
        ...(here ? { itemId: idFor.get(p.itemId)! } : {}),
      });
    }
    out.push({
      id: t.slug,
      title: t.title_italic ? { text: t.title_text, italic: t.title_italic } : { text: t.title_text },
      summary: t.summary,
      points: bundlePoints,
      provenance: await threadProvenance(env, points.map((p) => p.itemId)),
    });
  }
  return out;
}
