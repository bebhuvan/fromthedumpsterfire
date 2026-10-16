// Shared fixtures for the server tests: three real passages (Jevons 1865, Bush 1945, Nadella 2025),
// items with sources and passing checks, and a draft Haul.

import { makeEnv, type TestEnv } from './fake-env';

export const NOW = '2026-10-16T06:00:00.000Z';
export const JEVONS =
  'It is wholly a confusion of ideas to suppose that the economical use of fuel is equivalent to a diminished consumption. The very contrary is the truth. As a rule, new modes of economy will lead to an increase of consumption.';
export const NADELLA = 'Jevons paradox strikes again! As AI gets more efficient and accessible, we will see its use skyrocket, turning it into a commodity we just can not get enough of.';
export const BUSH = 'The summation of human experience is being expanded at a prodigious rate, and the means we use for threading through the consequent maze to the momentarily important item is the same as was used in the days of square-rigged ships.';

/** A JPEG header big enough for imageSize: SOI, then an SOF0 with 1200 x 800. */
export function fakeJpeg(w = 1200, h = 800): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
}

export async function seedItem(env: TestEnv, id: string, o: { title: string; text: string; date: string; type?: string; why?: string; url?: string; archived?: number }) {
  await env.DB.prepare(
    `INSERT INTO items (id, kind, type, status, url, title, creator, source_name, source_date, why_text, archived, captured_at, updated_at) VALUES (?, 'article', ?, 'ready', ?, ?, 'Someone', 'A source', ?, ?, ?, ?, ?)`,
  )
    .bind(id, o.type ?? 'essay', o.url ?? `https://example.org/${id}`, o.title, o.date, o.why ?? `Why ${o.title} is here, in my words.`, o.archived ?? 0, NOW, NOW)
    .run();
  await env.DB.prepare(`INSERT INTO sources (item_id, text, extractor, word_count, fetched_at) VALUES (?, ?, 'readability', 40, ?)`).bind(id, o.text, NOW).run();
  for (const name of ['links', 'quotes', 'citations', 'style', 'why']) {
    await env.DB.prepare(`INSERT INTO checks (item_id, name, status, detail, at) VALUES (?, ?, 'pass', '{"summary":"ok"}', ?)`).bind(id, name, NOW).run();
  }
}

export async function seedHaul(env: TestEnv) {
  await seedItem(env, 'it_jevons', { title: 'The Coal Question', text: JEVONS, date: '1865' });
  await seedItem(env, 'it_nadella', { title: 'Jevons paradox strikes again', text: NADELLA, date: '27 January 2025', type: 'post' });
  await seedItem(env, 'it_bush', { title: 'As We May Think', text: BUSH, date: 'July 1945', archived: 1 });
  await env.DB.prepare(
    `INSERT INTO hauls (id, number, title_text, title_italic, deck, fn_title_text, fn_body, colophon, created_at, updated_at) VALUES ('hl_1', 1, 'What cheap things', 'cost', 'Six finds about plenty.', 'Words got cheap', 'This week I kept finding the same argument.', 'Made by hand.', ?, ?)`,
  )
    .bind(NOW, NOW)
    .run();
  return env;
}

