// Runtime validation of a Haul bundle and the index, run by the Desk before any publish.
// It checks the shape (bundles are JSON assembled from a database, so types alone prove nothing)
// and the invariants in test/fixtures.test.ts, plus the house rules that apply to published copy.

import type { Block, Haul, HaulIndex, Item, Life, LifeCite, LifeLine, Title } from './haul';
import { AUDIO_FORMATS, BLOCK_KINDS, BUNDLE_VERSION, embedSrc, haulSlug } from './haul';
import { CODE_ROLES, EDITIONS, SWATCHES as SWATCH_LIST, typeSwatch } from './tokens';
import { checkStyle } from './style';
import { validateChart } from './charts/validate';
import { figuresIn } from './charts/figures';
import { lifeLines, wordNumbersIn } from './life';

export interface BundleIssue {
  /** JSON path to the offending value, e.g. "items[2].excerpt.highlight". */
  path: string;
  rule: string;
  message: string;
}

export interface BundleReport {
  ok: boolean;
  errors: BundleIssue[];
  warnings: BundleIssue[];
}

const SWATCHES = new Set<string>(SWATCH_LIST);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

export interface ValidateOptions {
  /**
   * The public files base (e.g. https://files.fromthedumpsterfire.com). When given, every plate and
   * audio URL must live under it: published media is copied next to the bundle, never hotlinked from
   * an archive (Wikimedia and others refuse app image loaders).
   */
  filesBase?: string;
}

class Collector {
  // A plain field, not a parameter property: scripts run this file with Node's type stripping.
  readonly opts: ValidateOptions;
  constructor(opts: ValidateOptions = {}) {
    this.opts = opts;
  }
  hosted(v: unknown, path: string) {
    const base = this.opts.filesBase?.replace(/\/$/, '');
    if (base && typeof v === 'string' && !v.startsWith(`${base}/`)) this.err(path, 'hosted', `must be published under ${base}/ (copy it next to the bundle; never hotlink)`);
  }
  errors: BundleIssue[] = [];
  warnings: BundleIssue[] = [];
  err(path: string, rule: string, message: string) {
    this.errors.push({ path, rule, message });
  }
  warn(path: string, rule: string, message: string) {
    this.warnings.push({ path, rule, message });
  }
  str(v: unknown, path: string, { optional = false, nonEmpty = true } = {}): v is string {
    if (v === undefined && optional) return false;
    if (typeof v !== 'string') {
      this.err(path, 'shape', 'must be a string');
      return false;
    }
    if (nonEmpty && !v.trim()) {
      this.err(path, 'shape', 'must not be empty');
      return false;
    }
    return true;
  }
  num(v: unknown, path: string, optional = false): v is number {
    if (v === undefined && optional) return false;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.err(path, 'shape', 'must be a number');
      return false;
    }
    return true;
  }
  arr(v: unknown, path: string): v is unknown[] {
    if (!Array.isArray(v)) {
      this.err(path, 'shape', 'must be an array');
      return false;
    }
    return true;
  }
  obj(v: unknown, path: string, optional = false): v is Record<string, unknown> {
    if (v === undefined && optional) return false;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      this.err(path, 'shape', 'must be an object');
      return false;
    }
    return true;
  }
  title(v: unknown, path: string) {
    if (!this.obj(v, path)) return;
    this.str(v.text, `${path}.text`);
    this.str(v.italic, `${path}.italic`, { optional: true });
  }
  https(v: unknown, path: string) {
    if (!this.str(v, path)) return;
    if (!/^https:\/\/[^\s]+$/.test(v)) this.err(path, 'https', 'links must be https URLs');
  }
  audio(v: unknown, path: string) {
    if (!this.obj(v, path, true)) return;
    this.https(v.url, `${path}.url`);
    this.hosted(v.url, `${path}.url`);
    this.num(v.seconds, `${path}.seconds`);
    if (v.format !== undefined && !AUDIO_FORMATS.includes(v.format as never)) this.err(`${path}.format`, 'shape', `one of ${AUDIO_FORMATS.join(', ')}`);
  }
  plate(v: unknown, path: string) {
    if (!this.obj(v, path, true)) return;
    this.https(v.url, `${path}.url`);
    this.hosted(v.url, `${path}.url`);
    this.num(v.width, `${path}.width`);
    this.num(v.height, `${path}.height`);
    this.str(v.caption, `${path}.caption`, { nonEmpty: false });
    this.str(v.credit, `${path}.credit`);
    this.str(v.licence, `${path}.licence`);
    if (v.sourceUrl !== undefined) this.https(v.sourceUrl, `${path}.sourceUrl`);
    this.str(v.creator, `${path}.creator`, { optional: true, nonEmpty: false });
    this.str(v.date, `${path}.date`, { optional: true, nonEmpty: false });
  }
  machineProse(v: unknown, path: string) {
    if (typeof v !== 'string' || !v.trim()) return;
    const r = checkStyle(v);
    for (const i of r.issues) {
      if (i.severity === 'error') this.err(path, `style:${i.rule}`, i.message);
      else this.warn(path, `style:${i.rule}`, i.message);
    }
  }
}

