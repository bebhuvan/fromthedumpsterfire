// Colour ramps for values (stripes, calendars, heatmaps): how a number becomes one of the ramp's
// steps, and the small key that prints those steps with their boundaries. The rule is stated so a
// reader can check any cell against the table:
//
// - sequential (7 steps, seq0 to seq6, or heat0 to heat6 for temperatures): equal-width bins of a
//   round width (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten), starting at a round
//   number at or below the smallest value; a value on a boundary goes to the upper bin. A share in
//   per cent ends its top bin at 100.
// - diverging (11 steps, div0 to div10): equal-width bins centred on the midpoint, so div5 holds the
//   values within half a bin of it. The width is a round width (as above), the smallest that keeps
//   95 per cent of the values inside the nine inner bins.
//   When the rest reach past the outer edges, the two end bins are open: they hold everything beyond
//   their inner edge, and the key draws them as pointed ends, as an atlas does. Otherwise the end bins
//   are closed at the midpoint plus or minus five and a half widths. One outlier no longer flattens
//   every other value into the three middle steps.
// - continuous diverging (warming stripes): the fine ramp (dv0 to dv40) spread evenly from the
//   midpoint minus a round reach to the midpoint plus it, the reach being the smallest round number
//   at or past the largest distance from the midpoint. Each value takes the nearest of the 41 steps,
//   so every year is its own shade.

import { FINE_STEPS, type Paint, type SceneNode } from './scene';
import type { Ctx } from './frame';
import { text } from './frame';
import { textWidth } from './text';
import { decimalsFor, formatNumber } from './scales';

