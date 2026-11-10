// A data story, as data (docs/DATA-STORIES.md): the editor's title and words, the machine's words,
// the plates with their rows, and the facts code worked out from the rows. validateStory refuses one
// that breaks the grammar's honesty rules; drawing never sees an unchecked story.

import { figuresIn } from '../charts/figures';
import { checkStyle } from '../style';
import { EDITIONS, type Edition } from '../tokens';
import type { Pt } from './geom';
import type { BarsFigure } from './forms/bars';
import type { BumpFigure } from './forms/bump';
import type { DumbbellFigure } from './forms/dumbbell';
import type { HeatmapFigure } from './forms/heatmap';
import type { MapFigure } from './forms/map';
import type { RidgelineFigure } from './forms/ridgeline';
import type { ScatterFigure } from './forms/scatter';
import type { SlopeFigure } from './forms/slope';
import type { TrailFigure } from './forms/trail';

export interface Source {
  maker: string;
  dataset: string;
  url: string;
  licence: string;
  /** YYYY-MM-DD. */
  retrieved: string;
  via?: { name: string; url: string; licence: string };
}

/** The source's uncertainty about a projected series: lower and upper bounds of its 80 and 95 per cent ranges. */
export interface Range { lo95: Pt[]; lo80: Pt[]; hi80: Pt[]; hi95: Pt[] }

export interface Series {
  key: string;
  /** Written at the line's end (focus and named lines). */
  label?: string;
  role: 'focus' | 'named' | 'context';
  points: Pt[];
  /** From this x on, the points are the source's projection. */
  projectedFrom?: number;
  range?: Range;
}

/** A machine note on a point: its lines on the wide plate, and (shorter) on the phone. */
export interface Note { x: number; y: number; lines: string[]; phone?: string[]; dot?: boolean }
export interface Rule { y: number; label: string }
export interface Zone { from: number; to: number; label: string; phone?: string }
export interface Axis {
  unit: string;
  domain: [number, number];
  ticks: number[];
  /** How ticks are written: whole, one or two decimals, millions, billions. */
  format?: 'int' | 'one' | 'two' | 'million' | 'billion';
}
export interface XAxis { domain: [number, number]; ticks: number[]; phoneTicks?: number[]; title?: string }

export interface Panel { y: Axis; series: Series[]; rules?: Rule[]; zones?: Zone[]; notes?: Note[]; weight?: number }
export interface LinesFigure {
  form: 'lines';
  x: XAxis;
  seam?: number;
  panels: Panel[];
  /** What the grey context lines are, for the key ("Every other country"). */
  contextLabel?: string;
}

export interface SwarmItem {
  label: string;
  /** The x of the event, or before or after the axis. */
  at: number | 'before' | 'after';
  /** Sets the circle's area. */
  weight: number;
  state: 'estimated' | 'projected';
  focus?: boolean;
  /** Name it on the plate. */
  named?: boolean;
}
export interface SwarmFigure {
  form: 'swarm';
  x: XAxis;
  seam: number;
  items: SwarmItem[];
  before: string;
  after: string;
  /** A share over time drawn above the swarm on the same x scale. */
  step?: { unit: string; points: Pt[]; notes?: Note[]; endLabel: string; phoneEndLabel?: string };
}

export interface MultiplesFigure {
  form: 'multiples';
  x: XAxis;
  y: Axis;
  seam?: number;
  rule?: Rule;
  /** The same line behind every panel, in grey (the world). */
  context?: { label: string; points: Pt[] };
  panels: { label: string; points: Pt[]; projectedFrom?: number; value: string }[];
  /** One line saying what the shared scale is. */
  scaleLine: string;
  phoneScaleLine?: string;
}

export interface StackFigure {
  form: 'stack';
  x: XAxis;
  seam?: number;
  unit: string;
  /** Bottom to top; shares of 100 at the same x in each. */
  layers: { label: string; short?: string; role: 'focus' | 'second' | 'rest'; points: Pt[] }[];
  labelAt: number[];
  phoneLabelAt?: number[];
}

export interface PyramidFigure {
  form: 'pyramid';
  /** Youngest first. */
  groups: { label: string; start: number }[];
  left: string;
  right: string;
  solid: { label: string; left: number[]; right: number[] };
  outline: { label: string; left: number[]; right: number[] };
  ticks: number[];
  tickFormat: 'million';
}