function checkItem(c: Collector, item: Item, p: string) {
  if (!c.obj(item, p)) return;
  c.str(item.id, `${p}.id`);
  if (typeof item.id === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) c.err(`${p}.id`, 'id', 'ids are lowercase slugs');
  if (!(item.type in typeSwatch)) c.err(`${p}.type`, 'type', `unknown content type "${String(item.type)}"`);
  c.title(item.title, `${p}.title`);
  c.str(item.creator, `${p}.creator`, { nonEmpty: false });
  if (c.obj(item.source, `${p}.source`)) {
    c.str(item.source.name, `${p}.source.name`);
    c.str(item.source.date, `${p}.source.date`, { nonEmpty: false });
    c.https(item.source.url, `${p}.source.url`);
  }
  c.num(item.minutes, `${p}.minutes`, true);
  if (c.obj(item.why, `${p}.why`)) {
    c.str(item.why.text, `${p}.why.text`);
    c.audio(item.why.audio, `${p}.why.audio`);
  }
  if (c.obj(item.excerpt, `${p}.excerpt`, true)) {
    const ex = item.excerpt;
    c.str(ex.text, `${p}.excerpt.text`);
    c.str(ex.locator, `${p}.excerpt.locator`, { nonEmpty: false });
    if (c.str(ex.highlight, `${p}.excerpt.highlight`, { optional: true }) && typeof ex.text === 'string' && !ex.text.includes(ex.highlight)) {
      c.err(`${p}.excerpt.highlight`, 'highlight', 'the highlight is not part of the excerpt text');
    }
  }
  if (c.obj(item.media, `${p}.media`, true)) {
    if (item.media.kind !== 'video' && item.media.kind !== 'audio') c.err(`${p}.media.kind`, 'shape', 'video or audio');
    c.https(item.media.url, `${p}.media.url`);
    c.str(item.media.label, `${p}.media.label`);
  }
  c.plate(item.plate, `${p}.plate`);
  if (c.obj(item.rhyme, `${p}.rhyme`, true)) {
    for (const end of ['then', 'now'] as const) {
      const e = item.rhyme[end];
      if (c.obj(e, `${p}.rhyme.${end}`)) {
        c.str(e.year, `${p}.rhyme.${end}.year`);
        c.str(e.quote, `${p}.rhyme.${end}.quote`);
        c.str(e.cite, `${p}.rhyme.${end}.cite`);
      }
    }
    c.str(item.rhyme.bridge, `${p}.rhyme.bridge`);
  }
  if (c.arr(item.marginalia, `${p}.marginalia`)) {
    item.marginalia.forEach((m, k) => {
      const mp = `${p}.marginalia[${k}]`;
      if (!c.obj(m, mp)) return;
      c.str(m.text, `${mp}.text`);
      if (typeof m.cite !== 'string' || !m.cite.trim()) c.err(`${mp}.cite`, 'citation', 'every machine note cites a source');
      c.machineProse(m.text, `${mp}.text`);
    });
  }
  if (item.ideas !== undefined && c.arr(item.ideas, `${p}.ideas`)) {
    item.ideas.forEach((m, k) => {
      const mp = `${p}.ideas[${k}]`;
      if (!c.obj(m, mp)) return;
      c.str(m.text, `${mp}.text`);
      // The quote is the source's evidence for the idea. Auto-generated captions are too rough to
      // print, so there the idea cites its moment (the locator) instead; one of the two is required.
      c.str(m.quote, `${mp}.quote`, { nonEmpty: false });
      c.str(m.locator, `${mp}.locator`, { nonEmpty: false });
      const quoted = typeof m.quote === 'string' && m.quote.trim();
      const placed = typeof m.locator === 'string' && m.locator.trim();
      if (!quoted && !placed) c.err(`${mp}.quote`, 'citation', 'every idea quotes the source or says where in it');
      c.machineProse(m.text, `${mp}.text`);
      c.str(m.reaction, `${mp}.reaction`, { optional: true });
    });
  }
  if (item.startHere !== undefined && c.obj(item.startHere, `${p}.startHere`)) {
    c.str(item.startHere.at, `${p}.startHere.at`);
    c.str(item.startHere.note, `${p}.startHere.note`, { optional: true });
    if (item.startHere.url !== undefined) c.https(item.startHere.url, `${p}.startHere.url`);
  }
  if (c.arr(item.wiki, `${p}.wiki`)) {
    item.wiki.forEach((w, k) => {
      const wp = `${p}.wiki[${k}]`;
      if (!c.obj(w, wp)) return;
      c.str(w.title, `${wp}.title`);
      c.str(w.summary, `${wp}.summary`);
      c.https(w.url, `${wp}.url`);
      if (typeof w.url === 'string' && !/^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(w.url)) {
        c.err(`${wp}.url`, 'wiki-url', 'Wikipedia cards link to a wikipedia.org article');
      }
    });
  }
  c.arr(item.connections, `${p}.connections`);
  if (item.year !== undefined && (!Number.isInteger(item.year) || item.year < -3000 || item.year > 2100)) c.err(`${p}.year`, 'shape', 'a whole year');
  c.str(item.handle, `${p}.handle`, { optional: true });
  c.str(item.recipient, `${p}.recipient`, { optional: true });
  c.str(item.place, `${p}.place`, { optional: true });
  if (c.str(item.shelf, `${p}.shelf`, { optional: true }) && !/^[a-z0-9][a-z0-9-]{0,80}$/.test(item.shelf)) c.err(`${p}.shelf`, 'shape', 'a shelf id');
  if (item.type === 'image' && typeof item.creator === 'string' && !item.creator.trim()) c.err(`${p}.creator`, 'credit', 'a picture names who made it');
  if (item.blocks !== undefined && c.arr(item.blocks, `${p}.blocks`)) item.blocks.forEach((b, k) => checkBlock(c, b, `${p}.blocks[${k}]`));
  if (item.type === 'life') {
    if (item.life === undefined) c.err(`${p}.life`, 'life', 'a Life carries its profile');
    else checkLife(c, item.life, `${p}.life`);
  } else if (item.life !== undefined) c.err(`${p}.life`, 'life', 'only a Life carries a profile');
}

