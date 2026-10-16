// Voice notes: Whisper transcript, then a deletion-only cleanup. A model may propose the cleanup,
// but it is only accepted if the token diff proves it deleted fillers and changed punctuation and
// nothing else; otherwise the code-only cleanup is used. The editor's words are never reworded.

import { dictionaryHints } from '@fdf/shared/voice';
import { checkDeletionOnly, cleanupDeterministic } from '@fdf/shared/cleanup';
import { AUDIO_FORMATS, type AudioFormat } from '@fdf/shared/haul';
import type { Env } from './env';
import type { NoteRow } from './db';
import { generateJson, transcribeAudio } from './models/router';
import { CLEAN_SYSTEM, cleanSchema } from './prompts';
import { errorMessage } from './util';

/**
 * The real format of a voice note, from its bytes (the browser's declared type can lie: Chrome's
 * "audio/mp4" may hold Opus). m4a means AAC in MP4, which iOS and Android both play. Opus in MP4 (mp4),
 * WebM and Ogg play on Android only.
 */
export function sniffAudioFormat(b: Uint8Array, declared = ''): AudioFormat {
  const ascii = (from: number, n: number) => String.fromCharCode(...b.subarray(from, from + n));
  if (b.length >= 12 && ascii(4, 4) === 'ftyp') {
    // Look for the sample entry in the first 256 KB (moov is at the front in MediaRecorder output).
    const head = ascii(0, Math.min(b.length, 256 * 1024));
    if (head.includes('mp4a')) return 'm4a';
    if (head.includes('Opus') || head.includes('opus')) return 'mp4';
    return 'm4a';
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (b.length >= 4 && ascii(0, 4) === 'OggS') return 'ogg';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  if ((b.length >= 3 && ascii(0, 3) === 'ID3') || (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0 && (b[1]! & 0x06) !== 0)) return 'mp3';
  // ADTS AAC (0xFFF1 / 0xFFF9) has layer bits 00; treat as m4a-compatible audio.
  if (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xf6) === 0xf0) return 'm4a';
  return formatFromMime(declared);
}

export function formatFromMime(mime: string): AudioFormat {
  const m = mime.toLowerCase();
  return m.includes('mp4') || m.includes('m4a') || m.includes('aac') ? 'm4a' : m.includes('mpeg') || m.includes('mp3') ? 'mp3' : m.includes('ogg') || m.includes('opus') ? 'ogg' : m.includes('wav') ? 'wav' : 'webm';
}

/** A stored note's format: sniffed at upload; older notes fall back to their declared type. */
export const formatOfNote = (n: Pick<NoteRow, 'format' | 'mime'>): AudioFormat => (n.format && (AUDIO_FORMATS as readonly string[]).includes(n.format) ? (n.format as AudioFormat) : formatFromMime(n.mime));

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
  const t = await transcribeAudio(env, audio, { itemId: note.item_id, seconds: note.seconds ?? undefined, hints: dictionaryHints });
  const clean = await cleanTranscript(env, t.text, note.item_id);
  await env.DB.prepare(
    'UPDATE notes SET transcript_raw = ?, transcript_clean = ?, deleted_words = ?, clean_method = ?, seconds = COALESCE(?, seconds) WHERE id = ?',
  )
    .bind(t.text, clean.text, JSON.stringify(clean.deleted), clean.method, t.seconds || null, noteId)
    .run();
  return (await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(noteId).first<NoteRow>())!;
}
