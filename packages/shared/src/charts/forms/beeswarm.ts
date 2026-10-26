// Beeswarm: every value as a dot on one scale, so a reader sees each one and the spread. Dots are
// packed by a deterministic rule (in order of value, each placed at the free offset nearest the
// axis), so the same rows always draw the same swarm. Groups (encode.series) are rows, each with its
// median marked; the named dots (options.focus) are loud and labelled.

import type { Scene, SceneNode, Paint } from '../scene';
import { Ctx, halo, hline, text, vline } from '../frame';
import { Placer, dotBox, placePoint, textBoxes } from '../labels';
import { linear, niceTicks } from '../scales';
import { textWidth, wrapText } from '../text';

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
  // Wide: the group names in a column on the left, each beside its swarm. Phone: over each swarm.
  const side = !ctx.narrow && groups.length > 1;
  const nameLines = new Map(groups.map((g) => [g, side ? wrapText(g, 'sans', ctx.s.label, 150) : [g]]));
  const nameW = side ? Math.ceil(Math.max(...[...nameLines.values()].flat().map((l) => textWidth(l, 'sans', ctx.s.label)))) : 0;
  const left = side ? nameW + 20 : 8;
  const right = W - 8;
  const sx = linear(t.domain, [left + 4, right - 4]);
  const r0 = ctx.narrow ? 3.1 : 4;
  const focus = ctx.chart.options?.focus ?? [];
  const isLoud = (row: (typeof rows)[number]) => (focus.length ? focus.includes(ctx.str(row, 'label')) : true);
  const unit = ctx.chart.units;

  // Swarm each group, then stack the rows with their names above.
  const titleH = groups.length > 1 && !side ? ctx.s.label + 10 : 0;
  const lh = ctx.s.label * 1.2;
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
    // Beside a swarm, its name needs its own lines' height around the swarm's axis.
    const nameH = side ? (nameLines.get(g)!.length * lh) / 2 : 0;
    const mid = top + Math.max(up, nameH);
    const bottom = mid + Math.max(down + 12, nameH) + (hasLoud ? labelPad * 0.4 : 0);
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
    if (side) {
      const ls = nameLines.get(b.name)!;
      ls.forEach((l, i) => nodes.push(text(0, b.mid - ((ls.length - 1) * lh) / 2 + ctx.s.label * 0.35 + i * lh, l, 'sans', ctx.s.label, 'ink')));
    } else if (groups.length > 1) nodes.push(text(left, b.top + ctx.s.label, b.name, 'sans', ctx.s.label, 'ink'));
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
  // Names of the loud dots: beside the dot when a spot is free, else further out on a leader; clear of
  // each other, the loud dots, the group names and the medians. Quiet dots may pass under a name
  // (its halo keeps it clean).
  const loud = dots.filter((d) => d.loud && d.label);
  const placer = new Placer({ x: 0, y: 0, w: W, h: axisY - 2 }, [
    ...loud.map((d) => dotBox(d.x, d.y, r0 + 1.5)),
    ...textBoxes(nodes.filter((n) => n.t === 'text')),
  ]);
  for (const d of loud) {
    const p = placePoint(placer, { x: d.x, y: d.y, r: r0 + 1, text: d.label, face: 'sans', size: ctx.s.small + 0.5 });
    if (!p) continue;
    if (p.leader) nodes.push({ t: 'line', ...p.leader, stroke: 'ink2', sw: 0.75 });
    nodes.push(halo(p.x, p.y, d.label, 'sans', ctx.s.small + 0.5, 'ink', p.anchor));
  }
  return { width: W, height: H, nodes };
}
