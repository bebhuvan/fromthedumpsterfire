// Where items stand (which published version of a Haul carries them) and what the Desk's
// pre-publish screen and suggestions page need for a whole Haul. The judgements themselves are the
// pure functions in @fdf/shared/prepublish; this file only gathers what they look at.

import { itemIssues, itemStanding, type Issue, type Standing } from '@fdf/shared/prepublish';
import type { Haul } from '@fdf/shared/haul';
import type { ContentType } from '@fdf/shared/tokens';
import type { DraftRow, ItemRow, WikiRow } from './db';
import type { Env } from './env';
import { bundleItemIds } from './publish';
import { parseJson } from './util';

/**
 * The Desk items a published bundle carries. Versions published since 0011 record their item ids;
 * for older ones the bundle is read and its items matched by bundle id (the title's slug) or by the
 * link to the original, which survive unless the item was retitled and relinked after publishing.
 */
export function matchBundleItems(rows: Array<Pick<ItemRow, 'id' | 'title' | 'title_choice' | 'url' | 'canonical_url'>>, bundle: Pick<Haul, 'items'>): string[] {
  const idFor = bundleItemIds(rows);
  const ids = new Set(bundle.items.map((i) => i.id));
  const urls = new Set(bundle.items.map((i) => i.source?.url).filter(Boolean));
  return rows.filter((r) => ids.has(idFor.get(r.id)!) || urls.has(r.canonical_url || r.url || '\0')).map((r) => r.id);
}

interface VersionRow {
  version: number;
  path: string;
  item_ids: string | null;
}

/** The latest published version of a Haul and the Desk items in it; null if it was never published. */
export async function publishedItems(env: Env, haulId: string): Promise<{ version: number; ids: Set<string> } | null> {
  const v = await env.DB.prepare('SELECT version, path, item_ids FROM haul_versions WHERE haul_id = ? ORDER BY version DESC LIMIT 1').bind(haulId).first<VersionRow>();
  if (!v) return null;
  const stored = parseJson<string[] | null>(v.item_ids, null);
  if (stored) return { version: v.version, ids: new Set(stored) };
  const obj = await env.FILES.get(v.path);
  const bundle = obj ? ((await obj.json().catch(() => null)) as Haul | null) : null;
  if (!bundle?.items) return { version: v.version, ids: new Set() };
  const rows = (
    await env.DB.prepare('SELECT i.id, i.title, i.title_choice, i.url, i.canonical_url FROM haul_items hi JOIN items i ON i.id = hi.item_id WHERE hi.haul_id = ?').bind(haulId).all<ItemRow>()
  ).results;
  const ids = matchBundleItems(rows, bundle);
  // Remember the answer so the tray never reads the bundle again for this version.
  await env.DB.prepare('UPDATE haul_versions SET item_ids = ? WHERE haul_id = ? AND version = ?').bind(JSON.stringify(ids), haulId, v.version).run();
  return { version: v.version, ids: new Set(ids) };
}

export interface HaulRef {
  id: string;
  number: number;
  status: 'draft' | 'published';
  version: number;
}

/** One item's standing, and the Haul a one-tap "add" should use (the newest draft), if any. */
export async function standingFor(env: Env, item: Pick<ItemRow, 'id' | 'archived'>): Promise<{ standing: Standing; haul: HaulRef | null; draft: { id: string; number: number } | null }> {
  const [haul, draft] = await Promise.all([
    env.DB.prepare('SELECT h.id, h.number, h.status, h.version FROM haul_items hi JOIN hauls h ON h.id = hi.haul_id WHERE hi.item_id = ?').bind(item.id).first<HaulRef>(),
    env.DB.prepare(`SELECT id, number FROM hauls WHERE status = 'draft' ORDER BY number DESC LIMIT 1`).first<{ id: string; number: number }>(),
  ]);
  const pub = haul?.status === 'published' ? await publishedItems(env, haul.id) : null;
  const publishedIn = pub?.ids.has(item.id) ? pub.version : null;
  return { standing: itemStanding({ archived: Boolean(item.archived), haul: haul ?? null, publishedIn }), haul: haul ?? null, draft: draft ?? null };
}