const LIFE_KINDS = ['book', 'report', 'article', 'reference'];

/**
 * A Life is machine prose from named sources (life.ts). Here: every line cites a listed source, every
 * source listed is cited (the label names exactly what it was written from) and names its maker,
 * every line passes the style check, headings carry no figures, a portrait names its maker. The
 * quotes and figures were checked against the stored sources on the Desk and again at publish.
 */
function checkLife(c: Collector, life: Life, p: string) {
  if (!c.obj(life, p)) return;
  c.str(life.name, `${p}.name`);
  c.str(life.writer, `${p}.writer`);
  const ids = new Set<string>();
  if (c.arr(life.sources, `${p}.sources`)) {
    if (!life.sources.length) c.err(`${p}.sources`, 'life', 'a Life is written from named sources');
    life.sources.forEach((s, k) => {
      const sp = `${p}.sources[${k}]`;
      if (!c.obj(s, sp)) return;
      if (c.str(s.id, `${sp}.id`)) {
        if (ids.has(s.id)) c.err(`${sp}.id`, 'life', 'source ids are unique');
        ids.add(s.id);
      }
      if (typeof s.author !== 'string' || !s.author.trim()) c.err(`${sp}.author`, 'credit', 'every source names who made it');
      c.str(s.title, `${sp}.title`);
      if (!LIFE_KINDS.includes(s.kind)) c.err(`${sp}.kind`, 'shape', `one of ${LIFE_KINDS.join(', ')}`);
      c.str(s.publisher, `${sp}.publisher`, { optional: true });
      c.str(s.year, `${sp}.year`, { optional: true });
      c.https(s.url, `${sp}.url`);
      c.str(s.via, `${sp}.via`, { optional: true });
      if (s.workUrl !== undefined) c.https(s.workUrl, `${sp}.workUrl`);
    });
  }
  const used = new Set<string>();
  const cites = (v: unknown, path: string) => {
    if (!c.arr(v, path)) return;
    if (!v.length) c.err(path, 'citation', 'every line of a Life cites a source');
    (v as LifeCite[]).forEach((x, k) => {
      if (!c.obj(x, `${path}[${k}]`)) return;
      if (!ids.has(x.source)) c.err(`${path}[${k}].source`, 'citation', `no source "${String(x.source)}" in this Life`);
      used.add(x.source);
      c.str(x.at, `${path}[${k}].at`, { optional: true });
    });
  };
  const line = (l: LifeLine, path: string) => {
    if (!c.obj(l, path)) return;
    c.str(l.text, `${path}.text`);
    c.machineProse(l.text, `${path}.text`);
    cites(l.cites, `${path}.cites`);
  };
  if (c.arr(life.sections, `${p}.sections`)) {
    if (!life.sections.length) c.err(`${p}.sections`, 'life', 'the profile has at least one section');
    life.sections.forEach((s, k) => {
      const sp = `${p}.sections[${k}]`;
      if (!c.obj(s, sp)) return;
      if (c.str(s.heading, `${sp}.heading`)) {
        if (figuresIn(s.heading).length || wordNumbersIn(s.heading).length) c.err(`${sp}.heading`, 'life', 'headings are labels: no figures in them');
        c.machineProse(s.heading, `${sp}.heading`);
      }
      if (c.arr(s.paragraphs, `${sp}.paragraphs`)) s.paragraphs.forEach((para, j) => c.arr(para, `${sp}.paragraphs[${j}]`) && !para.length && c.err(`${sp}.paragraphs[${j}]`, 'shape', 'an empty paragraph'));
    });
  }
  if (!c.obj(life.epithet, `${p}.epithet`)) return;
  if (!c.arr(life.dates, `${p}.dates`)) return;
  life.dates.forEach((d, k) => c.obj(d, `${p}.dates[${k}]`) && c.str(d.year, `${p}.dates[${k}].year`));
  if (c.obj(life.figures, `${p}.figures`, true)) {
    c.str(life.figures.title, `${p}.figures.title`);
    if (c.arr(life.figures.rows, `${p}.figures.rows`))
      life.figures.rows.forEach((r, k) => {
        if (c.obj(r, `${p}.figures.rows[${k}]`) && c.str(r.value, `${p}.figures.rows[${k}].value`) && !figuresIn(r.value).length && !wordNumbersIn(r.value).length)
          c.err(`${p}.figures.rows[${k}].value`, 'life', 'a figure');
      });
  }
  if (c.obj(life.words, `${p}.words`, true)) {
    c.str(life.words.text, `${p}.words.text`);
    cites(life.words.cites, `${p}.words.cites`);
  }
  for (const x of lifeLines(life)) line(x.line, `${p}.${x.path}`);
  for (const end of ['born', 'died'] as const) {
    const e = life[end];
    if (!c.obj(e, `${p}.${end}`, true)) continue;
    if (!Number.isInteger(e.year)) c.err(`${p}.${end}.year`, 'shape', 'a whole year');
    c.str(e.place, `${p}.${end}.place`, { optional: true });
    cites(e.cites, `${p}.${end}.cites`);
  }
  if (c.arr(life.reading, `${p}.reading`))
    life.reading.forEach((r, k) => {
      const rp = `${p}.reading[${k}]`;
      if (!c.obj(r, rp)) return;
      if (typeof r.author !== 'string' || !r.author.trim()) c.err(`${rp}.author`, 'credit', 'further reading names who made it');
      c.str(r.title, `${rp}.title`);
      if (!LIFE_KINDS.includes(r.kind)) c.err(`${rp}.kind`, 'shape', `one of ${LIFE_KINDS.join(', ')}`);
      if (r.url !== undefined) c.https(r.url, `${rp}.url`);
    });
  for (const id of ids) if (!used.has(id)) c.err(`${p}.sources`, 'life', `"${id}" is listed but nothing cites it; the label names only what the profile was written from`);
  if (life.portrait !== undefined) {
    c.plate(life.portrait, `${p}.portrait`);
    if (typeof life.portrait?.creator !== 'string' || !life.portrait.creator.trim()) c.err(`${p}.portrait.creator`, 'credit', 'a picture names who made it');
  }
}

