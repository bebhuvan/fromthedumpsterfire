// Lives on the Desk: a profile of one person, written by a model (in an editorial session today)
// from sources the Desk fetched itself. The rules are in @fdf/shared/life; this module keeps them:
//
// - sources are fetched by code (fetchSource: guardedFetch, byte caps, the article fetch order) and
//   their text stored privately; models never supply a link or a text;
// - a submitted draft is checked line by line (quotes word for word, figures in the quotes, style),
//   and refused whole if anything fails, so the writer fixes it rather than the Desk guessing;
// - the judge then reads each line against its quotes and what it cannot confirm is set aside
//   ('rejected'), never shown; it fails closed: an error or a missing verdict sets the line aside;
// - the editor keeps or cuts each line and approves the whole; any change clears the approval;
// - publish checks it all again against the stored texts and prints only the kept lines.

import type { LifeSource } from '@fdf/shared/haul';
import { detectUrl } from '@fdf/shared/detect';
import { assembleLife, checkLifeDraft, lifeLines, type DraftCite, type DraftLine, type LifeDraft, type LifeProblem, type LineStatus } from '@fdf/shared/life';
import type { Env } from './env';
import { fetchSource, type SourceMeta } from './ingest';
import { pageAt } from './extract/pdf';
import { generateJson } from './models/router';
import { JUDGE_SYSTEM, judgeSchema } from './prompts';
import { errorMessage, newId, nowIso, parseJson, truncate, wordCount } from './util';

const D1_TEXT_LIMIT = 1_500_000;
/** Words either side of a quote that the judge reads with it. */
const JUDGE_CONTEXT = 500;
/** Lines judged per model call. */
const JUDGE_BATCH = 20;

export interface LifeSourceRow {
  id: string;
  item_id: string;
  key: string;
  author: string;
  title: string;
  kind: LifeSource['kind'];
  publisher: string | null;
  year: string | null;
  url: string;
  via: string | null;
  work_url: string | null;
  status: 'queued' | 'fetched' | 'failed';
  detail: string | null;
  text: string | null;
  word_count: number | null;
  extractor: string | null;
  meta: string | null;
  snapshot_key: string | null;
  /** A PDF the editor uploaded because the link is too large or slow to fetch; the link stays the source. */
  file_key: string | null;
  position: number;
  fetched_at: string | null;
  created_at: string;
}

