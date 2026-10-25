// Beeswarm: every value as a dot on one scale, so a reader sees each one and the spread. Dots are
// packed by a deterministic rule (in order of value, each placed at the free offset nearest the
// axis), so the same rows always draw the same swarm. Groups (encode.series) are rows, each with its
// median marked; the named dots (options.focus) are loud and labelled.

import type { Scene, SceneNode, Paint } from '../scene';
import { Ctx, hline, text, vline } from '../frame';
import { linear, niceTicks } from '../scales';
import { textWidth } from '../text';
import { placeLabels } from './scatter';

export interface Placed {
  i: number;
  x: number;
  /** Offset from the row's axis, in px. */
  dy: number;
}

/**
 * Pack dots of radius r along an axis: in order of x (ties by input order), each at the smallest
 * offset (0, then +d, -d, +2d …, finely stepped) where it touches no dot already placed.
 */
export function swarm(xs: number[], r: number, gap = 1): Placed[] {
  const d = 2 * r + gap;
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);
  const placed: Placed[] = [];
  const step = d / 4;
  for (const p of order) {
    const near = placed.filter((q) => Math.abs(q.x - p.x) < d);
    let dy = 0;
    for (let k = 0; k < 4000; k++) {
      const cand = k === 0 ? 0 : Math.ceil(k / 2) * step * (k % 2 ? -1 : 1);
      if (near.every((q) => (q.x - p.x) ** 2 + (q.dy - cand) ** 2 >= d * d - 1e-6)) {
        dy = cand;
        break;
      }
    }
    placed.push({ i: p.i, x: p.x, dy });
  }
  return placed.sort((a, b) => a.i - b.i);
}

