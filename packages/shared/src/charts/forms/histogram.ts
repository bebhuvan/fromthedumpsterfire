// Histogram: how many of something fall in each band of a value. Code bins the rows (bins.ts: round
// widths, stated in a gloss); bars stand on zero and touch but for a hairline of ground, their counts
// on a value axis that says what is counted (options.of: "countries"). The rows the editor names
// (options.focus) are loud: their bars take the edition's ink, the rest are grey, and each is named
// above its bar with its own value. A reference line (a rule on x) marks a threshold.

import type { Scene, SceneNode } from '../scene';
import { Ctx, drawYAxis, halo, text, vline, yLabelWidth } from '../frame';
import { bins } from '../bins';
import { niceTicks, linear } from '../scales';
import { Placer, dotBox, placePoint } from '../labels';
import { textWidth, wrapText } from '../text';
import { tightAxis } from './area';

export function drawHistogram(ctx: Ctx): Scene {
  const W = ctx.W;
  const H = ctx.narrow ? 300 : 360;
  const rows = ctx.rows.filter((r) => ctx.num(r, 'y') !== null);
  const values = rows.map((r) => ctx.num(r, 'y')!);
  const b = bins(values.length ? values : [0]);
  const focus = ctx.chart.options?.focus ?? [];
  const named = rows.filter((r) => focus.includes(ctx.str(r, 'label')));
  const loudBins = new Set(named.map((r) => b.index(ctx.num(r, 'y')!)));
  const top = 22 + (named.length ? ctx.s.label + 16 : 0);
  const bottom = H - 30;
  const ax = tightAxis(ctx, [0, ...b.counts], [bottom, top], { zero: true });
  const of = ctx.chart.options?.of?.trim() ?? '';
  const left = Math.ceil(yLabelWidth(ctx, ax, of.length <= 12 ? of : undefined)) + 10;
  const right = W - 8;
  const k = b.counts.length;
  const sx = linear([b.start, b.start + k * b.width], [left, right]);
  const nodes: SceneNode[] = [];
  nodes.push(...drawYAxis(ctx, ax, left, right, { unit: of.length <= 12 ? of : undefined }));
  const step = (right - left) / k;
  const gap = step >= 6 ? 1 : 0;
  const unit = ctx.chart.units;
  b.counts.forEach((c, i) => {
    if (!c) return;
    const x0 = sx(b.start + i * b.width);
    const y = ax.scale(c);
    const lo = b.start + i * b.width;
    const tip = `${ctx.value(lo, 2)} to ${ctx.value(lo + b.width, 2)} ${unit}: ${c} ${of}`;
    nodes.push({ t: 'rect', x: x0 + gap / 2, y, w: step - gap, h: ax.scale(0) - y, fill: named.length ? (loudBins.has(i) ? 'ed' : 'quiet') : 'ed', tip });
  });
  nodes.push({ t: 'line', x1: left, x2: right, y1: Math.round(ax.scale(0)) + 0.5, y2: Math.round(ax.scale(0)) + 0.5, stroke: 'ink', sw: 1 });

  // The value axis: round edges, as many as fit.
  const t = niceTicks(b.start, b.start + k * b.width, ctx.narrow ? 4 : 7);
  let lastR = -Infinity;
  for (const v of t.ticks) {
    if (v < b.start - 1e-9 || v > b.start + k * b.width + 1e-9) continue;
    const x = sx(v);
    const lab = `${ctx.fmt(v, t.step)}${v === t.ticks[t.ticks.length - 1] && unit.length <= 6 ? ` ${unit}` : ''}`;
    const w = textWidth(lab, 'sans', ctx.s.tick);
    const anchor = x + w / 2 > W ? 'end' : 'middle';
    const l = anchor === 'end' ? x - w : x - w / 2;
    if (l < lastR + 6) continue;
    nodes.push(vline(Math.round(x) + 0.5, bottom, bottom + 4, 'ink2'));
    nodes.push(text(anchor === 'end' ? Math.min(W, x) : x, bottom + 6 + ctx.s.tick, lab, 'sans', ctx.s.tick, 'ink2', anchor));
    lastR = l + w;
  }

  // Thresholds the editor drew (rules on x), each named at the top.
  for (const a of ctx.chart.annotations ?? []) {
    if (a.kind !== 'rule' || a.axis !== 'x' || typeof a.value !== 'number') continue;
    const x = sx(a.value);
    if (x < left || x > right) continue;
    nodes.push(vline(x, top - 4, bottom, 'ink', 1));
    const face = a.by === 'editor' ? 'serifItalic' : 'sans';
    const size = a.by === 'editor' ? ctx.s.note - 1 : ctx.s.small;
    const lines = wrapText(a.text, face, size, ctx.narrow ? 120 : 170);
    const toRight = x + 6 + Math.max(...lines.map((s) => textWidth(s, face, size))) <= right;
    lines.forEach((s, j) => nodes.push(halo(toRight ? x + 5 : x - 5, top + size + j * size * 1.2, s, face, size, a.by === 'editor' ? 'ink' : 'mach', toRight ? 'start' : 'end')));
  }

  // The named rows: each over its bar, with its own value.
  const placer = new Placer({ x: 0, y: 0, w: W, h: bottom - 2 });
  for (const n of nodes) if (n.t === 'text') placer.claim({ x: n.anchor === 'end' ? n.x - textWidth(n.text, n.face, n.size) : n.anchor === 'middle' ? n.x - textWidth(n.text, n.face, n.size) / 2 : n.x, y: n.y - n.size * 0.8, w: textWidth(n.text, n.face, n.size), h: n.size });
  for (const r of named) {
    const v = ctx.num(r, 'y')!;
    const i = b.index(v);
    const x = sx(v);
    const y = ax.scale(b.counts[i]!) - 4;
    placer.claim(dotBox(x, y + 2, 1));
    const s = `${ctx.str(r, 'label')} ${ctx.value(v)}`;
    const p = placePoint(placer, { x, y: y - 2, r: 2, text: s, face: 'sansMedium', size: ctx.s.small + 0.5 }, 90);
    nodes.push({ t: 'line', x1: x, x2: x, y1: y, y2: y + 4, stroke: 'ink', sw: 1.25 });
    if (!p) continue;
    if (p.leader) nodes.push({ t: 'line', ...p.leader, stroke: 'ink2', sw: 0.75 });
    nodes.push(halo(p.x, p.y, s, 'sansMedium', ctx.s.small + 0.5, 'ink', p.anchor));
  }
  return { width: W, height: H, nodes };
}
