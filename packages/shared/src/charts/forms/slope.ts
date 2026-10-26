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
  // Room for a stepped-out label column on either side (see below).
  const xL = leftW + pad + 24;
  const xR = W - rightW - pad - 24;

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
  // When a side's labels had to move, its column steps out from the post and each moved label is
  // joined to its dot by a short level stub and a diagonal, so the leaders fan out and never cross.
  const mid = (top + bottom) / 2;
  const sideY = (k: 'a' | 'b') => rows.map((r) => (r[k] === null ? mid : sy(r[k]!)));
  const gap = lh;
  const ysL = spread(rows.map((r, i) => ({ y: sideY('a')[i]!, text: r.label })), gap, top - 4, bottom + 4);
  const ysR = spread(rows.map((r, i) => ({ y: sideY('b')[i]!, text: r.label })), gap, top - 4, bottom + 4);
  const movedL = ysL.some((y, i) => Math.abs(y - sideY('a')[i]!) > 2.5);
  const movedR = ysR.some((y, i) => Math.abs(y - sideY('b')[i]!) > 2.5);
  const offL = movedL ? 26 : 10;
  const offR = movedR ? 26 : 10;
  const leader = (x: number, dir: -1 | 1, from: number, to: number, off: number): SceneNode => ({
    t: 'path',
    d: `M${(x + dir * 5).toFixed(2)},${from.toFixed(2)}L${(x + dir * 9).toFixed(2)},${from.toFixed(2)}L${(x + dir * (off - 3)).toFixed(2)},${to.toFixed(2)}`,
    stroke: 'ink2',
    sw: 0.6,
  });
  // Three or more labels crowding one spot on a post share a bracket: it spans their dots, and one
  // stub joins it to the middle of their stacked labels, instead of a leader each.
  const bracketed = (anchors: number[], ys: number[], post: number, dir: -1 | 1, off: number): Set<number> => {
    const order = anchors.map((a, i) => i).sort((p, q) => anchors[p]! - anchors[q]!);
    const groups: number[][] = [];
    for (const i of order) {
      const g = groups[groups.length - 1];
      if (g && anchors[i]! - anchors[g[g.length - 1]!]! < gap * 0.5) g.push(i);
      else groups.push([i]);
    }
    const out = new Set<number>();
    for (const g of groups) {
      if (g.length < 3) continue;
      const a0 = Math.min(...g.map((i) => anchors[i]!));
      const a1 = Math.max(...g.map((i) => anchors[i]!));
      const l0 = Math.min(...g.map((i) => ys[i]!));
      const l1 = Math.max(...g.map((i) => ys[i]!));
      const bx = post + dir * 8;
      nodes.push({ t: 'path', d: `M${(post + dir * 5).toFixed(2)},${(a0 - 1).toFixed(2)}L${bx.toFixed(2)},${(a0 - 1).toFixed(2)}L${bx.toFixed(2)},${(a1 + 1).toFixed(2)}L${(post + dir * 5).toFixed(2)},${(a1 + 1).toFixed(2)}`, stroke: 'ink2', sw: 0.75 });
      nodes.push({ t: 'line', x1: bx, y1: (a0 + a1) / 2, x2: post + dir * (off - 4), y2: (l0 + l1) / 2, stroke: 'ink2', sw: 0.75 });
      // The stack itself gets a hairline down its edge, so it reads as one group.
      nodes.push({ t: 'line', x1: post + dir * (off - 4), y1: l0 - size * 0.45, x2: post + dir * (off - 4), y2: l1 + size * 0.45, stroke: 'ink2', sw: 0.75 });
      for (const i of g) out.add(i);
    }
    return out;
  };
  const inBracketL = bracketed(sideY('a'), ysL, xL, -1, offL);
  const inBracketR = bracketed(sideY('b'), ysR, xR, 1, offR);
  rows.forEach((r, i) => {
    const ink: Paint = loud(r.label) ? 'ink' : 'ink2';
    const f = face(r.label);
    const off = size * 0.35;
    // Left: value against the post, the name outside it.
    const yl = ysL[i]!;
    const al = sideY('a')[i]!;
    const vxL = xL - offL;
    if (Math.abs(yl - al) > 2.5 && !inBracketL.has(i)) nodes.push(leader(xL, -1, al, yl, offL));
    nodes.push(text(vxL, yl + off, val(r.a), f, size, ink, 'end'));
    if (namesLeft) nodes.push(text(vxL - valW('a') - 8, yl + off, r.label, f, size, ink, 'end'));
    // Right: value against the post, then the name.
    const yr = ysR[i]!;
    const ar = sideY('b')[i]!;
    const vxR = xR + offR;
    if (Math.abs(yr - ar) > 2.5 && !inBracketR.has(i)) nodes.push(leader(xR, 1, ar, yr, offR));
    nodes.push(text(vxR, yr + off, val(r.b), f, size, ink));
    nodes.push(text(vxR + valW('b') + 8, yr + off, r.label, f, size, ink));
  });
  return { width: W, height: H, nodes };
}
