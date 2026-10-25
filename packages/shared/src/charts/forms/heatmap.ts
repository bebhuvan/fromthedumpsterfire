// Heatmap: a value for every pair of two categories (month by year, say). Rows are named on the left,
// columns along the top (years thinned to round ones); cells sit on the sequential ramp (or the
// diverging ramp around a stated midpoint) with a hairline of ground between them, and a cell with
// no value is drawn as missing. Rows keep the order they first appear in, or go by their average
// when the editor asks for options.sort "value".

import type { Scene, SceneNode } from '../scene';
import { Ctx, shortUnit, text } from '../frame';
import { drawKey, rampFor } from '../ramp';
import { textWidth } from '../text';

export function drawHeatmap(ctx: Ctx): Scene {
  const colType = ctx.column('x')?.type;
  const cols = ctx.groups('x');
  if (colType === 'year' || cols.every((c) => /^-?\d+(\.\d+)?$/.test(c))) cols.sort((a, b) => Number(a) - Number(b));
  let rows = ctx.groups('label');
  const cells = new Map<string, number | null>();
  for (const r of ctx.rows) cells.set(`${ctx.str(r, 'label')}\u0000${ctx.str(r, 'x')}`, ctx.num(r, 'y'));
  if (ctx.chart.options?.sort === 'value') {
    const mean = (row: string) => {
      const v = cols.map((c) => cells.get(`${row}\u0000${c}`)).filter((x): x is number => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -Infinity;
    };
    rows = [...rows].sort((a, b) => mean(b) - mean(a));
  }
  const values = [...cells.values()].filter((v): v is number => v !== null);
  const ramp = rampFor(ctx, values.length ? values : [0]);
  const W = ctx.W;
  const size = ctx.s.tick;
  const left = Math.ceil(Math.max(...rows.map((r) => textWidth(r, 'sans', size)))) + 8;
  const top = size + 8;
  const avail = W - left;
  const rawPitch = avail / Math.max(1, cols.length);
  // Columns keep a hairline of ground between them while there is room for one; rows always do.
  const gap = rawPitch >= 12 ? 2 : rawPitch >= 6 ? 1 : 0;
  const cw = rawPitch - gap;
  const rowPitch = Math.max(rawPitch, ctx.narrow ? 15 : 19);
  const ch = rowPitch - 2;
  const nodes: SceneNode[] = [];
  let missing = false;
  const unit = ctx.chart.units;

  // Column labels: all of them when they fit; for years, round years spaced to fit.
  const numeric = colType === 'year' || cols.every((c) => /^-?\d+$/.test(c));
  const widest = Math.max(...cols.map((c) => textWidth(c, 'sans', size))) + 6;
  let shown: Set<string>;
  if (widest <= rawPitch) shown = new Set(cols);
  else if (numeric) {
    const need = widest / rawPitch;
    const step = [2, 5, 10, 20, 25, 50, 100].find((s) => s >= need) ?? 100;
    shown = new Set(cols.filter((c) => Number(c) % step === 0));
  } else {
    const every = Math.ceil(widest / rawPitch);
    shown = new Set(cols.filter((_, i) => i % every === 0));
  }
  cols.forEach((c, j) => {
    if (!shown.has(c)) return;
    const x = left + j * rawPitch;
    const anchor = rawPitch >= widest ? 'middle' : 'start';
    if (anchor === 'start' && x + widest - 6 > W) return;
    nodes.push(text(anchor === 'middle' ? x + cw / 2 : x, top - 7, c, 'sans', size, 'ink2', anchor));
    if (anchor === 'start') nodes.push({ t: 'line', x1: x + 0.5, x2: x + 0.5, y1: top - 4, y2: top - 1, stroke: 'ink2', sw: 1 });
  });

  rows.forEach((row, i) => {
    const y = top + i * rowPitch;
    nodes.push(text(left - 8, y + ch / 2 + size * 0.36, row, 'sans', size, 'ink2', 'end'));
    cols.forEach((c, j) => {
      const x = left + j * rawPitch;
      const k = `${row}\u0000${c}`;
      const v = cells.has(k) ? cells.get(k)! : null;
      if (v === null) {
        missing = true;
        if (cw >= 4) nodes.push({ t: 'rect', x: x + 0.5, y: y + 0.5, w: cw - 1, h: ch - 1, stroke: 'rule', sw: 1, tip: `${row}, ${c}: no data` });
        return;
      }
      nodes.push({ t: 'rect', x, y, w: cw + (gap === 0 ? 0.4 : 0), h: ch, fill: ramp.paint(v), tip: `${row}, ${c}: ${ctx.value(v)} ${unit}` });
    });
  });

  const keyY = top + rows.length * rowPitch + 14;
  const key = drawKey(ctx, ramp, left, keyY, ctx.narrow ? W - left : Math.min(W - left, 360), { unit: shortUnit(unit) ?? '', missing });
  nodes.push(...key.nodes);
  return { width: W, height: Math.ceil(keyY + key.height + 2), nodes };
}
