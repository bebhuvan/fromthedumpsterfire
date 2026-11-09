// dumbbell: two values per row, an earlier one as a ring and a later one as a solid dot, joined by
// a hairline, rows in the order given (the fixture sorts them). The story's row is in the edition's
// ink, the rest grey. The later value is written beside its dot, away from the ring; the top row's
// marks are named with their moments, so the key is drawn with the marks themselves.

import type { Scene, SceneNode } from '../../charts/scene';
import { fmt, xAxis } from '../axes';
import { scale } from '../geom';
import { DASH, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf, type Box } from '../place';

export interface DumbbellRow {
  label: string;
  /** The earlier value (the ring) and the later one (the dot). */
  from: number;
  to: number;
  focus?: boolean;
}

export interface DumbbellFigure {
  form: 'dumbbell';
  /** The two moments, named over the top row's ring and dot. */
  from: string;
  to: string;
  /** What the values count, under the axis. */
  unit: string;
  x: { domain: [number, number]; ticks: number[]; phoneTicks?: number[] };
  decimals: 0 | 1 | 2;
  /** Top to bottom. */
  rows: DumbbellRow[];
  /** A vertical reference, named once at the top. */
  rule?: { x: number; label: string };
}

const ROW = { wide: 24, phone: 22 } as const;
const R = { ring: 4.25, dot: 4.5 } as const;

export function drawDumbbell(f: DumbbellFigure, dev: Device): Scene {
  if (f.rows.filter((r) => r.focus).length > 1) throw new Error('A dumbbell has one row in the ink at most.');
  const T = TYPE[dev], width = WIDTH[dev], size = T.label, vs = T.small, pitch = ROW[dev];
  const val = (v: number) => fmt(v, f.decimals === 0 ? 'int' : f.decimals === 1 ? 'one' : 'two');
  const nameW = Math.max(...f.rows.map((r) => widthOf(r.label, r.focus ? 'sansMedium' : 'sans', size)));
  const valW = Math.max(...f.rows.map((r) => widthOf(val(r.to), 'sansMedium', vs)));
  // Room left of zero for a value written left of a dot that sits near zero.
  const x0 = nameW + 14 + valW + 8, x1 = width - (dev === 'phone' ? 10 : 24);
  const x = scale(f.x.domain, [x0, x1]);
  const headY = T.small + 2, top = headY + 26;
  const rowY = (i: number) => top + i * pitch + pitch / 2;
  const bottom = top + f.rows.length * pitch;
  const height = bottom + T.tick * 4 + 8;
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], marks: SceneNode[] = [], labels: SceneNode[] = [];
  const claim = (b: Box, what: string) => {
    if (!P.free(b)) throw new Error(`No room on the plate for "${what}"`);
    P.block(b);
  };

  const ticks = dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks;
  for (const t of ticks) back.push({ t: 'line', x1: x(t), y1: top - 4, x2: x(t), y2: bottom, stroke: 'rule', sw: STROKE.grid });
  back.push(...xAxis(P, x, ticks, bottom, dev, f.unit));

  if (f.rule) {
    const rx = x(f.rule.x), w = widthOf(f.rule.label, 'sans', T.small);
    back.push({ t: 'line', x1: rx, y1: headY + 6, x2: rx, y2: bottom, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: 0.8 });
    const lx = Math.min(Math.max(rx - w / 2, 0), width - w);
    claim({ x: lx, y: headY - T.small * 0.8, w, h: T.small * 1.05 }, f.rule.label);
    labels.push({ t: 'text', x: lx, y: headY, text: f.rule.label, face: 'sans', size: T.small, fill: 'ink2', stroke: 'bg', sw: 4 });
  }

  f.rows.forEach((r, i) => {
    const cy = rowY(i), a = x(r.from), b = x(r.to);
    const paint = r.focus ? 'ed' : 'quiet3';
    const face = r.focus ? 'sansMedium' as const : 'sans' as const;
    const name = { t: 'text' as const, x: nameW, y: cy + size * 0.35, text: r.label, face, size, anchor: 'end' as const, fill: r.focus ? 'ink' as const : 'ink2' as const };
    claim({ x: nameW - widthOf(r.label, face, size), y: cy - size * 0.55, w: widthOf(r.label, face, size), h: size * 1.05 }, r.label);
    labels.push(name);
    const gap = R.ring + 1;
    if (Math.abs(b - a) > gap + R.dot) marks.push({ t: 'line', x1: a + Math.sign(b - a) * gap, y1: cy, x2: b - Math.sign(b - a) * R.dot, y2: cy, stroke: paint, sw: r.focus ? 1.6 : 1, so: r.focus ? 1 : 0.8 });
    marks.push({ t: 'circle', cx: a, cy, r: R.ring, fill: 'bg', stroke: paint, sw: 1.4 });
    marks.push({ t: 'circle', cx: b, cy, r: R.dot, fill: paint, stroke: 'bg', sw: 1.5 });
    P.block({ x: Math.min(a, b) - R.dot, y: cy - R.dot, w: Math.abs(b - a) + 2 * R.dot, h: 2 * R.dot });
    // The later value beside its dot, on the side away from the ring; else beyond the ring.
    const v = val(r.to), vw = widthOf(v, face, vs), out = b <= a ? -1 : 1;
    const spots = [b + out * (R.dot + 5), a - out * (R.ring + 5)].map((sx, k) => ({ sx, anchor: (k === 0 ? out : -out) < 0 ? 'end' as const : 'start' as const }));
    const spot = spots.find(({ sx, anchor }) => P.free({ x: anchor === 'end' ? sx - vw : sx, y: cy - vs * 0.55, w: vw, h: vs * 1.05 }));
    if (!spot) throw new Error(`No room on the plate for "${r.label} ${v}"`);
    const vx = spot.anchor === 'end' ? spot.sx - vw : spot.sx;
    P.block({ x: vx, y: cy - vs * 0.55, w: vw, h: vs * 1.05 });
    labels.push({ t: 'text', x: spot.sx, y: cy + vs * 0.35, text: v, face, size: vs, anchor: spot.anchor, fill: r.focus ? 'ink' : 'ink2', stroke: 'bg', sw: 3 });
  });

  // The key: the top row's ring and dot named with their moments, just above them.
  const first = f.rows[0];
  if (first) {
    const cy = rowY(0);
    for (const [mx, text] of [[x(first.from), f.from], [x(first.to), f.to]] as const) {
      const w = widthOf(text, 'sans', T.small), ky = cy - R.dot - 9;
      claim({ x: mx - w / 2, y: ky - T.small * 0.8, w, h: T.small * 1.05 }, text);
      labels.push({ t: 'text', x: mx, y: ky, text, face: 'sans', size: T.small, anchor: 'middle', fill: 'ink2', stroke: 'bg', sw: 3 });
    }
  }
  return { width, height, nodes: [...back, ...marks, ...labels] };
}
