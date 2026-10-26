// What every form shares: the layout sizes, reading the rows by role, colours by series, the axes,
// direct labels that keep apart, and the annotation layer. The house look lives here: hairline
// gridlines, tick labels in quiet sans, an ink baseline at zero, labels on the lines, not in a legend.

import type { Chart, ChartColumn, ChartForm, ChartRole, Cell, Annotation } from './types';
import { FORMS } from './types';
import type { Paint, SceneNode } from './scene';
import type { ChartFace } from './metrics';
import { textWidth, wrapText } from './text';
import { isRupees } from './glosses';
import { decimalYear, dayNumber, decimalsFor, formatCompact, formatNumber, type Grouping, type Scale } from './scales';

export type Layout = 'wide' | 'narrow';

/** Drawing widths: the website's wide figure (column and air) and the phone figure (also the app's PNG). */
export const LAYOUT_WIDTH: Record<Layout, number> = { wide: 720, narrow: 375 };

export interface Sizes {
  tick: number;
  label: number;
  note: number;
  small: number;
}

export const SIZES: Record<Layout, Sizes> = {
  wide: { tick: 12, label: 13, note: 14.5, small: 11.5 },
  narrow: { tick: 11.5, label: 12.5, note: 14, small: 11 },
};

export class Ctx {
  readonly chart: Chart;
  readonly layout: Layout;
  readonly W: number;
  readonly s: Sizes;
  readonly narrow: boolean;
  readonly grouping: Grouping;
  private idx: Partial<Record<ChartRole, number>> = {};

  constructor(chart: Chart, layout: Layout) {
    this.chart = chart;
    this.layout = layout;
    this.W = LAYOUT_WIDTH[layout];
    this.s = SIZES[layout];
    this.narrow = layout === 'narrow';
    this.grouping = isRupees(chart) ? 'indian' : 'international';
    for (const [role, key] of Object.entries(chart.encode)) {
      const i = chart.data.columns.findIndex((c) => c.key === key);
      if (i >= 0) this.idx[role as ChartRole] = i;
    }
  }

