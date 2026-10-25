// The Desk's API client and the shapes it returns.

import type { Haul, RouteStep, Title } from '@fdf/shared/haul';
import type { ContentType, Edition, Swatch } from '@fdf/shared/tokens';
import type { BundleIssue } from '@fdf/shared/validate';
import type { StyleResult } from '@fdf/shared/style';
import type { BookStatus, Spine } from '@fdf/shared/shelf';
import type { Chart, ChartData, ChartMeasure, ChartSource } from '@fdf/shared/charts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  // x-desk marks a request as the Desk's own; the Worker refuses API writes without it (CSRF).
  const init: RequestInit = { method, credentials: 'same-origin', headers: { 'x-desk': '1' } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  const res = await fetch(path, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => call<T>('GET', p),
  post: <T>(p: string, b?: unknown) => call<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b: unknown) => call<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown) => call<T>('PUT', p, b),
  del: <T>(p: string) => call<T>('DELETE', p),
};

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface TrayItem {
  id: string;
  kind: string;
  type: ContentType;
  status: string;
  status_detail: string | null;
  url: string | null;
  title: string | null;
  title_choice: string | null;
  creator: string | null;
  source_name: string | null;
  source_date: string | null;
  minutes: number | null;
  has_why: number;
  captured_at: string;
  updated_at: string;
  archived: number;
  capture_text: string | null;
  haul_number: number | null;
  /** 1 when an excerpt is chosen. */
  has_excerpt: number;
  /** Big ideas the editor ticked. */
  kept_ideas: number;
  checks: string | null;
}

export interface Item {
  id: string;
  kind: string;
  type: ContentType;
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
  start_at?: string | null;
  start_note?: string | null;
  /** The year the work was made; a post's handle; a letter's recipient; where written or given. */
  year?: number | null;
  handle?: string | null;
  recipient?: string | null;
  place?: string | null;
  /** A Book item's shelf book (books.id). */
  shelf_id?: string | null;
  archived: number;
  captured_at: string;
  updated_at: string;
}

/** A block as stored (Desk side): the bundle Block without public URLs, plus where a quote sits. */
export type BlockBody =
  | { kind: 'quote'; text: string; locator?: string; start: number; end: number }
  | { kind: 'code'; code: string; lang?: string; caption?: string; start: number; end: number }
  | { kind: 'video'; provider: 'youtube' | 'vimeo'; id: string; title: string; start?: number; poster?: { width: number; height: number }; link: string }
  | { kind: 'audio'; provider: 'file' | 'spotify' | 'apple'; url: string; title: string; start?: number }
  | { kind: 'image'; caption: string; credit: string; licence: string; sourceUrl?: string; creator?: string; date?: string; width: number; height: number }
  | { kind: 'chart'; chart: Chart };

/** What POST /api/charts/fetch returns: a provider's rows and what is known about them. */
export interface FetchedChartData {
  data: ChartData;
  sources: ChartSource[];
  units: string;
  measure?: Partial<ChartMeasure>;
  sourceSpan?: { from: string; to: string };
  entities: string[];
  notice?: string;
  reference: { title?: string; subtitle?: string; note?: string; citation?: string };
}

export interface BlockUi {
  id: string;
  item_id: string;
  kind: BlockBody['kind'];
  body: BlockBody | null;
  status: 'kept' | 'cut';
  position: number;
  /** The poster or picture, served by the Desk from private storage. */
  image: string | null;
}

export interface SourceMeta {
  pages?: number[];
  headings?: Array<{ offset: number; text: string }>;
  times?: Array<{ offset: number; ms: number }>;
  note?: string;
  captionsAuto?: boolean;
  description?: string;
  /** Where the text came from when not the page itself (platform API or feed, archived copy). */
  via?: { route: string; label: string; url?: string; at?: string };
}

export interface Source {
  item_id: string;
  text: string;
  extractor: string;
  word_count: number;
  meta: SourceMeta;
  fetched_at: string;
  edited: number;
  snapshot_key: string | null;
}

export interface Excerpt {
  id: string;
  item_id: string;
  start: number;
  end: number;
  text: string;
  highlight_start: number | null;
  highlight_end: number | null;
  locator: string | null;
  origin: 'editor' | 'machine';
  chosen: number;
  verified: number;
  /** The machine's one line on why it proposed this passage. */
  why?: string | null;
}

