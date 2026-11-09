// trail: a connected scatter, how a few members moved through two measures over time. Each member is
// a path through its years, solid where the source estimated it and dashed where it projects, with a
// small dot every so many years. No arrows: the years at the start, at the last estimate (with the
// member's name) and at the end say which way it runs, and the last estimate's dot is a little larger.

import type { Scene, SceneNode } from '../../charts/scene';
import { xAxis, yAxis } from '../axes';
import { pathOf, scale, type Pt } from '../geom';
import { DASH, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer } from '../place';
import type { Axis, XAxis } from '../spec';
import { nameMark, referenceRule, type Part } from './scatter';

export interface TrailMember {
  label: string;
  focus?: boolean;
  /** [year, x, y], in order of year. */
  points: [number, number, number][];
  /** The first projected year: the path is dashed after the year before it. */
  projectedFrom?: number;
}

export interface TrailFigure {
  form: 'trail';
  x: XAxis & { title: string };
  y: Axis;
  members: TrailMember[];
  /** A dot every this many years along the estimates, counted from the first year. */
  every: number;
  rule?: { y: number; label: string };
}

const PLOT = {
  wide: { left: 38, right: 18, top: 34, bottom: 46, height: 450 },
  phone: { left: 30, right: 10, top: 34, bottom: 46, height: 380 },
} as const;

export function drawTrail(f: TrailFigure, dev: Device): Scene {
  const T = TYPE[dev], L = PLOT[dev], width = WIDTH[dev];
  const height = L.top + L.height + L.bottom;
  const x = scale(f.x.domain, [L.left, width - L.right]);
  const y = scale(f.y.domain, [L.top + L.height, L.top]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], paths: SceneNode[] = [], dots: SceneNode[] = [], labels: SceneNode[] = [];
  back.push(...yAxis(P, y, f.y, L.left, width - L.right, dev));
  back.push(...xAxis(P, x, dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks, L.top + L.height, dev, f.x.title));

  const at = (p: [number, number, number]): Pt => [x(p[1]), y(p[2])];
  const mk = ([cx, cy]: Pt, r: number) => ({ cx, cy, r });
  const members = f.members.map((m) => {
    if (m.points.length < 2) throw new Error(`${m.label} has no path`);
    const split = m.projectedFrom ?? Infinity;
    const est = m.points.filter(([yr]) => yr < split);
    const last = est[est.length - 1]!;
    const proj = m.points.filter(([yr]) => yr >= last[0]);
    return { m, est, proj, last, first: m.points[0]!, end: m.points[m.points.length - 1]! };
  });
  // Named members first, the story's member on top.
  const order = members.slice().sort((a, b) => Number(!!a.m.focus) - Number(!!b.m.focus));
  const dotR = dev === 'phone' ? 1.6 : 1.9;
  for (const { m, est, proj, last, end } of order) {
    const paint = m.focus ? 'ed' : 'quiet3';
    const sw = m.focus ? STROKE.story[dev] : STROKE.named + 0.2;
    if (est.length > 1) paths.push({ t: 'path', d: pathOf(est.map(at)), stroke: paint, sw });
    if (proj.length > 1) paths.push({ t: 'path', d: pathOf(proj.map(at)), stroke: paint, sw: m.focus ? STROKE.storyProjected[dev] : STROKE.named, dash: DASH.projected });
    P.path(m.points.map(at), m.focus ? 3 : 2.5);
    const start = m.points[0]![0];
    for (const p of est) if ((p[0] - start) % f.every === 0 && p !== last) {
      const [cx, cy] = at(p);
      dots.push({ t: 'circle', cx, cy, r: m.focus ? dotR + 0.6 : dotR, fill: paint, stroke: 'bg', sw: 0.8 });
    }
    const [lx, ly] = at(last);
    dots.push({ t: 'circle', cx: lx, cy: ly, r: m.focus ? DOT.story + 0.5 : DOT.story, fill: paint, stroke: 'bg', sw: STROKE.ring * 0.75 });
    P.circle(lx, ly, DOT.story + 1);
    if (proj.length > 1) {
      const [ex, ey] = at(end);
      dots.push({ t: 'circle', cx: ex, cy: ey, r: dotR + 0.6, fill: 'bg', stroke: paint, sw: 1.2 });
      P.circle(ex, ey, dotR + 1.5);
    }
  }
  if (f.rule) labels.push(...referenceRule(P, f.rule, y, L.left, width - L.right, dev));
  // Names (with the last estimate's year) first, the story's member before the rest; then the years
  // at each end, which may sit further off on a leader.
  const byFocus = members.slice().sort((a, b) => Number(!!b.m.focus) - Number(!!a.m.focus));
  for (const { m, last } of byFocus) {
    const parts: Part[] = [{ text: m.label, face: m.focus ? 'sansMedium' : 'sans', paint: m.focus ? 'ink' : 'ink2' }, { text: String(last[0]), face: 'sans', paint: 'ink2' }];
    labels.push(...nameMark(P, parts, T.label, mk(at(last), DOT.story), { reach: 120 }));
  }
  // The way a path leaves its start (looking back from a few years in) and arrives at its end.
  const away = (a: Pt, b: Pt) => Math.atan2(a[1] - b[1], a[0] - b[0]);
  for (const { m, first, end, proj } of byFocus) {
    const pts = m.points.map(at), k = Math.min(5, pts.length - 1);
    labels.push(...nameMark(P, [{ text: String(first[0]), face: 'sans', paint: 'ink2' }], T.tick, mk(at(first), dotR), { reach: 120, toward: away(pts[0]!, pts[k]!) }));
    if (proj.length > 1) labels.push(...nameMark(P, [{ text: String(end[0]), face: 'sans', paint: 'ink2' }], T.tick, mk(at(end), dotR + 0.6), { reach: 120, toward: away(pts[pts.length - 1]!, pts[pts.length - 1 - k]!) }));
  }
  return { width, height, nodes: [...back, ...paths, ...dots, ...labels] };
}