  get form(): ChartForm {
    return this.chart.form;
  }
  has(role: ChartRole): boolean {
    return this.idx[role] !== undefined;
  }
  column(role: ChartRole): ChartColumn | undefined {
    const i = this.idx[role];
    return i === undefined ? undefined : this.chart.data.columns[i];
  }
  cell(row: Cell[], role: ChartRole): Cell {
    const i = this.idx[role];
    return i === undefined ? null : (row[i] ?? null);
  }
  num(row: Cell[], role: ChartRole): number | null {
    const v = this.cell(row, role);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  str(row: Cell[], role: ChartRole): string {
    const v = this.cell(row, role);
    return v === null ? '' : String(v);
  }
  /** An x value on a continuous axis: years as numbers, dates as decimal years. */
  xval(row: Cell[], role: ChartRole = 'x'): number | null {
    return timeValue(this.cell(row, role), this.column(role)?.type);
  }
  get rows(): Cell[][] {
    return this.chart.data.rows;
  }
  /** Distinct values of a text role, in the order they first appear (so a colour follows its entity). */
  groups(role: ChartRole): string[] {
    const seen = new Set<string>();
    for (const r of this.rows) {
      const v = this.cell(r, role);
      if (v !== null && v !== '') seen.add(String(v));
    }
    return [...seen];
  }
  /** The loud series: the editor's focus, else the only one. */
  isFocus(name: string, all: string[]): boolean {
    const f = this.chart.options?.focus;
    if (f?.length) return f.includes(name);
    return all.length === 1;
  }
  get colour() {
    return this.chart.options?.colour ?? FORMS[this.form].colours[0]!;
  }
  /** A series' paint: categorical in fixed order, or the edition's ink for the focus and quiet grey for the rest. */
  paintFor(name: string, all: string[]): Paint {
    if (this.colour === 'categorical') return `cat${Math.min(5, all.indexOf(name)) as 0}` as Paint;
    const f = this.chart.options?.focus;
    if (!f?.length) return all.length <= 1 ? 'ed' : 'ink';
    return f.includes(name) ? 'ed' : 'quiet';
  }
  fmt(v: number, step: number): string {
    return formatCompact(v, step, this.grouping);
  }
  /** A value as a label prints it, with the decimals the data carries (at most 2 more than the ticks). */
  value(v: number, decimals?: number): string {
    // The data's decimals are read once per chart; labels are many.
    this.dec ??= valueDecimals(this.rows, this);
    return formatNumber(v, decimals ?? this.dec, this.grouping);
  }
  private dec?: number;
}


/** The decimals the data's numbers carry (up to 2), so labels never claim more precision than the rows. */
export function valueDecimals(rows: Cell[][], ctx: Ctx, roles: ChartRole[] = ['y', 'from', 'to']): number {
  let d = 0;
  for (const r of rows.slice(0, 2000)) {
    for (const role of roles) {
      const v = ctx.num(r, role);
      if (v === null || Number.isInteger(v)) continue;
      if (d === 2) return d;
      const s = String(v);
      const k = s.includes('e') ? 2 : (s.split('.')[1]?.length ?? 0);
      d = Math.max(d, Math.min(2, k));
    }
  }
  return d;
}

export { isRupees };

export function timeValue(v: Cell, type?: string): number | null {
  if (v === null || v === '') return null;
  if (type === 'date' && typeof v === 'string') {
    const y = decimalYear(v);
    return Number.isFinite(y) ? y : null;
  }
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** An annotation's x as a number on the chart's x axis. */
export function annotX(v: Cell, ctx: Ctx, role: ChartRole = 'x'): number | null {
  const t = ctx.column(role)?.type;
  if (t === 'date' && typeof v === 'string' && /^\d{4}$/.test(v)) return Number(v);
  return timeValue(v, t);
}

export { dayNumber };

// ---------------------------------------------------------------- shapes

export const text = (x: number, y: number, s: string, face: ChartFace, size: number, fill: Paint, anchor?: 'start' | 'middle' | 'end'): SceneNode => ({ t: 'text', x, y, text: s, face, size, fill, ...(anchor ? { anchor } : {}) });
/** A label with a halo of the ground under its letters, for text set over gridlines or marks. */
export const halo = (x: number, y: number, s: string, face: ChartFace, size: number, fill: Paint, anchor?: 'start' | 'middle' | 'end'): SceneNode => ({ ...(text(x, y, s, face, size, fill, anchor) as Extract<SceneNode, { t: 'text' }>), stroke: 'bg', sw: 3 });
export const hline = (x1: number, x2: number, y: number, stroke: Paint, sw = 1): SceneNode => ({ t: 'line', x1, x2, y1: y, y2: y, stroke, sw });
export const vline = (x: number, y1: number, y2: number, stroke: Paint, sw = 1): SceneNode => ({ t: 'line', x1: x, x2: x, y1, y2, stroke, sw });

/** A polyline as a path, broken wherever a point is missing. */
export function linePath(points: Array<[number, number] | null>): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    pen = true;
  }
  return d;
}

/** A closed band between a lower and an upper line (both in x order), broken at gaps. */
export function bandPath(lower: Array<[number, number] | null>, upper: Array<[number, number] | null>): string {
  const parts: string[] = [];
  let run: Array<[[number, number], [number, number]]> = [];
  const flush = () => {
    if (run.length > 1) {
      const top = run.map(([, u]) => u);
      const bot = run.map(([l]) => l).reverse();
      parts.push(`M${[...top, ...bot].map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L')}Z`);
    }
    run = [];
  };
  for (let i = 0; i < lower.length; i++) {
    const l = lower[i];
    const u = upper[i];
    if (l && u) run.push([l, u]);
    else flush();
  }
  flush();
  return parts.join('');
}

/**
 * Break a series wherever the step between points is more than one and a half times the usual
 * step, so a missing year is drawn as missing, never bridged.
 */
