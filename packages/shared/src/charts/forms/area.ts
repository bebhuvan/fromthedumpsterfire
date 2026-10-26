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

/** Greys for the quiet parts of a focused stack, in turn, so neighbours always differ. */
const GREYS: Paint[] = ['quiet3', 'quiet', 'quiet2'];

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
  // Neutral first: with a focus, the story's parts take the edition's ink and the rest are greys.
  const focus = ctx.chart.options?.focus ?? [];
  const focused = ctx.colour === 'focus' || focus.length > 0;
  const greyOf: number[] = [];
  let g = 0;
  st.names.forEach((n, i) => (greyOf[i] = focus.includes(n) ? -1 : g++ % GREYS.length));
  const paintOf = (i: number): Paint => (focused ? (greyOf[i]! < 0 ? 'ed' : GREYS[greyOf[i]!]!) : (`cat${Math.min(5, i)}` as Paint));

  const lastI = st.totals.length - 1 - [...st.totals].reverse().findIndex((t) => t !== null);
  const size = ctx.s.label;
  const lh = size * 1.2;
  const sy = ax.scale;
  // A name goes inside its band where the whole word fits inside the band at every point under it,
  // as far right as it can; the band's edges are followed exactly, so a sloping band never lets
  // the word slip over its neighbour.
  const inside = (i: number, sxp: (v: number) => number, x0: number, x1: number): { xr: number; cy: number } | null => {
    const w = textWidth(st.names[i]!, 'sansMedium', size);
    const need = size * 0.98 + 6;
    const edges = (px: number): [number, number] | null => {
      const t = xmin + ((px - x0) / (x1 - x0)) * (xmax - xmin);
      let k = st.xs.findIndex((x) => x >= t - 1e-9);
      if (k < 0) return null;
      if (k === 0) k = 1;
      const a = st.bands[i]![k - 1];
      const b = st.bands[i]![k];
      if (!a || !b) return null;
      const f = (t - st.xs[k - 1]!) / (st.xs[k]! - st.xs[k - 1]! || 1);
      const lo = a[0] + (b[0] - a[0]) * f;
      const hi = a[1] + (b[1] - a[1]) * f;
      return [sy(hi), sy(lo)];
    };
    for (let k = lastI; k >= 1; k--) {
      const xr = sxp(st.xs[k]!) - 6;
      const xl = xr - w;
      if (xl < x0 + 4) break;
      const samples = [xl, xr, ...st.xs.map(sxp).filter((px) => px > xl && px < xr)];
      let maxTop = -Infinity;
      let minBot = Infinity;
      let ok = true;
      for (const px of samples) {
        const e = edges(px);
        if (!e) {
          ok = false;
          break;
        }
        maxTop = Math.max(maxTop, e[0]);
        minBot = Math.min(minBot, e[1]);
      }
      if (ok && minBot - maxTop >= need) return { xr, cy: (maxTop + minBot) / 2 };
    }
    return null;
  };
  const labelMax = ctx.narrow ? 92 : 150;
  const place = (x1: number) => {
    const sxp = linear([xmin, xmax], [left, x1]);
    return st.names.map((_, i) => inside(i, sxp, left, x1));
  };
  let right = W - 8;
  let spots = place(right);
  if (spots.some((p) => !p)) {
    const outs = st.names.filter((_, i) => !spots[i]);
    const wOut = Math.min(labelMax, Math.max(...outs.map((n) => textWidth(n, 'sans', size))));
    right = W - wOut - 24;
    spots = place(right);
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

  const ticks = yearTicks(xmin, xmax, ctx.narrow ? 4 : 8);
  nodes.push(...drawXYears(ctx, sx, ticks.length ? ticks : [xmin, xmax], bottom));

  // Labels: inside where they fit (in the text colour that reads on the fill), or beside the plot on a leader.
  if (lastI >= 0) {
    const xr = sx(st.xs[lastI]!);
    const outside = st.names.map((_, i) => i).filter((i) => !spots[i]);
    const outs = outside.map((i) => {
      const b = st.bands[i]![lastI]!;
      return { i, y: sy((b[0] + b[1]) / 2) };
    });
    const wrapped = outs.map((o) => wrapText(st.names[o.i]!, 'sans', size, W - right - 24));
    const gap = Math.max(1, ...wrapped.map((l) => l.length)) * lh + 2;
    const ys = spread(outs.map((o) => ({ y: o.y, text: st.names[o.i]! })), gap, top, bottom);
    outs.forEach((o, k) => {
      const ly = ys[k]!;
      const lines = wrapped[k]!;
      const y0 = ly - ((lines.length - 1) * lh) / 2;
      nodes.push({ t: 'rect', x: right + 8, y: y0 - 4, w: 8, h: 8, fill: paintOf(o.i) });
      nodes.push({ t: 'path', d: `M${(xr + 1).toFixed(2)},${o.y.toFixed(2)}L${(right + 6).toFixed(2)},${y0.toFixed(2)}`, stroke: 'ink2', sw: 0.75 });
      lines.forEach((s2, j) => nodes.push(text(right + 20, y0 + size * 0.35 + j * lh, s2, focus.includes(st.names[o.i]!) ? 'sansMedium' : 'sans', size, 'ink')));
    });
    st.names.forEach((name, i) => {
      const p = spots[i];
      if (!p) return;
      // White or near-black by the fill's own contrast (labelOn), the same in both themes.
      nodes.push(text(p.xr, p.cy + size * 0.27, name, 'sansMedium', size, labelOn(paintOf(i)), 'end'));
    });
  }

  nodes.push(...drawCallouts(ctx, frame));
  return { width: W, height: H, nodes };
}

void niceTicks;
