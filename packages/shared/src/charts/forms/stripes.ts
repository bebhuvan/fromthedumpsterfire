// Warming stripes (after Ed Hawkins): one stripe a year, edge to edge with nothing else in the
// picture. Each year takes its own shade of the continuous diverging ramp (41 steps around the stated
// midpoint, symmetric, reaching a round number past the farthest year), so no two neighbouring years
// merge into a block unless their values are within a hair. Stripes overlap by half a pixel so the
// ground never shows between them. Years are marked under the stripes, sparingly; the key says what
// the colours mean. A year with no value is left as a gap and the key says so.

import type { Scene, SceneNode } from '../scene';
import { Ctx, shortUnit, text, vline } from '../frame';
import { continuousRamp, drawKey } from '../ramp';
import { linear, yearTicks } from '../scales';
import { textWidth } from '../text';

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
  const ramp = continuousRamp(values.length ? values : [0], ctx.chart.options?.midpoint ?? { value: 0, label: 'zero' }, Boolean(ctx.chart.measure?.money));

  const W = ctx.W;
  const stripeH = ctx.narrow ? 190 : 270;
  const top = 0;
  const sx = linear([first, last + 1], [0, W]);
  const nodes: SceneNode[] = [];
  let missing = false;
  const unit = ctx.chart.units;
  for (let y = first; y <= last; y++) {
    const v = byYear.has(y) ? byYear.get(y)! : null;
    if (v === null) {
      missing = true;
      continue;
    }
    const x0 = sx(y);
    const x1 = sx(y + 1);
    const next = byYear.get(y + 1);
    nodes.push({ t: 'rect', x: x0, y: top, w: x1 - x0 + (y < last && next !== null && next !== undefined ? 0.5 : 0), h: stripeH, fill: ramp.paint(v), tip: `${y}: ${ctx.value(v)} ${unit}` });
  }

  // Years under the stripes: the first and last, and round years between, kept clear of each other.
  const axisY = top + stripeH;
  const size = ctx.s.tick;
  const ticks = yearTicks(first, last, ctx.narrow ? 4 : 7).filter((t) => t > first && t < last);
  const w4 = textWidth('0000', 'sans', size);
  const clear = w4 + (ctx.narrow ? 14 : 18);
  const marks = [first, ...ticks.filter((t) => sx(t + 0.5) - sx(first + 0.5) > clear && sx(last + 0.5) - sx(t + 0.5) > clear), last];
  for (const t of marks) {
    const x = sx(t + 0.5);
    nodes.push(vline(Math.round(x) + 0.5, axisY, axisY + 4, 'ink2'));
    const anchor = t === first && x < w4 / 2 + 1 ? 'start' : t === last && W - x < w4 / 2 + 1 ? 'end' : 'middle';
    nodes.push(text(anchor === 'start' ? 0 : anchor === 'end' ? W : x, axisY + 6 + size, String(t), 'sans', size, 'ink2', anchor));
  }

  const keyY = axisY + 6 + size + (ctx.narrow ? 18 : 22);
  const key = drawKey(ctx, ramp, 0, keyY, W, { unit: shortUnit(unit) ?? '', missing });
  nodes.push(...key.nodes);
  return { width: W, height: Math.ceil(keyY + key.height + 2), nodes };
}