export interface Ramp {
  kind: 'sequential' | 'diverging' | 'continuous';
  /** Boundaries between steps (steps.length + 1 values, first and last are the outer edges). */
  edges: number[];
  steps: Paint[];
  step: number;
  midpoint?: { value: number; label: string };
  /** Diverging only: the end bins hold everything past their inner edge. */
  open?: boolean;
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

const SEQ = 7;

export function sequentialRamp(values: number[], ramp: 'seq' | 'heat' = 'seq', ceiling?: number): Ramp {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let step = roundUp((max - min) / SEQ || 1);
  let lo = Math.floor(min / step) * step;
  while (lo + SEQ * step <= max) {
    step = roundUp(step * 1.0001 + 1e-12);
    lo = Math.floor(min / step) * step;
  }
  const edges = Array.from({ length: SEQ + 1 }, (_, i) => clean(lo + i * step, step));
  // A share in per cent cannot pass 100: the top band ends there rather than at 105.
  if (ceiling !== undefined && edges[SEQ]! > ceiling && max <= ceiling) edges[SEQ] = ceiling;
  const steps = Array.from({ length: SEQ }, (_, i) => `${ramp}${i}` as Paint);
  const index = (v: number) => Math.max(0, Math.min(SEQ - 1, Math.floor((v - lo) / step + 1e-9)));
  return { kind: 'sequential', edges, steps, step, index, paint: (v) => steps[index(v)]! };
}

/** The continuous diverging ramp for warming stripes: 41 fine steps over midpoint ± a round reach. */
export function continuousRamp(values: number[], midpoint: { value: number; label: string }): Ramp {
  const m = midpoint.value;
  const far = Math.max(...values.map((v) => Math.abs(v - m)), 1e-9);
  const reach = roundUp(far);
  const n = FINE_STEPS - 1;
  const steps = Array.from({ length: FINE_STEPS }, (_, i) => `dv${i}` as Paint);
  const index = (v: number) => Math.max(0, Math.min(n, Math.round(((v - m) / reach + 1) * (n / 2))));
  return { kind: 'continuous', edges: [clean(m - reach, reach / 10), clean(m + reach, reach / 10)], steps, step: reach, midpoint, index, paint: (v) => steps[index(v)]! };
}

export function divergingRamp(values: number[], midpoint: { value: number; label: string }): Ramp {
  const m = midpoint.value;
  const dev = values.map((v) => Math.abs(v - m)).sort((a, b) => a - b);
  const far = Math.max(dev[dev.length - 1] ?? 0, 1e-9);
  const bulk = Math.max(dev[Math.min(dev.length - 1, Math.ceil(dev.length * 0.95) - 1)] ?? 0, 1e-9);
  // Nine inner bins of width w reach m ± 4.5w; the two end bins reach m ± 5.5w, or past it when open.
  const step = roundUp(bulk / 4.5);
  const open = far > 5.5 * step + 1e-9;
  const edges = Array.from({ length: 12 }, (_, i) => clean(m + (i - 5.5) * step, step / 2));
  const steps = Array.from({ length: 11 }, (_, i) => `div${i}` as Paint);
  const index = (v: number) => Math.max(0, Math.min(10, Math.floor((v - m) / step + 5.5 + 1e-9)));
  return { kind: 'diverging', edges, steps, step, midpoint, open, index, paint: (v) => steps[index(v)]! };
}

const clean = (v: number, step: number) => Number(v.toFixed(Math.min(10, decimalsFor(step) + 1)));

/** The ramp the chart asks for (diverging needs options.midpoint; it defaults to zero, labelled "zero"). */
export function rampFor(ctx: Ctx, values: number[]): Ramp {
  if (ctx.colour === 'diverging') return divergingRamp(values, ctx.chart.options?.midpoint ?? { value: 0, label: 'zero' });
  const pct = ctx.chart.measure?.basis === 'share' && /^%/.test(ctx.chart.units.trim());
  return sequentialRamp(values, ctx.colour === 'heat' ? 'heat' : 'seq', pct ? 100 : undefined);
}

/**
 * The key: the ramp's steps as a row of swatches with boundary values under them (in ink2), a
 * "no data" swatch when something is missing, and for a diverging ramp what its middle is.
 * Returns its nodes and its height. x, y is the top-left; it never runs wider than maxW.
 */
export function drawKey(ctx: Ctx, ramp: Ramp, x: number, y: number, maxW: number, opts: { unit?: string; missing?: boolean; align?: 'start' | 'end'; missingPaint?: Paint } = {}): { nodes: SceneNode[]; height: number; width: number } {
  const size = ctx.s.small;
  if (ramp.kind === 'continuous') return drawContinuousKey(ctx, ramp, x, y, maxW, opts);
  const n = ramp.steps.length;
  const sw = Math.max(12, Math.min(ctx.narrow ? 22 : 26, (maxW - (opts.missing ? 60 : 0)) / n));
  const sh = 9;
  const keyW = sw * n;
  const missingW = opts.missing ? textWidth('No data', 'sans', size) + 14 + 12 : 0;
  const width = keyW + missingW;
  const x0 = opts.align === 'end' ? x + maxW - width : x;
  const nodes: SceneNode[] = [];
  ramp.steps.forEach((p, i) => {
    // An open end bin is drawn as a point: it holds everything beyond its inner edge.
    if (ramp.open && (i === 0 || i === n - 1)) {
      const [a, b] = i === 0 ? [x0 + sw - 1, x0] : [x0 + i * sw, x0 + (i + 1) * sw - 1];
      nodes.push({ t: 'path', d: `M${a.toFixed(2)},${y}L${b.toFixed(2)},${(y + sh / 2).toFixed(2)}L${a.toFixed(2)},${y + sh}Z`, fill: p });
    } else nodes.push({ t: 'rect', x: x0 + i * sw, y, w: sw - 1, h: sh, fill: p });
  });
  const dec = decimalsFor(ramp.kind === 'diverging' ? ramp.step / 2 : ramp.step);
  const fmt = (v: number) => {
    const s = formatNumber(v, dec, ctx.grouping);
    return ramp.kind === 'diverging' && (ramp.midpoint?.value ?? 0) === 0 && v > 0 ? `+${s}` : s;
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
    // For a diverging ramp: its two ends (or, when the ends are open, the edges where they begin)
    // and the midpoint, rather than every inner edge.
    labels.length = 0;
    const [a, b] = ramp.open ? [1, n - 1] : [0, n];
    labels.push({ i: a, s: fmt(ramp.edges[a]!) }, { i: b, s: fmt(ramp.edges[b]!) });
  }
  const ly = y + sh + size + 3;
  const lastI = Math.max(...labels.map((l) => l.i));
  for (const l of labels) {
    const lx = x0 + l.i * sw - (l.i === n ? 1 : l.i === 0 ? 0 : 0.5);
    const s = `${l.s}${l.i === lastI && opts.unit ? ` ${opts.unit}` : ''}`;
    nodes.push({ t: 'line', x1: lx + (l.i === 0 ? 0.5 : -0.5), x2: lx + (l.i === 0 ? 0.5 : -0.5), y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
    const w = textWidth(s, 'sans', size);
    // Inner edge labels are centred on their tick, but never past the key's own ends.
    const anchor = l.i === 0 || (l.i !== n && lx - w / 2 < x0) ? 'start' : l.i === n || lx + w / 2 > x0 + keyW ? 'end' : 'middle';
    nodes.push(text(anchor === 'start' && l.i !== 0 ? Math.max(x0, lx - w / 2) : anchor === 'end' && l.i !== n ? Math.min(x0 + keyW, lx + w / 2) : lx, ly, s, 'sans', size, 'ink2', anchor));
  }
  let height = sh + size + 5;
  if (ramp.kind === 'diverging' && ramp.midpoint) {
    const mx = x0 + 5.5 * sw;
    nodes.push({ t: 'line', x1: mx, x2: mx, y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
    const mid = `${formatNumber(ramp.midpoint.value, decimalsFor(ramp.midpoint.value), ctx.grouping)} = ${ramp.midpoint.label}`;
    // The middle label goes under the key on its own line when it would touch the end labels.
    const inset = ramp.open ? sw : 0;
    const endW = Math.max(textWidth(labels[0]!.s, 'sans', size), textWidth(`${labels[1]!.s} ${opts.unit ?? ''}`, 'sans', size)) / (ramp.open ? 2 : 1) + inset;
    const midW = textWidth(mid, 'sans', size);
    if (midW / 2 + endW + 8 < keyW / 2) nodes.push(text(mx, ly, mid, 'sans', size, 'ink2', 'middle'));
    else {
      nodes.push(text(x0, ly + size + 3, mid, 'sans', size, 'ink2', 'start'));
      height += size + 3;
    }
  }
  if (opts.missing) {
    const mx = x0 + keyW + 12;
    // No data is an empty outline, or (on a map) the quiet fill the map gives it.
    nodes.push(opts.missingPaint ? { t: 'rect', x: mx, y, w: 12, h: sh, fill: opts.missingPaint } : { t: 'rect', x: mx + 0.5, y: y + 0.5, w: 12, h: sh - 1, stroke: 'rule', sw: 1 });
    nodes.push(text(mx + 16, y + sh - 0.5, 'No data', 'sans', size, 'ink2'));
  }
  return { nodes, height, width };
}

/** The continuous ramp's key: one smooth bar, its two ends in the data's units, the midpoint named. */
function drawContinuousKey(ctx: Ctx, ramp: Ramp, x: number, y: number, maxW: number, opts: { unit?: string; missing?: boolean; align?: 'start' | 'end'; missingPaint?: Paint }): { nodes: SceneNode[]; height: number; width: number } {
  const size = ctx.s.small;
  const keyW = Math.min(maxW - (opts.missing ? 80 : 0), ctx.narrow ? 240 : 300);
  const sh = 9;
  const n = ramp.steps.length;
  const nodes: SceneNode[] = [];
  // Slices overlap by a hair so no seam of the ground shows.
  const sw = keyW / n;
  ramp.steps.forEach((p, i) => nodes.push({ t: 'rect', x: x + i * sw, y, w: sw + (i < n - 1 ? 0.5 : 0), h: sh, fill: p }));
  const mv = ramp.midpoint?.value ?? 0;
  const dec = Math.min(2, Math.max(decimalsFor(ramp.step), decimalsFor(mv)));
  // A sign only on differences (a midpoint of zero); on an absolute scale "+15" would misread.
  const fmt = (v: number) => `${mv === 0 && v > 0 ? '+' : ''}${formatNumber(v, dec, ctx.grouping)}`;
  const ly = y + sh + size + 3;
  const lo = fmt(ramp.edges[0]!);
  const hi = `${fmt(ramp.edges[1]!)}${opts.unit ? ` ${opts.unit}` : ''}`;
  nodes.push({ t: 'line', x1: x + 0.5, x2: x + 0.5, y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
  nodes.push({ t: 'line', x1: x + keyW - 0.5, x2: x + keyW - 0.5, y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
  nodes.push(text(x, ly, lo, 'sans', size, 'ink2', 'start'));
  nodes.push(text(x + keyW, ly, hi, 'sans', size, 'ink2', 'end'));
  let height = sh + size + 5;
  if (ramp.midpoint) {
    const mx = x + keyW / 2;
    nodes.push({ t: 'line', x1: mx, x2: mx, y1: y + sh, y2: y + sh + 3, stroke: 'ink2', sw: 1 });
    const mid = `${formatNumber(ramp.midpoint.value, Math.min(2, decimalsFor(ramp.midpoint.value)), ctx.grouping)} = ${ramp.midpoint.label}`;
    const midW = textWidth(mid, 'sans', size);
    const endW = Math.max(textWidth(lo, 'sans', size), textWidth(hi, 'sans', size));
    if (midW / 2 + endW + 10 < keyW / 2) nodes.push(text(mx, ly, mid, 'sans', size, 'ink2', 'middle'));
    else {
      nodes.push(text(x, ly + size + 4, mid, 'sans', size, 'ink2', 'start'));
      height += size + 4;
    }
  }
  if (opts.missing) {
    const mx = x + keyW + 14;
    nodes.push({ t: 'rect', x: mx + 0.5, y: y + 0.5, w: 12, h: sh - 1, stroke: 'rule', sw: 1 });
    nodes.push(text(mx + 16, y + sh - 0.5, 'No data', 'sans', size, 'ink2'));
  }
  return { nodes, height, width: keyW };
}
