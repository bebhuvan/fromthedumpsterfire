// bars: a ranked list as horizontal bars, from zero, in the order given. Square ends, a thin gap of
// ground between bars, each value at its bar's tip; the story's bar in the edition's ink, the rest
// grey. A reference (the world's value) is a dashed rule across the bars, named once at the top.

import type { Scene, SceneNode } from '../../charts/scene';
import { fmt, xAxis } from '../axes';
import { scale } from '../geom';
import { DASH, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf, type Box } from '../place';

export interface BarsFigure {
  form: 'bars';
  /** What the values count, under the axis. */
  unit: string;
  /** The scale starts at zero: a bar's length is its value. */
  x: { domain: [number, number]; ticks: number[]; phoneTicks?: number[] };
  decimals: 0 | 1 | 2;
  /** Top to bottom. */
  bars: { label: string; value: number; focus?: boolean }[];
  rule?: { x: number; label: string };
}

/** Bar thickness and the ground between bars (the grammar caps a bar at 22 px). */
const BAR = { wide: 18, phone: 16, gap: 2 } as const;

export function drawBars(f: BarsFigure, dev: Device): Scene {
  if (f.x.domain[0] !== 0) throw new Error('Bars start at zero.');
  if (f.bars.some((b) => !(b.value >= 0) || b.value > f.x.domain[1])) throw new Error('Every bar is zero or more and inside the scale.');
  if (f.bars.filter((b) => b.focus).length > 1) throw new Error('Bars have one in the ink at most.');
  const T = TYPE[dev], width = WIDTH[dev], size = T.label, vs = T.small;
  const thick = BAR[dev], pitch = thick + BAR.gap;
  const val = (v: number) => fmt(v, f.decimals === 0 ? 'int' : f.decimals === 1 ? 'one' : 'two');
  const nameW = Math.max(...f.bars.map((b) => widthOf(b.label, b.focus ? 'sansMedium' : 'sans', size)));
  const x0 = nameW + 10, x1 = width - (dev === 'phone' ? 12 : 24);
  const x = scale(f.x.domain, [x0, x1]);
  const headY = T.small + 2, top = headY + 14;
  const bottom = top + f.bars.length * pitch - BAR.gap;
  const height = bottom + T.tick * 4 + 8;
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], marks: SceneNode[] = [], labels: SceneNode[] = [];
  const claim = (b: Box, what: string) => {
    if (!P.free(b)) throw new Error(`No room on the plate for "${what}"`);
    P.block(b);
  };

  const ticks = dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks;
  for (const t of ticks) if (t !== 0) back.push({ t: 'line', x1: x(t), y1: top, x2: x(t), y2: bottom, stroke: 'rule', sw: STROKE.grid });
  back.push(...xAxis(P, x, ticks, bottom + 2, dev, f.unit));

  f.bars.forEach((b, i) => {
    const y0 = top + i * pitch, cy = y0 + thick / 2;
    const face = b.focus ? 'sansMedium' : 'sans', ink = b.focus ? 'ink' as const : 'ink2' as const;
    const tip = x(b.value);
    marks.push({ t: 'rect', x: x0, y: y0, w: tip - x0, h: thick, fill: b.focus ? 'ed' : 'quiet3' });
    P.block({ x: x0, y: y0, w: tip - x0, h: thick });
    const nw = widthOf(b.label, face, size);
    claim({ x: x0 - 10 - nw, y: cy - size * 0.55, w: nw, h: size * 1.05 }, b.label);
    labels.push({ t: 'text', x: x0 - 10, y: cy + size * 0.35, text: b.label, face, size, anchor: 'end', fill: ink });
    const v = val(b.value), vw = widthOf(v, face, vs);
    claim({ x: tip + 5, y: cy - vs * 0.55, w: vw, h: vs * 1.05 }, `${b.label} ${v}`);
    labels.push({ t: 'text', x: tip + 5, y: cy + vs * 0.35, text: v, face, size: vs, fill: ink, stroke: 'bg', sw: 3 });
  });
  // The zero line over the bars' square starts.
  marks.push({ t: 'line', x1: x0, y1: top - 4, x2: x0, y2: bottom + 2, stroke: 'ink', sw: STROKE.grid });

  if (f.rule) {
    const rx = x(f.rule.x), w = widthOf(f.rule.label, 'sans', T.small);
    marks.push({ t: 'line', x1: rx, y1: headY + 5, x2: rx, y2: bottom + 2, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: 0.85 });
    const lx = Math.min(Math.max(rx - w / 2, 0), width - w);
    claim({ x: lx, y: headY - T.small * 0.8, w, h: T.small * 1.05 }, f.rule.label);
    labels.push({ t: 'text', x: lx, y: headY, text: f.rule.label, face: 'sans', size: T.small, fill: 'ink2', stroke: 'bg', sw: 4 });
  }
  return { width, height, nodes: [...back, ...marks, ...labels] };
}
