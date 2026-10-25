// Colour ramps for values (stripes, calendars, heatmaps): how a number becomes one of the ramp's
// steps, and the small key that prints those steps with their boundaries. The rule is stated so a
// reader can check any cell against the table:
//
// - sequential (9 steps, seq0 to seq8): equal-width bins of a round width (1, 1.2, 1.5, 2, 2.5, 3, 4,
//   5, 6 or 8 times a power of ten), starting at a round
//   number at or below the smallest value; a value on a boundary goes to the upper bin.
// - diverging (11 steps, div0 to div10): equal-width bins of a round width centred on the midpoint,
//   so div5 holds values within half a bin of it; the width is the smallest round width that keeps
//   the largest distance from the midpoint inside the outer bins. Beyond them a value is clamped.

import type { Paint, SceneNode } from './scene';
import type { Ctx } from './frame';
import { text } from './frame';
import { textWidth } from './text';
import { decimalsFor, formatNumber } from './scales';

export interface Ramp {
  kind: 'sequential' | 'diverging';
  /** Boundaries between steps (steps.length + 1 values, first and last are the outer edges). */
  edges: number[];
  steps: Paint[];
  step: number;
  midpoint?: { value: number; label: string };
  paint(v: number): Paint;
  /** The index of the step a value falls in. */
  index(v: number): number;
}

const ROUND = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/** The smallest round width (ROUND times a power of ten) at least w. */
export function roundUp(w: number): number {
  if (!(w > 0)) return 1;
  let p = 10 ** Math.floor(Math.log10(w));
  for (;;) {
    for (const m of ROUND) if (m * p >= w - 1e-12) return m * p;
    p *= 10;
  }
}

export function sequentialRamp(values: number[]): Ramp {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let step = roundUp((max - min) / 9 || 1);
  let lo = Math.floor(min / step) * step;
  while (lo + 9 * step <= max) {
    step = roundUp(step * 1.0001 + 1e-12);
    lo = Math.floor(min / step) * step;
  }
  const edges = Array.from({ length: 10 }, (_, i) => clean(lo + i * step, step));
  const steps = Array.from({ length: 9 }, (_, i) => `seq${i}` as Paint);
  const index = (v: number) => Math.max(0, Math.min(8, Math.floor((v - lo) / step + 1e-9)));
  return { kind: 'sequential', edges, steps, step, index, paint: (v) => steps[index(v)]! };
}

export function divergingRamp(values: number[], midpoint: { value: number; label: string }): Ramp {
  const m = midpoint.value;
  const far = Math.max(...values.map((v) => Math.abs(v - m)), 1e-9);
  // 11 bins of width w centred on m reach m ± 5.5w.
  const step = roundUp(far / 5.5);
  const edges = Array.from({ length: 12 }, (_, i) => clean(m + (i - 5.5) * step, step / 2));
  const steps = Array.from({ length: 11 }, (_, i) => `div${i}` as Paint);
  const index = (v: number) => Math.max(0, Math.min(10, Math.floor((v - m) / step + 5.5 + 1e-9)));
  return { kind: 'diverging', edges, steps, step, midpoint, index, paint: (v) => steps[index(v)]! };
}

const clean = (v: number, step: number) => Number(v.toFixed(Math.min(10, decimalsFor(step) + 1)));

/** The ramp the chart asks for (diverging needs options.midpoint; it defaults to zero, labelled "zero"). */
export function rampFor(ctx: Ctx, values: number[]): Ramp {
  if (ctx.colour === 'diverging') return divergingRamp(values, ctx.chart.options?.midpoint ?? { value: 0, label: 'zero' });
  return sequentialRamp(values);
}

/**
 * The key: the ramp's steps as a row of swatches with boundary values under them (in ink2), a
 * "no data" swatch when something is missing, and for a diverging ramp what its middle is.
 * Returns its nodes and its height. x, y is the top-left; it never runs wider than maxW.
 */
