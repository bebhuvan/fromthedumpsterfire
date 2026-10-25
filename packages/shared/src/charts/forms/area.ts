// Stacked area: how a whole over time splits into parts. Stacked from zero in the order the parts
// first appear (the first at the bottom), each layer in its categorical colour with a 2px gap of the
// ground between layers. Parts are named inside their band at the right edge where they fit, else
// beside the plot with a leader. A missing value breaks the whole stack at that x (stacking over a
// hole would misplace every layer above it).

import { labelOn, type Scene, type SceneNode, type Paint } from '../scene';
import { Ctx, drawCallouts, drawPeriods, drawXYears, drawYAxis, annotX, linePath, shortUnit, spread, text, yLabelWidth } from '../frame';
import { linear, niceTicks, yearTicks } from '../scales';
import { textWidth, wrapText } from '../text';
import { yAxisFor } from './line';
import type { YAxis } from '../frame';

/**
 * A y axis whose ticks waste the least room: tries a few tick counts and keeps the one whose nice
 * domain is tightest around the data (so a chart topping out at 2,080 ends at 2,500, not 3,000).
 */
export function tightAxis(ctx: Ctx, values: number[], range: [number, number], opts: { zero?: boolean; counts?: number[] } = {}): YAxis {
  if (ctx.chart.scale?.y?.log) return yAxisFor(ctx, values, range, opts);
  const counts = opts.counts ?? (ctx.narrow ? [4, 3, 5] : [5, 4, 6]);
  let best: YAxis | null = null;
  for (const count of counts) {
    const ax = yAxisFor(ctx, values, range, { zero: opts.zero, count });
    const span = ax.scale.domain[1] - ax.scale.domain[0];
    if (!best || span < best.scale.domain[1] - best.scale.domain[0] - 1e-9) best = ax;
  }
  return best!;
}

export interface Stack {
  xs: number[];
  names: string[];
  /** For each part, for each x: [lower, upper] of its band, or null where any part is missing. */
  bands: Array<Array<[number, number] | null>>;
  /** For each x: the stacked total (null where any part is missing). */
  totals: Array<number | null>;
}

/** Stack the rows: parts in order of first appearance, each x's values summed bottom-up. */
export function stackOf(ctx: Ctx): Stack {
  const names = ctx.groups('series');
  const byX = new Map<number, Map<string, number | null>>();
  for (const r of ctx.rows) {
    const x = ctx.xval(r);
    if (x === null) continue;
    if (!byX.has(x)) byX.set(x, new Map());
    byX.get(x)!.set(ctx.str(r, 'series'), ctx.num(r, 'y'));
  }
  const xs = [...byX.keys()].sort((a, b) => a - b);
  const bands = names.map(() => [] as Array<[number, number] | null>);
  const totals: Array<number | null> = [];
  for (const x of xs) {
    const vals = names.map((n) => byX.get(x)!.get(n));
    const complete = vals.every((v) => v !== null && v !== undefined);
    let acc = 0;
    names.forEach((_, i) => {
      if (!complete) return bands[i]!.push(null);
      const v = Math.max(0, vals[i] as number);
      bands[i]!.push([acc, acc + v]);
      acc += v;
    });
    totals.push(complete ? acc : null);
  }
  return { xs, names, bands, totals };
}

