// What the category forms share (bar, dot, dumbbell): rows in order, a label column that wraps
// rather than clips, and a value axis along the top with hairline gridlines down the rows.

import type { Cell } from '../types';
import type { Paint, SceneNode } from '../scene';
import { hline, text, vline, type Ctx } from '../frame';
import { textWidth, wrapText } from '../text';
import { decimalsFor, formatNumber, type Scale } from '../scales';

/** Rows sorted by a value, largest first, missing values last; or as given (options.sort = 'given'). */
export function orderRows(ctx: Ctx, rows: Cell[][], value: (r: Cell[]) => number | null): Cell[][] {
  if (ctx.chart.options?.sort === 'given') return rows;
  return rows
    .map((r, i) => ({ r, i, v: value(r) }))
    .sort((a, b) => (a.v === null ? (b.v === null ? a.i - b.i : 1) : b.v === null ? -1 : b.v - a.v || a.i - b.i))
    .map((x) => x.r);
}

export interface LabelColumn {
  width: number;
  lines: Map<string, string[]>;
  /** Most lines any label takes. */
  maxLines: number;
}

/** Category labels, wrapped to at most a share of the width (two lines, then three). */
export function labelColumn(ctx: Ctx, labels: string[], focus: (l: string) => boolean): LabelColumn {
  const cap = ctx.narrow ? 112 : 190;
  const lines = new Map<string, string[]>();
  let width = 0;
  for (const l of labels) {
    const face = focus(l) ? 'sansMedium' : 'sans';
    const full = textWidth(l, face, ctx.s.label);
    const ls = full <= cap ? [l] : wrapText(l, face, ctx.s.label, cap);
    lines.set(l, ls);
    width = Math.max(width, ...ls.map((s) => textWidth(s, face, ctx.s.label)));
  }
  return { width: Math.ceil(width), lines, maxLines: Math.max(1, ...[...lines.values()].map((l) => l.length)) };
}

/** The label at the left of a row, right-aligned against the plot, vertically centred on yc. */
export function drawRowLabel(ctx: Ctx, lines: string[], x: number, yc: number, focus: boolean): SceneNode[] {
  const lh = ctx.s.label * 1.18;
  const y0 = yc - ((lines.length - 1) * lh) / 2 + ctx.s.label * 0.35;
  return lines.map((s, i) => text(x, y0 + i * lh, s, focus ? 'sansMedium' : 'sans', ctx.s.label, 'ink', 'end'));
}

/**
 * Tick labels that agree with each other: plain grouped numbers below a million (or a lakh in
 * rupees), otherwise every tick in the same unit (m, bn; lakh, cr).
 */
export function axisLabels(ctx: Ctx, ticks: number[], step: number): string[] {
  const max = Math.max(...ticks.map((t) => Math.abs(t)));
  const units: Array<[number, string]> = ctx.grouping === 'indian' ? [[1e7, ' cr'], [1e5, ' lakh']] : [[1e12, 'tn'], [1e9, 'bn'], [1e6, 'm']];
  const u = units.find(([n]) => max >= n);
  const div = u ? u[0] : 1;
  const d = Math.min(3, decimalsFor(step / div));
  return ticks.map((t) => (t === 0 ? '0' : `${formatNumber(t / div, d, ctx.grouping)}${u ? u[1] : ''}`));
}

/** Tick labels above the plot and hairline gridlines down through the rows; zero in ink. */
export function drawValueAxisTop(ctx: Ctx, sx: Scale, ticks: number[], step: number, yTop: number, yBottom: number, unit?: string): SceneNode[] {
  const out: SceneNode[] = [];
  const labels = axisLabels(ctx, ticks, step);
  ticks.forEach((t, i) => {
    const x = Math.round(sx(t)) + 0.5;
    const zero = t === 0 && !sx.log;
    out.push(vline(x, yTop, yBottom, zero ? 'ink' : 'rule', 1));
    const last = i === ticks.length - 1;
    out.push(text(x, yTop - 6, `${labels[i]}${last && unit ? ` ${unit}` : ''}`, 'sans', ctx.s.tick, 'ink2', last && unit ? 'end' : 'middle'));
  });
  return out;
}

/** A key row: a mark drawn by `mark` then its name in ink, laid left to right; returns nodes and height. */
export function drawKey(ctx: Ctx, items: Array<{ name: string; mark: (x: number, y: number) => SceneNode[] }>, x0: number, y: number, maxX: number): { nodes: SceneNode[]; height: number } {
  const out: SceneNode[] = [];
  let x = x0;
  let row = 0;
  const lh = ctx.s.label + 8;
  for (const it of items) {
    const w = 16 + textWidth(it.name, 'sans', ctx.s.label) + 18;
    if (x > x0 && x + w > maxX) {
      x = x0;
      row++;
    }
    const yc = y + row * lh;
    out.push(...it.mark(x + 5, yc));
    out.push(text(x + 15, yc + ctx.s.label * 0.35, it.name, 'sans', ctx.s.label, 'ink'));
    x += w;
  }
  return { nodes: out, height: (row + 1) * lh };
}

/** A whisker from lo to hi with short end caps. */
export function whisker(x1: number, x2: number, y: number, paint: Paint, cap = 4): SceneNode[] {
  return [hline(x1, x2, y, paint, 1.25), { t: 'line', x1, x2: x1, y1: y - cap, y2: y + cap, stroke: paint, sw: 1.25 }, { t: 'line', x1: x2, x2, y1: y - cap, y2: y + cap, stroke: paint, sw: 1.25 }];
}
