// The research desk: margin notes from what the model knows, made checkable. Two calls. First the
// model lists leads from its own knowledge (a claim and the Wikipedia article that should state it);
// code resolves each title and fetches the whole article. Then the model writes each note from the
// article's passages, quoting the sentences that carry every fact. Code checks the style and finds
// each quotation word for word in the fetched article; the judge (steps.ts) then reads the quoted
// stretch, and anything it does not fully confirm is set aside. Only notes the editor keeps print.

import { checkStyle, describeIssues } from '@fdf/shared/style';
import { findVerbatim } from '@fdf/shared/verbatim';
import { countWords } from '@fdf/shared/quoting';
import type { DraftRow, EvidenceRow, MarginalBody, NoteAngle } from './db';
import { getItem, getSource, upsertCheck } from './db';
import type { Env } from './env';
import { addWikiEvidence, passagesFor } from './evidence';
import { generateJson, loadRoutes } from './models/router';
import { RESEARCH_LEADS_SYSTEM, RESEARCH_NOTES_SYSTEM, researchLeadsSchema, researchNotesSchema, type ReadingCard } from './prompts';
import { itemHeader } from './steps';
import { errorMessage, newId, nowIso, parseJson, truncate } from './util';
import { SpendCeilingError } from './spend';

export const MAX_LEADS = 8;
/** Longest note, in words: a margin is narrow, and the prompt asks for at most 70. */
export const NOTE_MAX_WORDS = 85;
const PASSAGE_CHARS = 5000;

export interface Lead {
  angle: NoteAngle;
  claim: string;
  wikipedia: string;
}

export interface WrittenNote {
  lead: number;
  text: string;
  quote: string;
}

export interface CheckedNote {
  lead: number;
  text: string;
  evidence: EvidenceRow;
  span: { quote: string; start: number; end: number };
}

/**
 * Check what the model wrote against the house style and the fetched articles: each note must be
 * for a lead that has evidence, quote that evidence word for word, and fit the margin. One note per
 * lead; repeats of a quotation already printed beside the item are dropped.
 */
export function auditResearch(
  notes: WrittenNote[],
  evidenceByLead: Map<number, EvidenceRow>,
  takenQuotes: Set<string> = new Set(),
): { ok: CheckedNote[]; failures: string[] } {
  const ok: CheckedNote[] = [];
  const failures: string[] = [];
  const seen = new Set<number>();
  // Quotations already used, beside the item or by an earlier note in this answer.
  const taken = new Set(takenQuotes);
  for (const n of notes) {
    const where = `note for lead ${n.lead}`;
    const ev = evidenceByLead.get(n.lead);
    if (!ev) {
      failures.push(`${where}:\n- There is no lead ${n.lead} with passages. Write notes only for the numbered leads given.`);
      continue;
    }
    if (seen.has(n.lead)) continue;
    const text = n.text.trim();
    const style = checkStyle(text);
    const problems: string[] = [];
    if (!style.ok) problems.push(describeIssues(style.issues));
    const words = countWords(text);
    if (words > NOTE_MAX_WORDS) problems.push(`- It is ${words} words; a margin note is at most 70.`);
    const found = findVerbatim(ev.text, n.quote);
    if (!found) problems.push("- Its quote is not in the lead's passages word for word. Copy one to three consecutive sentences exactly.");
    else if (countWords(found.text) > 110) problems.push('- Its quote is too long. Quote at most three sentences.');
    if (problems.length) {
      failures.push(`${where}:\n${problems.join('\n')}`);
      continue;
    }
    if (taken.has(found!.text)) continue;
    taken.add(found!.text);
    seen.add(n.lead);
    ok.push({ lead: n.lead, text, evidence: ev, span: { quote: found!.text, start: found!.start, end: found!.end } });
  }
  return { ok, failures };
}