export function drawBeeswarm(ctx: Ctx): Scene {
  const W = ctx.W;
  const rows = ctx.rows.filter((r) => ctx.num(r, 'y') !== null);
  const groups = ctx.has('series') ? ctx.groups('series') : [''];
  const values = rows.map((r) => ctx.num(r, 'y')!);
  const t = niceTicks(Math.min(...values), Math.max(...values), ctx.narrow ? 4 : 6);
  const left = 8;
  const right = W - 8;
  const sx = linear(t.domain, [left + 4, right - 4]);
  const r0 = ctx.narrow ? 3.1 : 4;
  const focus = ctx.chart.options?.focus ?? [];
  const isLoud = (row: (typeof rows)[number]) => (focus.length ? focus.includes(ctx.str(row, 'label')) : true);
  const unit = ctx.chart.units;

  // Swarm each group, then stack the rows with their names above.
  const titleH = groups.length > 1 ? ctx.s.label + 10 : 0;
  const labelPad = ctx.s.label + 8;
  let y = 6;
  const nodes: SceneNode[] = [];
  const dots: Array<{ x: number; y: number; paint: Paint; loud: boolean; label: string; v: number }> = [];
  const bands: Array<{ name: string; top: number; mid: number; low: number; bottom: number; median: number }> = [];
  for (const g of groups) {
    const gr = rows.filter((r) => !ctx.has('series') || ctx.str(r, 'series') === g);
    if (!gr.length) continue;
    const pl = swarm(gr.map((r) => sx(ctx.num(r, 'y')!)), r0);
    const up = Math.max(0, ...pl.map((p) => -p.dy)) + r0;
    const down = Math.max(0, ...pl.map((p) => p.dy)) + r0;
    const hasLoud = gr.some(isLoud) && focus.length > 0;
    const top = y + titleH + (hasLoud ? labelPad * 0.6 : 2);
    const mid = top + up;
    const bottom = mid + down + 12 + (hasLoud ? labelPad * 0.4 : 0);
    const vs = gr.map((r) => ctx.num(r, 'y')!).sort((a, b) => a - b);
    const median = vs.length % 2 ? vs[(vs.length - 1) / 2]! : (vs[vs.length / 2 - 1]! + vs[vs.length / 2]!) / 2;
    bands.push({ name: g, top: y, mid, low: mid + down, bottom, median });
    gr.forEach((r, k) => {
      const loud = isLoud(r);
      dots.push({ x: pl[k]!.x, y: mid + pl[k]!.dy, paint: focus.length ? (loud ? 'ed' : 'quiet') : 'ed', loud: loud && focus.length > 0, label: ctx.str(r, 'label'), v: ctx.num(r, 'y')! });
    });
    y = bottom + 6;
  }
  const axisY = y;
  const H = axisY + ctx.s.tick + 14;

  // Gridlines down through every row, the ticks under them.
  for (const tk of t.ticks) {
    const x = Math.round(sx(tk)) + 0.5;
    nodes.push(vline(x, 4, axisY, 'rule'));
    const lab = `${ctx.fmt(tk, t.step)}${tk === t.ticks[t.ticks.length - 1] && unit.length <= 6 ? ` ${unit}` : ''}`;
    const w = textWidth(lab, 'sans', ctx.s.tick);
    const anchor = sx(tk) + w / 2 > W - 2 ? 'end' : sx(tk) - w / 2 < 2 ? 'start' : 'middle';
    nodes.push(text(anchor === 'end' ? Math.min(W - 2, sx(tk) + textWidth(ctx.fmt(tk, t.step), 'sans', ctx.s.tick) / 2) : anchor === 'start' ? Math.max(2, sx(tk) - textWidth(ctx.fmt(tk, t.step), 'sans', ctx.s.tick) / 2) : sx(tk), axisY + ctx.s.tick + 4, lab, 'sans', ctx.s.tick, 'ink2', anchor));
  }
  nodes.push(hline(left, right, axisY + 0.5, 'ink2'));
  // Group names, and each group's median as a tick under its swarm.
  bands.forEach((b, k) => {
    if (groups.length > 1) nodes.push(text(left, b.top + ctx.s.label, b.name, 'sans', ctx.s.label, 'ink'));
    const mx = sx(b.median);
    nodes.push({ t: 'line', x1: mx, x2: mx, y1: b.low + 2, y2: b.low + 9, stroke: 'ink', sw: 1.5 });
    const lab = `${k === 0 ? 'median ' : ''}${ctx.value(b.median)}`;
    const w = textWidth(lab, 'sans', ctx.s.small);
    const lx = mx + 4 + w > right ? mx - 4 - w : mx + 4;
    nodes.push(text(lx, b.low + 9, lab, 'sans', ctx.s.small, 'ink2'));
  });
  // Quiet dots under loud ones.
  for (const d of [...dots].sort((a, b) => Number(a.loud) - Number(b.loud))) {
    nodes.push({ t: 'circle', cx: d.x, cy: d.y, r: d.loud ? r0 + 0.75 : r0, fill: d.paint, stroke: 'bg', sw: 1, tip: `${d.label}: ${ctx.value(d.v)}` });
  }
  // Names of the loud dots, placed clear of each other and of the loud dots.
  const loud = dots.filter((d) => d.loud && d.label);
  const obstacles = [
    ...loud.map((d) => ({ x: d.x - r0 - 1, y: d.y - r0 - 1, w: 2 * r0 + 2, h: 2 * r0 + 2 })),
    ...bands.map((b) => ({ x: left, y: b.top, w: groups.length > 1 ? textWidth(b.name, 'sans', ctx.s.label) + 4 : 0, h: ctx.s.label + 4 })),
    ...bands.map((b) => ({ x: sx(b.median) - 60, y: b.low, w: 120, h: 12 })),
  ];
  const placed = placeLabels(
    loud.map((d) => ({ x: d.x, y: d.y, r: r0 + 2, text: d.label, size: ctx.s.small + 0.5, face: 'sans' as const })),
    { x: 0, y: 0, w: W, h: axisY },
    obstacles.filter((o) => o.w > 0),
  );
  loud.forEach((d, k) => {
    const p = placed[k];
    if (p) nodes.push(text(p.x, p.y, d.label, 'sans', ctx.s.small + 0.5, 'ink', p.anchor));
  });
  return { width: W, height: H, nodes };
}
