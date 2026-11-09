// lines: change over time (or over any x), in one or more panels on one x axis. Context lines in
// grey, named lines darker, the story line in the edition's ink; projections dashed after the seam,
// the source's ranges hatched; references and zones; the machine's notes placed clear of everything.

import type { Scene, SceneNode } from '../../charts/scene';
import { ranges, seam, xAxis, yAxis } from '../axes';
import { hatch, hatchPath, pathOf, scale, type Pt } from '../geom';
import { DASH, OPACITY, DOT, HATCH, MARGIN, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { place, Placer, spread, widthOf } from '../place';
import type { LinesFigure, Series } from '../spec';

const PANEL_H = { wide: 360, phone: 300 } as const;
const GAP = 56;

export function drawLines(f: LinesFigure, dev: Device, width: number = WIDTH[dev]): Scene {
  const T = TYPE[dev], M = MARGIN[dev];
  const wsum = f.panels.reduce((a, p) => a + (p.weight ?? 1), 0);
  // One panel takes the plate's height; several share 1.45 times it, by weight.
  const heights = f.panels.map((p) => (f.panels.length === 1 ? PANEL_H[dev] : (PANEL_H[dev] * 1.45 * (p.weight ?? 1)) / wsum));
  const height = M.top + heights.reduce((a, b) => a + b, 0) + GAP * (f.panels.length - 1) + M.bottom + (f.x.title ? T.tick * 2 : 0);
  const x = scale(f.x.domain, [M.left, width - M.right]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], mid: SceneNode[] = [], front: SceneNode[] = [], labels: SceneNode[] = [];
  const xBottom = height - M.bottom - (f.x.title ? T.tick * 2 : 0);
  const ticks = dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks;
  back.push(...xAxis(P, x, ticks, xBottom, dev, f.x.title));
  if (f.seam !== undefined) back.push(...seam(P, x(f.seam), M.top - 24, xBottom, dev));

  let top = M.top;
  const ends: { y: number; text: string; strong: boolean }[] = [];
  const stops: { at: Pt; text: string; strong: boolean }[] = [];
  f.panels.forEach((panel, pi) => {
    const h = heights[pi]!;
    const y = scale(panel.y.domain, [top + h, top + (pi ? 18 : 0)]);
    back.push(...yAxis(P, y, panel.y, M.left, width - M.right, dev));
    const at = (s: Series, from: number, to: number) => s.points.filter(([px]) => px >= from && px <= to).map(([px, py]) => [x(px), y(py)] as Pt);
    // Zones: a band the story names, hatched grey, its name inside at the right.
    for (const z of panel.zones ?? []) {
      const lo = Math.min(y(z.from), y(z.to)), hi = Math.max(y(z.from), y(z.to));
      const edge = (yy: number): Pt[] => [[M.left, yy], [width - M.right, yy]];
      back.push({ t: 'path', d: hatchPath(hatch(edge(lo), edge(hi), HATCH.zone, true)), stroke: 'quiet3', sw: 0.7, so: 0.7 });
      const lab = dev === 'phone' ? z.phone ?? z.label : z.label;
      const lw = widthOf(lab, 'sans', T.small);
      labels.push({ t: 'text', x: width - M.right - lw - 6, y: (lo + hi) / 2 + T.small * 0.35, text: lab, face: 'sans', size: T.small, fill: 'ink2', stroke: 'bg', sw: 4 });
      P.block({ x: M.left, y: lo, w: width - M.right - M.left, h: hi - lo });
    }
    for (const r of panel.rules ?? []) {
      mid.push({ t: 'line', x1: M.left, y1: y(r.y), x2: width - M.right, y2: y(r.y), stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: OPACITY.reference });
      P.path([[M.left, y(r.y)], [width - M.right, y(r.y)]], 2);
      ends.push({ y: y(r.y), text: r.label, strong: false });
    }
    const roleOrder = { context: 0, named: 1, focus: 2 } as const;
    for (const s of panel.series.slice().sort((a, b) => roleOrder[a.role] - roleOrder[b.role])) {
      const split = s.projectedFrom ?? Infinity;
      const est = at(s, -Infinity, split), proj = at(s, split, Infinity);
      if (s.role === 'context') {
        back.push({ t: 'path', d: pathOf(est), stroke: 'quiet', sw: STROKE.context });
        if (proj.length > 1) back.push({ t: 'path', d: pathOf(proj), stroke: 'rule', sw: STROKE.context });
        continue;
      }
      if (s.range) front.push(...ranges(s.range, x, y, s.role === 'focus' ? P : undefined));
      const sw = s.role === 'focus' ? STROKE.story[dev] : STROKE.named;
      const sp = s.role === 'focus' ? STROKE.storyProjected[dev] : STROKE.named;
      const paint = s.role === 'focus' ? 'ed' : 'quiet3';
      if (est.length > 1) front.push({ t: 'path', d: pathOf(est), stroke: paint, sw });
      if (proj.length > 1) front.push({ t: 'path', d: pathOf(proj), stroke: paint, sw: sp, dash: DASH.projected });
      P.path([...est, ...proj], s.role === 'focus' ? 3.5 : 2);
      if (s.label) {
        const last = s.points[s.points.length - 1]!;
        // A line that stops short of the axis is named where it stops, with a dot; one that runs to
        // the end is named beyond it.
        if (last[0] < f.x.domain[1] - (f.x.domain[1] - f.x.domain[0]) * 0.02) {
          front.push({ t: 'circle', cx: x(last[0]), cy: y(last[1]), r: s.role === 'focus' ? DOT.story : DOT.named, fill: paint, stroke: 'bg', sw: 1.5 });
          stops.push({ at: [x(last[0]), y(last[1])], text: s.label, strong: s.role === 'focus' });
        } else ends.push({ y: y(last[1]), text: s.label, strong: s.role === 'focus' });
      }
    }
    for (const n of panel.notes ?? []) {
      const ax = x(n.x), ay = y(n.y);
      if (n.dot !== false) front.push({ t: 'circle', cx: ax, cy: ay, r: DOT.story, fill: 'ed', stroke: 'bg', sw: STROKE.ring });
      P.circle(ax, ay, DOT.story + 2);
    }
    for (const st of stops.splice(0)) labels.push(...place(P, { lines: [st.text], at: st.at, face: st.strong ? 'sansMedium' : 'sans', size: T.label, paint: st.strong ? 'ink' : 'ink2', prefer: [[8, T.label * 0.35, 'start'], [-8, T.label * 0.35, 'end'], [8, -8, 'start'], [8, T.label + 6, 'start']] }));
    // Notes after every mark is known, so none lands on a line.
    for (const n of panel.notes ?? []) {
      labels.push(...place(P, { lines: dev === 'phone' ? n.phone ?? n.lines : n.lines, at: [x(n.x), y(n.y)], face: 'sans', size: T.note, paint: 'mach', prefer: [[12, -34, 'start'], [-12, -34, 'end'], [12, 30, 'start'], [-12, 30, 'end']] }));
    }
    top += h + GAP;
  });
  // End labels: beyond the plot on the wide plate, spread so none touch; inside it on the phone.
  if (dev === 'wide') {
    const ys = spread(ends.map((e) => e.y), T.label * 1.35, M.top, xBottom);
    ends.forEach((e, i) => labels.push({ t: 'text', x: width - M.right + 8, y: ys[i]! + T.label * 0.35, text: e.text, face: e.strong ? 'sansMedium' : 'sans', size: T.label, fill: e.strong ? 'ink' : 'ink2' }));
  } else {
    for (const e of ends) labels.push(...place(P, { lines: [e.text], at: [width - M.right, e.y], face: e.strong ? 'sansMedium' : 'sans', size: T.label, paint: e.strong ? 'ink' : 'ink2', prefer: [[0, -7, 'end'], [0, T.label + 5, 'end'], [-40, -9, 'end'], [-40, T.label + 7, 'end']], reach: 140 }));
  }
  return { width, height, nodes: [...back, ...mid, ...front, ...labels] };
}
