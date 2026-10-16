// Plates: public-domain images for an item or a Haul cover. A model proposes search queries (never
// URLs); code asks open-access collection APIs, keeps only works the institution itself marks public
// domain or CC0, records exactly what it says about the work, fetch-checks every image, and copies
// the editor's choice into private storage. Publishing copies it next to the bundle. Nothing here
// generates or alters an image beyond resizing.

import type { Plate } from '@fdf/shared/haul';
import type { Env } from './env';
import type { ItemRow } from './db';
import { getItem } from './db';
import { generateJson } from './models/router';
import { PLATE_SYSTEM, plateSchema, type ReadingCard } from './prompts';
import { guardedFetch, finalUrlOf } from './extract/guard';
import { checkLink, USER_AGENT } from './extract/http';
import { FatalError, newId, nowIso, parseJson, truncate } from './util';

export type PlateProvider = 'commons' | 'aic' | 'met' | 'smithsonian' | 'rijksmuseum';

export interface PlateCandidate {
  provider: PlateProvider;
  providerId: string;
  title: string;
  creator?: string;
  date?: string;
  institution: string;
  licence: string;
  licenceUrl?: string;
  sourceUrl: string;
  imageUrl: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
}

export interface PlateRow {
  id: string;
  item_id: string | null;
  haul_id: string | null;
  provider: PlateProvider;
  provider_id: string;
  query: string;
  query_by: string;
  title: string;
  creator: string | null;
  date: string | null;
  institution: string;
  licence: string;
  licence_url: string | null;
  source_url: string;
  image_url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  status: 'candidate' | 'chosen' | 'rejected';
  check_status: number | null;
  checked_at: string | null;
  r2_key: string | null;
  mime: string | null;
  bytes: number | null;
  position: number;
  created_at: string;
}

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
/** Renditions are about this wide: big enough for a phone at 3x in a column, small enough to ship. */
export const RENDITION_WIDTH = 1200;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// ---------------------------------------------------------------- small pure helpers

/** Plain text from the HTML some APIs put in metadata (Commons "Artist"). */
export function stripHtml(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wikimedia Commons licence gate: only files the file page itself marks public domain or CC0.
 * Everything else (CC BY, CC BY-SA, fair use, unknown) is refused.
 */
export function commonsIsPublicDomain(meta: Record<string, { value?: string } | undefined>): { ok: boolean; licence: string } {
  const short = stripHtml(meta.LicenseShortName?.value);
  const code = (meta.License?.value ?? '').toLowerCase();
  const copyrighted = (meta.Copyrighted?.value ?? '').toLowerCase();
  const pdName = /^(public domain|pd\b|pd-|cc0|cc-zero|pdm|public domain mark|no restrictions)/i.test(short) || /^(pd|cc0|cc-zero|pdm)/.test(code);
  const attributionLicence = /\bcc[- ]by\b|\bgfdl\b|\bsa\b|fair use|non-free/i.test(short) || /^cc-by/.test(code);
  if (attributionLicence) return { ok: false, licence: short || code };
  const cc0 = /cc0|cc-zero/i.test(short + ' ' + code);
  // CC0 files are often marked Copyrighted=True (the author waived the rights), so CC0 passes on its own.
  if (cc0) return { ok: true, licence: 'CC0' };
  if (pdName && copyrighted !== 'true') return { ok: true, licence: 'Public domain' };
  return { ok: false, licence: short || code };
}

/** Width and height from the first bytes of a JPEG, PNG, GIF or WebP. */
export function imageSize(b: Uint8Array): { width: number; height: number; mime: string } | null {
  if (b.length < 24) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20), mime: 'image/png' };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: b[6]! | (b[7]! << 8), height: b[8]! | (b[9]! << 8), mime: 'image/gif' };
  // WebP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (kind === 'VP8X' && b.length >= 30) return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)), mime: 'image/webp' };
    if (kind === 'VP8 ' && b.length >= 30) return { width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff, mime: 'image/webp' };
    if (kind === 'VP8L' && b.length >= 25) {
      const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1, mime: 'image/webp' };
    }
    return null;
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]!, mime: 'image/jpeg' };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

