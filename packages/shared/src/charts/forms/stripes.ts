// Warming stripes (after Ed Hawkins): one stripe a year, coloured on the diverging ramp around a
// stated midpoint, edge to edge with nothing else in the picture. Years are marked under the
// stripes, sparingly; the key says what the colours mean. A year with no value is left blank and
// the key says so.

import type { Scene, SceneNode } from '../scene';
import { Ctx, shortUnit, text, vline } from '../frame';
import { divergingRamp, drawKey } from '../ramp';
import { linear, yearTicks } from '../scales';

export function drawStripes(ctx: Ctx): Scene {
  const byYear = new Map<number, number | null>();
  for (const r of ctx.rows) {
    const x = ctx.num(r, 'x');
    if (x === null) continue;
    byYear.set(Math.round(x), ctx.num(r, 'y'));
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const first = years[0] ?? 0;
  const last = years[years.length - 1] ?? 0;
  const values = [...byYear.values()].filter((v): v is number => v !== null);
  const ramp = divergingRamp(values.length ? values : [0], ctx.chart.options?.midpoint ?? { value: 0, label: 'zero' });

  const W = ctx.W;
  const stripeH = ctx.narrow ? 170 : 250;
  const top = 0;
  const n = last - first + 1;
  const sx = linear([first, last + 1], [0, W]);
  const nodes: SceneNode[] = [];
  let missing = false;
  const unit = ctx.chart.units;
  for (let y = first; y <= last; y++) {
    const v = byYear.has(y) ? byYear.get(y)! : null;
    const x0 = sx(y);
    const x1 = sx(y + 1);
    if (v === null) {
      missing = true;
      continue;
    }
    // Each stripe overlaps the next by a hair so no seam of the ground shows between them.
    nodes.push({ t: 'rect', x: x0, y: top, w: x1 - x0 + (y < last ? 0.6 : 0), h: stripeH, fill: ramp.paint(v), tip: `${y}: ${ctx.value(v)} ${unit}` });
  }

  // Years under the stripes: the first and last, and round years between (kept clear of the ends).
  const axisY = top + stripeH;
  const size = ctx.s.tick;
  const ticks = yearTicks(first, last, ctx.narrow ? 4 : 7).filter((t) => t > first && t < last);
  const minGap = ctx.narrow ? 46 : 44;
  const marks = [first, ...ticks.filter((t) => sx(t + 0.5) - sx(first + 0.5) > minGap && sx(last + 0.5) - sx(t + 0.5) > minGap), last];
  for (const t of marks) {
    const x = sx(t + 0.5);
    nodes.push(vline(Math.round(x) + 0.5, axisY, axisY + 4, 'ink2'));
    const anchor = t === first && x < 16 ? 'start' : t === last && W - x < 16 ? 'end' : 'middle';
    nodes.push(text(anchor === 'start' ? Math.max(0, x - 3) : anchor === 'end' ? Math.min(W, x + 3) : x, axisY + 6 + size, String(t), 'sans', size, 'ink2', anchor));
  }

  const keyY = axisY + 6 + size + (ctx.narrow ? 18 : 22);
  const key = drawKey(ctx, ramp, 0, keyY, ctx.narrow ? W : Math.min(W, 360), { unit: shortUnit(unit) ?? '', missing });
  nodes.push(...key.nodes);
  void n;
  return { width: W, height: Math.ceil(keyY + key.height + 2), nodes };
}
