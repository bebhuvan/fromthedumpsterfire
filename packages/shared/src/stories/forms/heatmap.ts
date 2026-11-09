// heatmap, "the cascade": one row per member, one column per year, each cell coloured by which side
// of a meaningful midpoint its value falls (cool below, warm above) on the diverging ramp. The bins are
// equal steps either side of the midpoint, the end bins open; the grey middle step is not used, so
// every cell says plainly which side it is on. Rows run in the order the members crossed, in groups
// (crossed, projected to cross, not by the end of the projection), with the crossing year at the right.
// The key is the cells themselves, the midpoint named at its centre.

import type { Paint, Scene, SceneNode } from '../../charts/scene';
import type { ChartFace } from '../../charts/metrics';
import { TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf, type Box } from '../place';

export interface HeatmapRow {
  key: string;
  label: string;
  /** A shorter name for the phone. */
  phoneLabel?: string;
  focus?: boolean;
  /** One value a year, from `years[0]` to `years[1]`, as stored. */
  values: number[];
  /** The first year the value fell below the midpoint (estimated or projected), or null. */
  crossed: number | null;
  /** Which group the row sits in (an index into `groups`). */
  group: number;
  /** Drawn on the phone too (the phone keeps fewer rows). */
  phone: boolean;
}

export interface HeatmapFigure {
  form: 'heatmap';
  years: [number, number];
  /** The meaningful midpoint the ramp turns on, and its name. */
  mid: number;
  midLabel: string;
  /** The width of each bin, the same both sides of the midpoint. */
  step: number;
  /** Bins either side of the midpoint, the outermost open-ended (at most 5: the ramp's arm). */
  perSide: number;
  /** What the key counts. */
  unit: string;
  /** The heading over the right-hand column of crossing years, in lines, wide and phone. */
  crossedHead: [string[], string[]];
  groups: { label: string; phone?: string }[];
  rows: HeatmapRow[];
}

/** The bin edges, ascending, symmetric about the midpoint: mid ± k·step, k = 0 … perSide − 1. */
export function binEdges(mid: number, step: number, perSide: number): number[] {
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return Array.from({ length: 2 * perSide - 1 }, (_, i) => r(mid + (i - (perSide - 1)) * step));
}

/** A value's bin: 0 … 2·perSide − 1, the midpoint itself counting as above (not below) it. */
export function binOf(v: number, edges: readonly number[]): number {
  let i = 0;
  while (i < edges.length && v >= edges[i]!) i++;
  return i;
}

/** A bin's paint: the cool arm div0 … div4 below the midpoint, the warm arm div6 … div10 above. */
export function binPaint(bin: number, perSide: number): Paint {
  if (perSide > 5 || perSide < 1) throw new Error('A diverging ramp has five steps an arm');
  const k = bin < perSide ? 5 - perSide + bin : bin - perSide + 6;
  return `div${k}` as Paint;
}

const fmtEdge = (v: number) => (Number.isInteger(v * 10) ? v.toFixed(1) : String(v));

/** A label at a fixed spot, kept clear of everything placed before it, or a throw. */
function fixed(P: Placer, x: number, y: number, text: string, face: ChartFace, size: number, fill: 'ink' | 'ink2', anchor: 'start' | 'middle' | 'end' = 'start'): SceneNode {
  const w = widthOf(text, face, size);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const box: Box = { x: left, y: y - size * 0.75, w, h: size * 0.95 };
  if (!P.free(box)) throw new Error(`No room on the plate for "${text}"`);
  P.block(box);
  return { t: 'text', x, y, text, face, size, anchor, fill };
}

