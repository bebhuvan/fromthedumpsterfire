// scatter: two measures together, one circle per member, its area its weight. Biggest drawn first so
// the small sit on top, each ringed in the ground; the story's member in the edition's ink, the rest
// a quiet grey. A reference rule across, the named members labelled beside their circles (on a
// leader when they must move), and a key of two circles that says what the areas mean.

import type { Scene, SceneNode } from '../../charts/scene';
import type { ChartFace } from '../../charts/metrics';
import { xAxis, yAxis } from '../axes';
import { scale, type Pt } from '../geom';
import { DASH, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf, type Box } from '../place';
import type { Axis, XAxis } from '../spec';

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
  wide: { left: 38, right: 18, top: 34, bottom: 46, height: 470, maxR: 30 },
  phone: { left: 30, right: 10, top: 34, bottom: 46, height: 360, maxR: 16 },
} as const;

/** A run of words in one line, each part in its own face and ink ("India" in ink, "2023" in grey). */
export interface Part { text: string; face: ChartFace; paint: 'ink' | 'ink2' }
const runWidth = (parts: Part[], size: number) =>
  parts.reduce((a, p, i) => a + widthOf(p.text, p.face, size) + (i ? widthOf(' ', 'sans', size) : 0), 0);

/**
 * Name a round mark: try spots just off its edge (the way it leans first, when it leans: behind a
 * path's start, beyond its end; then right, left, the diagonals, above, below), then
 * further out in every direction; a label that moved away gets a hairline leader from the mark's
 * edge. A label close by with no leader must be nearer its own mark than any other (`others`). The
 * leader is registered too, so no later label sits on it. Throws when nothing fits.
 */
export interface Mark { cx: number; cy: number; r: number }
/** How far a box is from a round mark's edge. */
const gapTo = (b: Box, m: Mark) => Math.hypot(Math.max(b.x - m.cx, 0, m.cx - b.x - b.w), Math.max(b.y - m.cy, 0, m.cy - b.y - b.h)) - m.r;

export function nameMark(P: Placer, parts: Part[], size: number, mark: Mark, opts: { reach?: number; toward?: number; others?: readonly Mark[] } = {}): SceneNode[] {
  const { cx, cy, r } = mark, reach = opts.reach ?? 160, toward = opts.toward;
  const w = runWidth(parts, size), h = size * 1.05;
  const lean = toward === undefined ? [] : [toward, toward - Math.PI / 4, toward + Math.PI / 4, toward - Math.PI / 2, toward + Math.PI / 2];
  const first = [...lean, 0, Math.PI, -Math.PI / 4, (-3 * Math.PI) / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2, Math.PI / 2];
  const ring = Array.from({ length: 24 }, (_, k) => (k / 24) * Math.PI * 2);
  const tries: [number, number][] = [];
  for (const d of [3, 7]) for (const a of first) tries.push([d, a]);
  for (let d = 12; d <= reach; d += 8) for (const a of ring) tries.push([d, a]);
  for (const [d, a] of tries) {
    const c = Math.cos(a), s = Math.sin(a);
    const px = cx + c * (r + d), py = cy + s * (r + d);
    const x = c > 0.35 ? px : c < -0.35 ? px - w : px - w / 2;
    const y = s > 0.35 ? py : s < -0.35 ? py - h : py - h / 2;
    const box: Box = { x: x - 1, y, w: w + 2, h };
    if (!P.free(box)) continue;
    // A label set close without a leader must be nearer its own mark than any other, or a reader
    // could give it to a neighbour.
    if (d <= 7 && opts.others?.some((o) => o !== mark && gapTo(box, o) < gapTo(box, mark) + 3)) continue;
    const out: SceneNode[] = [];
    if (d > 7) {
      const lx = Math.min(Math.max(cx, box.x), box.x + box.w), ly = Math.min(Math.max(cy, box.y), box.y + box.h);
      const la = Math.atan2(ly - cy, lx - cx);
      const from: Pt = [cx + Math.cos(la) * (r + 1), cy + Math.sin(la) * (r + 1)];
      const to: Pt = [lx - Math.cos(la) * 2, ly - Math.sin(la) * 2];
      out.push({ t: 'line', x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: 'ink2', sw: 0.6 });
      P.path([from, to], 1);
    }
    P.block(box);
    let tx = x;
    for (const p of parts) {
      out.push({ t: 'text', x: tx, y: y + size * 0.8, text: p.text, face: p.face, size, fill: p.paint, stroke: 'bg', sw: 3 });
      tx += widthOf(p.text, p.face, size) + widthOf(' ', 'sans', size);
    }
    return out;
  }
  throw new Error(`No room on the plate for "${parts.map((p) => p.text).join(' ')}"`);
}

