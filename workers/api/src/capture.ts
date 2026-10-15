// Capture: turn pasted links, passages, files and share-target posts into items and fan them out
// to the pipeline queue.

import { canonicalUrl, detectFile, detectText, detectUrl, extractUrls, type SourceKind } from '@fdf/shared/detect';
import { typeSwatch, type ContentType } from '@fdf/shared/tokens';
import { newId, nowIso, type Env, type QueueMessage } from '@fdf/server';

export interface CaptureEntry {
  url?: string;
  text?: string;
  /** For a pasted passage: where it is from, as the editor typed it. */
  source?: string;
  /** For a pasted passage: a link to the original, if any. */
  sourceUrl?: string;
  why?: string;
  whyNoteId?: string;
  type?: string;
}

export interface Captured {
  id: string;
  kind: SourceKind;
  type: ContentType;
  url: string | null;
  duplicateOf?: string;
}

const isType = (t: unknown): t is ContentType => typeof t === 'string' && t in typeSwatch;

async function insertItem(
  env: Env,
  f: { kind: SourceKind; type: ContentType; typeBy: 'auto' | 'editor'; url?: string | null; fileKey?: string | null; text?: string | null; source?: string | null; why?: string | null; whyNoteId?: string | null; title?: string | null },
): Promise<string> {
  const id = newId('it_');
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO items (id, kind, type, type_by, status, url, canonical_url, file_key, title, source_name, capture_text, why_text, why_note_id, captured_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      f.kind,
      f.type,
      f.typeBy,
      f.url ?? null,
      f.url ? canonicalUrl(f.url) : null,
      f.fileKey ?? null,
      f.title ?? null,
      f.source ?? null,
      f.text ?? null,
      f.why?.trim() || null,
      f.whyNoteId ?? null,
      now,
      now,
    )
    .run();
  if (f.whyNoteId) await env.DB.prepare('UPDATE notes SET item_id = ? WHERE id = ?').bind(id, f.whyNoteId).run();
  return id;
}

export async function captureEntries(env: Env, entries: CaptureEntry[]): Promise<Captured[]> {
  const out: Captured[] = [];
  for (const e of entries) {
    if (e.url) {
      const d = detectUrl(e.url);
      const canon = canonicalUrl(d.url ?? e.url);
      const dup = await env.DB.prepare('SELECT id, kind, type FROM items WHERE canonical_url = ? AND archived = 0 LIMIT 1').bind(canon).first<{ id: string; kind: SourceKind; type: ContentType }>();
      if (dup) {
        if (e.why?.trim()) await env.DB.prepare(`UPDATE items SET why_text = COALESCE(why_text || char(10) || char(10), '') || ?, updated_at = ? WHERE id = ?`).bind(e.why.trim(), nowIso(), dup.id).run();
        out.push({ id: dup.id, kind: dup.kind, type: dup.type, url: canon, duplicateOf: dup.id });
        continue;
      }
      const type = isType(e.type) ? e.type : d.type;
      const id = await insertItem(env, { kind: d.kind, type, typeBy: isType(e.type) ? 'editor' : 'auto', url: d.url ?? e.url, why: e.why, whyNoteId: e.whyNoteId });
      out.push({ id, kind: d.kind, type, url: d.url ?? e.url });
    } else if (e.text?.trim()) {
      const d = detectText(e.text);
      const type = isType(e.type) ? e.type : d.type;
      const id = await insertItem(env, {
        kind: 'text',
        type,
        typeBy: isType(e.type) ? 'editor' : 'auto',
        url: e.sourceUrl?.trim() || null,
        text: e.text.trim(),
        source: e.source?.trim() || null,
        why: e.why,
        whyNoteId: e.whyNoteId,
      });
      out.push({ id, kind: 'text', type, url: e.sourceUrl ?? null });
    }
  }
  const fresh = out.filter((c) => !c.duplicateOf);
  if (fresh.length) await env.INGEST_QUEUE.sendBatch(fresh.map((c) => ({ body: { kind: 'ingest', itemId: c.id } satisfies QueueMessage })));
  return out;
}

/** Split one block of pasted text into entries: many URLs become many items; prose is one passage. */
export function entriesFromPaste(text: string, extra: Omit<CaptureEntry, 'url' | 'text'> = {}): CaptureEntry[] {
  const urls = extractUrls(text);
  const rest = urls.reduce((s, u) => s.split(u).join(' '), text).replace(/[\s,;•*\-–—\d.)]+/g, ' ').trim();
  if (urls.length && rest.length < 40) return urls.map((url) => ({ ...extra, url }));
  if (urls.length === 1 && rest.length >= 40) {
    // A passage with its link: the link is the source of the passage.
    return [{ ...extra, text: text.replace(urls[0]!, '').trim(), sourceUrl: urls[0] }];
  }
  return [{ ...extra, text }];
}

export async function captureFile(env: Env, file: File, extra: { why?: string; type?: string; whyNoteId?: string } = {}): Promise<Captured | { noteFile: true }> {
  const d = detectFile(file.name, file.type);
  if (d.kind === 'voice') return { noteFile: true };
  if (d.kind !== 'pdf' && d.kind !== 'image') throw new Error(`Cannot capture a ${file.type || 'file'} yet; paste its text instead`);
  // Raster images only: an SVG is a document that can carry script.
  if (d.kind === 'image' && !/^image\/(png|jpeg|webp|gif|avif|heic|heif)$/.test(file.type)) throw new Error('Images must be PNG, JPEG, WebP, GIF, AVIF or HEIC');
  if (file.size > 60 * 1024 * 1024) throw new Error('Files over 60 MB are not supported');
  const id = newId('up_');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'upload';
  const key = `uploads/${id}/${safe}`;
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type || (d.kind === 'pdf' ? 'application/pdf' : 'image/jpeg') }, customMetadata: { name: file.name } });
  const type = isType(extra.type) ? extra.type : d.type;
  const itemId = await insertItem(env, { kind: d.kind, type, typeBy: isType(extra.type) ? 'editor' : 'auto', fileKey: key, why: extra.why, whyNoteId: extra.whyNoteId });
  await env.INGEST_QUEUE.send({ kind: 'ingest', itemId });
  return { id: itemId, kind: d.kind, type, url: null };
}
