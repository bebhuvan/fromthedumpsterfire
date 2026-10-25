// Dumbbell: two values for each category, joined. The "from" value is a ring and the "to" value a
// solid dot, so the two read apart without a second colour (and in grey print). A key above names
// the two columns. The loud rows are in the edition's ink, the rest quiet.

import type { Paint, Scene, SceneNode } from '../scene';
import { Ctx, hline, shortUnit, text } from '../frame';
import { linear, niceTicks } from '../scales';
import { textWidth } from '../text';
import { drawKey, drawRowLabel, drawValueAxisTop, labelColumn, orderRows } from './category';

export function drawDumbbell(ctx: Ctx): Scene {
  const W = ctx.W;
  const rows = orderRows(ctx, ctx.rows, (r) => ctx.num(r, 'to'));
  const labels = rows.map((r) => ctx.str(r, 'label'));
  const focusList = ctx.chart.options?.focus ?? [];
  const isFocus = (l: string) => focusList.includes(l);
  const col = labelColumn(ctx, labels, isFocus);
  const fromName = ctx.column('from')?.label ?? 'From';
  const toName = ctx.column('to')?.label ?? 'To';

  const vals: number[] = [];
  for (const r of rows) for (const role of ['from', 'to'] as const) {
    const v = ctx.num(r, role);
    if (v !== null) vals.push(v);
  }
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (ctx.chart.scale?.y?.zero) ((min = Math.min(0, min)), (max = Math.max(0, max)));
  const t = niceTicks(min, max, ctx.narrow ? 4 : 6);
  // Values print for the loud rows, on the outside of each end.
  const valueW = Math.max(0, ...rows.filter((r) => isFocus(ctx.str(r, 'label'))).flatMap((r) => (['from', 'to'] as const).map((k) => {
    const v = ctx.num(r, k);
    return v === null ? 0 : textWidth(ctx.value(v), 'sansMedium', ctx.s.small);
  })));
  const x0 = col.width + 18 + (valueW ? valueW + 6 : 0);
  const x1 = W - Math.max(14, valueW + 14);
  const sx = linear(t.domain, [x0, x1]);
  const paintOf = (l: string): Paint => (!focusList.length || isFocus(l) ? 'ed' : 'quiet');

  const nodes: SceneNode[] = [];
  const keyPaint: Paint = 'ed';
  const key = drawKey(
    ctx,
    [
      { name: fromName, mark: (x, y) => [{ t: 'circle', cx: x, cy: y, r: 4.25, fill: 'bg', stroke: keyPaint, sw: 1.75 }] },
      { name: toName, mark: (x, y) => [{ t: 'circle', cx: x, cy: y, r: 5, fill: keyPaint }] },
    ],
    x0,
    4 + ctx.s.label / 2,
    W,
  );
  nodes.push(...key.nodes);
  const top = 4 + key.height + 4 + ctx.s.tick + 12;
  const lh = ctx.s.label * 1.18;
  const pitch = Math.max(ctx.narrow ? 28 : 30, col.maxLines * lh + 10);
  const H = top + rows.length * pitch + 6;
  nodes.push(...drawValueAxisTop(ctx, sx, t.ticks, t.step, top, H - 4, shortUnit(ctx.chart.units)));

  rows.forEach((r, i) => {
    const label = labels[i]!;
    const yc = top + i * pitch + pitch / 2;
    nodes.push(...drawRowLabel(ctx, col.lines.get(label)!, col.width + 8, yc, isFocus(label)));
    const a = ctx.num(r, 'from');
    const b = ctx.num(r, 'to');
    const paint = paintOf(label);
    if (a === null && b === null) {
      nodes.push(hline(x0, x1, yc, 'rule', 1), text(x0 + 4, yc - 6, 'no data', 'sans', ctx.s.small, 'ink2'));
      return;
    }
    if (a !== null && b !== null) nodes.push(hline(sx(a), sx(b), yc, paint === 'ed' ? 'ed' : 'quiet', paint === 'ed' ? 2.5 : 2));
    if (a !== null) nodes.push({ t: 'circle', cx: sx(a), cy: yc, r: 4.25, fill: 'bg', stroke: paint, sw: 1.75, tip: `${label}, ${fromName}: ${ctx.value(a)} ${ctx.chart.units}` });
    if (b !== null) nodes.push({ t: 'circle', cx: sx(b), cy: yc, r: 5, fill: paint, stroke: 'bg', sw: 2, tip: `${label}, ${toName}: ${ctx.value(b)} ${ctx.chart.units}` });
    if (a === null || b === null) {
      const which = a === null ? fromName : toName;
      nodes.push(text(x1, yc - 7, `no data for ${which}`, 'sans', ctx.s.small, 'ink2', 'end'));
    }
    if (isFocus(label) && a !== null && b !== null) {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      nodes.push(text(sx(lo) - 9, yc + ctx.s.small * 0.35, ctx.value(lo), 'sansMedium', ctx.s.small, 'ink', 'end'));
      nodes.push(text(sx(hi) + 9, yc + ctx.s.small * 0.35, ctx.value(hi), 'sansMedium', ctx.s.small, 'ink'));
    }
  });
  return { width: W, height: H, nodes };
}