/** A reference rule across the plot, dashed, its label at the right end above it (or below). */
export function referenceRule(P: Placer, rule: { y: number; label: string }, y: (v: number) => number, x0: number, x1: number, dev: Device): SceneNode[] {
  const T = TYPE[dev], yy = y(rule.y);
  const out: SceneNode[] = [{ t: 'line', x1: x0, y1: yy, x2: x1, y2: yy, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: 0.75 }];
  const w = widthOf(rule.label, 'sans', T.small);
  for (const [bx, by] of [[x1 - w, yy - 4 - T.small], [x1 - w, yy + 4], [x0 + 4, yy - 4 - T.small]] as const) {
    const box = { x: bx - 2, y: by, w: w + 4, h: T.small };
    if (!P.free(box)) continue;
    P.block(box);
    out.push({ t: 'text', x: bx, y: by + T.small * 0.8, text: rule.label, face: 'sans', size: T.small, fill: 'ink2', stroke: 'bg', sw: 3 });
    P.path([[x0, yy], [x1, yy]], 1.5);
    return out;
  }
  throw new Error(`No room on the plate for "${rule.label}"`);
}

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
  const rOf = (w: number) => Math.max(dev === 'phone' ? 1.5 : 1.8, L.maxR * Math.sqrt(w / maxW));
  const dots = f.points.map((p) => ({ p, cx: x(p.x), cy: y(p.y), r: rOf(p.weight) }));
  for (const d of dots) if (d.cx < L.left || d.cx > width - L.right || d.cy < L.top || d.cy > xBottom) throw new Error(`${d.p.label} is off the scale`);
  // Biggest first, so a small member is never hidden under a large one; the focus last of all.
  for (const d of dots.slice().sort((a, b) => Number(!!a.p.focus) - Number(!!b.p.focus) || b.r - a.r)) {
    marks.push({ t: 'circle', cx: d.cx, cy: d.cy, r: d.r, fill: d.p.focus ? 'ed' : 'quiet3', stroke: 'bg', sw: Math.min(dev === 'phone' ? 0.6 : 0.8, d.r * 0.3), tip: d.p.label });
    P.circle(d.cx, d.cy, d.r);
  }
  if (f.rule) labels.push(...referenceRule(P, f.rule, y, L.left, width - L.right, dev));
  labels.push(...sizeKey(P, f.sizeKey, rOf, { x: L.left, y: L.top, w: width - L.right - L.left, h: L.height }, dev));
  const named = dots.filter((d) => d.p.named || d.p.focus).sort((a, b) => Number(!!b.p.focus) - Number(!!a.p.focus) || b.r - a.r);
  for (const d of named) {
    const part: Part = { text: d.p.label, face: d.p.focus ? 'sansMedium' : 'sans', paint: d.p.focus ? 'ink' : 'ink2' };
    labels.push(...nameMark(P, [part], T.label, d, { others: dots }));
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
      out.push({ t: 'line', x1: cx, y1: top, x2: cx + R + 4, y2: top, stroke: 'ink2', sw: 0.5, dash: '1 1.5' });
      out.push({ t: 'text', x: cx + R + 6, y: top + size * 0.35, text: c.label, face: 'sans', size, fill: 'ink2' });
    }
    return out;
  }
  throw new Error('No room on the plate for the size key');
}
