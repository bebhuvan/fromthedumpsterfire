// Publish: assemble a Haul bundle from D1, gate it on every item's checks and the bundle
// invariants (packages/shared/src/validate.ts), then write hauls/NNN/vN/haul.json and the index to
// R2. A correction is a new version with a corrections entry; versions are never overwritten.

import type { Haul, HaulIndex, HaulSummary, Item, RouteStep, Title } from '@fdf/shared/haul';
import { BUNDLE_VERSION, haulSlug } from '@fdf/shared/haul';
import type { ContentType, Swatch } from '@fdf/shared/tokens';
import { validateHaul, type BundleIssue } from '@fdf/shared/validate';
import type { Env } from './env';
import type { CheckRow, DraftRow, ExcerptRow, HaulRow, ItemRow, MarginalBody, NoteRow, WikiRow } from './db';
import { dateIst, nowIso, parseJson, sha256Hex, slugify } from './util';

export const INDEX_PATH = 'hauls/index.json';

export interface PublishProblem {
  itemId?: string;
  itemTitle?: string;
  message: string;
}

export interface Assembled {
  haul: Haul;
  index: HaulIndex;
  problems: PublishProblem[];
  bundleErrors: BundleIssue[];
  warnings: BundleIssue[];
  /** Voice-note audio to copy next to the bundle: [from R2 key, to R2 key]. */
  audioCopies: Array<[string, string]>;
}

const DEFAULT_COLOPHON =
  'Chosen and annotated by Bhuvanesh, mostly by voice. Read, cross-linked and drafted with language models, then checked by hand. The serif is the editor; the blue sans is the machine. Every quotation was matched against its source and every link was fetched before publishing.';

export const defaultColophon = () => DEFAULT_COLOPHON;