function checkBlock(c: Collector, b: Block, p: string) {
  if (!c.obj(b, p)) return;
  if (!BLOCK_KINDS.includes(b.kind)) return c.err(`${p}.kind`, 'shape', `one of ${BLOCK_KINDS.join(', ')}`);
  switch (b.kind) {
    case 'quote':
      c.str(b.text, `${p}.text`);
      c.str(b.locator, `${p}.locator`, { optional: true, nonEmpty: false });
      break;
    case 'code':
      c.str(b.code, `${p}.code`);
      c.str(b.lang, `${p}.lang`, { optional: true });
      c.str(b.caption, `${p}.caption`, { optional: true });
      if (b.tokens !== undefined && c.arr(b.tokens, `${p}.tokens`)) {
        const ok = b.tokens.every((t) => Array.isArray(t) && t.length === 2 && (t[0] === '' || CODE_ROLES.includes(t[0])) && typeof t[1] === 'string');
        if (!ok) c.err(`${p}.tokens`, 'shape', 'pairs of [role, text]');
        else if (b.tokens.map((t) => t[1]).join('') !== b.code) c.err(`${p}.tokens`, 'tokens', 'the highlighted tokens must join to the code exactly');
      }
      break;
    case 'video':
      if (b.provider !== 'youtube' && b.provider !== 'vimeo') c.err(`${p}.provider`, 'shape', 'youtube or vimeo');
      c.str(b.title, `${p}.title`);
      if (c.str(b.id, `${p}.id`) && !embedSrc(b)) c.err(`${p}.id`, 'embed', 'not a video id');
      c.num(b.start, `${p}.start`, true);
      if (c.obj(b.poster, `${p}.poster`, true)) {
        c.https(b.poster.url, `${p}.poster.url`);
        c.hosted(b.poster.url, `${p}.poster.url`);
        c.num(b.poster.width, `${p}.poster.width`);
        c.num(b.poster.height, `${p}.poster.height`);
      }
      break;
    case 'audio':
      if (!['file', 'spotify', 'apple'].includes(b.provider)) c.err(`${p}.provider`, 'shape', 'file, spotify or apple');
      c.https(b.url, `${p}.url`);
      c.str(b.title, `${p}.title`);
      if (b.provider !== 'file' && typeof b.url === 'string' && !embedSrc(b)) c.err(`${p}.url`, 'embed', `not a ${b.provider} episode or show link`);
      c.num(b.start, `${p}.start`, true);
      c.num(b.seconds, `${p}.seconds`, true);
      break;
    case 'image':
      if (c.obj(b.plate, `${p}.plate`)) {
        c.plate(b.plate, `${p}.plate`);
        // Name the person: every picture says who made it ("Unknown" only when nobody can say).
        if (typeof b.plate.creator !== 'string' || !b.plate.creator.trim()) c.err(`${p}.plate.creator`, 'credit', 'a picture names who made it');
      }
      break;
    case 'chart': {
      // The honesty rules (charts/validate.ts): sources and licences, zero baselines, no dual axes,
      // stated units and bases, the window shown, figures in machine text traced to the rows.
      const r = validateChart(b.chart, `${p}.chart`);
      c.errors.push(...r.errors);
      c.warnings.push(...r.warnings);
      if (c.obj(b.images, `${p}.images`, true)) {
        // The app's two pictures always; the share card when there is one (bundles before 2026-10-26 have none).
        for (const scheme of ['light', 'dark', 'share'] as const) {
          const im = b.images[scheme];
          if (!c.obj(im, `${p}.images.${scheme}`, scheme === 'share')) continue;
          c.https(im.url, `${p}.images.${scheme}.url`);
          c.hosted(im.url, `${p}.images.${scheme}.url`);
          c.num(im.width, `${p}.images.${scheme}.width`);
          c.num(im.height, `${p}.images.${scheme}.height`);
        }
      }
      break;
    }
  }
}

