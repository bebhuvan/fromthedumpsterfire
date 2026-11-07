// The field note's embeds and its published body. A link on a line of its own in the editor's text
// that names a YouTube or Vimeo video, a Spotify episode or show, or an X post is resolved by code
// when the note is saved, by the same functions and rules as an item's blocks (blocks.ts: provider
// and id parsed from the link, titles and a post's words from the platform's own oEmbed, a poster
// fetched through guardedFetch with a byte cap and kept in MEDIA). The results are kept on the Haul
// row (hauls.fn_embeds); publish.ts sets them into the body. The editor's words go nowhere.

import { bodyIsRich, bodyParagraphs, embedKind, embedLinks, noteBody, noteParts } from '@fdf/shared/fieldnote';
import type { NoteBlock, NoteEmbed } from '@fdf/shared/haul';
import type { Env } from './env';
import { audioBlock, BlockRefused, blocksForBundle, postBlock, videoBlock, type BlockRow, type StoredBlock } from './blocks';
import { newId, nowIso } from './util';

export interface FieldNoteEmbed {
  /** The stored block, as blocks.body stores one. */
  block?: Extract<StoredBlock, { kind: 'video' | 'audio' | 'post' }>;
  /** A video's poster in MEDIA. */
  media_key?: string;
  mime?: string;
  /** Why the link could not be set as an embed, in words the editor reads. */
  error?: string;
  at: string;
}
export type FieldNoteEmbeds = Record<string, FieldNoteEmbed>;

/** A link that failed is tried again on a save at least this long after. */
const RETRY_MS = 60_000;
export const MAX_NOTE_EMBEDS = 24;

async function resolveOne(env: Env, haulId: string, url: string): Promise<FieldNoteEmbed> {
  const at = nowIso();
  try {
    const kind = embedKind(url);
    if (kind === 'post') return { block: await postBlock(url), at };
    if (kind === 'audio') return { block: await audioBlock(url), at };
    const { body, poster } = await videoBlock(url);
    if (!poster) return { block: body, at };
    const key = `fieldnote/${haulId}/${newId('fe_')}.${poster.ext}`;
    await env.MEDIA.put(key, poster.bytes, { httpMetadata: { contentType: poster.mime } });
    return { block: body, media_key: key, mime: poster.mime, at };
  } catch (e) {
    return { error: e instanceof BlockRefused ? e.message : 'That link could not be read just now; save the note again in a minute to retry.', at };
  }
}

/**
 * The embeds for the note's current text: links already resolved are kept, new ones resolved, failed
 * ones retried after a minute (or now, with `retry`), and links no longer in the note dropped with
 * their posters.
 */
export async function resolveFieldNoteEmbeds(env: Env, haulId: string, text: string, current: FieldNoteEmbeds, opts: { retry?: boolean } = {}): Promise<FieldNoteEmbeds> {
  const next: FieldNoteEmbeds = {};
  for (const [i, url] of embedLinks(text).entries()) {
    const had = current[url];
    if (had?.block || (had?.error && !opts.retry && Date.now() - Date.parse(had.at) < RETRY_MS)) next[url] = had;
    else if (i >= MAX_NOTE_EMBEDS) next[url] = { error: `A field note takes at most ${MAX_NOTE_EMBEDS} embeds; link this one in a sentence instead.`, at: nowIso() };
    else next[url] = await resolveOne(env, haulId, url);
  }
  for (const [url, e] of Object.entries(current)) if (!next[url] && e.media_key) await env.MEDIA.delete(e.media_key).catch(() => undefined);
  return next;
}

/**
 * The field note as it goes into the bundle: its plain paragraphs, and its body when it says more
 * than they do (a heading, quotation, link, italic or embed). Posters are copied next to the bundle
 * under `to`. An embeddable link with no resolved embed stops the publish.
 */
export function fieldNoteForBundle(
  text: string,
  embeds: FieldNoteEmbeds,
  to: string,
  filesBase: string,
): { paragraphs: string[]; body?: NoteBlock[]; copies: Array<[string, string]>; problems: string[] } {
  const parts = noteParts(text);
  const urls = embedLinks(text).filter((u) => embeds[u]?.block);
  const rows: BlockRow[] = urls.map((u, k) => {
    const e = embeds[u]!;
    return { id: `fn-${k}`, item_id: '', kind: e.block!.kind, body: JSON.stringify(e.block), media_key: e.media_key ?? null, mime: e.mime ?? null, status: 'kept', position: k, created_at: e.at, updated_at: e.at };
  });
  const bb = blocksForBundle(rows, null, to, filesBase);
  const byUrl = new Map(urls.map((u, k) => [u, bb.blocks[k] as NoteEmbed]));
  const { body, missing } = noteBody(parts, (u) => byUrl.get(u));
  const problems = [
    ...bb.problems.map((m) => `the field note: ${m}`),
    ...missing.map((u) => `the field note's link ${u} is not set as an embed${embeds[u]?.error ? `: ${embeds[u]!.error}` : ' yet; save the note again'}`),
  ];
  return { paragraphs: bodyParagraphs(body), ...(bodyIsRich(body) ? { body } : {}), copies: bb.copies, problems };
}