const ext = (mime: string) => (mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm');

function citeLabel(b: MarginalBody, item: ItemRow): string {
  if (b.cite.kind === 'wiki') return `Wikipedia: ${b.cite.title}`;
  return item.source_name ? `${item.source_name}, the piece itself` : 'The piece itself';
}

export async function readIndex(env: Env): Promise<HaulIndex> {
  const obj = await env.MEDIA.get(INDEX_PATH);
  if (!obj) return { bundleVersion: BUNDLE_VERSION, updatedAt: nowIso(), hauls: [] };
  return (await obj.json()) as HaulIndex;
}

export async function assembleHaul(env: Env, haulId: string, opts: { correction?: string } = {}): Promise<Assembled> {
  const h = await env.DB.prepare('SELECT * FROM hauls WHERE id = ?').bind(haulId).first<HaulRow>();
  if (!h) throw new Error('No such Haul');
  const problems: PublishProblem[] = [];
  const audioCopies: Array<[string, string]> = [];
  const version = h.status === 'published' ? h.version + 1 : 1;
  const slug = haulSlug(h.number);
  const filesBase = env.FILES_BASE.replace(/\/$/, '');

  const items = (
    await env.DB.prepare('SELECT i.* FROM haul_items hi JOIN items i ON i.id = hi.item_id WHERE hi.haul_id = ? ORDER BY hi.position').bind(haulId).all<ItemRow>()
  ).results;
  const idFor = new Map<string, string>();
  const used = new Set<string>();
  for (const it of items) {
    const t = parseJson<Title | null>(it.title_choice, null)?.text ?? it.title ?? 'item';
    let s = slugify(t);
    for (let k = 2; used.has(s); k++) s = `${slugify(t, 44)}-${k}`;
    used.add(s);
    idFor.set(it.id, s);
  }

  const noteById = async (id: string | null) => (id ? env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>() : null);

  const bundleItems: Item[] = [];
  for (const it of items) {
    const label = it.title ?? it.url ?? it.id;
    const checks = (await env.DB.prepare('SELECT * FROM checks WHERE item_id = ?').bind(it.id).all<CheckRow>()).results;
    for (const c of checks) {
      if (c.status === 'fail' && ['links', 'quotes', 'citations', 'style', 'why'].includes(c.name)) {
        problems.push({ itemId: it.id, itemTitle: label, message: `${c.name}: ${parseJson<{ summary?: string }>(c.detail, {}).summary ?? 'failed'}` });
      }
    }
    if (!checks.some((c) => c.name === 'links')) problems.push({ itemId: it.id, itemTitle: label, message: 'links have not been checked yet' });

    const ex = await env.DB.prepare('SELECT * FROM excerpts WHERE item_id = ? AND chosen = 1').bind(it.id).first<ExcerptRow>();
    const notes = (
      await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status IN ('kept', 'edited') ORDER BY position`).bind(it.id).all<DraftRow>()
    ).results.map((d) => parseJson<MarginalBody | null>(d.body, null)).filter((b): b is MarginalBody => Boolean(b));
    for (const n of notes) if (n.verdict !== 'supported') problems.push({ itemId: it.id, itemTitle: label, message: `a kept note is not confirmed by its source ("${n.text.slice(0, 50)}…")` });
    const waiting = await env.DB.prepare(`SELECT COUNT(*) AS n FROM drafts WHERE item_id = ? AND kind = 'marginal' AND status = 'proposed'`).bind(it.id).first<{ n: number }>();
    if (waiting?.n) problems.push({ itemId: it.id, itemTitle: label, message: `${waiting.n} machine note${waiting.n === 1 ? '' : 's'} still waiting on you (keep or cut)` });
    const cards = (await env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ? AND status = 'kept' ORDER BY position`).bind(it.id).all<WikiRow>()).results;
    const conns = (
      await env.DB.prepare('SELECT c.*, i.title AS to_title, i.title_choice AS to_choice FROM connections c JOIN items i ON i.id = c.to_item_id WHERE c.item_id = ?').bind(it.id).all<{
        type: string;
        note: string;
        to_item_id: string;
        to_title: string | null;
        to_choice: string | null;
      }>()
    ).results.filter((c) => idFor.has(c.to_item_id));

    const whyNote = it.why_audio ? await noteById(it.why_note_id) : null;
    let whyAudio: Item['why']['audio'];
    if (whyNote) {
      const to = `hauls/${slug}/audio/${idFor.get(it.id)}-why.${ext(whyNote.mime)}`;
      audioCopies.push([whyNote.audio_key, to]);
      whyAudio = { url: `${filesBase}/${to}`, seconds: Math.round(whyNote.seconds ?? 0) };
    }

    const title = parseJson<Title | null>(it.title_choice, null) ?? { text: it.title ?? '' };
    const item: Item = {
      id: idFor.get(it.id)!,
      type: it.type as ContentType,
      title: title.italic ? { text: title.text, italic: title.italic } : { text: title.text },
      creator: it.creator ?? '',
      source: { name: it.source_name ?? '', date: it.source_date ?? '', url: it.canonical_url || it.url || '' },
      ...(it.minutes ? { minutes: it.minutes } : {}),
      why: { text: (it.why_text ?? '').trim(), ...(whyAudio ? { audio: whyAudio } : {}) },
      ...(ex
        ? {
            excerpt: {
              text: ex.text,
              ...(ex.highlight_start != null && ex.highlight_end != null ? { highlight: ex.text.slice(ex.highlight_start, ex.highlight_end) } : {}),
              locator: ex.locator ?? it.locator ?? '',
            },
          }
        : {}),
      ...(it.media ? { media: JSON.parse(it.media) } : {}),
      ...(it.plate ? { plate: JSON.parse(it.plate) } : {}),
      marginalia: notes.map((n) => ({ text: n.text, cite: citeLabel(n, it) })),
      wiki: cards.map((c) => ({ title: c.title, summary: c.summary, url: c.url })),
      connections: conns.map((c) => ({
        type: c.type,
        title: parseJson<Title | null>(c.to_choice, null)?.text ?? c.to_title ?? '',
        note: c.note,
        itemId: idFor.get(c.to_item_id)!,
      })),
    };
    bundleItems.push(item);
  }

  const route = parseJson<Array<RouteStep & { itemRef?: string }>>(h.route, []).map((r) => {
    const step: RouteStep = { day: r.day, text: r.text, by: r.by };
    const ref = r.itemRef ?? r.itemId;
    if (ref && idFor.has(ref)) step.itemId = idFor.get(ref);
    return step;
  });

  const fnNote = await noteById(h.fn_note_id);
  let fnAudio: Haul['fieldNote']['audio'];
  if (fnNote) {
    const to = `hauls/${slug}/audio/field-note.${ext(fnNote.mime)}`;
    audioCopies.push([fnNote.audio_key, to]);
    fnAudio = { url: `${filesBase}/${to}`, seconds: Math.round(fnNote.seconds ?? 0) };
  }

  const previous = (
    await env.DB.prepare('SELECT * FROM haul_versions WHERE haul_id = ? ORDER BY version').bind(haulId).all<{ correction: string | null; published_at: string; version: number }>()
  ).results;
  const corrections = previous.filter((p) => p.correction).map((p) => ({ date: dateIst(p.published_at), text: p.correction! }));
  if (version > 1) {
    if (!opts.correction?.trim()) problems.push({ message: 'A correction needs a note saying what changed' });
    else corrections.push({ date: dateIst(nowIso()), text: opts.correction.trim() });
  }

  const publishedAt = h.published_at ? dateIst(h.published_at) : dateIst(nowIso());
  const haulTitle: Title = h.title_italic ? { text: h.title_text, italic: h.title_italic } : { text: h.title_text };
  const haul: Haul = {
    bundleVersion: BUNDLE_VERSION,
    number: h.number,
    version,
    title: haulTitle,
    deck: h.deck,
    publishedAt,
    swatch: h.swatch as Swatch,
    fieldNote: {
      title: h.fn_title_italic ? { text: h.fn_title_text, italic: h.fn_title_italic } : { text: h.fn_title_text },
      ...(fnAudio ? { audio: fnAudio } : {}),
      paragraphs: h.fn_body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
      ...(h.fn_highlight?.trim() ? { highlight: h.fn_highlight.trim() } : {}),
      route,
    },
    items: bundleItems,
    threads: [],
    colophon: h.colophon.trim() || DEFAULT_COLOPHON,
    ...(corrections.length ? { corrections } : {}),
  };

  const current = await readIndex(env);
  const entry: HaulSummary = {
    number: h.number,
    title: haulTitle,
    deck: h.deck,
    publishedAt,
    swatch: h.swatch as Swatch,
    itemCount: bundleItems.length,
    path: `hauls/${slug}/v${version}/haul.json`,
  };
  const index: HaulIndex = {
    bundleVersion: BUNDLE_VERSION,
    updatedAt: nowIso(),
    hauls: [...current.hauls.filter((x) => x.number !== h.number), entry].sort((a, b) => b.number - a.number),
  };

  const report = validateHaul(haul, index);
  return { haul, index, problems, bundleErrors: report.errors, warnings: report.warnings, audioCopies };
}

