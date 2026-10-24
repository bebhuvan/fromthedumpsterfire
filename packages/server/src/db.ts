// Row types and small D1 helpers.

import type { Env } from './env';
import { nowIso } from './util';

export interface ItemRow {
  id: string;
  kind: string;
  type: string;
  type_by: string;
  status: string;
  status_detail: string | null;
  url: string | null;
  canonical_url: string | null;
  file_key: string | null;
  title: string | null;
  title_choice: string | null;
  creator: string | null;
  source_name: string | null;
  source_date: string | null;
  minutes: number | null;
  capture_text: string | null;
  why_text: string | null;
  why_note_id: string | null;
  why_audio: number;
  media: string | null;
  plate: string | null;
  locator: string | null;
  /** The editor's "start here": a time or page, and their few words (0005). */
  start_at?: string | null;
  start_note?: string | null;
  /** The year the work was made; a post's handle; a letter's recipient; where it was written or given (0006). */
  year?: number | null;
  handle?: string | null;
  recipient?: string | null;
  place?: string | null;
  /** A Book item's shelf book (books.id), written to the bundle as Item.shelf (0007). */
  shelf_id?: string | null;
  archived: number;
  captured_at: string;
  updated_at: string;
}

export interface SourceRow {
  item_id: string;
  text: string;
  extractor: string;
  word_count: number;
  snapshot_key: string | null;
  text_key: string | null;
  meta: string | null;
  fetched_at: string;
  edited: number;
}

export interface DraftRow {
  id: string;
  item_id: string | null;
  haul_id: string | null;
  kind: string;
  body: string;
  status: string;
  check_json: string | null;
  model: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface WikiRow {
  id: string;
  item_id: string;
  query: string;
  title: string;
  summary: string;
  extract: string;
  url: string;
  revision: string | null;
  status: string;
  http_status: number | null;
  checked_at: string | null;
  position: number;
  created_at: string;
}

export interface ExcerptRow {
  id: string;
  item_id: string;
  start: number;
  end: number;
  text: string;
  highlight_start: number | null;
  highlight_end: number | null;
  locator: string | null;
  origin: string;
  chosen: number;
  verified: number;
  /** The machine's one line on why it proposed this passage (Desk only). */
  why?: string | null;
  created_at: string;
}

export interface CheckRow {
  item_id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  at: string;
}

export interface HaulRow {
  id: string;
  number: number;
  title_text: string;
  title_italic: string | null;
  deck: string;
  swatch: string;
  fn_title_text: string;
  fn_title_italic: string | null;
  fn_body: string;
  fn_highlight: string | null;
  fn_note_id: string | null;
  cover_plate: string | null;
  /** The Haul's edition colour (0006); NULL means editionOf(number). */
  edition?: string | null;
  route: string;
  questions: string;
  colophon: string;
  status: string;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  item_id: string | null;
  haul_id: string | null;
  target: string;
  audio_key: string;
  mime: string;
  seconds: number | null;
  transcript_raw: string | null;
  transcript_clean: string | null;
  deleted_words: string | null;
  clean_method: string | null;
  format: string | null;
  created_at: string;
}

/** The body of a marginal-note draft. */
export interface MarginalBody {
  text: string;
  cite: { kind: 'source'; quote: string; start: number; end: number } | { kind: 'wiki'; title: string; cardId: string };
  /** The checker's verdict against the cited evidence. */
  verdict?: 'supported' | 'partly' | 'unsupported' | 'unchecked';
  reason?: string;
  corrected?: string;
  /** Ideas only: where the quoted passage sits (page, time, section). */
  locator?: string;
  /** Ideas only: the editor's own line on it, verbatim. Never sent to a model. */
  reaction?: string;
  /** True once the editor has changed the text. */
  edited?: boolean;
}

export async function getItem(env: Env, id: string): Promise<ItemRow | null> {
  return env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
}

export async function getSource(env: Env, itemId: string): Promise<SourceRow | null> {
  return env.DB.prepare('SELECT * FROM sources WHERE item_id = ?').bind(itemId).first<SourceRow>();
}

export async function setStatus(env: Env, id: string, status: string, detail: string | null = null): Promise<void> {
  await env.DB.prepare('UPDATE items SET status = ?, status_detail = ?, updated_at = ? WHERE id = ?').bind(status, detail, nowIso(), id).run();
}

export async function upsertCheck(env: Env, itemId: string, name: string, status: CheckRow['status'], detail: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO checks (item_id, name, status, detail, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (item_id, name) DO UPDATE SET status = excluded.status, detail = excluded.detail, at = excluded.at`,
  )
    .bind(itemId, name, status, JSON.stringify(detail), nowIso())
    .run();
}