export function drawHeatmap(f: HeatmapFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev], phone = dev === 'phone';
  const size = T.small;
  const rows = f.rows.filter((r) => !phone || r.phone);
  const [y0, y1] = f.years;
  const nYears = y1 - y0 + 1;
  if (rows.some((r) => r.values.length !== nYears)) throw new Error('A heatmap row must hold one value a year');
  const edges = binEdges(f.mid, f.step, f.perSide);

  const name = (r: HeatmapRow) => (phone ? r.phoneLabel ?? r.label : r.label);
  const nameW = Math.max(...rows.map((r) => widthOf(name(r), r.focus ? 'sansMedium' : 'sans', size)));
  const x0 = Math.ceil(nameW + (phone ? 8 : 12));
  const yearsW = widthOf('0000', 'sans', size);
  const x1 = width - Math.ceil(yearsW + (phone ? 6 : 10));
  const cw = (x1 - x0) / nYears;
  const xOf = (year: number) => x0 + (year - y0) * cw;
  const rowH = phone ? 10 : 12, pitch = rowH + 2;

  // The key: the cells themselves, the bin edges under them, the midpoint named over its centre.
  const keyTop = 34, sw = phone ? 30 : 38, sh = phone ? 9 : 10;
  const nBins = 2 * f.perSide;
  const kx = phone ? (width - sw * nBins) / 2 : x0;
  const keyBottom = keyTop + sh + 6 + size;
  const ticksY = keyBottom + (phone ? 30 : 32);
  let top = ticksY + 10;
  const layout: { r: HeatmapRow; y: number }[] = [];
  const heads: { label: string; y: number }[] = [];
  let group = -1;
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      // A group's heading sits close over its rows, with more room above it than below.
      top += layout.length ? 18 : 16;
      heads.push({ label: phone ? f.groups[group]!.phone ?? f.groups[group]!.label : f.groups[group]!.label, y: top });
      top += 6;
    }
    layout.push({ r, y: top });
    top += pitch;
  }
  const height = Math.ceil(top + 6);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const cells: SceneNode[] = [], marks: SceneNode[] = [], labels: SceneNode[] = [];

  // The key's swatches; the open end bins come to a point, as an atlas draws them.
  const tip = 5;
  for (let b = 0; b < nBins; b++) {
    const x = kx + b * sw, fill = binPaint(b, f.perSide), yy = keyTop, gap = 1;
    if (b === 0) marks.push({ t: 'path', d: `M${x + tip} ${yy}H${x + sw - gap}V${yy + sh}H${x + tip}L${x} ${yy + sh / 2}Z`, fill });
    else if (b === nBins - 1) marks.push({ t: 'path', d: `M${x} ${yy}H${x + sw - tip}L${x + sw} ${yy + sh / 2}L${x + sw - tip} ${yy + sh}H${x}Z`, fill });
    else marks.push({ t: 'rect', x, y: yy, w: sw - gap, h: sh, fill });
  }
  P.block({ x: kx, y: keyTop, w: sw * nBins, h: sh });
  labels.push(fixed(P, kx, keyTop - 8, f.unit, 'sans', T.tick, 'ink2'));
  const mx = kx + f.perSide * sw - 0.5;
  marks.push({ t: 'line', x1: mx, y1: keyTop - 5, x2: mx, y2: keyTop + sh + 3, stroke: 'ink', sw: 1 });
  labels.push(fixed(P, mx, keyTop - 8, f.midLabel, 'sansMedium', T.tick, 'ink', 'middle'));
  edges.forEach((e, i) => {
    const ex = kx + (i + 1) * sw - 0.5;
    // Every other edge is written, the midpoint always: the steps are even, so the rest read off.
    if ((i - (f.perSide - 1)) % 2 !== 0) return;
    labels.push(fixed(P, ex, keyTop + sh + 5 + size * 0.8, fmtEdge(e), i === f.perSide - 1 ? 'sansMedium' : 'sans', T.tick, i === f.perSide - 1 ? 'ink' : 'ink2', 'middle'));
  });

  // Decade ticks along the top; the right-hand column's heading.
  const every = phone ? 20 : 10;
  for (let yr = y0; yr <= y1; yr += every) {
    const x = xOf(yr);
    marks.push({ t: 'line', x1: x, y1: ticksY - 2, x2: x, y2: ticksY + 4, stroke: 'ink2', sw: 0.75 });
    labels.push(fixed(P, x, ticksY - 6, String(yr), 'sans', T.tick, 'ink2', yr === y0 ? 'start' : 'middle'));
  }
  const head = f.crossedHead[phone ? 1 : 0];
  head.forEach((line, i) => labels.push(fixed(P, width, ticksY - 6 - (head.length - 1 - i) * T.tick * 1.25, line, 'sans', T.tick, 'ink2', 'end')));

  for (const h of heads) labels.push(fixed(P, 0, h.y, h.label, 'sans', T.tick, 'ink2'));
  // Each row: runs of one bin drawn as one rect (no seams between equal neighbours), then its name.
  for (const { r, y } of layout) {
    let from = 0;
    for (let i = 1; i <= nYears; i++) {
      if (i < nYears && binOf(r.values[i]!, edges) === binOf(r.values[from]!, edges)) continue;
      cells.push({ t: 'rect', x: xOf(y0 + from), y, w: (i - from) * cw, h: rowH, fill: binPaint(binOf(r.values[from]!, edges), f.perSide) });
      from = i;
    }
    P.block({ x: x0, y, w: x1 - x0, h: rowH });
    const by = y + rowH / 2 + size * 0.35;
    labels.push(fixed(P, x0 - (phone ? 6 : 8), by, name(r), r.focus ? 'sansMedium' : 'sans', size, r.focus ? 'ink' : 'ink2', 'end'));
    if (r.focus) {
      const nx = x0 - (phone ? 6 : 8) - widthOf(name(r), 'sansMedium', size) - 7;
      marks.push({ t: 'rect', x: nx, y: y + rowH / 2 - 2.5, w: 5, h: 5, fill: 'ed' });
    }
    if (r.crossed !== null) labels.push(fixed(P, width, by, String(r.crossed), r.focus ? 'sansMedium' : 'sans', size, r.focus ? 'ink' : 'ink2', 'end'));
  }
  return { width, height, nodes: [...cells, ...marks, ...labels] };
}
