// Voice notes: Whisper transcript, then a deletion-only cleanup. A model may propose the cleanup,
// but it is only accepted if the token diff proves it deleted fillers and changed punctuation and
// nothing else; otherwise the code-only cleanup is used. The editor's words are never reworded.

import { checkDeletionOnly, cleanupDeterministic } from '@fdf/shared/cleanup';
import type { Env } from './env';
import type { NoteRow } from './db';
import { generateJson, transcribeAudio } from './models/router';
import { CLEAN_SYSTEM, cleanSchema } from './prompts';
import { errorMessage } from './util';

export interface CleanResult {
  text: string;
  method: 'model' | 'code';
  deleted: string[];
  rejected?: string;
}

export async function cleanTranscript(env: Env, raw: string, itemId?: string | null): Promise<CleanResult> {
  const fallback = (): CleanResult => {
    const text = cleanupDeterministic(raw);
    const report = checkDeletionOnly(raw, text);
    // The code-only cleanup is itself checked; if even that fails, the raw transcript stands.
    return report.ok ? { text, method: 'code', deleted: report.deleted } : { text: raw.trim(), method: 'code', deleted: [] };
  };
  if (!raw.trim()) return { text: '', method: 'code', deleted: [] };
  try {
    const { data } = await generateJson(env, { task: 'clean', system: CLEAN_SYSTEM, prompt: `TRANSCRIPT:\n${raw}`, schema: cleanSchema, itemId });
    const report = checkDeletionOnly(raw, data.text);
    if (report.ok) return { text: data.text.trim(), method: 'model', deleted: report.deleted };
    return { ...fallback(), rejected: `Model cleanup rejected: ${report.problems.slice(0, 3).join('; ')}` };
  } catch (e) {
    return { ...fallback(), rejected: `Model cleanup unavailable: ${errorMessage(e)}` };
  }
}

/** Transcribe and clean a stored voice note, writing both versions back to its row. */
export async function processNote(env: Env, noteId: string): Promise<NoteRow> {
  const note = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<NoteRow>();
  if (!note) throw new Error('No such note');
  const obj = await env.MEDIA.get(note.audio_key);
  if (!obj) throw new Error('The audio is missing from storage');
  const audio = new Uint8Array(await obj.arrayBuffer());
  const t = await transcribeAudio(env, audio, { itemId: note.item_id, seconds: note.seconds ?? undefined });
  const clean = await cleanTranscript(env, t.text, note.item_id);
  await env.DB.prepare(
    'UPDATE notes SET transcript_raw = ?, transcript_clean = ?, deleted_words = ?, clean_method = ?, seconds = COALESCE(?, seconds) WHERE id = ?',
  )
    .bind(t.text, clean.text, JSON.stringify(clean.deleted), clean.method, t.seconds || null, noteId)
    .run();
  return (await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<NoteRow>())!;
}