/** The caption readers see, from the institution's own metadata: "Title. Creator, date." */
export function defaultCaption(c: Pick<PlateCandidate, 'title' | 'creator' | 'date'>): string {
  const title = truncate(c.title.replace(/\s+/g, ' ').trim().replace(/[.;,:]+$/, ''), 160);
  const tail = [c.creator?.trim(), c.date?.trim()].filter(Boolean).join(', ');
  return tail ? `${title}. ${tail}.` : `${title}.`;
}

const cleanQuery = (q: string) => q.replace(/https?:\S+|www\.\S+/gi, ' ').replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers }, timeoutMs: 15_000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- providers

export async function searchCommons(q: string, limit = 4): Promise<PlateCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    // Structured data: copyright status "public domain" (P6216=Q19652) or licence CC0 (P275=Q6938433).
    gsrsearch: `${q} filetype:bitmap haswbstatement:P6216=Q19652|P275=Q6938433`,
    gsrlimit: '15',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(RENDITION_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|License|Copyrighted|Artist|DateTimeOriginal|ObjectName|LicenseUrl',
  });
  const j = await getJson<{ query?: { pages?: Record<string, { pageid: number; title: string; index?: number; imageinfo?: Array<Record<string, any>> }> } }>(
    `https://commons.wikimedia.org/w/api.php?${params}`,
  );
  const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: PlateCandidate[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !IMAGE_TYPES.has(ii.mime)) continue;
    const meta = (ii.extmetadata ?? {}) as Record<string, { value?: string }>;
    const lic = commonsIsPublicDomain(meta);
    if (!lic.ok) continue;
    const imageUrl: string = ii.thumburl ?? ii.url;
    if (!imageUrl?.startsWith('https://')) continue;
    out.push({
      provider: 'commons',
      providerId: String(p.pageid),
      title: stripHtml(meta.ObjectName?.value) || p.title.replace(/^File:/, '').replace(/\.[a-z]{3,4}$/i, ''),
      creator: truncate(stripHtml(meta.Artist?.value), 120) || undefined,
      date: truncate(stripHtml(meta.DateTimeOriginal?.value).replace(/\s*(date )?QS:.*$/, '').trim(), 40) || undefined,
      institution: 'Wikimedia Commons',
      licence: lic.licence,
      licenceUrl: lic.licence === 'CC0' ? CC0 : stripHtml(meta.LicenseUrl?.value) || undefined,
      sourceUrl: ii.descriptionurl,
      imageUrl,
      thumbUrl: typeof ii.thumburl === 'string' ? ii.thumburl.replace(/\/\d+px-/, '/400px-') : imageUrl,
      width: ii.thumbwidth ?? ii.width,
      height: ii.thumbheight ?? ii.height,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchAic(q: string, limit = 4): Promise<PlateCandidate[]> {
  const params = new URLSearchParams({ q, limit: '8', fields: 'id,title,artist_title,artist_display,date_display,image_id,thumbnail,is_public_domain' });
  params.set('query[term][is_public_domain]', 'true');
  const j = await getJson<{ data?: Array<Record<string, any>> }>(`https://api.artic.edu/api/v1/artworks/search?${params}`, { 'AIC-User-Agent': USER_AGENT });
  const out: PlateCandidate[] = [];
  for (const a of j.data ?? []) {
    if (!a.is_public_domain || !a.image_id) continue;
    const tw = Number(a.thumbnail?.width ?? 0);
    const th = Number(a.thumbnail?.height ?? 0);
    out.push({
      provider: 'aic',
      providerId: String(a.id),
      title: String(a.title ?? 'Untitled'),
      creator: a.artist_title ?? (a.artist_display ? String(a.artist_display).split('\n')[0] : undefined),
      date: a.date_display ?? undefined,
      institution: 'Art Institute of Chicago',
      licence: 'CC0',
      licenceUrl: CC0,
      sourceUrl: `https://www.artic.edu/artworks/${a.id}`,
      imageUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`,
      thumbUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`,
      ...(tw && th ? { width: 843, height: Math.round((843 * th) / tw) } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchMet(q: string, limit = 3): Promise<PlateCandidate[]> {
  const s = await getJson<{ objectIDs?: number[] | null }>(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&limit=8&q=${encodeURIComponent(q)}`);
  const ids = (s.objectIDs ?? []).slice(0, 8);
  const objs = await Promise.allSettled(ids.map((id) => getJson<Record<string, any>>(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)));
  const out: PlateCandidate[] = [];
  for (const r of objs) {
    if (r.status !== 'fulfilled') continue;
    const o = r.value;
    if (!o.isPublicDomain || !o.primaryImageSmall || !String(o.objectURL ?? '').startsWith('https://')) continue;
    out.push({
      provider: 'met',
      providerId: String(o.objectID),
      title: String(o.title || o.objectName || 'Untitled'),
      creator: o.artistDisplayName || undefined,
      date: o.objectDate || undefined,
      institution: 'The Metropolitan Museum of Art',
      licence: 'CC0',
      licenceUrl: CC0,
      sourceUrl: o.objectURL,
      imageUrl: o.primaryImageSmall,
      thumbUrl: o.primaryImageSmall,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchSmithsonian(q: string, key: string, limit = 3): Promise<PlateCandidate[]> {
  const params = new URLSearchParams({ q: `${q} AND online_media_type:"Images"`, rows: '10', api_key: key });
  const j = await getJson<{ response?: { rows?: Array<Record<string, any>> } }>(`https://api.si.edu/openaccess/api/v1.0/search?${params}`);
  const out: PlateCandidate[] = [];
  for (const row of j.response?.rows ?? []) {
    const d = row.content?.descriptiveNonRepeating ?? {};
    const media = (d.online_media?.media ?? []).find((m: Record<string, any>) => m?.usage?.access === 'CC0' && m.type === 'Images' && typeof m.content === 'string');
    if (!media || !String(d.record_link ?? '').startsWith('https://')) continue;
    const imageUrl = String(media.content).startsWith('https://ids.si.edu/') ? `${media.content}&max=${RENDITION_WIDTH}` : String(media.content);
    if (!imageUrl.startsWith('https://')) continue;
    out.push({
      provider: 'smithsonian',
      providerId: String(row.id ?? d.record_ID),
      title: String(d.title?.content ?? row.title ?? 'Untitled'),
      creator: row.content?.freetext?.name?.[0]?.content,
      date: row.content?.freetext?.date?.[0]?.content,
      institution: String(d.data_source ?? 'Smithsonian Institution'),
      licence: 'CC0',
      licenceUrl: CC0,
      sourceUrl: d.record_link,
      imageUrl,
      thumbUrl: typeof media.thumbnail === 'string' ? media.thumbnail : imageUrl,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function searchRijksmuseum(q: string, key: string, limit = 3): Promise<PlateCandidate[]> {
  const params = new URLSearchParams({ key, q, imgonly: 'true', ps: '8' });
  const j = await getJson<{ artObjects?: Array<Record<string, any>> }>(`https://www.rijksmuseum.nl/api/en/collection?${params}`);
  const out: PlateCandidate[] = [];
  for (const a of j.artObjects ?? []) {
    const url = a.webImage?.url as string | undefined;
    if (!a.permitDownload || !url?.startsWith('https://') || !String(a.links?.web ?? '').startsWith('https://')) continue;
    const w = Number(a.webImage.width);
    const h = Number(a.webImage.height);
    out.push({
      provider: 'rijksmuseum',
      providerId: String(a.objectNumber),
      title: String(a.title ?? 'Untitled'),
      creator: a.principalOrFirstMaker || undefined,
      institution: 'Rijksmuseum',
      licence: 'Public domain',
      sourceUrl: a.links.web,
      imageUrl: url.replace(/=s0$/, `=w${RENDITION_WIDTH}`),
      thumbUrl: url.replace(/=s0$/, '=w400'),
      ...(w && h ? { width: RENDITION_WIDTH, height: Math.round((RENDITION_WIDTH * h) / w) } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Which providers this deployment can ask. Key-gated ones are skipped without their key. */
export function plateProviders(env: Pick<Env, 'SMITHSONIAN_API_KEY' | 'RIJKSMUSEUM_API_KEY'>): Array<{ name: PlateProvider; search: (q: string) => Promise<PlateCandidate[]> }> {
  const list: Array<{ name: PlateProvider; search: (q: string) => Promise<PlateCandidate[]> }> = [
    { name: 'commons', search: (q) => searchCommons(q) },
    { name: 'aic', search: (q) => searchAic(q) },
    { name: 'met', search: (q) => searchMet(q) },
  ];
  if (env.SMITHSONIAN_API_KEY) list.push({ name: 'smithsonian', search: (q) => searchSmithsonian(q, env.SMITHSONIAN_API_KEY!) });
  if (env.RIJKSMUSEUM_API_KEY) list.push({ name: 'rijksmuseum', search: (q) => searchRijksmuseum(q, env.RIJKSMUSEUM_API_KEY!) });
  return list;
}

/** Round-robin across providers so one collection does not crowd out the rest. */
export function interleave<T>(lists: T[][], max: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && out.length < max) out.push(l[i]!);
  return out;
}

export interface ProbeResult {
  ok: boolean;
  status: number;
  mime?: string;
  width?: number;
  height?: number;
}

/** Fetch-check an image: a 2xx, an image content type, and image bytes we can measure. */
export async function probeImage(url: string): Promise<ProbeResult> {
  try {
    const res = await guardedFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*', range: 'bytes=0-131071' }, timeoutMs: 15_000 });
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, status: res.status };
    }
    const reader = res.body?.getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    while (reader && n < 131072) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.byteLength;
    }
    await reader?.cancel().catch(() => {});
    const head = new Uint8Array(n);
    let off = 0;
    for (const p of parts) {
      head.set(p, off);
      off += p.byteLength;
    }
    const size = imageSize(head);
    const okType = IMAGE_TYPES.has(mime) || Boolean(size);
    return { ok: okType && Boolean(size), status: res.status, mime: size?.mime ?? mime, width: size?.width, height: size?.height };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Search every available provider for one query; failures of one provider never sink the rest. */
export async function searchPlates(env: Env, query: string, max = 9): Promise<PlateCandidate[]> {
  const q = cleanQuery(query);
  if (q.length < 2) return [];
  const results = await Promise.allSettled(plateProviders(env).map((p) => p.search(q)));
  const lists = results.map((r, i) => {
    if (r.status === 'rejected') console.warn(JSON.stringify({ event: 'plate-provider-failed', provider: plateProviders(env)[i]?.name, error: String(r.reason).slice(0, 200) }));
    return r.status === 'fulfilled' ? r.value : [];
  });
  return interleave(lists, max);
}

// ---------------------------------------------------------------- storing candidates

export type PlateTarget = { itemId: string } | { haulId: string };

async function existingKeys(env: Env, t: PlateTarget): Promise<{ keys: Set<string>; count: number }> {
  const rows = (
    'itemId' in t
      ? await env.DB.prepare('SELECT provider, provider_id FROM plates WHERE item_id = ?').bind(t.itemId).all<{ provider: string; provider_id: string }>()
      : await env.DB.prepare('SELECT provider, provider_id FROM plates WHERE haul_id = ?').bind(t.haulId).all<{ provider: string; provider_id: string }>()
  ).results;
  return { keys: new Set(rows.map((r) => `${r.provider}:${r.provider_id}`)), count: rows.length };
}

/** Fetch-check candidates and store the ones whose image is really there. Returns how many were added. */
export async function storeCandidates(env: Env, t: PlateTarget, query: string, by: 'machine' | 'editor', candidates: PlateCandidate[]): Promise<number> {
  const { keys, count } = await existingKeys(env, t);
  const fresh = candidates.filter((c) => !keys.has(`${c.provider}:${c.providerId}`));
  const probes = await Promise.all(fresh.map((c) => probeImage(c.imageUrl)));
  let position = count;
  let added = 0;
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  fresh.forEach((c, i) => {
    const p = probes[i]!;
    if (!p.ok) return;
    // Our measurement of the rendition beats the API's numbers.
    const width = p.width ?? c.width ?? null;
    const height = p.height ?? c.height ?? null;
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO plates (id, item_id, haul_id, provider, provider_id, query, query_by, title, creator, date, institution, licence, licence_url, source_url, image_url, thumb_url, width, height, caption, status, check_status, checked_at, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?)`,
      ).bind(
        newId('pl_'),
        'itemId' in t ? t.itemId : null,
        'haulId' in t ? t.haulId : null,
        c.provider,
        c.providerId,
        query,
        by,
        truncate(c.title, 300),
        c.creator ? truncate(c.creator, 200) : null,
        c.date ? truncate(c.date, 60) : null,
        c.institution,
        c.licence,
        c.licenceUrl ?? null,
        c.sourceUrl,
        c.imageUrl,
        c.thumbUrl ?? null,
        width,
        height,
        defaultCaption(c),
        p.status,
        now,
        position++,
        now,
      ),
    );
    added++;
  });
  if (stmts.length) await env.DB.batch(stmts);
  return added;
}

// ---------------------------------------------------------------- the pipeline step

/** Ask the model for collection queries about an item and store fetch-checked candidates. */
export async function findPlates(env: Env, itemId: string, opts: { maxCandidates?: number; force?: boolean } = {}): Promise<{ queries: string[]; added: number }> {
  const item = await getItem(env, itemId);
  if (!item) throw new FatalError('No such item');
  if (item.plate) return { queries: [], added: 0 }; // the editor has decided already
  const had = await env.DB.prepare('SELECT COUNT(*) AS n FROM plates WHERE item_id = ?').bind(itemId).first<{ n: number }>();
  if (had?.n && !opts.force) return { queries: [], added: 0 }; // candidates exist; the editor can search for more
  const max = opts.maxCandidates ?? 9;
  const cardRow = await env.DB.prepare(`SELECT body FROM drafts WHERE item_id = ? AND kind = 'card'`).bind(itemId).first<{ body: string }>();
  const card = parseJson<Partial<ReadingCard>>(cardRow?.body, {});
  const prompt = [
    plateHeader(item),
    card.summary ? `Summary: ${card.summary}` : '',
    card.entities?.length ? `People, places, works and ideas in it: ${card.entities.map((e) => e.name).join('; ')}` : '',
    card.events?.length ? `Dated events: ${card.events.map((e) => `${e.date} ${e.what}`).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const { data } = await generateJson(env, { task: 'plate', system: PLATE_SYSTEM, prompt, schema: plateSchema, itemId });
  const queries = [...new Set(data.queries.map((x) => cleanQuery(x.q)).filter((q) => q.length >= 2))].slice(0, 4);
  // Each query gets a share of the slots, so the first query does not take them all.
  const seen = new Set<string>();
  const quota = Math.max(2, Math.ceil(max / Math.max(1, queries.length)));
  let added = 0;
  for (const q of queries) {
    if (added >= max) break;
    const list = (await searchPlates(env, q, quota * 2))
      .filter((c) => {
        const k = `${c.provider}:${c.providerId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, Math.min(quota, max - added));
    added += await storeCandidates(env, { itemId }, q, 'machine', list);
  }
  return { queries, added };
}

function plateHeader(item: ItemRow): string {
  return [item.title && `Title: ${item.title}`, item.creator && `By: ${item.creator}`, item.source_name && `Source: ${item.source_name}`, item.source_date && `Date: ${item.source_date}`, `Type: ${item.type}`]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------- choosing

/** Resize with the Images binding if bound and the image is wider than we need; else keep the bytes. */
async function maybeResize(env: Env, bytes: Uint8Array, width: number): Promise<{ bytes: Uint8Array; mime?: string }> {
  if (!env.IMAGES || width <= 1600) return { bytes };
  try {
    const stream = new Response(bytes).body!;
    const out = await env.IMAGES.input(stream).transform({ width: 1600 }).output({ format: 'image/jpeg', quality: 85 });
    return { bytes: new Uint8Array(await out.response().arrayBuffer()), mime: 'image/jpeg' };
  } catch (e) {
    console.warn(JSON.stringify({ event: 'image-resize-failed', error: String(e).slice(0, 200) }));
    return { bytes };
  }
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * The editor picks a plate: fetch the rendition (guarded), check it is an image, measure it, copy it
 * into private storage, check the institution's page still resolves, and record the choice.
 */
export async function choosePlate(env: Env, plateId: string): Promise<PlateRow> {
  const p = await env.DB.prepare('SELECT * FROM plates WHERE id = ?').bind(plateId).first<PlateRow>();
  if (!p) throw Object.assign(new Error('No such plate'), { status: 404 });
  const res = await guardedFetch(p.image_url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, timeoutMs: 30_000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw Object.assign(new Error(`The image no longer loads (${res.status}); pick another`), { status: 409 });
  }
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) {
    await res.body?.cancel();
    throw Object.assign(new Error('The image is too large'), { status: 409 });
  }
  let bytes: Uint8Array = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw Object.assign(new Error('The image is too large'), { status: 409 });
  let size = imageSize(bytes);
  if (!size) throw Object.assign(new Error('That link did not return an image we can read'), { status: 409 });
  const resized = await maybeResize(env, bytes, size.width);
  if (resized.bytes !== bytes) {
    const s2 = imageSize(resized.bytes);
    if (s2) {
      bytes = resized.bytes;
      size = s2;
    }
  }
  const page = await checkLink(p.source_url);
  if (!page.ok && ![401, 403, 429].includes(page.status)) throw Object.assign(new Error(`The institution's page for this work returned ${page.status || 'nothing'}`), { status: 409 });
  const key = `plates/${p.id}.${EXT[size.mime] ?? 'jpg'}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: size.mime }, customMetadata: { source: finalUrlOf(res, p.image_url).slice(0, 500) } });
  const now = nowIso();
  const target = p.item_id ? { col: 'item_id', id: p.item_id } : { col: 'haul_id', id: p.haul_id! };
  await env.DB.batch([
    env.DB.prepare(`UPDATE plates SET status = 'candidate' WHERE ${target.col} = ? AND status = 'chosen'`).bind(target.id),
    env.DB.prepare(`UPDATE plates SET status = 'chosen', r2_key = ?, mime = ?, bytes = ?, width = ?, height = ?, check_status = ?, checked_at = ? WHERE id = ?`).bind(
      key,
      size.mime,
      bytes.byteLength,
      size.width,
      size.height,
      res.status,
      now,
      p.id,
    ),
    p.item_id
      ? env.DB.prepare('UPDATE items SET plate = ?, updated_at = ? WHERE id = ?').bind(p.id, now, p.item_id)
      : env.DB.prepare('UPDATE hauls SET cover_plate = ?, updated_at = ? WHERE id = ?').bind(p.id, now, p.haul_id),
  ]);
  return (await env.DB.prepare('SELECT * FROM plates WHERE id = ?').bind(p.id).first<PlateRow>())!;
}

/** "No plate" for an item or a Haul cover; NULL means undecided again. */
export async function setNoPlate(env: Env, t: PlateTarget, none: boolean): Promise<void> {
  const now = nowIso();
  const v = none ? 'none' : null;
  if ('itemId' in t) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE plates SET status = 'candidate' WHERE item_id = ? AND status = 'chosen'`).bind(t.itemId),
      env.DB.prepare('UPDATE items SET plate = ?, updated_at = ? WHERE id = ?').bind(v, now, t.itemId),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(`UPDATE plates SET status = 'candidate' WHERE haul_id = ? AND status = 'chosen'`).bind(t.haulId),
      env.DB.prepare('UPDATE hauls SET cover_plate = ?, updated_at = ? WHERE id = ?').bind(v, now, t.haulId),
    ]);
  }
}

/** The bundle's plate for a chosen row (url filled in by the publisher). */
export function plateForBundle(p: PlateRow, url: string): Plate {
  return {
    url,
    width: p.width ?? 0,
    height: p.height ?? 0,
    caption: (p.caption ?? defaultCaption({ title: p.title, creator: p.creator ?? undefined, date: p.date ?? undefined })).trim(),
    credit: p.institution,
    licence: p.licence,
    sourceUrl: p.source_url,
    ...(p.creator ? { creator: p.creator } : {}),
    ...(p.date ? { date: p.date } : {}),
  };
}

/** Copy a Haul's items' candidate plates as cover candidates (code only, no model). */
export async function coverCandidatesFromItems(env: Env, haulId: string): Promise<number> {
  const rows = (
    await env.DB.prepare(
      `SELECT p.* FROM plates p JOIN haul_items hi ON hi.item_id = p.item_id WHERE hi.haul_id = ? AND p.status != 'rejected' ORDER BY p.status = 'chosen' DESC, hi.position, p.position LIMIT 24`,
    )
      .bind(haulId)
      .all<PlateRow>()
  ).results;
  const { keys, count } = await existingKeys(env, { haulId });
  let position = count;
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows) {
    if (keys.has(`${r.provider}:${r.provider_id}`)) continue;
    keys.add(`${r.provider}:${r.provider_id}`);
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO plates (id, item_id, haul_id, provider, provider_id, query, query_by, title, creator, date, institution, licence, licence_url, source_url, image_url, thumb_url, width, height, caption, status, check_status, checked_at, position, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?, ?)`,
      ).bind(newId('pl_'), haulId, r.provider, r.provider_id, r.query, r.query_by, r.title, r.creator, r.date, r.institution, r.licence, r.licence_url, r.source_url, r.image_url, r.thumb_url, r.width, r.height, r.caption, r.check_status, r.checked_at, position++, nowIso()),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length;
}