export interface MarginalBody {
  text: string;
  cite: { kind: 'source'; quote: string; start: number; end: number } | { kind: 'wiki'; title: string; cardId: string };
  verdict?: 'supported' | 'partly' | 'unsupported' | 'unchecked';
  reason?: string;
  /** Ideas: where the quoted passage sits. */
  locator?: string;
  /** Ideas: the editor's own line on it. */
  reaction?: string;
  edited?: boolean;
}

export interface TitleBody extends Title {
  /** The angle a machine option was drafted from (turn, fact, question, lift, plain). */
  angle?: string;
}

export interface Draft<B = unknown> {
  id: string;
  item_id: string;
  kind: 'title' | 'marginal' | 'idea' | 'card';
  body: B;
  /** 'rejected': set aside by the checker; never shown. */
  status: 'proposed' | 'kept' | 'cut' | 'edited' | 'rejected';
  model: string | null;
  position: number;
}

export interface WikiCard {
  id: string;
  query: string;
  title: string;
  summary: string;
  extract: string;
  url: string;
  status: 'proposed' | 'kept' | 'cut';
  http_status: number | null;
}

export interface CheckRowUi {
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface Check {
  name: string;
  status: CheckStatus;
  detail: { summary?: string; rows?: CheckRowUi[] };
  at: string;
}

export interface Note {
  id: string;
  item_id: string | null;
  haul_id: string | null;
  target: string;
  mime: string;
  seconds: number | null;
  transcript_raw: string | null;
  transcript_clean: string | null;
  deleted_words: string | null;
  clean_method: string | null;
  format?: string | null;
  created_at: string;
}

export interface ItemDetail {
  item: Item;
  source: Source | null;
  excerpts: Excerpt[];
  drafts: Draft[];
  wiki: WikiCard[];
  checks: Check[];
  notes: Note[];
  run: { status: string; step: string | null; error: string | null; started_at: string } | null;
  haul: { id: string; number: number; status: string } | null;
  connections: Array<{ id: string; to_item_id: string; to_title: string | null; type: string; note: string; suggestion_id?: string | null }>;
  plates: PlateCandidate[];
  suggestions: Suggestion[];
  blocks: BlockUi[];
}

export interface PlateCandidate {
  id: string;
  item_id: string | null;
  haul_id: string | null;
  provider: 'commons' | 'aic' | 'met' | 'smithsonian' | 'rijksmuseum' | 'editor';
  query: string;
  query_by: 'machine' | 'editor';
  title: string;
  creator: string | null;
  date: string | null;
  institution: string;
  licence: string;
  licence_url: string | null;
  source_url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  status: 'candidate' | 'chosen' | 'rejected';
}

export interface Suggestion {
  id: string;
  from_item_id: string;
  to_item_id: string;
  from_title: string | null;
  from_choice: string | null;
  to_title: string | null;
  to_choice: string | null;
  from_type?: ContentType;
  to_type?: ContentType;
  from_date?: string | null;
  to_date?: string | null;
  type: string;
  note: string;
  editor_note: string | null;
  from_quote: string;
  to_quote: string;
  confidence: number;
  routes: { vector?: number; entities?: string[]; mechanisms?: string[] } | string;
  status: 'proposed' | 'approved' | 'rejected';
  model: string | null;
}

export interface ThreadPointUi {
  itemId: string;
  year: string;
  gist: string;
  edge: string;
  item: { id: string; title: string | null; title_choice: string | null; type: ContentType; creator: string | null } | null;
}

export interface ThreadUi {
  id: string;
  slug: string;
  title_text: string;
  title_italic: string | null;
  summary: string;
  points: ThreadPointUi[];
  status: 'proposed' | 'approved' | 'rejected';
  edited: number;
  model: string | null;
}

export interface RhymeRecord {
  item_id: string;
  then_item_id: string | null;
  then_year: string;
  then_quote: string | null;
  then_start: number | null;
  then_end: number | null;
  then_cite: string;
  now_item_id: string | null;
  now_year: string;
  now_quote: string | null;
  now_start: number | null;
  now_end: number | null;
  now_cite: string;
  bridge: string;
}

export interface RhymeEnd {
  item: { id: string; title: string | null; title_choice: string | null; creator: string | null; source_name: string | null; source_date: string | null; url: string | null; status: string; status_detail: string | null; type: ContentType };
  source: Source | null;
}

export interface RhymeDetail {
  item: Item;
  rhyme: RhymeRecord;
  then: RhymeEnd | null;
  now: RhymeEnd | null;
  checks: Check[];
}

export interface Captured {
  id?: string;
  kind?: string;
  type?: ContentType;
  url?: string | null;
  duplicateOf?: string;
  error?: string;
}

export interface HaulListRow {
  id: string;
  number: number;
  title_text: string;
  title_italic: string | null;
  deck: string;
  swatch: Swatch;
  edition: Edition | null;
  status: string;
  version: number;
  published_at: string | null;
  item_count: number;
}

export interface HaulRecord {
  id: string;
  number: number;
  title_text: string;
  title_italic: string | null;
  deck: string;
  swatch: Swatch;
  /** The edition ink; null means the default for the Haul's number (editionOf). */
  edition: Edition | null;
  fn_title_text: string;
  fn_title_italic: string | null;
  fn_body: string;
  fn_highlight: string | null;
  fn_note_id: string | null;
  cover_plate: string | null;
  route: Array<RouteStep & { drafted?: boolean }>;
  questions: Array<{ q: string; answer: string }>;
  colophon: string;
  status: 'draft' | 'published';
  version: number;
  published_at: string | null;
}

export interface HaulDetail {
  haul: HaulRecord;
  items: Array<{ id: string; type: ContentType; status: string; title: string | null; title_choice: string | null; creator: string | null; source_name: string | null; source_date: string | null; captured_at: string; why_text: string | null; checks: string | null }>;
  versions: Array<{ version: number; path: string; correction: string | null; published_at: string; notified: number }>;
  plates: PlateCandidate[];
  fieldNoteAudio: { id: string; format: string | null; mime: string } | null;
}

export interface PreviewResult {
  haul: Haul;
  problems: Array<{ itemId?: string; itemTitle?: string; message: string }>;
  bundleErrors: BundleIssue[];
  warnings: BundleIssue[];
}

export interface PublishResult extends Omit<PreviewResult, 'haul'> {
  ok: boolean;
  version?: number;
  path?: string;
  url?: string;
}

export interface Spend {
  spentUsd: number;
  warnUsd: number;
  ceilingUsd: number;
  state: 'ok' | 'warn' | 'ceiling';
}

// ---------------------------------------------------------------- the shelf

export interface BookUi {
  id: string;
  title: Title;
  title_text: string;
  title_italic: string | null;
  author: string;
  year: number | null;
  publisher: string | null;
  url: string | null;
  status: BookStatus;
  started: string | null;
  finished: string | null;
  spine: Spine | null;
  /** The cover, served by the Desk from private storage. */
  cover: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_caption: string | null;
  cover_credit: string | null;
  cover_licence: string | null;
  cover_creator: string | null;
  cover_source_url: string | null;
  cover_date: string | null;
  updated_at: string;
}

export interface BookListRow extends BookUi {
  note_count: number;
  line_count: number;
  last_note: string | null;
  item_count: number;
}

export interface BookNoteUi {
  id: string;
  book_id: string;
  date: string;
  at: string | null;
  text: string;
  note_id: string | null;
  format: string | null;
  seconds: number | null;
  publish_audio: number;
  /** The recording, through the Desk. */
  audio: string | null;
}

export interface BookLineUi {
  id: string;
  text: string;
  locator: string | null;
  position: number;
  /** Past about 60 words a line is flagged, never refused. */
  warning: string | null;
}

export interface BookDetail {
  book: BookUi;
  notes: BookNoteUi[];
  lines: BookLineUi[];
  items: Array<{ id: string; type: ContentType; title: string | null; title_choice: string | null; haul_id: string | null; haul_number: number | null; haul_status: string | null }>;
}

export interface ShelfCheck {
  problems: string[];
  warnings: string[];
  changes: string[];
  last?: { version: number; published_at: string; books: number } | null;
  ok?: boolean;
  version?: number;
  url?: string;
}

export type { Title, StyleResult };

export function displayTitle(t: { title: string | null; title_choice: string | null; url?: string | null; capture_text?: string | null }): string {
  try {
    const c = t.title_choice ? (JSON.parse(t.title_choice) as Title) : null;
    if (c?.text) return [c.text, c.italic].filter(Boolean).join(' ');
  } catch {
    /* ignore */
  }
  if (t.title) return t.title;
  if (t.capture_text) return t.capture_text.split('\n')[0]!.slice(0, 80);
  if (t.url) {
    try {
      const u = new URL(t.url);
      return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
    } catch {
      return t.url;
    }
  }
  return 'Untitled';
}

export function parseChecks(s: string | null): Record<string, CheckStatus> {
  const out: Record<string, CheckStatus> = {};
  for (const part of (s ?? '').split(',').filter(Boolean)) {
    const [k, v] = part.split(':');
    if (k && v) out[k] = v as CheckStatus;
  }
  return out;
}
