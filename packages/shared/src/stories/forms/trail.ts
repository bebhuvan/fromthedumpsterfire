// trail: a connected scatter, how a few members (four at most) moved through two measures over time.
// Each member is a path through its yearly values, solid where the source estimated them and dashed
// where it projects, with a dot every ten years along the estimates. Each member is named once, at its
// last estimate, with that year; the story's member alone also carries its first and last years, set
// beside their dots, so no year stands without its member. The projection ends in a hollow dot.

import type { Scene, SceneNode } from '../../charts/scene';
import { xAxis, yAxis } from '../axes';
import { pathOf, scale, type Pt } from '../geom';
import { DASH, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer } from '../place';
import type { Axis, XAxis } from '../spec';
import { nameMark, referenceRule, type Mark, type Part } from './marks';

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

/** More paths than this tangle into a knot nobody can follow. */
export const TRAIL_MAX = 4;

const PLOT = {
  wide: { left: 38, right: 18, top: 34, bottom: 46, height: 450, reach: 48 },
  phone: { left: 30, right: 10, top: 34, bottom: 46, height: 440, reach: 40 },
} as const;

export function drawTrail(f: TrailFigure, dev: Device): Scene {
  if (f.members.length > TRAIL_MAX) throw new Error(`A trail follows at most ${TRAIL_MAX} members.`);
  if (f.members.filter((m) => m.focus).length !== 1) throw new Error('A trail has one member in the ink.');
  const T = TYPE[dev], L = PLOT[dev], width = WIDTH[dev];
  const height = L.top + L.height + L.bottom;
  const x = scale(f.x.domain, [L.left, width - L.right]);
  const y = scale(f.y.domain, [L.top + L.height, L.top]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], paths: SceneNode[] = [], dots: SceneNode[] = [], labels: SceneNode[] = [];
  const xBottom = L.top + L.height;
  back.push(...yAxis(P, y, f.y, L.left, width - L.right, dev));
  back.push(...xAxis(P, x, dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks, xBottom, dev, f.x.title));

  const at = (p: [number, number, number]): Pt => [x(p[1]), y(p[2])];
  const mk = (p: [number, number, number], r: number): Mark => { const [cx, cy] = at(p); return { cx, cy, r }; };
  const members = f.members.map((m) => {
    if (m.points.length < 2) throw new Error(`${m.label} has no path`);
    for (const p of m.points) {
      const [cx, cy] = at(p);
      if (cx < L.left - 0.5 || cx > width - L.right + 0.5 || cy < L.top - 0.5 || cy > xBottom + 0.5) throw new Error(`${m.label} ${p[0]} is off the scale`);
    }
    const split = m.projectedFrom ?? Infinity;
    const est = m.points.filter(([yr]) => yr < split);
    if (!est.length) throw new Error(`${m.label} has no estimates`);
    const last = est[est.length - 1]!;
    const proj = m.points.filter(([yr]) => yr >= last[0]);
    const first = m.points[0]!, end = m.points[m.points.length - 1]!;
    const marks = { first: mk(first, m.focus ? DOT.named : DOT.note), last: mk(last, DOT.story), end: mk(end, DOT.named) };
    return { m, est, proj, last, first, end, marks };
  });
  // Every member's dots, so a label beside one is never nearer another.
  const allMarks = members.flatMap(({ marks, proj }) => (proj.length > 1 ? [marks.first, marks.last, marks.end] : [marks.first, marks.last]));

  // The story's member drawn last, on top.
  const order = members.slice().sort((a, b) => Number(!!a.m.focus) - Number(!!b.m.focus));
  for (const { m, est, proj, last, marks } of order) {
    const paint = m.focus ? 'ed' : 'quiet3';
    if (est.length > 1) paths.push({ t: 'path', d: pathOf(est.map(at)), stroke: paint, sw: m.focus ? STROKE.story[dev] : STROKE.named });
    if (proj.length > 1) paths.push({ t: 'path', d: pathOf(proj.map(at)), stroke: paint, sw: m.focus ? STROKE.storyProjected[dev] : STROKE.named, dash: DASH.projected });
    P.path(m.points.map(at), m.focus ? 3 : 2.5);
    const start = m.points[0]![0];
    for (const p of est) if ((p[0] - start) % f.every === 0 && p !== last) {
      const [cx, cy] = at(p);
      dots.push({ t: 'circle', cx, cy, r: m.focus ? DOT.named : DOT.note, fill: paint, stroke: 'bg', sw: STROKE.hair });
    }
    dots.push({ t: 'circle', cx: marks.last.cx, cy: marks.last.cy, r: marks.last.r, fill: paint, stroke: 'bg', sw: STROKE.ring * 0.75 });
    P.circle(marks.last.cx, marks.last.cy, marks.last.r + 1);
    if (proj.length > 1) {
      // Projected, so hollow.
      dots.push({ t: 'circle', cx: marks.end.cx, cy: marks.end.cy, r: marks.end.r, fill: 'bg', stroke: paint, sw: m.focus ? STROKE.named * 1.25 : STROKE.named });
      P.circle(marks.end.cx, marks.end.cy, marks.end.r + 1);
    }
  }
  if (f.rule) labels.push(...referenceRule(P, f.rule, y, L.left, width - L.right, dev));

  // Names with their last estimate's year, the story's member first; then its first and last years.
  const byFocus = members.slice().sort((a, b) => Number(!!b.m.focus) - Number(!!a.m.focus));
  for (const { m, last, marks } of byFocus) {
    const parts: Part[] = [{ text: m.label, face: m.focus ? 'sansMedium' : 'sans', paint: m.focus ? 'ink' : 'ink2' }, { text: String(last[0]), face: 'sans', paint: 'ink2' }];
    labels.push(...nameMark(P, parts, T.label, marks.last, { reach: L.reach, others: allMarks }));
  }
  // A year leans away from the path: behind its start, beyond its end.
  const away = (a: Pt, b: Pt) => Math.atan2(a[1] - b[1], a[0] - b[0]);
  const story = members.find((s) => s.m.focus)!;
  const pts = story.m.points.map(at), k = Math.min(5, pts.length - 1);
  labels.push(...nameMark(P, [{ text: String(story.first[0]), face: 'sans', paint: 'ink2' }], T.tick, story.marks.first, { reach: L.reach, others: allMarks, toward: away(pts[0]!, pts[k]!) }));
  if (story.proj.length > 1) labels.push(...nameMark(P, [{ text: String(story.end[0]), face: 'sans', paint: 'ink2' }], T.tick, story.marks.end, { reach: L.reach, others: allMarks, toward: away(pts[pts.length - 1]!, pts[pts.length - 1 - k]!) }));
  return { width, height, nodes: [...back, ...paths, ...dots, ...labels] };
}