export type Figure =
  | LinesFigure | SwarmFigure | MultiplesFigure | StackFigure | PyramidFigure
  | SlopeFigure | DumbbellFigure | BarsFigure | HeatmapFigure | RidgelineFigure | BumpFigure
  | ScatterFigure | TrailFigure | MapFigure;

export interface Plate {
  key: string;
  name: string;
  /** The machine's headline and paragraph. */
  headline: string;
  body: string;
  /** One line under the figure (the machine's). */
  caption: string;
  figure: Figure;
  sources: Source[];
  /** The story's climax, drawn across the page. At most one. */
  fold?: boolean;
  /** The editor's words for the margin: found unchanged in his stored text. */
  editorNote?: string;
  /** A passage from the source the story answers, matched against its stored text on the Desk. */
  quote?: { text: string; credit: string };
  /** A short arithmetic coda after the plate: a few numbers and one machine sentence. */
  coda?: { label: string; figures: { value: string; text: string }[]; text: string };
}

export interface Fact { key: string; value: number; method: string }

export interface Story {
  title: string;
  standfirst: string;
  edition: Edition;
  /** The principal figures: the number as written, and one machine line on what it counts. */
  ledger: { value: string; text: string; loud?: boolean }[];
  movements: { numeral: string; name: string; plates: string[] }[];
  plates: Plate[];
  /** Numbers code worked out from the rows, each with its method; machine words may cite them. */
  facts: Fact[];
}

// ---- Validation -------------------------------------------------------------------------------

/**
 * Keys that hold a figure's structure, not its data: scales, ticks, bins, the seam, references and
 * zones (definitions such as replacement at 2.1 must be stated as facts), notes and label positions.
 * A number under one of these keys is never evidence for a figure in the words.
 */
// ('step' is not here: it names the swarm's share panel, which is data, as well as a heatmap's bin
// width, which is not but cannot mislead: a bin width is never a figure the words cite.)
const STRUCTURE = new Set(['domain', 'ticks', 'phoneTicks', 'decimals', 'digits', 'perSide', 'width', 'every', 'dots', 'bins', 'mid', 'rule', 'rules', 'zones', 'seam', 'notes', 'labelAt', 'phoneLabelAt', 'sizeKey', 'centre']);

/** The data in a value: numbers in its rows, never in its strings or its structure. */
function dataIn(v: unknown, out: Set<number>): void {
  if (typeof v === 'number') { if (Number.isFinite(v)) out.add(v); return; }
  if (Array.isArray(v)) { for (const x of v) dataIn(x, out); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!STRUCTURE.has(k)) dataIn(x, out);
}