/** The prompt section for each lead with its article's passages. */
export function leadsPrompt(leads: Lead[], evidenceByLead: Map<number, EvidenceRow>): string {
  return leads
    .map((l, i) => {
      const ev = evidenceByLead.get(i);
      if (!ev) return '';
      return `LEAD ${i} (${l.angle}): ${l.claim}\nPassages from Wikipedia, "${ev.title}":\n"""\n${passagesFor(ev.text, l.claim, PASSAGE_CHARS)}\n"""`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function researchItem(env: Env, itemId: string): Promise<{ leads: number; sources: number; notes: number; dropped: number }> {
  const item = await getItem(env, itemId);
  const src = await getSource(env, itemId);
  // A Life and a Rhyme carry their own cited lines; a picture or an item without text has nothing to read.
  if (!item || !src?.text?.trim() || item.type === 'life' || item.kind === 'rhyme') return { leads: 0, sources: 0, notes: 0, dropped: 0 };
  const cardRow = await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'card'`).bind(itemId).first<{ body: string }>();
  const card = parseJson<Partial<ReadingCard>>(cardRow?.body, {});
  const max = loadRoutes(env).tasks.research.maxInputChars;
  const about = [
    itemHeader(item),
    item.why_text ? `The editor's note on why it is here (for your understanding only, never quote or rewrite it):\n${item.why_text}` : '',
    card.summary ? `Reading card summary: ${card.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data: found } = await generateJson(env, {
    task: 'research',
    system: RESEARCH_LEADS_SYSTEM,
    context: `${about}\n\nSOURCE TEXT:\n"""\n${truncate(src.text, max)}\n"""`,
    prompt: 'List the leads for this item.',
    schema: researchLeadsSchema,
    itemId,
  });
  const leads: Lead[] = found.leads.slice(0, MAX_LEADS).filter((l) => l.claim.trim() && l.wikipedia.trim() && !/https?:|www\./i.test(l.wikipedia));

  // Fetch each article once. A title that does not resolve (or is ambiguous) drops its lead.
  const evidenceByLead = new Map<number, EvidenceRow>();
  const byTitle = new Map<string, EvidenceRow | null>();
  for (const [i, l] of leads.entries()) {
    const key = l.wikipedia.trim().toLowerCase();
    if (!byTitle.has(key)) {
      const row = await addWikiEvidence(env, itemId, l.wikipedia.trim()).catch((e) => {
        if (e instanceof SpendCeilingError) throw e;
        console.warn(JSON.stringify({ event: 'research-fetch-failed', itemId, title: l.wikipedia, error: errorMessage(e) }));
        return null;
      });
      byTitle.set(key, row);
    }
    const row = byTitle.get(key);
    if (row) evidenceByLead.set(i, row);
  }
  const sources = new Set([...evidenceByLead.values()].map((e) => e.id)).size;
  if (!evidenceByLead.size) {
    await upsertCheck(env, itemId, 'research', 'warn', { summary: `${leads.length} lead${leads.length === 1 ? '' : 's'}, but no Wikipedia article could be found for any of them`, rows: [] });
    return { leads: leads.length, sources: 0, notes: 0, dropped: 0 };
  }

  // Quotations already beside this item (kept notes, the editor's or a session's) are not offered twice.
  // The pipeline's own unkept research offers are replaced below, so they do not count as taken.
  const existing = (
    await env.DB.prepare(
      `SELECT body FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status IN ('kept', 'edited', 'proposed')
       AND NOT (status = 'proposed' AND model NOT LIKE '%(session)' AND json_extract(body, '$.cite.kind') = 'evidence')`,
    )
      .bind(itemId)
      .all<Pick<DraftRow, 'body'>>()
  ).results;
  const taken = new Set(existing.map((r) => parseJson<MarginalBody | null>(r.body, null)?.cite).flatMap((c) => (c && 'quote' in c ? [c.quote] : [])));

  const context = `${about}\n\n${leadsPrompt(leads, evidenceByLead)}`;
  let result = { ok: [] as CheckedNote[], failures: [] as string[] };
  let written: WrittenNote[] = [];
  let model = '';
  let attempts = 0;
  for (; attempts < 2; attempts++) {
    const feedback = attempts && result.failures.length ? `Your previous notes had problems. Fix them and return all the notes again.\n${result.failures.join('\n')}\nPrevious notes:\n${JSON.stringify(written)}` : '';
    const r = await generateJson(env, {
      task: 'research',
      system: RESEARCH_NOTES_SYSTEM,
      context,
      prompt: feedback || 'Write the margin notes.',
      schema: researchNotesSchema,
      itemId,
      temperature: attempts ? 0.3 : undefined,
    });
    written = r.data.notes;
    model = r.model;
    result = auditResearch(written, evidenceByLead, taken);
    if (!result.failures.length) break;
  }

  // A fresh research run replaces the pipeline's earlier offers; kept lines and a session's notes stay.
  const now = nowIso();
  const pos = await env.DB.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM drafts WHERE item_id = ? AND kind = 'marginal'`).bind(itemId).first<{ n: number }>();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `DELETE FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status IN ('proposed', 'rejected') AND model NOT LIKE '%(session)' AND json_extract(body, '$.cite.kind') = 'evidence'`,
    ).bind(itemId),
  ];
  result.ok.forEach((n, i) => {
    const body: MarginalBody = {
      text: n.text,
      cite: { kind: 'evidence', evidenceId: n.evidence.id, title: n.evidence.title, publisher: n.evidence.publisher, url: n.evidence.url, ...n.span },
      angle: leads[n.lead]!.angle,
      verdict: 'unchecked',
    };
    stmts.push(
      env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES (?, ?, 'marginal', ?, 'proposed', ?, ?, ?, ?)`).bind(
        newId('dr_'),
        itemId,
        JSON.stringify(body),
        model,
        (pos?.n ?? 0) + i,
        now,
        now,
      ),
    );
  });
  await env.DB.batch(stmts);
  const dropped = result.failures.length;
  await upsertCheck(env, itemId, 'research', result.ok.length ? 'pass' : 'warn', {
    summary: `${result.ok.length} research note${result.ok.length === 1 ? '' : 's'} from ${sources} Wikipedia article${sources === 1 ? '' : 's'} (${leads.length} leads)${dropped ? `; ${dropped} failed the house checks and were dropped` : ''}`,
    rows: [],
  });
  return { leads: leads.length, sources, notes: result.ok.length, dropped };
}
