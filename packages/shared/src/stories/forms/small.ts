// The three compact forms: multiples (one measure, a few members, one scale), stack (shares of a
// whole over time, to 100) and pyramid (a population by age and sex, now against a later year).

import { labelOn, type Scene, type SceneNode } from '../../charts/scene';
import { seam, xAxis } from '../axes';
import { areaOf, hatch, hatchPath, pathOf, scale, type Pt } from '../geom';
import { DASH, DOT, HATCH, MARGIN, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf } from '../place';
import type { MultiplesFigure, PyramidFigure, StackFigure } from '../spec';

export function drawMultiples(f: MultiplesFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev];
  const cols = dev === 'phone' ? 3 : 4, gx = dev === 'phone' ? 12 : 26, gy = dev === 'phone' ? 42 : 48, lead = 22;
  const pw = (width - lead - gx * (cols - 1)) / cols, ph = dev === 'phone' ? 70 : 100;
  const rows = Math.ceil(f.panels.length / cols);
  const height = 30 + rows * (ph + gy);
  const x = scale(f.x.domain, [0, pw]), y = scale(f.y.domain, [ph, 0]);
  const nodes: SceneNode[] = [{ t: 'text', x: 0, y: 13, text: dev === 'phone' ? f.phoneScaleLine ?? f.scaleLine : f.scaleLine, face: 'sans', size: T.tick, fill: 'ink2' }];
  f.panels.forEach((p, i) => {
    const children: SceneNode[] = [];
    children.push({ t: 'line', x1: 0, y1: y(f.y.domain[0]), x2: pw, y2: y(f.y.domain[0]), stroke: 'ink', sw: STROKE.grid });
    if (f.rule) children.push({ t: 'line', x1: 0, y1: y(f.rule.y), x2: pw, y2: y(f.rule.y), stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: 0.7 });
    if (f.seam !== undefined) children.push({ t: 'line', x1: x(f.seam), y1: 0, x2: x(f.seam), y2: ph, stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam });
    if (i % cols === 0) for (const t of f.y.ticks) children.push({ t: 'text', x: -5, y: y(t) + 3.5, text: String(t), face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
    if (f.context) children.push({ t: 'path', d: pathOf(f.context.points.filter(([a]) => f.seam === undefined || a <= f.seam).map(([a, b]) => [x(a), y(b)])), stroke: 'quiet3', sw: 0.9 });
    const split = p.projectedFrom ?? Infinity;
    children.push({ t: 'path', d: pathOf(p.points.filter(([a]) => a <= split).map(([a, b]) => [x(a), y(b)])), stroke: 'ed', sw: dev === 'phone' ? 1.6 : 1.9 });
    const proj = p.points.filter(([a]) => a >= split);
    if (proj.length > 1) children.push({ t: 'path', d: pathOf(proj.map(([a, b]) => [x(a), y(b)])), stroke: 'ed', sw: 1.3, dash: DASH.projected });
    const now = p.points.find(([a]) => a === (f.seam ?? p.points[p.points.length - 1]![0]));
    if (now) children.push({ t: 'circle', cx: x(now[0]), cy: y(now[1]), r: DOT.named, fill: 'ed', stroke: 'bg', sw: 1.5 });
    // Name left, value right, never closer than 8 px; a long name moves the value under the panel.
    const nw = widthOf(p.label, 'sansMedium', T.label), vw = widthOf(p.value, 'sans', T.tick);
    children.push({ t: 'text', x: 0, y: -10, text: p.label, face: 'sansMedium', size: T.label, fill: 'ink' });
    if (nw + vw + 8 <= pw) children.push({ t: 'text', x: pw, y: -10, text: p.value, face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
    else children.push({ t: 'text', x: pw, y: ph + 14, text: p.value, face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
    nodes.push({ t: 'g', dx: lead + (i % cols) * (pw + gx), dy: 46 + Math.floor(i / cols) * (ph + gy), children });
  });
  return { width, height, nodes };
}

export function drawStack(f: StackFigure, dev: Device): Scene {
  const T = TYPE[dev], M = MARGIN[dev], width = WIDTH[dev];
  const right = dev === 'wide' ? 150 : M.right;
  const height = dev === 'phone' ? 330 : 400;
  const x = scale(f.x.domain, [M.left, width - right]), y = scale([0, 100], [height - M.bottom, M.top - 6]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const nodes: SceneNode[] = [];
  const xs = f.layers[0]!.points.map(([a]) => a);
  let below: Pt[] = xs.map((a) => [x(a), y(0)]);
  const cum = xs.map(() => 0);
  const edges: Pt[][] = [];
  const paint = { focus: 'ed', second: 'quiet3', rest: 'quiet2' } as const;
  for (const l of f.layers) {
    l.points.forEach(([, v], i) => (cum[i]! += v));
    const above: Pt[] = xs.map((a, i) => [x(a), y(Math.min(100, cum[i]!))]);
    nodes.push({ t: 'path', d: areaOf(above, below), fill: paint[l.role] });
    edges.push(above);
    below = above;
  }
  for (const e of edges.slice(0, -1)) nodes.push({ t: 'path', d: pathOf(e), stroke: 'bg', sw: 2 });
  if (f.seam !== undefined) {
    const s = x(f.seam);
    const top: Pt[] = [[s, y(100)], [x(f.x.domain[1]), y(100)]], bot: Pt[] = [[s, y(0)], [x(f.x.domain[1]), y(0)]];
    nodes.push({ t: 'path', d: hatchPath(hatch(top, bot, HATCH.zone, true)), stroke: 'bg', sw: 0.9, so: 0.55 });
    nodes.push(...seam(P, s, M.top - 22, height - M.bottom, dev));
  }
  for (const t of [0, 50, 100]) nodes.push({ t: 'text', x: M.left - 6, y: y(t) + 4, text: String(t), face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
  nodes.push({ t: 'text', x: M.left - 6 - widthOf('0', 'sans', T.tick), y: y(100) - T.tick * 1.3, text: f.unit, face: 'sans', size: T.tick, fill: 'ink2' });
  // Names inside their bands, with the share under each name.
  const at = dev === 'phone' ? f.phoneLabelAt ?? f.labelAt : f.labelAt;
  for (const yr of at) {
    const i = xs.indexOf(yr);
    let base = 0;
    for (const l of f.layers) {
      const v = l.points[i]![1];
      const mid = y(base + v / 2), name = dev === 'phone' ? l.short ?? l.label : l.label;
      const ink = labelOn(paint[l.role]);
      nodes.push({ t: 'text', x: x(yr), y: mid - 1, text: name, face: 'sansMedium', size: T.inFill, anchor: 'middle', fill: ink });
      nodes.push({ t: 'text', x: x(yr), y: mid + T.inFillSub + 2, text: String(Math.round(v)), face: 'sans', size: T.inFillSub, anchor: 'middle', fill: ink });
      base += v;
    }
  }
  nodes.push(...xAxis(P, x, dev === 'phone' ? f.x.phoneTicks ?? f.x.ticks : f.x.ticks, height - M.bottom, dev));
  return { width, height, nodes };
}

export function drawPyramid(f: PyramidFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev];
  const n = f.groups.length, bh = dev === 'phone' ? 13 : 15, gap = 2, top = 40;
  const height = top + n * (bh + gap) + 40 + (dev === 'phone' ? 26 : 0);
  const mid = width / 2, half = dev === 'phone' ? width / 2 - 30 : 300, spine = 14;
  const max = Math.max(...f.solid.left, ...f.solid.right, ...f.outline.left, ...f.outline.right);
  const s = scale([0, max], [0, half]);
  const yOf = (i: number) => top + (n - 1 - i) * (bh + gap);
  const nodes: SceneNode[] = [];
  f.groups.forEach((_, i) => {
    nodes.push({ t: 'rect', x: mid - spine - s(f.solid.left[i]!), y: yOf(i), w: s(f.solid.left[i]!), h: bh, fill: 'ed', fo: 0.85 });
    nodes.push({ t: 'rect', x: mid + spine, y: yOf(i), w: s(f.solid.right[i]!), h: bh, fill: 'ed', fo: 0.85 });
  });
  // The later year as a silhouette over the first: one stepped outline a side.
  const outline = (side: 1 | -1, vals: number[]) => {
    const pts: Pt[] = [[mid + side * spine, yOf(n - 1) - gap / 2]];
    for (let i = n - 1; i >= 0; i--) {
      const xx = mid + side * (spine + s(vals[i]!));
      pts.push([xx, yOf(i) - gap / 2], [xx, yOf(i) + bh + gap / 2]);
    }
    pts.push([mid + side * spine, yOf(0) + bh + gap / 2]);
    return { t: 'path' as const, d: pathOf(pts), stroke: 'ink' as const, sw: 1.3, dash: '4 2.5' };
  };
  nodes.push(outline(-1, f.outline.left), outline(1, f.outline.right));
  f.groups.forEach((g, i) => { if (i % 2 === 0) nodes.push({ t: 'text', x: mid, y: yOf(i) + bh - 3, text: g.label, face: 'sans', size: T.tick, anchor: 'middle', fill: 'ink2' }); });
  nodes.push({ t: 'text', x: mid - spine, y: top - 12, text: f.left, face: 'sans', size: T.label, anchor: 'end', fill: 'ink2' }, { t: 'text', x: mid + spine, y: top - 12, text: f.right, face: 'sans', size: T.label, fill: 'ink2' });
  const axisY = top + n * (bh + gap) + 6;
  // Only the ticks whose label fits inside the figure.
  for (const v of f.ticks.filter((t) => spine + s(t) + 14 <= width / 2)) for (const side of [-1, 1]) {
    const xx = mid + side * (spine + s(v));
    nodes.push({ t: 'line', x1: xx, y1: axisY, x2: xx, y2: axisY + 4, stroke: 'ink2', sw: STROKE.hair }, { t: 'text', x: xx, y: axisY + 16, text: v ? `${Math.round(v / 1e6)}m` : '0', face: 'sans', size: T.tick, anchor: 'middle', fill: 'ink2' });
  }
  // The key, drawn with the marks themselves.
  const kx = dev === 'phone' ? 0 : mid + half - 130, ky = dev === 'phone' ? height - 16 : top + 8;
  nodes.push({ t: 'rect', x: kx, y: ky, w: 18, h: 11, fill: 'ed', fo: 0.85 }, { t: 'text', x: kx + 24, y: ky + 10, text: f.solid.label, face: 'sansMedium', size: T.label, fill: 'ink' });
  const k2x = dev === 'phone' ? 80 : kx, k2y = dev === 'phone' ? ky : ky + 20;
  nodes.push({ t: 'path', d: `M${k2x} ${k2y + 11}V${k2y}H${k2x + 18}V${k2y + 11}`, stroke: 'ink', sw: 1.3, dash: '4 2.5' }, { t: 'text', x: k2x + 24, y: k2y + 10, text: f.outline.label, face: 'sans', size: T.label, fill: 'ink2' });
  return { width, height, nodes };
}
