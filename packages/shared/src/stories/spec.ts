// A data story, as data (docs/DATA-STORIES.md): the editor's title and words, the machine's words,
// the plates with their rows, and the facts code worked out from the rows. validateStory refuses one
// that breaks the grammar's honesty rules; drawing never sees an unchecked story.

import { figuresIn } from '../charts/figures';
import { checkStyle } from '../style';
import { EDITIONS, type Edition } from '../tokens';
import type { Pt } from './geom';

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
export interface LinesFigure { form: 'lines'; x: XAxis; seam?: number; panels: Panel[] }

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

export type Figure = LinesFigure | SwarmFigure | MultiplesFigure | StackFigure | PyramidFigure;

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

/** Every number a story's machine words may cite: its rows, its axes and rules, its facts. */
export function citable(story: Story): number[] {
  const nums = new Set<number>();
  const add = (v: number) => Number.isFinite(v) && nums.add(v);
  const pts = (p: Pt[]) => p.forEach(([x, y]) => (add(x), add(y)));
  for (const f of story.facts) add(f.value);
  for (const pl of story.plates) {
    const f = pl.figure;
    if (f.form === 'lines') {
      if (f.seam !== undefined) add(f.seam);
      for (const p of f.panels) {
        for (const s of p.series) { pts(s.points); if (s.range) Object.values(s.range).forEach(pts); }
        p.rules?.forEach((r) => add(r.y));
        p.zones?.forEach((z) => (add(z.from), add(z.to)));
      }
    } else if (f.form === 'swarm') {
      add(f.seam);
      f.items.forEach((i) => (typeof i.at === 'number' && add(i.at), add(i.weight)));
      if (f.step) pts(f.step.points);
    } else if (f.form === 'multiples') {
      f.panels.forEach((p) => pts(p.points));
      if (f.context) pts(f.context.points);
      if (f.rule) add(f.rule.y);
    } else if (f.form === 'stack') {
      f.layers.forEach((l) => pts(l.points));
    } else {
      f.groups.forEach((g) => add(g.start));
      [f.solid, f.outline].forEach((s) => [...s.left, ...s.right].forEach(add));
    }
  }
  return [...nums];
}

/** The figures in a machine line that match nothing citable (rounded no finer than written). */
export function untraced(text: string, nums: number[]): string[] {
  return figuresIn(text)
    .filter((f) => {
      const tol = 0.5 * 10 ** -f.decimals + 1e-9;
      // "67 per cent" and "67%" may cite a share stored as 0.67 or as 67.
      return !nums.some((v) => Math.abs(v - f.value) <= tol || Math.abs(v * 100 - f.value) <= tol);
    })
    .map((f) => f.text);
}

const sorted = (p: Pt[]) => p.every((q, i) => i === 0 || q[0] > p[i - 1]![0]);
const finite = (p: Pt[]) => p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
const yOf = (p: Pt[], x: number) => p.find((q) => q[0] === x)?.[1];

/**
 * Every rule the grammar holds a story to. `editorText` is the editor's stored text: his standfirst
 * and margin notes must be found in it unchanged. Returns problems; empty means it may be drawn.
 */
export function validateStory(story: Story, editorText: string): string[] {
  const errs: string[] = [];
  const keys = new Set(story.plates.map((p) => p.key));
  if (!story.title.trim()) errs.push('The story needs the editor’s title.');
  if (!EDITIONS.includes(story.edition)) errs.push(`Unknown edition "${story.edition}".`);
  if (!editorText.includes(story.standfirst)) errs.push('The standfirst is not the editor’s words unchanged.');
  if (story.plates.length < 3 || story.plates.length > 9) errs.push('A story has three to nine plates.');
  if (keys.size !== story.plates.length) errs.push('Plate keys must be unique.');
  if (story.plates.filter((p) => p.fold).length > 1) errs.push('At most one plate folds out.');
  const inMovements = story.movements.flatMap((m) => m.plates);
  if (story.plates.length >= 5 && story.movements.length === 0) errs.push('A story of five plates or more is told in movements.');
  if (story.movements.length && (inMovements.length !== story.plates.length || inMovements.some((k) => !keys.has(k)))) errs.push('Every plate belongs to exactly one movement.');
  for (const f of story.facts) if (!f.method.trim()) errs.push(`The fact "${f.key}" has no method.`);

  const nums = citable(story);
  const machine: [string, string][] = [];
  story.ledger.forEach((l, i) => machine.push([`ledger ${i + 1}`, `${l.value} ${l.text}`]));
  for (const p of story.plates) {
    const at = `Plate "${p.name}"`;
    machine.push([`${at} headline`, p.headline], [`${at} paragraph`, p.body], [`${at} caption`, p.caption]);
    if (p.coda) machine.push([`${at} coda`, [p.coda.text, ...p.coda.figures.map((f) => `${f.value} ${f.text}`)].join(' ')]);
    if (p.editorNote !== undefined && !editorText.includes(p.editorNote)) errs.push(`${at}: the margin note is not the editor’s words unchanged.`);
    if (!p.sources.length) errs.push(`${at}: no source.`);
    for (const s of p.sources) {
      if (!/^https:\/\//.test(s.url) || !s.licence.trim() || /^unknown$/i.test(s.licence) || !/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved)) errs.push(`${at}: the source "${s.dataset}" needs an https link, a licence and the day it was retrieved.`);
      if (s.via && (!/^https:\/\//.test(s.via.url) || !s.via.licence.trim())) errs.push(`${at}: the redistributor "${s.via.name}" needs an https link and its licence.`);
    }
    const f = p.figure;
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
        panel.notes?.forEach((n) => machine.push([`${at} note`, [...n.lines, ...(n.phone ?? [])].join(' ')]));
      }
    } else if (f.form === 'swarm') {
      if (f.items.some((i) => !(i.weight > 0))) errs.push(`${at}: every member needs a weight above zero.`);
      if (f.items.some((i) => typeof i.at === 'number' && (i.state === 'projected') !== i.at > f.seam)) errs.push(`${at}: projected members sit after the seam, estimated ones before it.`);
      f.step?.notes?.forEach((n) => machine.push([`${at} note`, n.lines.join(' ')]));
    } else if (f.form === 'stack') {
      const n0 = f.layers[0]?.points.length ?? 0;
      for (let i = 0; i < n0; i++) {
        const tot = f.layers.reduce((a, l) => a + (l.points[i]?.[1] ?? NaN), 0);
        if (!(Math.abs(tot - 100) <= 0.6)) { errs.push(`${at}: the layers must add to 100 at every point (${tot.toFixed(1)} at ${f.layers[0]!.points[i]![0]}).`); break; }
      }
      if (f.layers.some((l) => l.points.some(([, v]) => v < 0))) errs.push(`${at}: a share cannot be negative.`);
    } else if (f.form === 'pyramid') {
      const n = f.groups.length;
      if ([f.solid.left, f.solid.right, f.outline.left, f.outline.right].some((a) => a.length !== n || a.some((v) => !(v >= 0)))) errs.push(`${at}: every age group needs a count of zero or more on both sides, in both years.`);
    }
  }
  for (const [where, text] of machine) {
    const bad = untraced(text, nums);
    if (bad.length) errs.push(`${where}: ${bad.join(', ')} is not in the rows or the facts.`);
    const style = checkStyle(text);
    for (const i of style.issues.filter((x) => x.severity === 'error')) errs.push(`${where}: ${i.message}`);
  }
  return errs;
}