/** Validate a bundle (and, if given, the index that will point to it). */
export function validateHaul(haul: Haul, index?: HaulIndex, opts: ValidateOptions = {}): BundleReport {
  const c = new Collector(opts);
  if (!c.obj(haul, 'haul')) return { ok: false, errors: c.errors, warnings: c.warnings };

  if (haul.bundleVersion !== BUNDLE_VERSION) c.err('bundleVersion', 'version', `must be ${BUNDLE_VERSION}`);
  if (c.num(haul.number, 'number') && (!Number.isInteger(haul.number) || haul.number < 1)) c.err('number', 'shape', 'a positive integer');
  if (c.num(haul.version, 'version') && (!Number.isInteger(haul.version) || haul.version < 1)) c.err('version', 'shape', 'a positive integer');
  c.title(haul.title, 'title');
  c.str(haul.deck, 'deck');
  if (c.str(haul.publishedAt, 'publishedAt') && !ISO_DATE.test(haul.publishedAt)) c.err('publishedAt', 'shape', 'an ISO date');
  if (!SWATCHES.has(haul.swatch)) c.err('swatch', 'shape', 'a known swatch');
  if (haul.edition !== undefined && !EDITIONS.includes(haul.edition)) c.err('edition', 'shape', `one of ${EDITIONS.join(', ')}`);
  c.str(haul.colophon, 'colophon');
  c.plate(haul.cover, 'cover');
  if (c.obj(haul.card, 'card', true)) {
    c.https(haul.card.url, 'card.url');
    c.hosted(haul.card.url, 'card.url');
    c.num(haul.card.width, 'card.width');
    c.num(haul.card.height, 'card.height');
  }

  // Field note.
  const fn = haul.fieldNote;
  if (c.obj(fn, 'fieldNote')) {
    c.title(fn.title, 'fieldNote.title');
    if (c.arr(fn.paragraphs, 'fieldNote.paragraphs')) {
      if (fn.paragraphs.length === 0) c.err('fieldNote.paragraphs', 'shape', 'the field note needs at least one paragraph');
      fn.paragraphs.forEach((t, k) => c.str(t, `fieldNote.paragraphs[${k}]`));
      if (fn.highlight && !fn.paragraphs.join(' ').includes(fn.highlight)) {
        c.err('fieldNote.highlight', 'highlight', 'the highlight is not in the field note text');
      }
    }
    c.audio(fn.audio, 'fieldNote.audio');
    if (c.arr(fn.route, 'fieldNote.route')) {
      fn.route.forEach((r, k) => {
        const rp = `fieldNote.route[${k}]`;
        if (!c.obj(r, rp)) return;
        c.str(r.day, `${rp}.day`);
        c.str(r.text, `${rp}.text`);
        if (r.by !== 'editor' && r.by !== 'machine') c.err(`${rp}.by`, 'shape', 'editor or machine');
        if (r.by === 'machine') c.machineProse(r.text, `${rp}.text`);
      });
    }
  }

  // Items.
  const items: Item[] = c.arr(haul.items, 'items') ? haul.items : [];
  items.forEach((item, k) => checkItem(c, item, `items[${k}]`));
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) c.err('items', 'unique-ids', 'item ids must be unique');
  if (items.length === 0) c.err('items', 'count', 'a Haul needs items');
  else if (items.length < 6 || items.length > 20) c.warn('items', 'count', `a Haul is 6 to 20 objects; this one has ${items.length}`);

  // Threads.
  const threads = c.arr(haul.threads, 'threads') ? haul.threads : [];
  const threadIds = new Set(threads.map((t) => t.id));
  threads.forEach((t, k) => {
    const tp = `threads[${k}]`;
    if (!c.obj(t, tp)) return;
    c.str(t.id, `${tp}.id`);
    c.title(t.title, `${tp}.title`);
    c.str(t.summary, `${tp}.summary`);
    c.str(t.provenance, `${tp}.provenance`);
    if (c.arr(t.points, `${tp}.points`)) {
      t.points.forEach((pt, j) => {
        if (pt.itemId && !ids.has(pt.itemId)) c.err(`${tp}.points[${j}].itemId`, 'link', `no item "${pt.itemId}" in this Haul`);
      });
    }
  });

  // Internal links resolve within the bundle.
  fn?.route?.forEach((r, k) => {
    if (r.itemId && !ids.has(r.itemId)) c.err(`fieldNote.route[${k}].itemId`, 'link', `no item "${r.itemId}" in this Haul`);
  });
  items.forEach((item, k) =>
    item.connections?.forEach((cn, j) => {
      const cp = `items[${k}].connections[${j}]`;
      if (cn.itemId && !ids.has(cn.itemId)) c.err(`${cp}.itemId`, 'link', `no item "${cn.itemId}" in this Haul`);
      if (cn.threadId && !threadIds.has(cn.threadId)) c.err(`${cp}.threadId`, 'link', `no thread "${cn.threadId}" in this Haul`);
      if (!cn.itemId && !cn.threadId) c.err(cp, 'link', 'a connection points to an item or a thread');
    }),
  );

  if (haul.corrections !== undefined && c.arr(haul.corrections, 'corrections')) {
    haul.corrections.forEach((x, k) => {
      c.str(x.date, `corrections[${k}].date`);
      c.str(x.text, `corrections[${k}].text`);
    });
    if (haul.version > 1 && haul.corrections.length < haul.version - 1) {
      c.err('corrections', 'corrections', 'every version after the first carries a correction entry');
    }
  } else if (typeof haul.version === 'number' && haul.version > 1) {
    c.err('corrections', 'corrections', 'a corrected version must say what changed');
  }

  if (index) {
    if (index.bundleVersion !== BUNDLE_VERSION) c.err('index.bundleVersion', 'version', `must be ${BUNDLE_VERSION}`);
    const entry = index.hauls?.find((h) => h.number === haul.number);
    if (!entry) c.err('index.hauls', 'index', `the index has no entry for Haul ${haul.number}`);
    else {
      if (entry.itemCount !== items.length) c.err('index.itemCount', 'index', 'item count disagrees with the bundle');
      if (!entry.path.includes(haulSlug(haul.number))) c.err('index.path', 'index', 'path does not name this Haul');
      if (!sameTitle(entry.title, haul.title)) c.err('index.title', 'index', 'title disagrees with the bundle');
    }
    const numbers = (index.hauls ?? []).map((h) => h.number);
    if (new Set(numbers).size !== numbers.length) c.err('index.hauls', 'index', 'each Haul appears once');
    for (let k = 1; k < numbers.length; k++) {
      if (numbers[k - 1]! < numbers[k]!) c.err('index.hauls', 'index', 'the index lists the newest Haul first');
    }
  }

  return { ok: c.errors.length === 0, errors: c.errors, warnings: c.warnings };
}

function sameTitle(a: Title, b: Title): boolean {
  return a?.text === b?.text && (a?.italic ?? undefined) === (b?.italic ?? undefined);
}
