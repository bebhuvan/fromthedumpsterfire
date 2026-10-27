// Lives: a profile of one person, written by a model from named sources (docs/DECISIONS.md,
// 2026-10-27). The rules are the magazine's, applied to a long machine piece:
//
// - every line (sentence, caption, date, figure) cites one or more stored sources, each with a quote
//   found word for word in that source's fetched text (no match, no ship);
// - every number in a line is in its quotes, fail-closed, as chart annotations are traced to rows;
// - every line passes the house style check; headings are labels with no figures in them;
// - a judge confirms each line against its quotes, and what it cannot confirm is set aside unseen;
// - only lines the editor keeps are printed, and only after the editor approves the whole profile.
//
// The Desk keeps a LifeDraft (quotes, offsets, ticks); publish assembles the bundle's Life from it.
// The quotes stay private: the bundle names each line's source and place, never a second copy of it.

import type { Life, LifeCite, LifeLine, LifeReading, LifeShape, LifeSource } from './haul';
import { findVerbatim } from './verbatim';
import { checkStyle } from './style';
import { figuresIn } from './charts/figures';

export type LineStatus = 'proposed' | 'kept' | 'cut' | 'rejected';
export type LineVerdict = 'supported' | 'partly' | 'unsupported' | 'unchecked';

/** A citation on the Desk: the quote that supports the line, anchored in the stored source text. */
export interface DraftCite {
  source: string;
  quote: string;
  at?: string;
  start?: number;
  end?: number;
}

export interface DraftLine {
  id: string;
  text: string;
  cites: DraftCite[];
  status: LineStatus;
  verdict?: LineVerdict;
  reason?: string;
}

export type LifeDraft = LifeShape<DraftLine, DraftCite>;

// ---------------------------------------------------------------- reading a Life

/** The years under the name: "1899–1963", "born 1947", or nothing. */
export function lifeYears(life: Pick<Life, 'born' | 'died'>): string {
  const b = life.born?.year;
  const d = life.died?.year;
  if (b && d) return `${b}–${d}`;
  if (b) return `born ${b}`;
  if (d) return `died ${d}`;
  return '';
}

/** One part of the machine label: a source named by its maker, its title set in italic if a whole work. */
export interface BylinePart {
  author: string;
  title: string;
  italic: boolean;
}

const possessive = (name: string) => (/s$/.test(name) ? `${name}’` : `${name}’s`);

/**
 * The label over the profile, generated from the sources it cites, never typed: "Written by Claude
 * from Ramachandra Guha’s India After Gandhi and the Election Commission of India’s Report on…".
 */
export function lifeByline(life: Pick<Life, 'writer' | 'sources'>): { lead: string; parts: BylinePart[] } {
  return {
    lead: `Written by ${life.writer} from`,
    parts: life.sources.map((s) => ({ author: possessive(institutional(s.author)), title: s.title, italic: s.kind === 'book' || s.kind === 'report' })),
  };
}

/** "Election Commission of India" reads as "the Election Commission of India" in running text. */
function institutional(author: string): string {
  return /^(Election|Press|Government|Ministry|Office|Registrar|Census|Lok|Rajya|Reserve|National|Indian|Royal|British|United)\b/.test(author) && !/^the\b/i.test(author) ? `the ${author}` : author;
}