export function withGaps<T extends { x: number; y: number | null }>(pts: T[]): Array<T | null> {
  const xs = pts.filter((p) => p.y !== null).map((p) => p.x);
  const diffs = xs.slice(1).map((x, i) => x - xs[i]!).filter((d) => d > 0).sort((a, b) => a - b);
  const usual = diffs.length ? diffs[Math.floor((diffs.length - 1) / 2)]! : Infinity;
  const out: Array<T | null> = [];
  let prev: T | null = null;
  for (const p of pts) {
    if (p.y === null) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev && p.x - prev.x > usual * 1.5) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

/** True when a series has values missing (null cells, or steps longer than the usual one). */
export function hasGaps(pts: Array<{ x: number; y: number | null }>): boolean {
  return withGaps(pts).some((p) => p === null);
}

// ---------------------------------------------------------------- axes

export interface YAxis {
  scale: Scale;
  ticks: number[];
  step: number;
}

/** Gridlines across the plot with tick labels in the left margin; zero in ink. */
export function drawYAxis(ctx: Ctx, ax: YAxis, x0: number, x1: number, opts: { unit?: string; labelX?: number } = {}): SceneNode[] {
  const out: SceneNode[] = [];
  const lx = opts.labelX ?? x0 - 8;
  ax.ticks.forEach((t, i) => {
    const y = ax.scale(t);
    const zero = t === 0 && !ax.scale.log;
    out.push(hline(x0, x1, Math.round(y) + 0.5, zero ? 'ink' : 'rule', zero ? 1 : 1));
    const last = i === ax.ticks.length - 1;
    const lab = `${ctx.fmt(t, ax.step)}${last && opts.unit ? ` ${opts.unit}` : ''}`;
    out.push(text(lx, y + ctx.s.tick * 0.36, lab, 'sans', ctx.s.tick, 'ink2', 'end'));
  });
  return out;
}

export function yLabelWidth(ctx: Ctx, ax: YAxis, unit?: string): number {
  return Math.max(...ax.ticks.map((t, i) => textWidth(`${ctx.fmt(t, ax.step)}${i === ax.ticks.length - 1 && unit ? ` ${unit}` : ''}`, 'sans', ctx.s.tick)));
}

/** Year ticks under the plot, with a short tick mark at each. */
export function drawXYears(ctx: Ctx, scale: Scale, ticks: number[], y: number, label: (v: number) => string = (v) => String(v)): SceneNode[] {
  const out: SceneNode[] = [];
  for (const t of ticks) {
    const x = scale(t);
    out.push(vline(Math.round(x) + 0.5, y, y + 4, 'ink2'));
    out.push(text(x, y + 6 + ctx.s.tick, label(t), 'sans', ctx.s.tick, 'ink2', 'middle'));
  }
  return out;
}

/** A short unit to put on the top tick ("°C", "%"), or nothing when the units are long. */
export function shortUnit(units: string): string | undefined {
  const u = units.trim();
  return u.length <= 4 ? u : undefined;
}

// ---------------------------------------------------------------- direct labels

export interface LabelIn {
  y: number;
  text: string;
  face?: ChartFace;
  /** The mark's own y, for a leader when the label had to move. */
  anchorY?: number;
}

/** Spread labels vertically so none overlap (keeps their order), within [top, bottom]. */
export function spread(labels: LabelIn[], gap: number, top: number, bottom: number): number[] {
  const order = labels.map((l, i) => ({ i, y: l.y })).sort((a, b) => a.y - b.y);
  const ys = order.map((o) => o.y);
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let k = 1; k < ys.length; k++) {
      const d = ys[k]! - ys[k - 1]!;
      if (d < gap) {
        const push = (gap - d) / 2;
        ys[k - 1]! -= push;
        ys[k]! += push;
        moved = true;
      }
    }
    for (let k = 0; k < ys.length; k++) ys[k] = Math.max(top, Math.min(bottom, ys[k]!));
    for (let k = 1; k < ys.length; k++) if (ys[k]! < ys[k - 1]! + gap - 0.01 && ys[k - 1]! + gap <= bottom) ys[k] = ys[k - 1]! + gap;
    for (let k = ys.length - 2; k >= 0; k--) if (ys[k]! > ys[k + 1]! - gap + 0.01) ys[k] = ys[k + 1]! - gap;
    if (!moved) break;
  }
  const out = new Array<number>(labels.length);
  order.forEach((o, k) => (out[o.i] = ys[k]!));
  return out;
}

// ---------------------------------------------------------------- annotations