export interface PublishResult {
  ok: boolean;
  version?: number;
  path?: string;
  url?: string;
  problems: PublishProblem[];
  bundleErrors: BundleIssue[];
  warnings: BundleIssue[];
}

export async function publishHaul(env: Env, haulId: string, opts: { correction?: string; dryRun?: boolean } = {}): Promise<PublishResult> {
  const a = await assembleHaul(env, haulId, opts);
  const base = { problems: a.problems, bundleErrors: a.bundleErrors, warnings: a.warnings };
  if (a.problems.length || a.bundleErrors.length || opts.dryRun) return { ok: !a.problems.length && !a.bundleErrors.length, ...base };

  const path = `hauls/${haulSlug(a.haul.number)}/v${a.haul.version}/haul.json`;
  // Versions are immutable: refuse to overwrite one that exists.
  if (await env.MEDIA.head(path)) return { ok: false, ...base, problems: [{ message: `${path} already exists; publish a correction instead` }] };

  for (const [from, to] of a.audioCopies) {
    const obj = await env.MEDIA.get(from);
    if (obj) await env.MEDIA.put(to, obj.body, { httpMetadata: { contentType: obj.httpMetadata?.contentType, cacheControl: 'public, max-age=31536000, immutable' } });
  }
  const body = JSON.stringify(a.haul, null, 2);
  await env.MEDIA.put(path, body, { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' } });
  await env.MEDIA.put(INDEX_PATH, JSON.stringify(a.index, null, 2), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'public, max-age=60' } });

  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO haul_versions (haul_id, version, path, correction, sha256, published_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      haulId,
      a.haul.version,
      path,
      a.haul.version > 1 ? opts.correction!.trim() : null,
      await sha256Hex(body),
      now,
    ),
    env.DB.prepare(`UPDATE hauls SET status = 'published', version = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`).bind(a.haul.version, now, now, haulId),
  ]);
  // One notification per Haul: only the first version is announced.
  if (a.haul.version === 1) await env.INGEST_QUEUE.send({ kind: 'notify', haulId, version: 1 });
  return { ok: true, version: a.haul.version, path, url: `${env.FILES_BASE.replace(/\/$/, '')}/${path}`, ...base };
}