/** Every string in a value, with where it is: the machine's labels on a figure. */
function stringsIn(v: unknown, at: string, out: [string, string][]): void {
  if (typeof v === 'string') { if (/\d/.test(v)) out.push([at, v]); return; }
  if (Array.isArray(v)) { v.forEach((x) => stringsIn(x, at, out)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'form' && k !== 'key' && k !== 'code') stringsIn(x, `${at} ${k}`, out);
}

/**
 * What the machine's prose may cite: its facts, each with a method, and the years its rows hold.
 * Prose is held to facts because a story's rows hold thousands of numbers, and nearly any round
 * number would match one of them by chance.
 */
export function citableInProse(story: Story): number[] {
  const nums = new Set<number>(story.facts.map((f) => f.value));
  const rows = new Set<number>();
  for (const p of story.plates) dataIn(p.figure, rows);
  // Years the figures show, whether in their rows or written in their own headings (a slope's "1990").
  const labels: [string, string][] = [];
  for (const p of story.plates) stringsIn(p.figure, '', labels);
  for (const [, t] of labels) for (const f of figuresIn(t)) rows.add(f.value);
  for (const v of rows) if (Number.isInteger(v) && v >= 1800 && v <= 2200) nums.add(v);
  return [...nums];
}

/** Every number a label on a figure may cite: its figures' data and the story's facts. */
export function citable(story: Story): number[] {
  const nums = new Set<number>();
  for (const f of story.facts) dataIn(f.value, nums);
  for (const p of story.plates) dataIn(p.figure, nums);
  return [...nums];
}

/** The figures in a machine line that match nothing citable (rounded no finer than written). */
export function untraced(text: string, nums: number[]): string[] {
  return figuresIn(text)
    .filter((f) => {
      const tol = 0.5 * 10 ** -f.decimals + 1e-9;
      // "67 per cent" and "67%" may cite a share stored as 0.67 (a fraction) or as 67.
      return !nums.some((v) => Math.abs(v - f.value) <= tol || (v >= 0 && v <= 1 && Math.abs(v * 100 - f.value) <= tol));
    })
    .map((f) => f.text);
}

/**
 * The editor's words as whole sentences of his note: the passage starts where a sentence starts (the
 * note's start, a new line, or after a full stop) and ends a sentence, so a cut can never turn his
 * meaning ("I doubt fertility will recover" never yields "fertility will recover").
 */
export function wholeSentences(passage: string, text: string): boolean {
  const p = passage.trim();
  if (!p || !/[.!?…]["”’)]*$/.test(p)) return false;
  for (let at = text.indexOf(p); at >= 0; at = text.indexOf(p, at + 1)) {
    const before = text.slice(0, at).replace(/[\s"“‘(]+$/, '');
    if (before === '' || /[.!?…:]["”’)]*$/.test(before) || /\n\s*$/.test(text.slice(0, at))) return true;
  }
  return false;
}

const sorted = (p: Pt[]) => p.every((q, i) => i === 0 || q[0] > p[i - 1]![0]);
const finite = (p: Pt[]) => p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
const yOf = (p: Pt[], x: number) => p.find((q) => q[0] === x)?.[1];

/**
 * Every rule the grammar holds a story to. `editorText` is the editor's stored text: his standfirst
 * and margin notes must be found in it unchanged. Returns problems; empty means it may be drawn.
 */
export function validateStory(story: Story, editorText: string | null): string[] {
  const errs: string[] = [];
  const keys = new Set(story.plates.map((p) => p.key));
  if (!story.title.trim()) errs.push('The story needs the editor’s title.');
  if (!EDITIONS.includes(story.edition)) errs.push(`Unknown edition "${story.edition}".`);
  // The editor's words are checked where his stored text is (the Desk, at publish); a reader's copy
  // (editorText null) is checked for everything else.
  if (editorText !== null && !wholeSentences(story.standfirst, editorText)) errs.push('The standfirst is not the editor’s words unchanged, as whole sentences of his note.');
  if (story.plates.length < 3 || story.plates.length > 9) errs.push('A story has three to nine plates.');
  if (keys.size !== story.plates.length) errs.push('Plate keys must be unique.');
  // A plate's key names its anchor on the page and its pictures' files.
  if (story.plates.some((p) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.key))) errs.push('Plate keys are lowercase words joined by hyphens.');
  if (story.plates.filter((p) => p.fold).length > 1) errs.push('At most one plate folds out.');
  const inMovements = story.movements.flatMap((m) => m.plates);
  if (story.plates.length >= 5 && story.movements.length === 0) errs.push('A story of five plates or more is told in movements.');
  if (story.movements.length && (inMovements.length !== story.plates.length || new Set(inMovements).size !== inMovements.length || inMovements.some((k) => !keys.has(k)))) errs.push('Every plate belongs to exactly one movement.');
  for (const f of story.facts) if (!f.method.trim()) errs.push(`The fact "${f.key}" has no method.`);

  const nums = citable(story), prose = citableInProse(story);
  const machine: [string, string][] = [];
  const figureText: [string, string][] = [];
  story.ledger.forEach((l, i) => machine.push([`ledger ${i + 1}`, `${l.value} ${l.text}`]));
  for (const p of story.plates) {
    const at = `Plate "${p.name}"`;
    machine.push([`${at} headline`, p.headline], [`${at} paragraph`, p.body], [`${at} caption`, p.caption]);
    if (p.coda) machine.push([`${at} coda`, [p.coda.text, ...p.coda.figures.map((f) => `${f.value} ${f.text}`)].join(' ')]);
    if (editorText !== null && p.editorNote !== undefined && !wholeSentences(p.editorNote, editorText)) errs.push(`${at}: the margin note is not the editor’s words unchanged.`);
    if (!p.sources.length) errs.push(`${at}: no source.`);
    for (const s of p.sources) {
      if (!/^https:\/\//.test(s.url) || !s.licence.trim() || /^unknown$/i.test(s.licence) || !/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved)) errs.push(`${at}: the source "${s.dataset}" needs an https link, a licence and the day it was retrieved.`);
      if (s.via && (!/^https:\/\//.test(s.via.url) || !s.via.licence.trim())) errs.push(`${at}: the redistributor "${s.via.name}" needs an https link and its licence.`);
    }
    const f = p.figure;
    // Every label on the figure is the machine's too: its figures are traced like the paragraph's.
    const labels: [string, string][] = [];
    stringsIn(f, `${at} figure`, labels);
    figureText.push(...labels);
    if (f.form === 'lines') {
      for (const panel of f.panels) {
        if (panel.y.domain[0] !== 0 && !/not (at )?zero/i.test(p.caption)) errs.push(`${at}: the scale does not start at zero, and the caption must say so.`);
        for (const s of panel.series) {
          if (!sorted(s.points) || !finite(s.points)) errs.push(`${at}: the series "${s.key}" must be finite and in order.`);
          if (s.projectedFrom !== undefined && f.seam === undefined) errs.push(`${at}: a projected series needs the seam.`);
          if (s.range) {
            if (f.seam === undefined || s.range.lo95.some(([x]) => x < f.seam!)) errs.push(`${at}: a range belongs after the seam.`);
            for (const [x, a] of s.range.lo95) {
              const b = yOf(s.range.lo80, x), c = yOf(s.range.hi80, x), d = yOf(s.range.hi95, x);
              if (b === undefined || c === undefined || d === undefined || !(a <= b && b <= c && c <= d)) { errs.push(`${at}: the range of "${s.key}" is out of order at ${x}.`); break; }
            }
          }
        }
      }
    } else if (f.form === 'swarm') {
      if (f.items.some((i) => !(i.weight > 0))) errs.push(`${at}: every member needs a weight above zero.`);
      if (f.items.some((i) => typeof i.at === 'number' && (i.state === 'projected') !== i.at > f.seam)) errs.push(`${at}: projected members sit after the seam, estimated ones before it.`);
    } else if (f.form === 'stack') {
      const xs = f.layers[0]?.points.map(([x]) => x) ?? [];
      for (const x of xs) {
        const tot = f.layers.reduce((a, l) => a + (yOf(l.points, x) ?? NaN), 0);
        if (!(Math.abs(tot - 100) <= 0.6)) { errs.push(`${at}: the layers must add to 100 at every x (${tot.toFixed(1)} at ${x}).`); break; }
      }
      if (f.layers.some((l) => l.points.some(([, v]) => v < 0))) errs.push(`${at}: a share cannot be negative.`);
      for (const x of [...(f.labelAt ?? []), ...(f.phoneLabelAt ?? [])]) if (f.layers.some((l) => yOf(l.points, x) === undefined)) errs.push(`${at}: the shares are labelled at ${x}, a year the layers do not hold.`);
    } else if (f.form === 'bars') {
      if (f.x.domain[0] !== 0 || f.bars.some((b) => !(b.value >= 0))) errs.push(`${at}: bars start at zero and are never negative.`);
    } else if (f.form === 'bump') {
      const years = new Set(f.lines.flatMap((l) => l.ranks.map(([y]) => y)));
      for (const y of years) {
        const ranks = f.lines.map((l) => yOf(l.ranks, y)).filter((r): r is number => r !== undefined).sort((a, b) => a - b);
        if (ranks.some((r, i) => r !== i + 1)) { errs.push(`${at}: the ranks in ${y} are not 1 to ${ranks.length}.`); break; }
      }
    } else if (f.form === 'slope' || f.form === 'dumbbell') {
      const vals = f.form === 'slope' ? f.members.flatMap((m) => [m.from, m.to]) : f.rows.flatMap((r) => [r.from, r.to]);
      if (vals.some((v) => !Number.isFinite(v))) errs.push(`${at}: every value must be a number.`);
    } else if (f.form === 'heatmap' || f.form === 'map') {
      const b = f.form === 'map' ? f.bins : { width: f.step, perSide: f.perSide };
      if (!(b.width > 0) || b.perSide < 1 || b.perSide > 5) errs.push(`${at}: the ramp needs a positive bin width and one to five bins a side.`);
    } else if (f.form === 'pyramid') {
      const n = f.groups.length;
      if ([f.solid.left, f.solid.right, f.outline.left, f.outline.right].some((a) => a.length !== n || a.some((v) => !(v >= 0)))) errs.push(`${at}: every age group needs a count of zero or more on both sides, in both years.`);
    }
  }
  for (const [where, text] of figureText) {
    const bad = untraced(text, nums);
    if (bad.length) errs.push(`${where}: ${bad.join(', ')} is not in the rows or the facts.`);
  }
  for (const [where, text] of machine) {
    const bad = untraced(text, prose);
    if (bad.length) errs.push(`${where}: ${bad.join(', ')} is not a fact of the story.`);
    const style = checkStyle(text);
    for (const i of style.issues.filter((x) => x.severity === 'error')) errs.push(`${where}: ${i.message}`);
  }
  return errs;
}
