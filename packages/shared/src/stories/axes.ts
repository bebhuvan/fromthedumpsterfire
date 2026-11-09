// The parts every plate shares: ticks and their unit, the time axis, the seam between estimates and
// projections, the hatched ranges. Each registers what it draws with the placer.

import type { SceneNode } from '../charts/scene';
import { areaOf, hatch, hatchPath, type Pt, type Scale } from './geom';
import { DASH, HATCH, OPACITY, STROKE, TYPE, type Device } from './grammar';
import { widthOf, type Placer } from './place';
import type { Axis, Range } from './spec';

export function fmt(v: number, f: Axis['format'] = 'int'): string {
  if (f === 'one') return v.toFixed(1);
  if (f === 'two') return v.toFixed(2);
  if (f === 'million') return v === 0 ? '0' : `${Math.round(v / 1e6)}`;
  if (f === 'billion') return v === 0 ? '0' : `${+(v / 1e9).toFixed(1)} bn`;
  return String(Math.round(v));
}

const text = (x: number, y: number, t: string, size: number, anchor: 'start' | 'middle' | 'end' = 'start', fill: 'ink2' | 'ink' = 'ink2'): SceneNode =>
  ({ t: 'text', x, y, text: t, face: 'sans', size, anchor, fill });

/** Gridlines and ticks for a y axis, its unit above the top tick, clear of the plot. */
export function yAxis(P: Placer, y: Scale, a: Axis, x0: number, x1: number, dev: Device): SceneNode[] {
  const size = TYPE[dev].tick;
  const out: SceneNode[] = [];
  for (const t of a.ticks) {
    out.push({ t: 'line', x1: x0, y1: y(t), x2: x1, y2: y(t), stroke: t === 0 ? 'ink' : 'rule', sw: STROKE.grid });
    const lab = fmt(t, a.format);
    const w = widthOf(lab, 'sans', size);
    out.push(text(x0 - 6, y(t) + size * 0.35, lab, size, 'end'));
    P.block({ x: x0 - 6 - w, y: y(t) - size * 0.8, w, h: size });
  }
  const top = y(a.ticks[a.ticks.length - 1]!) - size * 1.3;
  const left = x0 - 6 - widthOf(fmt(a.ticks[0]!, a.format), 'sans', size);
  out.push(text(left, top, a.unit, size));
  P.block({ x: left, y: top - size, w: widthOf(a.unit, 'sans', size) + 4, h: size + 4 });
  return out;
}

export function xAxis(P: Placer, x: Scale, ticks: number[], y0: number, dev: Device, title?: string): SceneNode[] {
  const size = TYPE[dev].tick;
  const out: SceneNode[] = [];
  for (const t of ticks) {
    out.push({ t: 'line', x1: x(t), y1: y0, x2: x(t), y2: y0 + 4, stroke: 'ink2', sw: STROKE.hair });
    out.push(text(x(t), y0 + 6 + size, String(t), size, 'middle'));
    const w = widthOf(String(t), 'sans', size);
    P.block({ x: x(t) - w / 2 - 2, y: y0, w: w + 4, h: size + 8 });
  }
  if (title) {
    out.push(text(x.range[0], y0 + 6 + size * 2.5, title, size));
    P.block({ x: x.range[0], y: y0 + size * 1.5, w: widthOf(title, 'sans', size), h: size + 6 });
  }
  return out;
}

/** The seam: a dotted hairline, "Estimated" to its left and "Projected" to its right, above the plot. */
export function seam(P: Placer, x: number, top: number, bottom: number, dev: Device): SceneNode[] {
  const size = TYPE[dev].tick;
  // The same words at both widths, and the same as the key's.
  const a = 'Estimated', b = 'Projected';
  const wa = widthOf(a, 'sans', size), wb = widthOf(b, 'sans', size);
  P.block({ x: x - wa - 8, y: top - size, w: wa + wb + 16, h: size + 4 });
  return [
    { t: 'line', x1: x, y1: top + 5, x2: x, y2: bottom, stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam },
    text(x - 6, top, a, size, 'end'),
    text(x + 6, top, b, size),
  ];
}

/** A range as hatching in the edition's ink: the 95 per cent range open, the 80 per cent close. */
export function ranges(r: Range, x: Scale, y: Scale, P?: Placer): SceneNode[] {
  const f = (s: Pt[]) => s.map(([a, b]) => [x(a), y(b)] as Pt);
  const hi95 = f(r.hi95), lo95 = f(r.lo95), hi80 = f(r.hi80), lo80 = f(r.lo80);
  if (P) hi95.forEach((p, i) => P.block({ x: p[0] - 2, y: p[1], w: 4, h: lo95[i]![1] - p[1] }));
  return [
    { t: 'path', d: areaOf(hi95, lo95), fill: 'ed', fo: 0.05 },
    { t: 'path', d: hatchPath(hatch(hi95, lo95, HATCH.open)), stroke: 'ed', sw: HATCH.weight * 0.8, so: OPACITY.hatch * 0.8 },
    { t: 'path', d: hatchPath(hatch(hi80, lo80, HATCH.close)), stroke: 'ed', sw: HATCH.weight, so: OPACITY.hatch },
  ];
}
