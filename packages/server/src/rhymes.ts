// Rhymes: a present piece paired with its historical precedent. A Rhyme is an item of type "rhymes"
// whose then/now ends each point at a captured item with a fetched source. Both quotes follow the
// excerpt rule: they are the source's own characters at stored offsets, matched word for word, or
// they do not ship. The bridge is machine voice in the app (blue sans), so it passes the style
// check whoever typed it; a model may draft it from the two quotes and their citations.

import { checkStyle, describeIssues } from '@fdf/shared/style';
import { findVerbatim, isVerbatimAt } from '@fdf/shared/verbatim';
import type { Env } from './env';
import type { ItemRow } from './db';
import { getItem, getSource } from './db';
import { generateJson } from './models/router';
import { BRIDGE_SYSTEM, bridgeSchema } from './prompts';
import { yearOf } from './connect';
import { newId, nowIso } from './util';

export interface RhymeRecord {
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
  updated_at: string;
}

export type RhymeEnd = 'then' | 'now';

const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status });

export async function createRhyme(env: Env, opts: { thenItemId?: string; nowItemId?: string } = {}): Promise<string> {
  const id = newId('it_');
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO items (id, kind, type, type_by, status, title, captured_at, updated_at) VALUES (?, 'rhyme', 'rhymes', 'editor', 'ready', ?, ?, ?)`).bind(id, 'A new rhyme', now, now),
    env.DB.prepare('INSERT INTO rhymes (item_id, updated_at) VALUES (?, ?)').bind(id, now),
  ]);
  for (const end of ['then', 'now'] as const) {
    const src = end === 'then' ? opts.thenItemId : opts.nowItemId;
    if (src) await setEndSource(env, id, end, src);
  }
  return id;
}

export async function getRhyme(env: Env, itemId: string): Promise<RhymeRecord | null> {
  return env.DB.prepare('SELECT * FROM rhymes WHERE item_id = ?').bind(itemId).first<RhymeRecord>();
}

/** Default citation from the source item's own fields: "W. Stanley Jevons, The Coal Question". */
export function defaultCite(src: Pick<ItemRow, 'creator' | 'title' | 'source_name' | 'source_date'>): string {
  const parts = [src.creator, src.title, src.source_name && src.source_name !== src.title ? src.source_name : null].filter((x): x is string => Boolean(x && x.trim()));
  return parts.join(', ');
}

/** Point one end at a captured item (its quote is cleared until it is selected again). */
export async function setEndSource(env: Env, rhymeId: string, end: RhymeEnd, sourceItemId: string): Promise<void> {
  const src = await getItem(env, sourceItemId);
  if (!src) throw httpErr(404, 'No such source item');
  if (src.kind === 'rhyme') throw httpErr(400, 'A rhyme cannot quote another rhyme');
  await env.DB.prepare(
    `UPDATE rhymes SET ${end}_item_id = ?, ${end}_quote = NULL, ${end}_start = NULL, ${end}_end = NULL,
       ${end}_year = CASE WHEN ${end}_year = '' THEN ? ELSE ${end}_year END,
       ${end}_cite = CASE WHEN ${end}_cite = '' THEN ? ELSE ${end}_cite END, updated_at = ? WHERE item_id = ?`,
  )
    .bind(sourceItemId, yearOf(src.source_date), defaultCite(src), nowIso(), rhymeId)
    .run();
  await syncRhymeItem(env, rhymeId);
}

/**
 * Set an end's quote, either from a selection in the source reader (offsets plus text, which must be
 * the source's own characters) or from a pasted quotation located verbatim in the source.
 */
export async function setEndQuote(env: Env, rhymeId: string, end: RhymeEnd, q: { start: number; end: number; text: string } | { quote: string }): Promise<RhymeRecord> {
  const r = await getRhyme(env, rhymeId);
  if (!r) throw httpErr(404, 'No such rhyme');
  const srcId = r[`${end}_item_id`];
  if (!srcId) throw httpErr(409, `Choose the ${end} source first`);
  const src = await getSource(env, srcId);
  if (!src) throw httpErr(409, 'That source has not been fetched yet');
  let span: { start: number; end: number; text: string } | null;
  if ('quote' in q) span = findVerbatim(src.text, q.quote);
  else {
    let { start, end: stop } = q;
    while (start < stop && /\s/.test(src.text[start]!)) start++;
    while (stop > start && /\s/.test(src.text[stop - 1]!)) stop--;
    const text = src.text.slice(start, stop);
    span = text && text === q.text.trim() ? { start, end: stop, text } : null;
  }
  if (!span) throw httpErr(409, 'That quotation is not in the source word for word; select it in the source text');
  if (span.text.length > 900) throw httpErr(400, 'Keep a rhyme quote short: one to three sentences');
  await env.DB.prepare(`UPDATE rhymes SET ${end}_quote = ?, ${end}_start = ?, ${end}_end = ?, updated_at = ? WHERE item_id = ?`).bind(span.text, span.start, span.end, nowIso(), rhymeId).run();
  return (await getRhyme(env, rhymeId))!;
}

export async function patchRhyme(env: Env, rhymeId: string, p: { then_year?: string; then_cite?: string; now_year?: string; now_cite?: string; bridge?: string }): Promise<RhymeRecord> {
  if (p.bridge !== undefined && p.bridge.trim()) {
    const s = checkStyle(p.bridge);
    if (!s.ok) throw httpErr(400, `The bridge is set in the machine's voice and must pass the house style: ${s.issues.filter((i) => i.severity === 'error').map((i) => i.message).join(' ')}`);
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(v.trim());
  }
  if (sets.length) await env.DB.prepare(`UPDATE rhymes SET ${sets.join(', ')}, updated_at = ? WHERE item_id = ?`).bind(...vals, nowIso(), rhymeId).run();
  await syncRhymeItem(env, rhymeId);
  return (await getRhyme(env, rhymeId))!;
}