export interface LifeRow {
  item_id: string;
  body: string;
  writer: string | null;
  problems: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LifeSourceInput = Omit<LifeSource, 'id' | 'workUrl'> & { id: string; workUrl?: string };

export class LifeError extends Error {
  readonly status: number;
  readonly problems: LifeProblem[];
  constructor(message: string, status = 422, problems: LifeProblem[] = []) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

export const lifeSourceRows = async (env: Env, itemId: string): Promise<LifeSourceRow[]> =>
  (await env.DB.prepare('SELECT * FROM life_sources WHERE item_id = ? ORDER BY position').bind(itemId).all<LifeSourceRow>()).results;

export const lifeRow = (env: Env, itemId: string) => env.DB.prepare('SELECT * FROM lives WHERE item_id = ?').bind(itemId).first<LifeRow>();

/** A source as the bundle and the draft list it (no text). */
export function sourceOf(r: LifeSourceRow): LifeSource {
  return {
    id: r.key,
    author: r.author,
    title: r.title,
    kind: r.kind,
    ...(r.publisher ? { publisher: r.publisher } : {}),
    ...(r.year ? { year: r.year } : {}),
    url: r.url,
    ...(r.via ? { via: r.via } : {}),
    ...(r.work_url ? { workUrl: r.work_url } : {}),
  };
}

/**
 * A new Life item: the person's name as its title, the first source's maker and work as its
 * creator and source (the link to the original names them, as every link does), then each source
 * fetched by code. The item never enters the reading pipeline: it has no single source to read.
 */
export async function createLife(
  env: Env,
  input: { name: string; why?: string; year?: number; sources: LifeSourceInput[] },
): Promise<{ itemId: string; sources: LifeSourceRow[] }> {
  if (!input.sources.length) throw new LifeError('A Life is written from named sources; give at least one');
  const keys = new Set<string>();
  for (const s of input.sources) {
    if (keys.has(s.id)) throw new LifeError(`Two sources share the id "${s.id}"`);
    keys.add(s.id);
  }
  const first = input.sources[0]!;
  const id = newId('it_');
  const now = nowIso();
  const link = first.workUrl ?? first.url;
  await env.DB.prepare(
    `INSERT INTO items (id, kind, type, type_by, status, url, canonical_url, title, title_choice, creator, source_name, source_date, why_text, year, captured_at, updated_at)
     VALUES (?, 'life', 'life', 'editor', 'fetching', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, link, link, input.name, JSON.stringify({ text: input.name }), first.author, first.title, first.year ?? '', input.why?.trim() || null, input.year ?? null, now, now)
    .run();
  await addLifeSources(env, id, input.sources);
  const rows = await fetchLifeSources(env, id);
  return { itemId: id, sources: rows };
}

export async function addLifeSources(env: Env, itemId: string, sources: LifeSourceInput[]): Promise<void> {
  const existing = await lifeSourceRows(env, itemId);
  let pos = existing.length;
  for (const s of sources) {
    if (existing.some((r) => r.key === s.id)) throw new LifeError(`This Life already has a source "${s.id}"`, 409);
    await env.DB.prepare(
      `INSERT INTO life_sources (id, item_id, key, author, title, kind, publisher, year, url, via, work_url, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId('ls_'), itemId, s.id, s.author.trim(), s.title.trim(), s.kind, s.publisher ?? null, s.year ?? null, s.url, s.via ?? null, s.workUrl ?? null, pos++, nowIso())
      .run();
  }
}

/** Fetch every source not yet fetched (or one, again), through the same fetch order as any item. */
export async function fetchLifeSources(env: Env, itemId: string, onlyKey?: string): Promise<LifeSourceRow[]> {
  for (const r of await lifeSourceRows(env, itemId)) {
    if (onlyKey ? r.key !== onlyKey : r.status === 'fetched') continue;
    try {
      const d = detectUrl(r.url);
      const outcome = await fetchSource(env, { id: itemId, kind: r.file_key ? 'pdf' : d.kind, type: 'essay', url: r.url, file_key: r.file_key, capture_text: null, source_name: null, title: null });
      if (outcome.kind !== 'text') throw new Error(outcome.kind === 'none' ? outcome.reason : 'This source is a recording; a Life is written from texts');
      let snapshotKey: string | null = null;
      if (outcome.snapshot) {
        snapshotKey = `snapshots/${itemId}/life-${r.key}.${outcome.snapshot.ext}`;
        await env.MEDIA.put(snapshotKey, outcome.snapshot.bytes, { httpMetadata: { contentType: outcome.snapshot.contentType } });
      }
      await env.MEDIA.put(`snapshots/${itemId}/life-${r.key}.txt`, outcome.text, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
      const text = truncate(outcome.text, D1_TEXT_LIMIT);
      await env.DB.prepare(
        `UPDATE life_sources SET status = 'fetched', detail = NULL, text = ?, word_count = ?, extractor = ?, meta = ?, snapshot_key = ?, fetched_at = ? WHERE id = ?`,
      )
        .bind(text, wordCount(outcome.text), outcome.extractor, JSON.stringify(outcome.meta), snapshotKey, nowIso(), r.id)
        .run();
    } catch (e) {
      await env.DB.prepare(`UPDATE life_sources SET status = 'failed', detail = ? WHERE id = ?`).bind(errorMessage(e).slice(0, 300), r.id).run();
    }
  }
  const rows = await lifeSourceRows(env, itemId);
  const failed = rows.filter((r) => r.status !== 'fetched');
  await env.DB.prepare('UPDATE items SET status = ?, status_detail = ?, updated_at = ? WHERE id = ?')
    .bind(failed.length ? 'failed' : 'ready', failed.length ? `Could not fetch ${failed.map((r) => `${r.key} (${r.detail ?? 'not fetched'})`).join('; ')}` : null, nowIso(), itemId)
    .run();
  return rows;
}

/**
 * The editor's own copy of a source whose link is too large or slow to fetch (a scanned report of
 * hundreds of pages): kept in MEDIA and read in place of the link, which stays the source readers get.
 */
export async function setLifeSourceFile(env: Env, itemId: string, key: string, file: { stream: ReadableStream; name: string }): Promise<LifeSourceRow[]> {
  const row = (await lifeSourceRows(env, itemId)).find((r) => r.key === key);
  if (!row) throw new LifeError(`This Life has no source "${key}"`, 404);
  const fileKey = `uploads/${itemId}/life-${key}.pdf`;
  await env.MEDIA.put(fileKey, file.stream, { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { name: file.name } });
  await env.DB.prepare(`UPDATE life_sources SET file_key = ?, status = 'queued', detail = NULL WHERE id = ?`).bind(fileKey, row.id).run();
  return fetchLifeSources(env, itemId, key);
}

/** The stored text of each fetched source, by the key the profile cites. */
export async function lifeTexts(env: Env, itemId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await lifeSourceRows(env, itemId)) if (r.status === 'fetched' && r.text != null) out[r.key] = r.text;
  return out;
}

/** A citation's place, when the writer gave none: the page of a PDF (as the PDF counts them). */
function placeCites(draft: LifeDraft, rows: LifeSourceRow[]): LifeDraft {
  const pages = new Map(rows.map((r) => [r.key, parseJson<SourceMeta>(r.meta, {}).pages ?? []]));
  const place = (c: DraftCite): DraftCite => {
    const p = pages.get(c.source);
    return c.at || c.start == null || !p || p.length < 2 ? c : { ...c, at: `PDF p. ${pageAt(p, c.start)}` };
  };
  const line = (l: DraftLine): DraftLine => ({ ...l, cites: l.cites.map(place) });
  return {
    ...draft,
    epithet: line(draft.epithet),
    sections: draft.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map((p) => p.map(line)) })),
    ...(draft.words ? { words: { ...draft.words, context: line(draft.words.context), cites: draft.words.cites.map(place) } } : {}),
    dates: draft.dates.map((d) => ({ ...d, line: line(d.line) })),
    ...(draft.figures ? { figures: { ...draft.figures, rows: draft.figures.rows.map((r) => ({ ...r, line: line(r.line) })) } } : {}),
    ...(draft.born ? { born: { ...draft.born, cites: draft.born.cites.map(place) } } : {}),
    ...(draft.died ? { died: { ...draft.died, cites: draft.died.cites.map(place) } } : {}),
  };
}

