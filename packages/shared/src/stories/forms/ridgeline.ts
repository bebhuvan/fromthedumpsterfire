// ridgeline: how a distribution shifts. One ridge per moment, each the kernel density of the members'
// values (Gaussian, Silverman's bandwidth), all on one height scale so a taller ridge means a tighter
// crowd. Ridges overlap a little, the later in front. Earlier moments are quiet, the story's moment
// washed in the edition's ink, a projected one hatched ("not yet"). Each ridge carries its median; a
// reference (replacement, 2.1) runs down through all of them, named once.

import type { Scene, SceneNode } from '../../charts/scene';
import { xAxis } from '../axes';
import { areaOf, hatch, hatchPath, pathOf, scale, type Pt } from '../geom';
import { DASH, HATCH, OPACITY, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { place, Placer, widthOf } from '../place';

export interface Ridge {
  key: string;
  /** Written at the ridge's left: the year. */
  label: string;
  /** A second line under the label ("UN projection"). */
  sub?: string;
  /** context: quiet; focus: the story's moment; projected: hatched. */
  role: 'context' | 'focus' | 'projected';
  /** Every member's value, as stored. */
  values: number[];
}

export interface RidgelineFigure {
  form: 'ridgeline';
  x: { domain: [number, number]; ticks: number[]; title: string };
  /** Top to bottom, earliest first. */
  ridges: Ridge[];
  rule?: { x: number; label: string };
  /** Written before the first ridge's median ("Median"). */
  medianWord: string;
  /** How a median is written: decimals. */
  digits: number;
}

export function median(v: readonly number[]): number {
  const s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function quantile(s: readonly number[], q: number): number {
  const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return s[lo]! + (s[hi]! - s[lo]!) * (p - lo);
}

/** Silverman's rule of thumb: 0.9 · min(sd, IQR / 1.34) · n^(−1/5). */
export function silverman(v: readonly number[]): number {
  const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const s = v.slice().sort((a, b) => a - b);
  const iqr = quantile(s, 0.75) - quantile(s, 0.25);
  const spread = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd;
  if (!(spread > 0)) throw new Error('A density needs values that differ');
  return 0.9 * spread * n ** -0.2;
}

/** The Gaussian kernel density of the values at each x, with bandwidth h. */
export function density(v: readonly number[], h: number, xs: readonly number[]): number[] {
  const k = 1 / (v.length * h * Math.sqrt(2 * Math.PI));
  return xs.map((x) => k * v.reduce((a, xi) => a + Math.exp(-0.5 * ((x - xi) / h) ** 2), 0));
}

const GRID = 0.04;

export function drawRidgeline(f: RidgelineFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev], phone = dev === 'phone';
  const left = phone ? 68 : 92, right = width - (phone ? 10 : 24);
  const pitch = phone ? 50 : 62, peak = phone ? 68 : 84;
  const n = f.ridges.length;
  const x = scale(f.x.domain, [left, right]);
  const xs: number[] = [];
  for (let v = f.x.domain[0]; v <= f.x.domain[1] + 1e-9; v += GRID) xs.push(Math.round(v * 1e6) / 1e6);
  const dens = f.ridges.map((r) => density(r.values, silverman(r.values), xs));
  const h = scale([0, Math.max(...dens.flat())], [0, peak]);
  // The first ridge stands just under the reference's name; each after it a pitch lower, so the
  // tallest ridge reaches a little into the one behind it.
  const crest = (i: number) => h(Math.max(...dens[i]!));
  const top = T.label * 2 + 6;
  const base0 = Math.max(...f.ridges.map((_, i) => top + 10 + crest(i) - i * pitch));
  const base = (i: number) => base0 + i * pitch;
  const axisY = base(n - 1) + 14;
  const height = axisY + 6 + T.tick * 3 + 4;
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], ridges: SceneNode[] = [], over: SceneNode[] = [], labels: SceneNode[] = [];
  back.push(...xAxis(P, x, f.x.ticks, axisY, dev, f.x.title));
  back.push({ t: 'line', x1: left, y1: axisY, x2: right, y2: axisY, stroke: 'ink', sw: STROKE.grid });

  const curves: Pt[][] = [];
  f.ridges.forEach((r, i) => {
    const y0 = base(i);
    const curve: Pt[] = xs.map((v, k) => [x(v), y0 - h(dens[i]![k]!)]);
    const floor: Pt[] = xs.map((v) => [x(v), y0]);
    curves.push(curve);
    const area = areaOf(curve, floor);
    ridges.push({ t: 'line', x1: left, y1: y0, x2: right, y2: y0, stroke: 'rule', sw: STROKE.grid });
    // The ground first, so a ridge in front hides the one behind it.
    ridges.push({ t: 'path', d: area, fill: 'bg' });
    if (r.role === 'context') {
      ridges.push({ t: 'path', d: area, fill: 'quiet2' }, { t: 'path', d: pathOf(curve), stroke: 'quiet3', sw: STROKE.named });
    } else if (r.role === 'focus') {
      ridges.push({ t: 'path', d: area, fill: 'ed', fo: OPACITY.wash * 1.6 }, { t: 'path', d: pathOf(curve), stroke: 'ed', sw: STROKE.story[dev] });
    } else {
      ridges.push({ t: 'path', d: hatchPath(hatch(curve, floor, HATCH.close)), stroke: 'quiet3', sw: HATCH.weight, so: OPACITY.hatch });
      ridges.push({ t: 'path', d: pathOf(curve), stroke: 'quiet3', sw: STROKE.named, dash: DASH.projected });
    }
    ridges.push({ t: 'line', x1: left, y1: y0, x2: right, y2: y0, stroke: r.role === 'focus' ? 'ed' : 'quiet3', sw: STROKE.hair });
  });
  // The line of every ridge, as the placer sees it: no label sits on one.
  curves.forEach((c) => P.path(c.filter((_, k) => k % 3 === 0), 2));

  if (f.rule) {
    const rx = x(f.rule.x);
    over.push({ t: 'line', x1: rx, y1: top - 8, x2: rx, y2: axisY, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: 0.8 });
    P.path([[rx, top - 4], [rx, axisY]], 1.5);
    labels.push(...place(P, { lines: [f.rule.label], at: [rx, top - 8], face: 'sans', size: T.label, paint: 'ink2', prefer: [[0, -6, 'middle'], [-4, -4, 'end'], [4, -4, 'start']], roam: false }));
  }

  f.ridges.forEach((r, i) => {
    const y0 = base(i);
    // The year, on its baseline at the left, and what it is under it.
    const strong = r.role === 'focus';
    labels.push(...place(P, { lines: r.sub ? [r.label, r.sub] : [r.label], at: [left - 10, y0], face: strong ? 'sansMedium' : 'sans', size: T.label, paint: strong ? 'ink' : 'ink2', prefer: [[0, -4 - (r.sub ? T.label * 1.3 : 0), 'end']], roam: false }));
    // The median: a tick from the baseline to the ridge, and its value beside the tick's top.
    const m = median(r.values);
    const mx = x(m), my = y0 - h(density(r.values, silverman(r.values), [m])[0]!);
    over.push({ t: 'line', x1: mx, y1: y0, x2: mx, y2: my, stroke: strong ? 'ed' : 'ink', sw: strong ? 1.5 : 1 });
    P.path([[mx, y0], [mx, my]], 1.5);
    const val = m.toFixed(f.digits), text = i === 0 ? `${f.medianWord} ${val}` : val;
    const tw = widthOf(text, strong ? 'sansMedium' : 'sans', T.tick);
    labels.push(...place(P, {
      lines: [text], at: [mx, my], face: strong ? 'sansMedium' : 'sans', size: T.tick, paint: strong ? 'ink' : 'ink2',
      prefer: [[0, -11, 'middle'], [4, -11, 'start'], [-4, -11, 'end'], [0, -17, 'middle'], [5, (y0 - my) / 2 + T.tick * 0.3, 'start'], [-5, (y0 - my) / 2 + T.tick * 0.3, 'end'], [tw / 2 + 8, -14, 'middle']],
      reach: 60,
    }, `the median of ${r.label}`));
  });
  return { width, height, nodes: [...back, ...ridges, ...over, ...labels] };
}
