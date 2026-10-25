// Slope: how each category moved between two moments. Two hairline posts named by their columns,
// a line per category between them, the values on the outside of each post and the names beside
// them, spread so no two touch (with a short leader when a label had to move). On a phone the names
// go on the right only.

import type { Paint, Scene, SceneNode } from '../scene';
import { Ctx, spread, text, vline } from '../frame';
import { linear } from '../scales';
import { textWidth } from '../text';

export function drawSlope(ctx: Ctx): Scene {
  const W = ctx.W;
  const focusList = ctx.chart.options?.focus ?? [];
  const rows = ctx.rows.map((r) => ({ label: ctx.str(r, 'label'), a: ctx.num(r, 'from'), b: ctx.num(r, 'to') }));
  const names = rows.map((r) => r.label);
  const fromName = ctx.column('from')?.label ?? 'From';
  const toName = ctx.column('to')?.label ?? 'To';
  const paintOf = (l: string): Paint => (focusList.length ? (focusList.includes(l) ? 'ed' : 'quiet') : ctx.colour === 'categorical' ? ctx.paintFor(l, names) : 'ink');
  const loud = (l: string) => paintOf(l) !== 'quiet';
  const face = (l: string) => (focusList.includes(l) ? 'sansMedium' : 'sans');
  const size = ctx.s.label;
  const val = (v: number | null) => (v === null ? 'no data' : ctx.value(v));

  const vals = rows.flatMap((r) => [r.a, r.b]).filter((v): v is number => v !== null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const namesLeft = !ctx.narrow;
  const valW = (k: 'a' | 'b') => Math.max(...rows.map((r) => textWidth(val(r[k]), face(r.label), size)));
  const nameW = Math.max(...rows.map((r) => textWidth(r.label, face(r.label), size)));
  const leftW = valW('a') + (namesLeft ? nameW + 10 : 0);
  const rightW = valW('b') + nameW + 10;
  const pad = ctx.narrow ? 10 : 16;
  const xL = leftW + pad + 8;
  const xR = W - rightW - pad - 8;

  const headH = ctx.s.tick + 14;
  const lh = size * 1.25;
  const H = Math.max(ctx.narrow ? 300 : 380, headH + rows.length * (lh + 1) + 30);
  const top = headH + 12;
  const bottom = H - 12;
  const sy = linear([min, max], [bottom, top]);

  const nodes: SceneNode[] = [];
  nodes.push(text(xL, ctx.s.tick + 4, fromName, 'sansMedium', ctx.s.tick, 'ink2', 'middle'));
  nodes.push(text(xR, ctx.s.tick + 4, toName, 'sansMedium', ctx.s.tick, 'ink2', 'middle'));
  nodes.push(vline(Math.round(xL) + 0.5, headH, H - 2, 'rule'), vline(Math.round(xR) + 0.5, headH, H - 2, 'rule'));

  // Quiet lines first, loud on top.
  const order = rows.map((r, i) => ({ r, i })).sort((p, q) => Number(loud(p.r.label)) - Number(loud(q.r.label)));
  for (const { r } of order) {
    const paint = paintOf(r.label);
    const quiet = paint === 'quiet';
    if (r.a !== null && r.b !== null) nodes.push({ t: 'line', x1: xL, y1: sy(r.a), x2: xR, y2: sy(r.b), stroke: paint, sw: quiet ? 1.25 : 2.25 });
    if (r.a !== null) nodes.push({ t: 'circle', cx: xL, cy: sy(r.a), r: quiet ? 3 : 4, fill: paint, stroke: 'bg', sw: 1.5, tip: `${r.label}, ${fromName}: ${ctx.value(r.a)} ${ctx.chart.units}` });
    if (r.b !== null) nodes.push({ t: 'circle', cx: xR, cy: sy(r.b), r: quiet ? 3 : 4, fill: paint, stroke: 'bg', sw: 1.5, tip: `${r.label}, ${toName}: ${ctx.value(r.b)} ${ctx.chart.units}` });
  }

  // Labels on each side, spread apart; a missing end is labelled where the middle of the scale is.
  const mid = (top + bottom) / 2;
  const sideY = (k: 'a' | 'b') => rows.map((r) => (r[k] === null ? mid : sy(r[k]!)));
  const gap = lh;
  const ysL = spread(rows.map((r, i) => ({ y: sideY('a')[i]!, text: r.label })), gap, top - 4, bottom + 4);
  const ysR = spread(rows.map((r, i) => ({ y: sideY('b')[i]!, text: r.label })), gap, top - 4, bottom + 4);
  rows.forEach((r, i) => {
    const ink: Paint = loud(r.label) ? 'ink' : 'ink2';
    const f = face(r.label);
    const off = size * 0.35;
    // Left: value against the post, the name outside it.
    const yl = ysL[i]!;
    const al = sideY('a')[i]!;
    const vxL = xL - 10;
    if (Math.abs(yl - al) > 2.5) nodes.push({ t: 'line', x1: xL - 5, y1: al, x2: vxL + 2, y2: yl, stroke: 'ink2', sw: 0.6 });
    nodes.push(text(vxL, yl + off, val(r.a), f, size, ink, 'end'));
    if (namesLeft) nodes.push(text(vxL - valW('a') - 8, yl + off, r.label, f, size, ink, 'end'));
    // Right: value against the post, then the name.
    const yr = ysR[i]!;
    const ar = sideY('b')[i]!;
    const vxR = xR + 10;
    if (Math.abs(yr - ar) > 2.5) nodes.push({ t: 'line', x1: xR + 5, y1: ar, x2: vxR - 2, y2: yr, stroke: 'ink2', sw: 0.6 });
    nodes.push(text(vxR, yr + off, val(r.b), f, size, ink));
    nodes.push(text(vxR + valW('b') + 8, yr + off, r.label, f, size, ink));
  });
  return { width: W, height: H, nodes };
}