const sameLine = (a: DraftLine, b: DraftLine) => a.text === b.text && JSON.stringify(a.cites.map((c) => [c.source, c.quote])) === JSON.stringify(b.cites.map((c) => [c.source, c.quote]));

/**
 * Take a draft from its writer. The sources come from the Desk (the writer cites them by key); the
 * draft is refused whole if any line fails the code checks. Lines the editor already ruled on keep
 * their status if they come back unchanged; everything new is judged.
 */
export async function submitLife(env: Env, itemId: string, input: Omit<LifeDraft, 'sources'>, writer: string): Promise<{ draft: LifeDraft; judged: number; setAside: number }> {
  const rows = await lifeSourceRows(env, itemId);
  if (!rows.length) throw new LifeError('This item has no Life sources', 409);
  const unfetched = rows.filter((r) => r.status !== 'fetched');
  if (unfetched.length) throw new LifeError(`Fetch every source first: ${unfetched.map((r) => r.key).join(', ')}`, 409);
  const texts = await lifeTexts(env, itemId);
  const fresh: LifeDraft = { ...structuredClone(input), sources: rows.map(sourceOf) };
  const { draft: checked, problems } = checkLifeDraft(fresh, texts);
  if (problems.length) throw new LifeError(`The draft fails ${problems.length} check${problems.length === 1 ? '' : 's'}`, 422, problems);
  const prior = parseJson<LifeDraft | null>((await lifeRow(env, itemId))?.body, null);
  const priorLines = new Map(prior ? lifeLines(prior).map((x) => [x.line.id, x.line]) : []);
  const toJudge: DraftLine[] = [];
  for (const { line } of lifeLines(checked)) {
    const old = priorLines.get(line.id);
    if (old && sameLine(old, line) && old.status !== 'proposed') {
      line.status = old.status;
      line.verdict = old.verdict;
      line.reason = old.reason;
    } else {
      line.status = 'proposed';
      line.verdict = 'unchecked';
      toJudge.push(line);
    }
  }
  const placed = placeCites(checked, rows);
  // placeCites copies lines; judge on the copies so the verdicts land in what is stored.
  const byId = new Map(lifeLines(placed).map((x) => [x.line.id, x.line]));
  const judging = toJudge.map((l) => byId.get(l.id)!).filter(Boolean);
  await judgeLines(env, itemId, judging, texts);
  const setAside = judging.filter((l) => l.status === 'rejected').length;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO lives (item_id, body, writer, problems, approved_at, created_at, updated_at) VALUES (?, ?, ?, '[]', NULL, ?, ?)
     ON CONFLICT (item_id) DO UPDATE SET body = excluded.body, writer = excluded.writer, problems = '[]', approved_at = NULL, updated_at = excluded.updated_at`,
  )
    .bind(itemId, JSON.stringify(placed), writer, now, now)
    .run();
  return { draft: placed, judged: judging.length, setAside };
}

/**
 * The judge reads each line with its quotes and the text around them. Only "supported" keeps a line
 * on offer; anything else, or no verdict, or an error, sets it aside. Mutates the lines.
 */
export async function judgeLines(env: Env, itemId: string, lines: DraftLine[], texts: Record<string, string>): Promise<void> {
  for (let i = 0; i < lines.length; i += JUDGE_BATCH) {
    const batch = lines.slice(i, i + JUDGE_BATCH);
    const evidence = (l: DraftLine) =>
      l.cites
        .map((c) => {
          const t = texts[c.source] ?? '';
          const from = Math.max(0, (c.start ?? 0) - JUDGE_CONTEXT);
          const to = Math.min(t.length, (c.end ?? 0) + JUDGE_CONTEXT);
          return `From ${c.source}: """${t.slice(from, to)}"""`;
        })
        .join('\n');
    const prompt = batch.map((l, k) => `NOTE ${k}: ${l.text}\nEVIDENCE ${k}:\n${evidence(l)}`).join('\n\n');
    let verdicts: Array<{ index: number; verdict: 'supported' | 'partly' | 'unsupported'; reason: string }> = [];
    try {
      const { data } = await generateJson(env, { task: 'judge', system: JUDGE_SYSTEM, prompt, schema: judgeSchema, itemId });
      verdicts = data.verdicts;
    } catch (e) {
      console.error(JSON.stringify({ event: 'life-judge-failed', itemId, error: errorMessage(e) }));
    }
    batch.forEach((l, k) => {
      const v = verdicts.find((x) => x.index === k);
      l.verdict = v?.verdict ?? 'unchecked';
      l.reason = v?.reason || (v ? '' : 'The checker returned no verdict.');
      if (l.verdict !== 'supported') l.status = 'rejected';
    });
  }
}

async function saveDraft(env: Env, itemId: string, draft: LifeDraft): Promise<void> {
  await env.DB.prepare(`UPDATE lives SET body = ?, approved_at = NULL, updated_at = ? WHERE item_id = ?`).bind(JSON.stringify(draft), nowIso(), itemId).run();
}

export async function getDraft(env: Env, itemId: string): Promise<LifeDraft> {
  const row = await lifeRow(env, itemId);
  const draft = parseJson<LifeDraft | null>(row?.body, null);
  if (!draft) throw new LifeError('This Life has no profile yet', 404);
  return draft;
}

/** The editor keeps or cuts one line. The checker's rejections stay set aside. */
export async function setLineStatus(env: Env, itemId: string, lineId: string, status: Extract<LineStatus, 'kept' | 'cut' | 'proposed'>): Promise<LifeDraft> {
  const draft = await getDraft(env, itemId);
  const hit = lifeLines(draft).find((x) => x.line.id === lineId);
  if (!hit) throw new LifeError('No such line', 404);
  if (hit.line.status === 'rejected') throw new LifeError('The checker set this line aside', 409);
  hit.line.status = status;
  await saveDraft(env, itemId, draft);
  return draft;
}

/** Keep (or cut) every line still on offer, for an editor who has read them all. */
export async function setAllLines(env: Env, itemId: string, status: 'kept' | 'cut'): Promise<LifeDraft> {
  const draft = await getDraft(env, itemId);
  for (const { line } of lifeLines(draft)) if (line.status === 'proposed') line.status = status;
  await saveDraft(env, itemId, draft);
  return draft;
}

/**
 * The editor approves the profile as it stands. Refused while anything is undecided or fails the
 * checks again; approval is cleared by any later change.
 */
export async function approveLife(env: Env, itemId: string, approve: boolean): Promise<{ approvedAt: string | null; problems: string[] }> {
  const draft = await getDraft(env, itemId);
  if (!approve) {
    await env.DB.prepare('UPDATE lives SET approved_at = NULL WHERE item_id = ?').bind(itemId).run();
    return { approvedAt: null, problems: [] };
  }
  const problems = await recheck(env, itemId, draft);
  const undecided = lifeLines(draft).filter((x) => x.line.status === 'proposed').length;
  if (undecided) problems.push(`${undecided} line${undecided === 1 ? ' is' : 's are'} still to keep or cut.`);
  if (problems.length) {
    await env.DB.prepare('UPDATE lives SET problems = ? WHERE item_id = ?').bind(JSON.stringify(problems), itemId).run();
    return { approvedAt: null, problems };
  }
  const at = nowIso();
  await env.DB.prepare(`UPDATE lives SET approved_at = ?, problems = '[]' WHERE item_id = ?`).bind(at, itemId).run();
  return { approvedAt: at, problems: [] };
}

/** Everything the profile claims, checked again against the stored texts; then what would print. */
async function recheck(env: Env, itemId: string, draft: LifeDraft): Promise<string[]> {
  const texts = await lifeTexts(env, itemId);
  const { problems } = checkLifeDraft(draft, texts);
  const out = problems
    .filter((p) => !p.lineId || ['kept'].includes(lifeLines(draft).find((x) => x.line.id === p.lineId)?.line.status ?? 'kept'))
    .map((p) => `${p.path}: ${p.message}`);
  for (const { line } of lifeLines(draft)) if (line.status === 'kept' && line.verdict !== 'supported') out.push(`A kept line is not confirmed by its sources: “${line.text.slice(0, 60)}”`);
  // Offsets must still hold: the stored quotes are the source's characters at those places.
  for (const { line } of lifeLines(draft)) {
    if (line.status !== 'kept') continue;
    for (const c of line.cites) {
      const t = texts[c.source];
      if (!t || c.start == null || c.end == null || t.slice(c.start, c.end) !== c.quote) out.push(`A quote no longer matches ${c.source} at its place: “${c.quote.slice(0, 60)}”`);
    }
  }
  out.push(...assembleLife(draft).problems);
  return out;
}

/** The printed Life for publish: approved, checked again, kept lines only. */
export async function lifeForBundle(env: Env, itemId: string): Promise<{ life?: ReturnType<typeof assembleLife>['life']; problems: string[] }> {
  const row = await lifeRow(env, itemId);
  const draft = parseJson<LifeDraft | null>(row?.body, null);
  if (!row || !draft) return { problems: ['this Life has no profile yet'] };
  if (!row.approved_at) return { problems: ['approve the profile on the Desk before publishing'] };
  const problems = await recheck(env, itemId, draft);
  if (problems.length) return { problems };
  const { life, problems: p2 } = assembleLife(draft);
  return life ? { life, problems: p2 } : { problems: p2 };
}

/** Links a reader will follow from a Life: every source, and the further reading. */
export async function lifeLinks(env: Env, itemId: string): Promise<Array<{ label: string; url: string }>> {
  const rows = await lifeSourceRows(env, itemId);
  const draft = parseJson<LifeDraft | null>((await lifeRow(env, itemId))?.body, null);
  return [
    ...rows.flatMap((r) => [{ label: `Source: ${r.title}`, url: r.url }, ...(r.work_url ? [{ label: `The work: ${r.title}`, url: r.work_url }] : [])]),
    ...(draft?.reading ?? []).flatMap((r) => (r.url ? [{ label: `Further reading: ${r.title}`, url: r.url }] : [])),
  ];
}
