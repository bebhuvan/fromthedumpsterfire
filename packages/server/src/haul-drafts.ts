// Machine help for the field note: two or three interview questions about the week's items, and a
// draft of the route from capture timestamps. Both are machine prose and pass the style check;
// failures are regenerated with feedback, then dropped.

import type { RouteStep } from '@fdf/shared/haul';
import { checkStyle, describeIssues } from '@fdf/shared/style';
import type { Env } from './env';
import type { HaulRow, ItemRow } from './db';
import { generateJson } from './models/router';
import { HAUL_QUESTIONS_SYSTEM, questionsSchema, ROUTE_SYSTEM, routeSchema } from './prompts';
import { nowIso, parseJson, truncate, weekdayIst } from './util';

async function haulItems(env: Env, haulId: string) {
  return (
    await env.DB.prepare('SELECT i.* FROM haul_items hi JOIN items i ON i.id = hi.item_id WHERE hi.haul_id = ? ORDER BY hi.position').bind(haulId).all<ItemRow>()
  ).results;
}

function describe(items: ItemRow[]): string {
  return items
    .map((it) =>
      [
        `[${it.id}] ${it.title ?? it.url} (${it.type}${it.creator ? `, ${it.creator}` : ''}${it.source_date ? `, ${it.source_date}` : ''})`,
        `captured ${weekdayIst(it.captured_at)} ${it.captured_at.slice(0, 16)}`,
        it.why_text ? `editor's note: ${truncate(it.why_text, 600)}` : 'no editor note yet',
      ].join('\n  '),
    )
    .join('\n');
}

export async function draftQuestions(env: Env, haulId: string): Promise<string[]> {
  const items = await haulItems(env, haulId);
  if (!items.length) throw new Error('Add items to the Haul first');
  let feedback = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await generateJson(env, { task: 'haul', system: HAUL_QUESTIONS_SYSTEM, prompt: `ITEMS IN THIS HAUL:\n${describe(items)}${feedback}`, schema: questionsSchema });
    const bad = data.questions.map((q) => checkStyle(q)).filter((r) => !r.ok);
    if (!bad.length || attempt === 2) {
      const good = data.questions.filter((q) => checkStyle(q).ok);
      const h = await env.DB.prepare('SELECT questions FROM hauls WHERE id = ?').bind(haulId).first<Pick<HaulRow, 'questions'>>();
      const existing = parseJson<Array<{ q: string; answer: string }>>(h?.questions, []);
      // Keep answers the editor already wrote; replace unanswered questions.
      const answered = existing.filter((x) => x.answer?.trim());
      const next = [...answered, ...good.map((q) => ({ q, answer: '' }))];
      await env.DB.prepare('UPDATE hauls SET questions = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), nowIso(), haulId).run();
      return good;
    }
    feedback = `\n\nYour previous questions broke the house style:\n${bad.map((b) => describeIssues(b.issues)).join('\n')}\nWrite them again.`;
  }
  return [];
}

export async function draftRoute(env: Env, haulId: string): Promise<RouteStep[]> {
  const items = (await haulItems(env, haulId)).sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  if (!items.length) throw new Error('Add items to the Haul first');
  let feedback = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await generateJson(env, {
      task: 'haul',
      system: ROUTE_SYSTEM,
      prompt: `ITEMS, IN THE ORDER THEY WERE CAPTURED:\n${describe(items)}\n\nUse the item ids in square brackets.${feedback}`,
      schema: routeSchema,
    });
    const lines = [...data.steps.map((s) => s.text), data.noticed.text];
    const bad = lines.map((l) => checkStyle(l)).filter((r) => !r.ok);
    if (bad.length && attempt < 2) {
      feedback = `\n\nYour previous route broke the house style:\n${bad.map((b) => describeIssues(b.issues)).join('\n')}\nWrite it again.`;
      continue;
    }
    const byId = new Map(items.map((i) => [i.id, i]));
    const steps: Array<RouteStep & { drafted: true }> = [];
    for (const it of items) {
      const s = data.steps.find((x) => x.itemId === it.id);
      if (!s || !checkStyle(s.text).ok) continue;
      steps.push({ day: weekdayIst(it.captured_at), text: s.text.trim(), by: 'machine', itemId: it.id, drafted: true });
    }
    if (checkStyle(data.noticed.text).ok) {
      const last = data.noticed.itemIds.map((id) => byId.get(id)).filter(Boolean).at(-1);
      steps.push({ day: last ? weekdayIst(last.captured_at) : steps.at(-1)?.day ?? '', text: data.noticed.text.trim(), by: 'machine', drafted: true });
    }
    await env.DB.prepare('UPDATE hauls SET route = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(steps), nowIso(), haulId).run();
    return steps;
  }
  return [];
}
