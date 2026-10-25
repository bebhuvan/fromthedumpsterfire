// Scatter: how two measures go together. Dots with a ring of the ground so overlaps stay legible;
// size encodes area (never radius) when there is a size column; the points that matter are named,
// each label placed where it collides with nothing (or left to the table). Log axes say so.

import type { Scene, SceneNode, Paint } from '../scene';
import { Ctx, drawCallouts, hline, text, vline } from '../frame';
import { linear, logScale, niceTicks, type Scale } from '../scales';
import { textWidth, wrapText } from '../text';
import type { Cell } from '../types';

interface Dot {
  i: number;
  x: number;
  y: number;
  r: number;
  label: string;
  paint: Paint;
  loud: boolean;
  row: Cell[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** A log axis that ends at the 1-2-5 steps either side of the data, not whole decades. */
export function logAxis(min: number, max: number, range: [number, number]): { scale: Scale; ticks: number[]; step: number } {
  const seq: number[] = [];
  for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)) + 1; e++) for (const m of [1, 2, 5]) seq.push(m * 10 ** e);
  const lo = Math.max(...seq.filter((v) => v <= min * 1.0001));
  const hi = Math.min(...seq.filter((v) => v >= max * 0.9999));
  let ticks = seq.filter((v) => v >= lo && v <= hi);
  if (ticks.length > 7) ticks = ticks.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
  return { scale: logScale([lo, hi], range), ticks, step: 1 };
}

/** A tick on a log axis: 500, 1k, 20k, 1m, 2bn. */
export function logLabel(v: number): string {
  const units: Array<[number, string]> = [[1e12, 'tn'], [1e9, 'bn'], [1e6, 'm'], [1e3, 'k']];
  for (const [n, suf] of units) if (v >= n) return `${Number((v / n).toPrecision(3))}${suf}`;
  return String(Number(v.toPrecision(3)));
}

function axisFor(values: number[], log: boolean, range: [number, number], count: number): { scale: Scale; ticks: number[]; step: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (log) return logAxis(Math.max(min, 1e-12), max, range);
  const t = niceTicks(min, max, count);
  return { scale: linear(t.domain, range), ticks: t.ticks, step: t.step };
}