/** The label as plain text (Markdown, feeds, the app's screen reader). */
export function lifeBylineText(life: Pick<Life, 'writer' | 'sources'>): string {
  const { lead, parts } = lifeByline(life);
  const names = parts.map((p) => `${p.author} ${p.title}`);
  const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${lead} ${list}.`;
}

/** Every line of a Life (or a draft) with a path for messages, in reading order. */
export function lifeLines<L, C>(life: LifeShape<L, C>): Array<{ path: string; line: L; role: 'epithet' | 'body' | 'context' | 'date' | 'figure' }> {
  const out: Array<{ path: string; line: L; role: 'epithet' | 'body' | 'context' | 'date' | 'figure' }> = [];
  if (life.epithet) out.push({ path: 'epithet', line: life.epithet, role: 'epithet' });
  (life.sections ?? []).forEach((s, i) => (s?.paragraphs ?? []).forEach((p, j) => (p ?? []).forEach((l, k) => out.push({ path: `sections[${i}].paragraphs[${j}][${k}]`, line: l, role: 'body' }))));
  if (life.words?.context) out.push({ path: 'words.context', line: life.words.context, role: 'context' });
  (life.dates ?? []).forEach((d, i) => d?.line && out.push({ path: `dates[${i}].line`, line: d.line, role: 'date' }));
  (life.figures?.rows ?? []).forEach((r, i) => r?.line && out.push({ path: `figures.rows[${i}].line`, line: r.line, role: 'figure' }));
  return out;
}

/** The profile's prose as paragraphs of plain text (search, Markdown, word counts). */
export function lifeParagraphs(life: Life): string[] {
  return life.sections.flatMap((s) => s.paragraphs.map((p) => p.map((l) => l.text).join(' ')));
}

// ---------------------------------------------------------------- figures

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

/** Numbers written as words ("twenty-one", "four months"), so a figure cannot hide by being spelled out. */
export function wordNumbersIn(text: string): Array<{ text: string; value: number }> {
  const out: Array<{ text: string; value: number }> = [];
  const re = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[-\s](one|two|three|four|five|six|seven|eight|nine))?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = WORD_NUMBERS[m[1]!.toLowerCase()]!;
    const b = m[2] && a >= 20 && a % 10 === 0 && a < 100 ? WORD_NUMBERS[m[2].toLowerCase()]! : 0;
    // "one of the", "no one", "the right one" are not figures.
    if (a === 1 && !b && /^\s+(of|another|day|by|who|man|woman|person)\b/i.test(text.slice(m.index + m[0].length))) continue;
    if (a === 1 && !b && /\b(no|any|every|some|the|a|this|that|each|which)\s+(\w+\s+)?$/i.test(text.slice(0, m.index))) continue;
    out.push({ text: b ? m[0] : m[1]!, value: a + b });
    if (!b && m[2]) re.lastIndex = m.index + m[1]!.length;
  }
  return out;
}

/** Every value a quote can vouch for: its figures, its spelled-out numbers, the parts of a range. */
function quotedValues(quotes: string[]): Array<{ value: number; decimals: number }> {
  const vals: Array<{ value: number; decimals: number }> = [];
  for (const q of quotes) {
    for (const f of figuresIn(q)) vals.push({ value: f.value, decimals: f.decimals });
    for (const w of wordNumbersIn(q)) vals.push({ value: w.value, decimals: 0 });
  }
  return vals;
}

/**
 * The figures in a machine line that its quotes do not hold. A written figure matches a quoted value
 * rounded no finer than it is written ("2.8 million" against "2.8 million" or "2,800,000"; "85 per
 * cent" against "85 percent"). Fail-closed: anything unmatched stops the line.
 */
export function untracedFigures(text: string, quotes: string[]): string[] {
  const vals = quotedValues(quotes);
  const ok = (value: number, decimals: number) => {
    const tol = 0.5 * 10 ** -decimals + 1e-9;
    return vals.some((v) => Math.abs(Math.abs(v.value) - Math.abs(value)) <= tol);
  };
  const bad: string[] = [];
  for (const f of figuresIn(text)) if (!ok(f.value, f.decimals)) bad.push(f.text);
  for (const w of wordNumbersIn(text)) if (!ok(w.value, 0)) bad.push(w.text);
  return bad;
}

// ---------------------------------------------------------------- checking a draft

export interface LifeProblem {
  path: string;
  message: string;
  /** The line it belongs to, when it is one line's problem (it can then be cut instead). */
  lineId?: string;
}

/**
 * Check a draft against the stored text of its sources and anchor every quote to the source's own
 * characters. Returns the draft with quotes re-anchored and the problems found. Called when a draft
 * arrives, when a line is edited, and again at publish (fail-closed).
 */
export function checkLifeDraft(draft: LifeDraft, texts: Record<string, string>): { draft: LifeDraft; problems: LifeProblem[] } {
  const problems: LifeProblem[] = [];
  const ids = new Set(draft.sources.map((s) => s.id));
  const anchor = (cites: DraftCite[], path: string, lineId?: string): DraftCite[] =>
    cites.map((c, k) => {
      const cp = `${path}.cites[${k}]`;
      if (!ids.has(c.source)) {
        problems.push({ path: cp, message: `cites "${c.source}", which is not one of the sources`, lineId });
        return c;
      }
      const text = texts[c.source];
      if (text === undefined) {
        problems.push({ path: cp, message: `the source "${c.source}" has no stored text to check against`, lineId });
        return c;
      }
      const f = findVerbatim(text, c.quote);
      if (!f) {
        problems.push({ path: cp, message: `the quote is not in ${c.source} word for word: “${c.quote.slice(0, 80)}${c.quote.length > 80 ? '…' : ''}”`, lineId });
        return c;
      }
      return { ...c, quote: f.text, start: f.start, end: f.end };
    });
  const checkLine = (l: DraftLine, path: string, role: string): DraftLine => {
    if (!l || typeof l.text !== 'string' || !l.text.trim()) {
      problems.push({ path, message: 'an empty line' });
      return l;
    }
    if (!Array.isArray(l.cites) || l.cites.length === 0) problems.push({ path, message: 'every line cites at least one source', lineId: l.id });
    const cites = anchor(l.cites ?? [], path, l.id);
    const style = checkStyle(l.text);
    for (const i of style.issues) if (i.severity === 'error') problems.push({ path, message: `style: ${i.message}`, lineId: l.id });
    // A figure caption's value is part of what it claims.
    const claim = role === 'figure' ? `${figureValue(draft, l.id) ?? ''} ${l.text}` : l.text;
    const bad = untracedFigures(claim, cites.map((c) => c.quote));
    if (bad.length) problems.push({ path, message: `figures not in its quotes: ${bad.join(', ')}`, lineId: l.id });
    return { ...l, text: l.text.trim(), cites };
  };

  const next: LifeDraft = structuredClone(draft);
  if (!next.name?.trim()) problems.push({ path: 'name', message: 'the person’s name' });
  if (!next.writer?.trim()) problems.push({ path: 'writer', message: 'name the model that wrote it' });
  if (!next.sources?.length) problems.push({ path: 'sources', message: 'a Life is written from named sources' });
  const seen = new Set<string>();
  next.sources.forEach((s, i) => {
    if (seen.has(s.id)) problems.push({ path: `sources[${i}].id`, message: 'source ids are unique' });
    seen.add(s.id);
    if (!s.author?.trim()) problems.push({ path: `sources[${i}].author`, message: 'every source names who made it' });
  });
  next.epithet = checkLine(next.epithet, 'epithet', 'epithet');
  next.sections = (next.sections ?? []).map((s, i) => {
    if (!s.heading?.trim()) problems.push({ path: `sections[${i}].heading`, message: 'a heading' });
    else {
      if (figuresIn(s.heading).length || wordNumbersIn(s.heading).length) problems.push({ path: `sections[${i}].heading`, message: 'headings are labels: no figures in them' });
      for (const x of checkStyle(s.heading).issues) if (x.severity === 'error') problems.push({ path: `sections[${i}].heading`, message: `style: ${x.message}` });
    }
    return { ...s, paragraphs: s.paragraphs.map((p, j) => p.map((l, k) => checkLine(l, `sections[${i}].paragraphs[${j}][${k}]`, 'body'))) };
  });
  if (!next.sections.length) problems.push({ path: 'sections', message: 'the profile has at least one section' });
  for (const end of ['born', 'died'] as const) {
    const e = next[end];
    if (!e) continue;
    if (!Number.isInteger(e.year)) problems.push({ path: `${end}.year`, message: 'a whole year' });
    if (!e.cites?.length) problems.push({ path: `${end}.cites`, message: `cite where the year ${end === 'born' ? 'of birth' : 'of death'} comes from` });
    e.cites = anchor(e.cites ?? [], end);
    const bad = untracedFigures(String(e.year), e.cites.map((c) => c.quote));
    if (bad.length) problems.push({ path: `${end}.year`, message: `${e.year} is not in its quotes` });
  }
  if (next.words) {
    const w = next.words;
    if (!w.cites?.length) problems.push({ path: 'words.cites', message: 'cite where the words are recorded' });
    w.cites = anchor(w.cites ?? [], 'words');
    // The words themselves must be inside the quote that records them, and the quote in the source.
    const inQuote = w.cites.some((c) => findVerbatim(c.quote, w.text) !== null);
    if (!inQuote) problems.push({ path: 'words.text', message: 'the person’s words must be inside the quote that records them, word for word' });
    w.context = checkLine(w.context, 'words.context', 'context');
  }
  next.dates = (next.dates ?? []).map((d, i) => {
    if (!String(d.year ?? '').trim()) problems.push({ path: `dates[${i}].year`, message: 'a year' });
    const line = checkLine(d.line, `dates[${i}].line`, 'date');
    const bad = untracedFigures(String(d.year), line.cites.map((c) => c.quote));
    if (bad.length) problems.push({ path: `dates[${i}].year`, message: `${d.year} is not in its quotes`, lineId: line.id });
    return { ...d, line };
  });
  if (next.figures) {
    next.figures.rows = next.figures.rows.map((r, i) => {
      if (!figuresIn(r.value).length && !wordNumbersIn(r.value).length) problems.push({ path: `figures.rows[${i}].value`, message: 'a figure', lineId: r.line?.id });
      return { ...r, line: checkLine(r.line, `figures.rows[${i}].line`, 'figure') };
    });
  }
  const lineIds = lifeLines(next).map((x) => x.line.id);
  if (new Set(lineIds).size !== lineIds.length) problems.push({ path: 'sections', message: 'line ids are unique' });
  return { draft: next, problems };
}

function figureValue(draft: LifeDraft, lineId: string): string | undefined {
  return draft.figures?.rows.find((r) => r.line?.id === lineId)?.value;
}

// ---------------------------------------------------------------- the bundle's Life

const printed = (l: DraftLine | undefined): l is DraftLine => !!l && l.status === 'kept';
const bare = (cites: DraftCite[]): LifeCite[] => cites.map((c) => (c.at ? { source: c.source, at: c.at } : { source: c.source }));
const line = (l: DraftLine): LifeLine => ({ text: l.text, cites: bare(l.cites) });

/**
 * The printed Life: only what the editor kept, with citations reduced to source and place. Sources no
 * kept line cites drop out, so the label names exactly what the printed profile was written from.
 */
export function assembleLife(draft: LifeDraft): { life?: Life; problems: string[] } {
  const problems: string[] = [];
  if (!printed(draft.epithet)) problems.push('Keep the line under the name (the epithet), or write another.');
  const sections = draft.sections
    .map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map((p) => p.filter(printed).map(line)).filter((p) => p.length) }))
    .filter((s) => s.paragraphs.length);
  if (!sections.length) problems.push('No sentence of the profile is kept.');
  if (problems.length) return { problems };
  const life: Life = {
    name: draft.name.trim(),
    ...(draft.born ? { born: { year: draft.born.year, ...(draft.born.place ? { place: draft.born.place } : {}), cites: bare(draft.born.cites) } } : {}),
    ...(draft.died ? { died: { year: draft.died.year, ...(draft.died.place ? { place: draft.died.place } : {}), cites: bare(draft.died.cites) } } : {}),
    epithet: line(draft.epithet),
    sections,
    ...(draft.words && printed(draft.words.context) ? { words: { text: draft.words.text, context: line(draft.words.context), cites: bare(draft.words.cites) } } : {}),
    dates: draft.dates.filter((d) => printed(d.line)).map((d) => ({ year: d.year, line: line(d.line) })),
    ...(draft.figures && draft.figures.rows.some((r) => printed(r.line))
      ? { figures: { title: draft.figures.title, rows: draft.figures.rows.filter((r) => printed(r.line)).map((r) => ({ value: r.value, line: line(r.line) })) } }
      : {}),
    sources: [],
    reading: draft.reading.map((r): LifeReading => ({ ...r })),
    writer: draft.writer.trim(),
    ...(draft.portrait ? { portrait: draft.portrait } : {}),
  };
  const cited = new Set(lifeCites(life).map((c) => c.source));
  life.sources = draft.sources.filter((s) => cited.has(s.id)).map((s): LifeSource => ({ ...s }));
  return { life, problems };
}

/** Every citation in a Life: its lines, the years and the person's words. */
export function lifeCites(life: Life): LifeCite[] {
  return [...lifeLines(life).flatMap((x) => x.line.cites), ...(life.born?.cites ?? []), ...(life.died?.cites ?? []), ...(life.words?.cites ?? [])];
}

/** The sources a paragraph (or any lines) draws on, in the order of the source list, each with its places. */
export function citedIn(life: Life, lines: LifeLine[]): Array<{ source: LifeSource; at: string[] }> {
  return life.sources
    .map((source) => {
      const at = [...new Set(lines.flatMap((l) => l.cites.filter((c) => c.source === source.id).map((c) => c.at ?? '')).filter(Boolean))];
      const used = lines.some((l) => l.cites.some((c) => c.source === source.id));
      return used ? { source, at } : null;
    })
    .filter((x): x is { source: LifeSource; at: string[] } => x !== null);
}

/** A source's places as one phrase: "PDF pp. 74, 75" rather than "PDF p. 74 PDF p. 75". */
export function placesText(at: string[]): string {
  const pages = at.map((a) => /^PDF p\. (\d+)$/.exec(a)?.[1]);
  if (at.length > 1 && pages.every(Boolean)) return `PDF pp. ${[...new Set(pages)].sort((a, b) => Number(a) - Number(b)).join(', ')}`;
  return at.join(', ');
}

/** "Guha; ECI PDF p. 78": where the given lines come from, for the margin. */
export function whereFrom(life: Life, lines: LifeLine[]): string {
  return citedIn(life, lines)
    .map((c) => [sourceKey(c.source), placesText(c.at)].filter(Boolean).join(' '))
    .join('; ');
}

/** Short names for sources in the margin: the maker's surname or the institution's initials. */
export function sourceKey(s: LifeSource): string {
  const words = s.author.replace(/^the\s+/i, '').split(/\s+/);
  if (words.length >= 3 && /^[A-Z]/.test(words[0]!) && /\b(of|for|and)\b/.test(s.author)) {
    return words.filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('');
  }
  return words[words.length - 1]!;
}