export interface AnnotFrame {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Position of an annotation's x (or null when it is off the chart). */
  sx: (v: Cell) => number | null;
  /** The plotted points in px, so labels can be set where the data is not. */
  marks?: Array<[number, number]>;
  /** The data point an annotation points at: its y in px, looked up from the rows. */
  /** The data point an annotation points at (r: the mark's own radius, when it is bigger than a dot). */
  point?: (a: Extract<Annotation, { kind: 'point' }>) => { x: number; y: number; r?: number } | null;
  sy?: Scale;
}

const authorFace = (by: 'editor' | 'machine'): ChartFace => (by === 'editor' ? 'serifItalic' : 'sans');
const authorPaint = (by: 'editor' | 'machine'): Paint => (by === 'editor' ? 'ink' : 'mach');

/** Shaded periods go under the data; draw them first. */
export function drawPeriods(ctx: Ctx, f: AnnotFrame): SceneNode[] {
  const out: SceneNode[] = [];
  for (const a of ctx.chart.annotations ?? []) {
    if (a.kind !== 'period') continue;
    const xa = f.sx(a.from);
    const xb = f.sx(a.to);
    if (xa === null || xb === null) continue;
    let l = Math.max(f.x0, Math.min(xa, xb));
    let r = Math.min(f.x1, Math.max(xa, xb));
    if (r < l) continue;
    // A period of one year (or one day) is still a period: give it a visible width around its point.
    if (r - l < 3) ((l = (l + r) / 2 - 1.5), (r = l + 3));
    out.push({ t: 'rect', x: l, y: f.y0, w: r - l, h: f.y1 - f.y0, fill: 'plate' });
    const size = a.by === 'editor' ? ctx.s.note - 1.5 : ctx.s.small;
    const lines = wrapText(a.text, authorFace(a.by), size, Math.max(60, Math.min(150, r - l + 80)));
    const anchorRight = l + 4 + Math.max(...lines.map((s) => textWidth(s, authorFace(a.by), size))) > f.x1;
    lines.forEach((s, i) => out.push(text(anchorRight ? r - 4 : l + 4, f.y0 + size + 2 + i * (size + 2), s, authorFace(a.by), size, authorPaint(a.by), anchorRight ? 'end' : 'start')));
  }
  return out;
}