/** Standing for many items at once (the tray): one look per published Haul. */
export async function standings(env: Env, rows: Array<{ id: string; archived: number; haul_id: string | null; haul_number: number | null; haul_status: string | null; haul_version: number | null }>): Promise<Map<string, Standing>> {
  const pubs = new Map<string, Awaited<ReturnType<typeof publishedItems>>>();
  for (const id of new Set(rows.filter((r) => r.haul_status === 'published').map((r) => r.haul_id!))) pubs.set(id, await publishedItems(env, id));
  const out = new Map<string, Standing>();
  for (const r of rows) {
    const pub = r.haul_id ? pubs.get(r.haul_id) : null;
    const haul = r.haul_id ? { number: r.haul_number!, status: r.haul_status === 'published' ? ('published' as const) : ('draft' as const), version: r.haul_version ?? 0 } : null;
    out.set(r.id, itemStanding({ archived: Boolean(r.archived), haul, publishedIn: pub?.ids.has(r.id) ? pub.version : null }));
  }
  return out;
}

// ---------------------------------------------------------------- a whole Haul: review and suggestions

interface HaulItem {
  id: string;
  type: ContentType;
  title: string | null;
  title_choice: string | null;
  url: string | null;
}

async function haulItems(env: Env, haulId: string): Promise<ItemRow[]> {
  return (await env.DB.prepare('SELECT i.* FROM haul_items hi JOIN items i ON i.id = hi.item_id WHERE hi.haul_id = ? ORDER BY hi.position').bind(haulId).all<ItemRow>()).results;
}

const isIn = (s: string) => s === 'kept' || s === 'edited';
const pendingDraft = (d: Pick<DraftRow, 'kind' | 'status'>, kind: string) => d.kind === kind && d.status === 'proposed';

/** Every item of the Haul with what is wrong or doubtful about it, in Haul order. */
export async function haulReview(env: Env, haulId: string): Promise<Array<HaulItem & { issues: Issue[] }>> {
  const items = await haulItems(env, haulId);
  return Promise.all(
    items.map(async (it) => {
      const [source, drafts, wiki] = await Promise.all([
        env.DB.prepare('SELECT text, word_count FROM sources WHERE item_id = ?').bind(it.id).first<{ text: string; word_count: number }>(),
        env.DB.prepare(`SELECT kind, status FROM drafts WHERE item_id = ? AND kind IN ('marginal', 'idea')`).bind(it.id).all<Pick<DraftRow, 'kind' | 'status'>>(),
        env.DB.prepare('SELECT id, title, extract, status FROM wiki_cards WHERE item_id = ?').bind(it.id).all<Pick<WikiRow, 'id' | 'title' | 'extract' | 'status'>>(),
      ]);
      const issues = itemIssues({
        title: displayTitle(it),
        type: it.type as ContentType,
        creator: it.creator,
        sourceName: it.source_name,
        sourceDate: it.source_date,
        year: it.year ?? null,
        url: it.canonical_url || it.url,
        minutes: it.minutes,
        why: it.why_text ?? '',
        source: source ? { text: source.text, wordCount: source.word_count } : null,
        keptCards: wiki.results.filter((w) => isIn(w.status)),
        pending: {
          notes: drafts.results.filter((d) => pendingDraft(d, 'marginal')).length,
          ideas: drafts.results.filter((d) => pendingDraft(d, 'idea')).length,
          cards: wiki.results.filter((w) => w.status === 'proposed').length,
        },
      });
      return { id: it.id, type: it.type as ContentType, title: it.title, title_choice: it.title_choice, url: it.url, issues };
    }),
  );
}

/** Every margin note, big idea and Wikipedia card across the Haul that the editor can tick. */
export async function haulSuggestions(env: Env, haulId: string) {
  const items = await haulItems(env, haulId);
  return Promise.all(
    items.map(async (it) => {
      const [drafts, wiki] = await Promise.all([
        env.DB.prepare(`SELECT * FROM drafts WHERE item_id = ? AND kind IN ('marginal', 'idea') AND status NOT IN ('rejected', 'cut') ORDER BY kind, position`).bind(it.id).all<DraftRow>(),
        env.DB.prepare(`SELECT * FROM wiki_cards WHERE item_id = ? AND status != 'cut' ORDER BY position`).bind(it.id).all<WikiRow>(),
      ]);
      return {
        id: it.id,
        type: it.type as ContentType,
        title: it.title,
        title_choice: it.title_choice,
        url: it.url,
        drafts: drafts.results.map((d) => ({ ...d, body: parseJson(d.body, {}) })),
        wiki: wiki.results,
      };
    }),
  );
}

function displayTitle(it: Pick<ItemRow, 'title' | 'title_choice'>): string {
  const c = parseJson<{ text?: string; italic?: string } | null>(it.title_choice, null);
  return c?.text ? [c.text, c.italic].filter(Boolean).join(' ') : (it.title ?? '');
}