/** Labels set around their dots: eight places tried in order, the first that collides with nothing wins. */
export function placeLabels(
  items: Array<{ x: number; y: number; r: number; text: string; size: number; face: 'sans' | 'sansMedium' }>,
  bounds: Box,
  obstacles: Box[],
): Array<{ x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box } | null> {
  const taken = [...obstacles];
  return items.map((it) => {
    const w = textWidth(it.text, it.face, it.size);
    const h = it.size;
    const g = it.r + 3;
    const cands: Array<{ x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = [
      { x: it.x + g, y: it.y + h * 0.35, anchor: 'start' },
      { x: it.x - g, y: it.y + h * 0.35, anchor: 'end' },
      { x: it.x, y: it.y - g - 2, anchor: 'middle' },
      { x: it.x, y: it.y + g + h, anchor: 'middle' },
      { x: it.x + g * 0.8, y: it.y - g * 0.8, anchor: 'start' },
      { x: it.x - g * 0.8, y: it.y - g * 0.8, anchor: 'end' },
      { x: it.x + g * 0.8, y: it.y + g * 0.8 + h * 0.7, anchor: 'start' },
      { x: it.x - g * 0.8, y: it.y + g * 0.8 + h * 0.7, anchor: 'end' },
    ];
    for (const c of cands) {
      const bx = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2;
      const box = { x: bx - 1, y: c.y - h * 0.8, w: w + 2, h: h * 1.05 };
      if (box.x < bounds.x || box.x + box.w > bounds.x + bounds.w || box.y < bounds.y || box.y + box.h > bounds.y + bounds.h) continue;
      if (taken.some((t) => overlaps(t, box))) continue;
      taken.push(box);
      return { ...c, box };
    }
    return null;
  });
}

export function drawScatter(ctx: Ctx): Scene {
  const W = ctx.W;
  const H = ctx.narrow ? 360 : 460;
  const xlog = Boolean(ctx.chart.scale?.x?.log);
  const ylog = Boolean(ctx.chart.scale?.y?.log);
  const rows = ctx.rows.filter((r) => ctx.num(r, 'x') !== null && ctx.num(r, 'y') !== null && (!xlog || ctx.num(r, 'x')! > 0) && (!ylog || ctx.num(r, 'y')! > 0));
  const xs = rows.map((r) => ctx.num(r, 'x')!);
  const ys = rows.map((r) => ctx.num(r, 'y')!);
  const xCol = ctx.column('x');
  const yCol = ctx.column('y');
  const yTitle = `${yCol?.label ?? ''}${yCol?.unit ? `, ${yCol.unit}` : ctx.chart.units ? `, ${ctx.chart.units}` : ''}`;
  const xTitle = `${xCol?.label ?? ''}${xCol?.unit ? `, ${xCol.unit}` : ''}${xlog ? '; log scale' : ''}`;

  const xTitleLines = wrapText(xTitle, 'sans', ctx.s.tick, W - 12);
  const top = 20 + ctx.s.tick + (ylog ? ctx.s.small + 4 : 0);
  const bottom = H - 24 - xTitleLines.length * (ctx.s.tick * 1.25);
  const yax = axisFor(ys, ylog, [bottom, top], ctx.narrow ? 4 : 5);
  const labW = Math.max(...yax.ticks.map((t) => textWidth(ctx.fmt(t, yax.step), 'sans', ctx.s.tick)));
  const left = Math.ceil(labW) + 10;
  const right = W - 6;
  const xax = axisFor(xs, xlog, [left + 6, right - 6], ctx.narrow ? 4 : 6);
  const sx = xax.scale;
  const sy = yax.scale;

  const nodes: SceneNode[] = [];
  // y gridlines and labels; the y axis title above the plot.
  yax.ticks.forEach((t) => {
    const y = Math.round(sy(t)) + 0.5;
    nodes.push(hline(left, right, y, 'rule'));
    nodes.push(text(left - 8, sy(t) + ctx.s.tick * 0.36, ylog ? logLabel(t) : ctx.fmt(t, yax.step), 'sans', ctx.s.tick, 'ink2', 'end'));
  });
  nodes.push(text(left, top - 12 - (ylog ? ctx.s.small + 4 : 0), yTitle, 'sans', ctx.s.tick, 'ink2'));
  if (ylog) nodes.push(text(left, top - 12, 'Log scale: each step is ten times the last', 'sans', ctx.s.small, 'mach'));
  // x ticks under the plot; the x title under them at the right.
  const xticks = xax.ticks.filter((t) => sx(t) >= left - 1 && sx(t) <= right + 1);
  const minGap = 6;
  let lastR = -Infinity;
  for (const t of xticks) {
    const x = sx(t);
    const lab = xlog ? logLabel(t) : ctx.fmt(t, xax.step);
    const w = textWidth(lab, 'sans', ctx.s.tick);
    nodes.push(vline(Math.round(x) + 0.5, bottom, bottom + 4, 'ink2'));
    if (x - w / 2 > lastR + minGap && x + w / 2 <= W) {
      nodes.push(text(x, bottom + 6 + ctx.s.tick, lab, 'sans', ctx.s.tick, 'ink2', 'middle'));
      lastR = x + w / 2;
    }
  }
  nodes.push(hline(left, right, Math.round(bottom) + 0.5, 'ink2'));
  xTitleLines.forEach((l, k) => nodes.push(text(right, bottom + 10 + ctx.s.tick * 2.2 + k * ctx.s.tick * 1.25, l, 'sans', ctx.s.tick, 'ink2', 'end')));

  // Dots: area for size, the loud ones in the edition's ink (or categorical colours).
  const sizes = ctx.has('size') ? rows.map((r) => ctx.num(r, 'size') ?? 0) : [];
  const smax = Math.max(1, ...sizes);
  const rmax = ctx.narrow ? 11 : 16;
  const focus = ctx.chart.options?.focus ?? [];
  const groups = ctx.has('series') ? ctx.groups('series') : [];
  const dots: Dot[] = rows.map((r, i) => {
    const label = ctx.str(r, 'label');
    const loud = focus.length ? focus.includes(label) || (ctx.has('series') && focus.includes(ctx.str(r, 'series'))) : true;
    const paint: Paint = ctx.colour === 'categorical' && groups.length ? ctx.paintFor(ctx.str(r, 'series'), groups) : loud ? 'ed' : 'quiet';
    const r0 = ctx.has('size') ? Math.max(2.25, Math.sqrt(Math.max(0, sizes[i]!) / smax) * rmax) : 4;
    return { i, x: sx(ctx.num(r, 'x')!), y: sy(ctx.num(r, 'y')!), r: r0, label, paint, loud, row: r };
  });
  // Big dots underneath, quiet dots under loud ones.
  const order = [...dots].sort((a, b) => Number(a.loud) - Number(b.loud) || b.r - a.r);
  for (const d of order) {
    const tip = [d.label, `${xCol?.label}: ${ctx.value(ctx.num(d.row, 'x')!, 0)}`, `${yCol?.label}: ${ctx.value(ctx.num(d.row, 'y')!)}`].filter(Boolean).join(' · ');
    nodes.push({ t: 'circle', cx: d.x, cy: d.y, r: d.r, fill: d.paint, fo: ctx.has('size') ? 0.85 : undefined, stroke: 'bg', sw: 1.25, tip });
  }

  const frame = {
    x0: left,
    x1: right,
    y0: top,
    y1: bottom,
    sx: (v: Cell) => (typeof v === 'number' ? sx(v) : null),
    sy,
    marks: dots.map((d) => [d.x, d.y] as [number, number]),
    point: (a: { x: Cell; series?: string }) => {
      const d = typeof a.x === 'string' ? dots.find((q) => q.label === a.x) : dots.find((q) => Math.abs(ctx.num(q.row, 'x')! - Number(a.x)) < 1e-9);
      return d ? { x: d.x, y: d.y, r: d.r } : null;
    },
  };
  // Callouts first (they are the editor's), then names placed around them.
  const loudBoxes = dots.filter((d) => d.loud).map((d) => ({ x: d.x - d.r, y: d.y - d.r, w: d.r * 2, h: d.r * 2 }));
  const callouts = drawCallouts(ctx, frame, loudBoxes);
  const calloutBoxes: Box[] = callouts.flatMap((n) => (n.t === 'text' ? [{ x: n.anchor === 'end' ? n.x - textWidth(n.text, n.face, n.size) : n.x, y: n.y - n.size, w: textWidth(n.text, n.face, n.size), h: n.size * 1.25 }] : []));

  // Size key: what the circles' area stands for, with two round reference sizes.
  const keyBoxes: Box[] = [];
  if (ctx.has('size')) {
    const sCol = ctx.column('size');
    const ref = [1, 2, 5].flatMap((m) => [m * 10 ** Math.floor(Math.log10(smax)), m * 10 ** (Math.floor(Math.log10(smax)) - 1)]).filter((v) => v <= smax).sort((a, b) => b - a);
    const refs = [ref[0]!, ref.find((v) => v <= ref[0]! / 8) ?? ref[ref.length - 1]!];
    const rr = refs.map((v) => Math.sqrt(v / smax) * rmax);
    const kx = right - rr[0]! - 2;
    const ky = bottom - 8;
    const label = `Circle area: ${(sCol?.label ?? 'size').toLowerCase()}`;
    nodes.push(text(right, ky - rr[0]! * 2 - 8, label, 'sans', ctx.s.small, 'ink2', 'end'));
    refs.forEach((v, k) => {
      nodes.push({ t: 'circle', cx: kx, cy: ky - rr[k]!, r: rr[k]!, stroke: 'ink2', sw: 0.75 });
      nodes.push(text(kx - rr[0]! - 6, ky - rr[k]! * 2 + ctx.s.small * 0.4, logLabel(v), 'sans', ctx.s.small, 'ink2', 'end'));
    });
    keyBoxes.push({ x: right - Math.max(textWidth(label, 'sans', ctx.s.small), rr[0]! * 2 + 40), y: ky - rr[0]! * 2 - 8 - ctx.s.small, w: W, h: rr[0]! * 2 + 8 + ctx.s.small + 10 });
  }

  // Labels: the focus rows (or every row when there are few), loudest and biggest first.
  const want = dots.filter((d) => d.label && (focus.length ? focus.includes(d.label) : rows.length <= 12));
  want.sort((a, b) => b.r - a.r);
  const bounds = { x: 0, y: top - 4, w: W, h: bottom - top + 4 };
  const dotBoxes = dots.filter((d) => d.loud).map((d) => ({ x: d.x - d.r, y: d.y - d.r, w: d.r * 2, h: d.r * 2 }));
  // Each label may sit over quiet dots but never over a loud dot other than its own.
  const labelBoxes: Box[] = [...calloutBoxes, ...keyBoxes];
  const placed = want.map((d) => {
    const others = dotBoxes.filter((b) => !(Math.abs(b.x + b.w / 2 - d.x) < 0.01 && Math.abs(b.y + b.h / 2 - d.y) < 0.01));
    const p = placeLabels([{ x: d.x, y: d.y, r: d.r, text: d.label, size: ctx.s.label, face: 'sans' }], bounds, [...others, ...labelBoxes])[0];
    if (p) labelBoxes.push(p.box);
    return p;
  });
  // Annotations aside, labels whose dot is the subject of a callout are left to the callout.
  const called = new Set((ctx.chart.annotations ?? []).filter((a) => a.kind === 'point').map((a) => String((a as { x: Cell }).x)));
  want.forEach((d, k) => {
    const p = placed[k];
    if (!p || called.has(d.label)) return;
    nodes.push(text(p.x, p.y, d.label, 'sans', ctx.s.label, 'ink', p.anchor));
  });

  nodes.push(...callouts);
  return { width: W, height: H, nodes };
}

