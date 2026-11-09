// bump: rankings over time. Each member's rank among the group at each moment, one row a rank, the
// members' lines easing from row to row. Every line quiet but the story's, in the edition's ink;
// the stretch after the seam dashed (projected); a dot at each moment ringed in the ground; names at
// both ends, so a reader can follow a member in from either side.

import type { Scene, SceneNode } from '../../charts/scene';
import { seam, xAxis } from '../axes';
import { scale, type Pt } from '../geom';
import { DASH, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { place, Placer, widthOf } from '../place';

export interface BumpLine {
  key: string;
  label: string;
  /** A shorter name for the phone. */
  phoneLabel?: string;
  focus?: boolean;
  /** [year, rank], rank 1 the top; worked out by code from the stored values. */
  ranks: Pt[];
}

export interface BumpFigure {
  form: 'bump';
  x: { domain: [number, number]; ticks: number[]; phoneTicks?: number[] };
  /** Where estimates end: the line after it is dashed. */
  seam: number;
  /** The moments that get a dot (the seam's own point is on the line but not dotted). */
  dots: number[];
  /** Written over the ranks ("Rank"). */
  unit: string;
  lines: BumpLine[];
}

/** A line through points as eased steps: horizontal at each point, a smooth S between. */
export function easePath(pts: readonly Pt[]): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  return pts.map(([x, y], i) => {
    if (!i) return `M${r(x)} ${r(y)}`;
    const [px, py] = pts[i - 1]!, m = (x - px) / 2;
    return `C${r(px + m)} ${r(py)} ${r(x - m)} ${r(y)} ${r(x)} ${r(y)}`;
  }).join('');
}

/** The same curve sampled, for the placer. */
function easeSample(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  pts.forEach(([x, y], i) => {
    if (!i) return void out.push([x, y]);
    const [px, py] = pts[i - 1]!;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, e = t * t * (3 - 2 * t);
      out.push([px + (x - px) * t, py + (y - py) * e]);
    }
  });
  return out;
}

export function drawBump(f: BumpFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev], phone = dev === 'phone';
  const n = f.lines.length;
  const name = (l: BumpLine) => (phone ? l.phoneLabel ?? l.label : l.label);
  const face = (l: BumpLine) => (l.focus ? 'sansMedium' : 'sans') as 'sans' | 'sansMedium';
  const nameW = Math.max(...f.lines.map((l) => widthOf(name(l), face(l), T.label)));
  const numW = phone ? 0 : widthOf(String(n), 'sans', T.tick) + 10;
  const x0 = Math.ceil(nameW + numW + 12), x1 = width - Math.ceil(nameW + 12);
  const pitch = phone ? 25 : 30, top = phone ? 52 : 56;
  const y = scale([1, n], [top, top + (n - 1) * pitch]);
  const axisY = y(n) + 22;
  const height = axisY + 6 + T.tick + 8;
  const x = scale(f.x.domain, [x0, x1]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], lines: SceneNode[] = [], dots: SceneNode[] = [], labels: SceneNode[] = [];

  back.push(...xAxis(P, x, phone ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks, axisY, dev));
  back.push({ t: 'line', x1: x0, y1: axisY, x2: x1, y2: axisY, stroke: 'ink', sw: STROKE.grid });
  back.push(...seam(P, x(f.seam), top - 26, axisY, dev));
  // Faint guides along each rank, so a dot's row reads across.
  for (let r = 1; r <= n; r++) back.push({ t: 'line', x1: x0, y1: y(r), x2: x1, y2: y(r), stroke: 'rule', sw: STROKE.hair });

  const ordered = f.lines.slice().sort((a, b) => Number(!!a.focus) - Number(!!b.focus));
  for (const l of ordered) {
    const pts = l.ranks.map(([yr, rk]) => [x(yr), y(rk)] as Pt);
    const est = pts.filter((_, i) => l.ranks[i]![0] <= f.seam), proj = pts.filter((_, i) => l.ranks[i]![0] >= f.seam);
    const paint = l.focus ? 'ed' : 'quiet3';
    // The quiet lines get a ground-coloured edge, so where two cross each stays whole.
    if (!l.focus) lines.push({ t: 'path', d: easePath(pts), stroke: 'bg', sw: STROKE.named + 3 });
    else lines.push({ t: 'path', d: easePath(pts), stroke: 'bg', sw: STROKE.story[dev] + 3 });
    if (est.length > 1) lines.push({ t: 'path', d: easePath(est), stroke: paint, sw: l.focus ? STROKE.story[dev] : STROKE.named + 0.4 });
    if (proj.length > 1) lines.push({ t: 'path', d: easePath(proj), stroke: paint, sw: l.focus ? STROKE.storyProjected[dev] : STROKE.named, dash: DASH.projected });
    P.path(easeSample(pts), l.focus ? 2.5 : 1.5);
    l.ranks.forEach(([yr, rk]) => {
      if (!f.dots.includes(yr)) return;
      const r = l.focus ? DOT.story : DOT.named;
      dots.push({ t: 'circle', cx: x(yr), cy: y(rk), r, fill: paint, stroke: 'bg', sw: 1.5 });
    });
  }
  // The dots of the story line over every other line.
  dots.sort((a, b) => Number(a.t === 'circle' && a.fill === 'ed') - Number(b.t === 'circle' && b.fill === 'ed'));

  if (!phone) for (let r = 1; r <= n; r++) labels.push(...place(P, { lines: [String(r)], at: [x0 - 8, y(r) + T.tick * 0.35], face: 'sans', size: T.tick, paint: 'ink2', prefer: [[0, 0, 'end']], roam: false }, `rank ${r}`));
  labels.push(...place(P, { lines: [f.unit], at: [phone ? x0 - 8 : x0 - 8, top - 26], face: 'sans', size: T.tick, paint: 'ink2', prefer: [[0, 0, 'end']], roam: false }));
  for (const l of f.lines) {
    const first = l.ranks[0]!, last = l.ranks[l.ranks.length - 1]!;
    const common = { face: face(l), size: T.label, paint: (l.focus ? 'ink' : 'ink2') as 'ink' | 'ink2', roam: false };
    labels.push(...place(P, { ...common, lines: [name(l)], at: [x0 - 8 - numW, y(first[1]) + T.label * 0.35], prefer: [[0, 0, 'end']] }));
    labels.push(...place(P, { ...common, lines: [name(l)], at: [x1 + 9, y(last[1]) + T.label * 0.35], prefer: [[0, 0, 'start']] }));
  }
  return { width, height, nodes: [...back, ...lines, ...dots, ...labels] };
}