export function drawArea(ctx: Ctx): Scene {
  const W = ctx.W;
  const H = ctx.narrow ? 320 : 420;
  const top = 18;
  const bottom = H - 30;
  const st = stackOf(ctx);
  const xmin = st.xs[0] ?? 0;
  const xmax = st.xs[st.xs.length - 1] ?? 1;
  const totals = st.totals.filter((t): t is number => t !== null);
  const ax = tightAxis(ctx, [0, ...totals], [bottom, top], { zero: true });
  const unit = shortUnit(ctx.chart.units);
  const left = Math.ceil(yLabelWidth(ctx, ax, unit)) + 10;
  const paints: Paint[] = st.names.map((n) => ctx.paintFor(n, st.names));
  // Use categorical colours unless the editor chose a focus.
  const paintOf = (i: number): Paint => (ctx.chart.options?.focus?.length ? paints[i]! : (`cat${Math.min(5, i)}` as Paint));

  // Where each part's label goes: inside its band at the right edge when the band is tall enough there.
  const lastI = st.totals.length - 1 - [...st.totals].reverse().findIndex((t) => t !== null);
  const lh = ctx.s.label * 1.2;
  const outside: number[] = [];
  const sy = ax.scale;
  // A name fits inside when its band is tall enough everywhere under the name, at the right edge.
  const insideFits = (i: number, sxp: (v: number) => number) => {
    const xr = sxp(st.xs[lastI]!);
    const w = textWidth(st.names[i]!, 'sansMedium', ctx.s.label) + 12;
    for (let k = lastI; k >= 0 && sxp(st.xs[k]!) >= xr - w - (sxp(st.xs[1] ?? 0) - sxp(st.xs[0] ?? 0)); k--) {
      const b = st.bands[i]![k];
      if (!b || sy(b[0]) - sy(b[1]) < ctx.s.label + 5) return false;
    }
    return true;
  };
  const labelMax = ctx.narrow ? 92 : 150;
  const fitsAll = (sxp: (v: number) => number) => st.names.map((_, i) => i).filter((i) => !insideFits(i, sxp));
  let right = W - 8;
  outside.push(...fitsAll(linear([xmin, xmax], [left, right])));
  if (outside.length) {
    const wOut = Math.min(labelMax, Math.max(...outside.map((i) => textWidth(st.names[i]!, 'sans', ctx.s.label))));
    right = W - wOut - 24;
    outside.length = 0;
    outside.push(...fitsAll(linear([xmin, xmax], [left, right])));
  }
  const sx = linear([xmin, xmax], [left, right]);

  const nodes: SceneNode[] = [];
  const frame = {
    x0: left,
    x1: right,
    y0: top,
    y1: bottom,
    sx: (v: string | number | null) => {
      const x = annotX(v, ctx);
      return x === null ? null : sx(Math.max(xmin, Math.min(xmax, x)));
    },
    sy,
  };
  nodes.push(...drawYAxis(ctx, ax, left, right, { unit }));

  // Layers, bottom up; the ground's 2px stroke along each top edge separates neighbours.
  st.names.forEach((name, i) => {
    const runs: Array<Array<[number, number, number]>> = [];
    let run: Array<[number, number, number]> = [];
    st.xs.forEach((x, k) => {
      const b = st.bands[i]![k];
      if (b) run.push([sx(x), sy(b[0]), sy(b[1])]);
      else if (run.length) (runs.push(run), (run = []));
    });
    if (run.length) runs.push(run);
    for (const r of runs) {
      if (r.length < 2) continue;
      const d = `M${r.map(([x, , y1]) => `${x.toFixed(2)},${y1.toFixed(2)}`).join('L')}L${[...r].reverse().map(([x, y0]) => `${x.toFixed(2)},${y0.toFixed(2)}`).join('L')}Z`;
      nodes.push({ t: 'path', d, fill: paintOf(i), tip: name });
      nodes.push({ t: 'path', d: linePath(r.map(([x, , y1]) => [x, y1])), stroke: 'bg', sw: 2 });
    }
  });
  // A zero baseline in ink over the layers' feet.
  nodes.push({ t: 'line', x1: left, x2: right, y1: Math.round(sy(0)) + 0.5, y2: Math.round(sy(0)) + 0.5, stroke: 'ink', sw: 1 });
  // Periods are drawn over the layers as a hairline bracket at the top, not a wash (a wash would tint the colours).
  for (const n of drawPeriods(ctx, frame)) {
    if (n.t === 'rect') {
      nodes.push({ t: 'line', x1: n.x, x2: n.x, y1: top, y2: bottom, stroke: 'ink2', sw: 1 });
      if (n.w > 2) nodes.push({ t: 'line', x1: n.x + n.w, x2: n.x + n.w, y1: top, y2: bottom, stroke: 'ink2', sw: 1 });
    } else if (n.t === 'text') nodes.push({ ...n, x: n.anchor === 'end' ? n.x - 2 : n.x + 2 });
  }

  const span = xmax - xmin;
  const ticks = yearTicks(xmin, xmax, ctx.narrow ? 4 : 8);
  nodes.push(...drawXYears(ctx, sx, ticks.length ? ticks : [xmin, xmax], bottom));
  void span;

  // Labels: inside at the right edge (in the text colour that reads on the fill), or outside with a leader.
  if (lastI >= 0) {
    const xr = sx(st.xs[lastI]!);
    const outs = outside.map((i) => {
      const b = st.bands[i]![lastI]!;
      return { i, y: sy((b[0] + b[1]) / 2) };
    });
    const wrapped = outs.map((o) => wrapText(st.names[o.i]!, 'sans', ctx.s.label, W - right - 24));
    const gap = Math.max(...wrapped.map((l) => l.length)) * lh + 2;
    const ys = spread(outs.map((o) => ({ y: o.y, text: st.names[o.i]! })), gap, top, bottom);
    outs.forEach((o, k) => {
      const ly = ys[k]!;
      const lines = wrapped[k]!;
      const y0 = ly - ((lines.length - 1) * lh) / 2;
      nodes.push({ t: 'rect', x: right + 8, y: y0 - 4, w: 8, h: 8, fill: paintOf(o.i) });
      nodes.push({ t: 'path', d: `M${(xr + 1).toFixed(2)},${o.y.toFixed(2)}L${(right + 6).toFixed(2)},${y0.toFixed(2)}`, stroke: 'ink2', sw: 0.75 });
      lines.forEach((s2, j) => nodes.push(text(right + 20, y0 + ctx.s.label * 0.35 + j * lh, s2, 'sans', ctx.s.label, 'ink')));
    });
    st.names.forEach((name, i) => {
      if (outside.includes(i)) return;
      const b = st.bands[i]![lastI]!;
      const mid = sy((b[0] + b[1]) / 2);
      // White or near-black by the fill's own contrast (labelOn), the same in both themes.
      nodes.push(text(xr - 6, mid + ctx.s.label * 0.35, name, 'sansMedium', ctx.s.label, labelOn(paintOf(i)), 'end'));
    });
  }

  nodes.push(...drawCallouts(ctx, frame));
  return { width: W, height: H, nodes };
}

void niceTicks;
