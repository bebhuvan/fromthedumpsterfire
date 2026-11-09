// scatter: two measures together, one circle per member, its area its weight. Biggest drawn first so
// the small sit on top, each ringed in the ground; the story's member in the edition's ink, the rest
// a quiet grey. A reference rule across, the named members labelled beside their circles (on a
// leader when they must move), and a key of two circles that says what the areas mean.

import type { Scene, SceneNode } from '../../charts/scene';
import { xAxis, yAxis } from '../axes';
import { scale } from '../geom';
import { DASH, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf, type Box } from '../place';
import type { Axis, XAxis } from '../spec';
import { nameMark, referenceRule, type Part } from './marks';

export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  /** What the circle's area stands for (people). */
  weight: number;
  focus?: boolean;
  /** Named on the plate. */
  named?: boolean;
}

export interface ScatterFigure {
  form: 'scatter';
  x: XAxis & { title: string };
  y: Axis;
  points: ScatterPoint[];
  rule?: { y: number; label: string };
  /** The size key: weights drawn as circles, each with what it is ("100 million"). Not data. */
  sizeKey: { title: string; circles: { weight: number; label: string }[] };
}

/** The plot's margins: no end labels here, so the right margin is narrow. */
const PLOT = {
  wide: { left: 38, right: 18, top: 34, bottom: 46, height: 470, maxR: 30, reach: 56 },
  phone: { left: 30, right: 10, top: 34, bottom: 46, height: 400, maxR: 16, reach: 44 },
} as const;

export function drawScatter(f: ScatterFigure, dev: Device): Scene {
  const T = TYPE[dev], L = PLOT[dev], width = WIDTH[dev];
  const height = L.top + L.height + L.bottom;
  const x = scale(f.x.domain, [L.left, width - L.right]);
  const y = scale(f.y.domain, [L.top + L.height, L.top]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], marks: SceneNode[] = [], labels: SceneNode[] = [];
  const xBottom = L.top + L.height;
  back.push(...yAxis(P, y, f.y, L.left, width - L.right, dev));
  back.push(...xAxis(P, x, dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks, xBottom, dev, f.x.title));

  const maxW = Math.max(...f.points.map((p) => p.weight), ...f.sizeKey.circles.map((c) => c.weight));
  const rOf = (w: number) => Math.max(DOT.note * (dev === 'phone' ? 0.75 : 0.9), L.maxR * Math.sqrt(w / maxW));
  const dots = f.points.map((p) => ({ p, cx: x(p.x), cy: y(p.y), r: rOf(p.weight) }));
  for (const d of dots) if (d.cx < L.left || d.cx > width - L.right || d.cy < L.top || d.cy > xBottom) throw new Error(`${d.p.label} is off the scale`);
  // Biggest first, so a small member is never hidden under a large one; the focus last of all.
  for (const d of dots.slice().sort((a, b) => Number(!!a.p.focus) - Number(!!b.p.focus) || b.r - a.r)) {
    marks.push({ t: 'circle', cx: d.cx, cy: d.cy, r: d.r, fill: d.p.focus ? 'ed' : 'quiet3', stroke: 'bg', sw: Math.min(STROKE.hair, d.r * 0.3), tip: d.p.label });
    P.circle(d.cx, d.cy, d.r);
  }
  // Names stay inside the plot, clear of the axis line and its ticks.
  P.block({ x: 0, y: xBottom - 1, w: width, h: height - xBottom + 1 });
  if (f.rule) labels.push(...referenceRule(P, f.rule, y, L.left, width - L.right, dev));
  labels.push(...sizeKey(P, f.sizeKey, rOf, { x: L.left, y: L.top, w: width - L.right - L.left, h: L.height }, dev));
  const named = dots.filter((d) => d.p.named || d.p.focus).sort((a, b) => Number(!!b.p.focus) - Number(!!a.p.focus) || b.r - a.r);
  for (const d of named) {
    const part: Part = { text: d.p.label, face: d.p.focus ? 'sansMedium' : 'sans', paint: d.p.focus ? 'ink' : 'ink2' };
    labels.push(...nameMark(P, [part], T.label, d, { others: dots, reach: L.reach }));
  }
  return { width, height, nodes: [...back, ...marks, ...labels] };
}

/**
 * The size key: the circles nested on one baseline, each with a hairline from its top to its words,
 * put in the first corner of the plot that nothing else uses (throws when none is free).
 */
function sizeKey(P: Placer, k: ScatterFigure['sizeKey'], rOf: (w: number) => number, plot: Box, dev: Device): SceneNode[] {
  const T = TYPE[dev], size = T.tick;
  const circles = k.circles.slice().sort((a, b) => b.weight - a.weight).map((c) => ({ ...c, r: rOf(c.weight) }));
  const R = circles[0]!.r;
  const textW = Math.max(widthOf(k.title, 'sans', size) - 2 * R - 6, ...circles.map((c) => widthOf(c.label, 'sans', size)));
  const w = 2 * R + 6 + textW, h = size * 1.6 + 2 * R;
  const spots: [number, number][] = [
    [plot.x + plot.w - w - 4, plot.y + 4],
    [plot.x + plot.w - w - 4, plot.y + plot.h - h - 4],
    [plot.x + plot.w / 2 - w / 2, plot.y + 4],
    [plot.x + 8, plot.y + plot.h - h - 4],
  ];
  for (const [bx, by] of spots) {
    const box = { x: bx, y: by, w, h };
    if (!P.free(box)) continue;
    P.block(box);
    const cx = bx + R, base = by + h;
    const out: SceneNode[] = [{ t: 'text', x: bx, y: by + size * 0.8, text: k.title, face: 'sans', size, fill: 'ink2' }];
    for (const c of circles) {
      const top = base - 2 * c.r;
      out.push({ t: 'circle', cx, cy: base - c.r, r: c.r, stroke: 'ink2', sw: STROKE.hair });
      out.push({ t: 'line', x1: cx, y1: top, x2: cx + R + 4, y2: top, stroke: 'ink2', sw: STROKE.hair * 0.7, dash: DASH.seam });
      out.push({ t: 'text', x: cx + R + 6, y: top + size * 0.35, text: c.label, face: 'sans', size, fill: 'ink2' });
    }
    return out;
  }
  throw new Error('No room on the plate for the size key');
}