export function drawKey(ctx: Ctx, ramp: Ramp, x: number, y: number, maxW: number, opts: { unit?: string; missing?: boolean; align?: 'start' | 'end' } = {}): { nodes: SceneNode[]; height: number; width: number } {
  const size = ctx.s.small;
  const n = ramp.steps.length;
  const sw = Math.max(12, Math.min(ctx.narrow ? 22 : 26, (maxW - (opts.missing ? 60 : 0)) / n));
  const sh = 9;
  const keyW = sw * n;
  const missingW = opts.missing ? textWidth('No data', 'sans', size) + 14 + 12 : 0;
  const width = keyW + missingW;
  const x0 = opts.align === 'end' ? x + maxW - width : x;
  const nodes: SceneNode[] = [];
  ramp.steps.forEach((p, i) => nodes.push({ t: 'rect', x: x0 + i * sw, y, w: sw - 1, h: sh, fill: p }));
  const dec = decimalsFor(ramp.kind === 'diverging' ? ramp.step / 2 : ramp.step);
  const fmt = (v: number) => {
    const s = formatNumber(v, dec, ctx.grouping);
    return ramp.kind === 'diverging' && v > (ramp.midpoint?.value ?? 0) ? `+${s}` : s;
  };
  // Boundary labels: always the two outer edges, then inner edges wherever they fit without touching.
  const labels: Array<{ i: number; s: string }> = [];
  const endS = (i: number) => `${fmt(ramp.edges[i]!)}${i === n && opts.unit ? ` ${opts.unit}` : ''}`;
  const spans: Array<[number, number]> = [
    [x0, x0 + textWidth(endS(0), 'sans', size)],
    [x0 + n * sw - textWidth(endS(n), 'sans', size), x0 + n * sw],
  ];
  labels.push({ i: 0, s: fmt(ramp.edges[0]!) }, { i: n, s: fmt(ramp.edges[n]!) });
  for (let i = 1; i < n; i++) {
    const s = fmt(ramp.edges[i]!);
    const w = textWidth(s, 'sans', size);
    const a = x0 + i * sw - w / 2;
    const span: [number, number] = [a, a + w];
    if (spans.some(([l, r]) => span[0] < r + 6 && span[1] > l - 6)) continue;
    spans.push(span);
    labels.push({ i, s });
  }
  if (ramp.kind === 'diverging') {
    // For a diverging ramp, mark the middle step's centre (the midpoint) rather than inner edges.
    labels.length = 0;
    labels.push({ i: 0, s: fmt(ramp.edges[0]!) }, { i: n, s: fmt(ramp.edges[n]!) });
  }
  const ly = y + sh + size + 3;
  for (const l of labels) {
    const lx = x0 + l.i * sw - (l.i === n ? 1 : 0);
    nodes.push({ t: 'line', x1: lx + (l.i === 0 ? 0.5 : -0.5), x2: lx + (l.i === 0 ? 0.5 : -0.5), y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
    nodes.push(text(lx, ly, `${l.s}${l.i === n && opts.unit ? ` ${opts.unit}` : ''}`, 'sans', size, 'ink2', l.i === 0 ? 'start' : l.i === n ? 'end' : 'middle'));
  }
  let height = sh + size + 5;
  if (ramp.kind === 'diverging' && ramp.midpoint) {
    const mx = x0 + 5.5 * sw;
    nodes.push({ t: 'line', x1: mx, x2: mx, y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
    const mid = `${formatNumber(ramp.midpoint.value, decimalsFor(ramp.midpoint.value), ctx.grouping)} = ${ramp.midpoint.label}`;
    // The middle label goes under the key on its own line when it would touch the end labels.
    const endW = Math.max(textWidth(labels[0]!.s, 'sans', size), textWidth(`${labels[1]!.s} ${opts.unit ?? ''}`, 'sans', size));
    const midW = textWidth(mid, 'sans', size);
    if (midW / 2 + endW + 8 < keyW / 2) nodes.push(text(mx, ly, mid, 'sans', size, 'ink2', 'middle'));
    else {
      nodes.push(text(x0, ly + size + 3, mid, 'sans', size, 'ink2', 'start'));
      height += size + 3;
    }
  }
  if (opts.missing) {
    const mx = x0 + keyW + 12;
    nodes.push({ t: 'rect', x: mx + 0.5, y: y + 0.5, w: 12, h: sh - 1, stroke: 'rule', sw: 1 });
    nodes.push(text(mx + 16, y + sh - 0.5, 'No data', 'sans', size, 'ink2'));
  }
  return { nodes, height, width };
}