/** Reference rules and callouts go over the data. Callouts sit clear of the point, with a short leader. */
export function drawCallouts(ctx: Ctx, f: AnnotFrame, avoid: Array<{ x: number; y: number; w: number; h: number }> = []): SceneNode[] {
  const out: SceneNode[] = [];
  const taken = [...avoid];
  for (const a of ctx.chart.annotations ?? []) {
    const face = authorFace(a.by);
    const paint = authorPaint(a.by);
    const size = a.by === 'editor' ? ctx.s.note : ctx.s.small + 0.5;
    const lh = size * 1.22;
    if (a.kind === 'rule') {
      if (a.axis === 'y' && f.sy && typeof a.value === 'number') {
        const y = f.sy(a.value);
        if (y < f.y0 - 1 || y > f.y1 + 1) continue;
        out.push(hline(f.x0, f.x1, y, 'ink2', 1));
        const lines = wrapText(a.text, face, size, ctx.narrow ? 150 : 220);
        const w = Math.max(...lines.map((s) => textWidth(s, face, size)));
        const h = lines.length * lh + 6;
        // Set the label at whichever end of the rule has less data under it (above the rule, else below).
        const crowd = (l: number, r: number, t: number, b: number) => (f.marks ?? []).filter(([mx, my]) => mx >= l && mx <= r && my >= t && my <= b).length;
        const opts = [
          { x: f.x0 + 2, anchor: 'start' as const, above: true },
          { x: f.x1, anchor: 'end' as const, above: true },
          { x: f.x0 + 2, anchor: 'start' as const, above: false },
          { x: f.x1, anchor: 'end' as const, above: false },
        ].map((o) => {
          const l = o.anchor === 'start' ? o.x : o.x - w;
          const t = o.above ? y - h : y;
          return { ...o, n: crowd(l - 4, l + w + 4, t, t + h) + (t < f.y0 - 4 || t + h > f.y1 + 4 ? 1000 : 0) };
        });
        const best = opts.reduce((a2, b2) => (b2.n < a2.n ? b2 : a2));
        taken.push({ x: best.anchor === 'start' ? best.x : best.x - w, y: best.above ? y - h : y, w, h });
        lines.forEach((s, i) => out.push(halo(best.x, best.above ? y - 5 - (lines.length - 1 - i) * lh : y + size + 3 + i * lh, s, face, size, paint, best.anchor)));
      } else if (a.axis === 'x') {
        const x = f.sx(a.value);
        if (x === null || x < f.x0 || x > f.x1) continue;
        out.push(vline(x, f.y0, f.y1, 'ink2', 1));
        const lines = wrapText(a.text, face, size, ctx.narrow ? 110 : 160);
        const right = x + 6 + Math.max(...lines.map((s) => textWidth(s, face, size))) <= f.x1;
        lines.forEach((s, i) => out.push(halo(right ? x + 5 : x - 5, f.y0 + size + i * lh, s, face, size, paint, right ? 'start' : 'end')));
      }
      continue;
    }
    if (a.kind !== 'point' || !f.point) continue;
    const p = f.point(a);
    if (!p) continue;
    const maxW = ctx.narrow ? 124 : 176;
    const lines = wrapText(a.text, face, size, maxW);
    const w = Math.max(...lines.map((s) => textWidth(s, face, size)));
    const h = lines.length * lh;
    const ring = Math.max(4.5, (p.r ?? 0) + 3);
    // Spots around the point, in eight directions at two distances: the text keeps a clear gap from
    // its ring, stays inside the plot, and covers no mark and no other label. A short leader joins them.
    const cands: Array<{ bx: number; by: number; dx: number; dy: number; d: number }> = [];
    for (const d of [ring + 16, ring + 34]) {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const bx = dx < 0 ? p.x - d * (dy ? 0.72 : 1) - w : dx > 0 ? p.x + d * (dy ? 0.72 : 1) : p.x - w / 2;
        const by = dy < 0 ? p.y - d * (dx ? 0.72 : 1) - h : dy > 0 ? p.y + d * (dx ? 0.72 : 1) : p.y - h / 2;
        cands.push({ bx, by, dx, dy, d });
      }
    }
    const score = (c: { bx: number; by: number; d: number }) => {
      let s = c.d > ring + 20 ? 3 : 0;
      if (c.bx < f.x0 - 30 || c.bx + w > f.x1 + 30 || c.bx < 0 || c.bx + w > ctx.W) s += 1000;
      if (c.by < f.y0 - 20 || c.by + h > f.y1 + 6) s += 500;
      for (const t of taken) if (c.bx - 4 < t.x + t.w && c.bx + w + 4 > t.x && c.by - 4 < t.y + t.h && c.by + h + 4 > t.y) s += 100;
      for (const [mx, my] of f.marks ?? []) if (mx >= c.bx - 5 && mx <= c.bx + w + 5 && my >= c.by - 5 && my <= c.by + h + 5) s += 8;
      return s;
    };
    const best = cands.reduce((a2, b2) => (score(b2) < score(a2) ? b2 : a2));
    taken.push({ x: best.bx, y: best.by, w, h });
    out.push({ t: 'circle', cx: p.x, cy: p.y, r: ring, stroke: 'ink', sw: 1.25 });
    // The leader: from the ring's edge towards the nearest point of the text block, stopping short of it.
    const tx = Math.max(best.bx, Math.min(p.x, best.bx + w));
    const ty = Math.max(best.by, Math.min(p.y, best.by + h));
    const len = Math.hypot(tx - p.x, ty - p.y) || 1;
    const ux = (tx - p.x) / len;
    const uy = (ty - p.y) / len;
    if (len > ring + 6) out.push({ t: 'line', x1: p.x + ux * ring, y1: p.y + uy * ring, x2: tx - ux * 3, y2: ty - uy * 3, stroke: 'ink', sw: 0.75 });
    const anchor = best.dx < 0 ? 'end' : best.dx > 0 ? 'start' : 'middle';
    const ax = anchor === 'end' ? best.bx + w : anchor === 'start' ? best.bx : best.bx + w / 2;
    lines.forEach((s, i) => out.push(halo(ax, best.by + size * 0.8 + i * lh, s, face, size, paint, anchor)));
  }
  return out;
}