/** The Rhyme item's own source fields follow the "then" end (as in the bundle's sample Rhyme). */
async function syncRhymeItem(env: Env, rhymeId: string): Promise<void> {
  const r = await getRhyme(env, rhymeId);
  if (!r?.then_item_id) return;
  const t = await getItem(env, r.then_item_id);
  if (!t) return;
  await env.DB.prepare('UPDATE items SET url = ?, canonical_url = ?, creator = ?, source_name = ?, source_date = ?, updated_at = ? WHERE id = ?')
    .bind(t.url, t.canonical_url, t.creator, t.title ?? t.source_name, r.then_year || t.source_date, nowIso(), rhymeId)
    .run();
}

/** Machine draft of the bridge from the two verified quotes; style-checked, regenerated twice, else refused. */
export async function draftBridge(env: Env, rhymeId: string): Promise<string> {
  const r = await getRhyme(env, rhymeId);
  if (!r?.then_quote || !r.now_quote) throw httpErr(409, 'Set both quotes first');
  const prompt = `THEN (${r.then_year}): "${r.then_quote}"\nCited as: ${r.then_cite}\n\nNOW (${r.now_year}): "${r.now_quote}"\nCited as: ${r.now_cite}`;
  let feedback = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await generateJson(env, { task: 'haul', system: BRIDGE_SYSTEM, prompt: prompt + feedback, schema: bridgeSchema, itemId: rhymeId });
    const s = checkStyle(data.bridge);
    if (s.ok) {
      await env.DB.prepare('UPDATE rhymes SET bridge = ?, updated_at = ? WHERE item_id = ?').bind(data.bridge.trim(), nowIso(), rhymeId).run();
      return data.bridge.trim();
    }
    feedback = `\n\nYour previous bridge broke the house style:\n${describeIssues(s.issues)}\nWrite it again.`;
  }
  throw httpErr(422, 'The machine could not write a bridge that passes the house style; write it yourself');
}

/** Rows for the quotes check of a Rhyme item. */
export async function rhymeQuoteRows(env: Env, itemId: string): Promise<Array<{ label: string; status: 'pass' | 'warn' | 'fail'; detail?: string }>> {
  const r = await getRhyme(env, itemId);
  if (!r) return [{ label: 'Rhyme', status: 'fail', detail: 'No then/now pair' }];
  const rows: Array<{ label: string; status: 'pass' | 'warn' | 'fail'; detail?: string }> = [];
  for (const end of ['then', 'now'] as const) {
    const label = end === 'then' ? 'Then quote' : 'Now quote';
    const srcId = r[`${end}_item_id`];
    const quote = r[`${end}_quote`];
    if (!srcId || !quote || r[`${end}_start`] == null) {
      rows.push({ label, status: 'fail', detail: 'Not chosen yet' });
      continue;
    }
    const src = await getSource(env, srcId);
    const ok = Boolean(src && isVerbatimAt(src.text, { start: r[`${end}_start`]!, end: r[`${end}_end`]! }, quote));
    rows.push({ label, status: ok ? 'pass' : 'fail', detail: ok ? 'Found word for word in its fetched source' : 'No longer matches its source; select it again' });
    if (!r[`${end}_year`] || !r[`${end}_cite`]) rows.push({ label: `${label}: year and citation`, status: 'fail', detail: 'Both are needed' });
  }
  const b = r.bridge.trim();
  rows.push({ label: 'Bridge', status: !b ? 'fail' : checkStyle(b).ok ? 'pass' : 'fail', detail: !b ? 'Write or draft the bridge' : checkStyle(b).ok ? 'Passes the house style' : 'Fails the house style' });
  return rows;
}
