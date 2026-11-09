// swarm: every member of a group placed at the moment something happened to it, its area its
// weight, packed so no two touch (biggest first). Filled where the source estimated it, hollow where
// it projects it; members before or after the axis in their own columns. A step panel above shares
// the x scale (the share of people the swarm adds up to). On a phone the time runs down the page.

import { labelOn, type Scene, type SceneNode } from '../../charts/scene';
import { seam, xAxis, yAxis } from '../axes';
import { areaOf, pathOf, scale, steps, type Pt } from '../geom';
import { DASH, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { place, Placer, widthOf, type Box } from '../place';
import type { SwarmFigure, SwarmItem } from '../spec';

/** "Not by 2100" as "Not by" over "2100": split at the last space. */
const twoLines = (t: string) => { const i = t.lastIndexOf(' '); return i < 0 ? [t] : [t.slice(0, i), t.slice(i + 1)]; };

interface Bee { i: number; at: number; r: number; off: number }

/** Pack circles along a line: each at its position, pushed sideways to the nearest free spot. */
export function pack(items: { at: number; r: number }[], gap: number, limit: number): number[] {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => b.r - a.r || a.at - b.at);
  const placed: Bee[] = [];
  const offs = new Array<number>(items.length).fill(0);
  for (const b of order) {
    let off = 0;
    for (let k = 0; k < 6000; k++) {
      off = k === 0 ? 0 : Math.ceil(k / 2) * 0.5 * (k % 2 ? 1 : -1);
      if (Math.abs(off) + b.r > limit) continue;
      if (placed.every((p) => Math.hypot(p.at - b.at, p.off - off) >= p.r + b.r + gap)) break;
    }
    placed.push({ i: b.i, at: b.at, r: b.r, off });
    offs[b.i] = off;
  }
  return offs;
}

const fill = (it: SwarmItem): Pick<SceneNode & { t: 'circle' }, 'fill' | 'stroke' | 'sw'> =>
  it.focus ? { fill: 'ed', stroke: 'bg', sw: 1 } : it.state === 'projected' ? { fill: 'bg', stroke: 'quiet3', sw: 1 } : { fill: 'quiet3', stroke: 'bg', sw: 1 };

function step(f: SwarmFigure, P: Placer, x: (v: number) => number, top: number, h: number, dev: Device, right: number): SceneNode[] {
  if (!f.step) return [];
  const T = TYPE[dev];
  const y = scale([0, 100], [top + h, top + 14]);
  const out: SceneNode[] = [...yAxis(P, y, { unit: f.step.unit, domain: [0, 100], ticks: [0, 50, 100] }, x(f.x.domain[0]), right, dev)];
  const pts = steps(f.step.points.map(([a, b]) => [x(a), y(b)] as Pt));
  out.push({ t: 'path', d: areaOf(pts, pts.map(([a]) => [a, y(0)] as Pt)), fill: 'ed', fo: 0.14 }, { t: 'path', d: pathOf(pts), stroke: 'ed', sw: 2 });
  P.path(pts, 3);
  const last = f.step.points[f.step.points.length - 1]!;
  out.push({ t: 'circle', cx: x(last[0]), cy: y(last[1]), r: DOT.story, fill: 'ed', stroke: 'bg', sw: STROKE.ring });
  out.push(...place(P, { lines: [dev === 'phone' ? f.step.phoneEndLabel ?? f.step.endLabel : f.step.endLabel], at: [x(last[0]), y(last[1])], face: 'sansMedium', size: T.label, paint: 'ink', prefer: [[9, 4, 'start'], [-9, -10, 'end']], roam: false }));
  for (const n of f.step.notes ?? []) out.push(...place(P, { lines: n.lines, at: [x(n.x), y(n.y) - 2], face: 'sans', size: T.note, paint: 'mach', prefer: [[-8, -12, 'end'], [-8, -26, 'end'], [8, -26, 'start']] }));
  return out;
}

export function drawSwarm(f: SwarmFigure, dev: Device): Scene {
  const T = TYPE[dev];
  const maxW = Math.max(...f.items.map((i) => i.weight));
  const R = dev === 'phone' ? 20 : 34;
  const rOf = (w: number) => Math.max(dev === 'phone' ? 1.6 : 2, R * Math.sqrt(w / maxW));
  const named = f.items.map((it, i) => ({ it, i })).filter(({ it }) => it.named || it.focus).sort((a, b) => b.it.weight - a.it.weight);
  const tag = (it: SwarmItem) => (typeof it.at === 'number' ? String(it.at) : it.at === 'before' ? f.before : f.after);

  if (dev === 'wide') {
    const width = WIDTH.fold, left = 92, right = width - 92;
    const x = scale(f.x.domain, [left, right]);
    const P = new Placer({ x: 0, y: 0, w: width, h: 4000 });
    const nodes: SceneNode[] = [];
    const stepH = f.step ? 150 : 0;
    nodes.push(...step(f, P, x, 30, stepH, dev, x(f.seam)));
    const pos = (it: SwarmItem) => (it.at === 'before' ? 38 : it.at === 'after' ? width - 38 : x(it.at));
    const items = f.items.map((it) => ({ at: pos(it), r: rOf(it.weight) }));
    const offs = pack(items, 1.4, 150);
    const ext = Math.max(...items.map((b, i) => Math.abs(offs[i]!) + b.r));
    const head = 30 + stepH + 34;
    const cy = head + 62 + ext;
    const height = cy + ext + 96;
    const axisY = height - 30;
    P.bounds.h = axisY;
    const axis = xAxis(P, x, f.x.ticks, axisY, dev);
    nodes.push({ t: 'line', x1: left, y1: cy, x2: right, y2: cy, stroke: 'rule', sw: STROKE.grid });
    nodes.push(...seam(P, x(f.seam), head, axisY, dev));
    for (const [bx, lines] of [[38, twoLines(f.before)], [width - 38, twoLines(f.after)]] as const) {
      lines.forEach((l, k) => nodes.push({ t: 'text', x: bx, y: head + k * T.tick * 1.25, text: l, face: 'sans', size: T.tick, anchor: 'middle', fill: 'ink2' }));
      P.block({ x: bx - 30, y: head - T.tick, w: 60, h: lines.length * T.tick * 1.3 + 4 });
    }
    nodes.push({ t: 'line', x1: x(f.x.domain[0]) - 26, y1: head + 20, x2: x(f.x.domain[0]) - 26, y2: axisY, stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam });
    nodes.push({ t: 'line', x1: x(f.x.domain[1]) + 26, y1: head + 20, x2: x(f.x.domain[1]) + 26, y2: axisY, stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam });
    f.items.forEach((it, i) => {
      const b = items[i]!;
      nodes.push({ t: 'circle', cx: b.at, cy: cy + offs[i]!, r: Math.max(0.8, b.r - (it.state === 'projected' && !it.focus ? 0.5 : 0)), ...fill(it) });
      P.circle(b.at, cy + offs[i]!, b.r + 1);
    });
    for (const { it, i } of named) {
      const bx = items[i]!.at, by = cy + offs[i]!, r = items[i]!.r;
      const lw = Math.max(widthOf(it.label, 'sansMedium', T.label), widthOf(tag(it), 'sans', T.tick));
      if (r * 2 > lw + 10) {
        const on = labelOn(it.focus ? 'ed' : 'quiet3');
        nodes.push({ t: 'text', x: bx, y: by - 1, text: it.label, face: 'sansMedium', size: T.inFill, anchor: 'middle', fill: on });
        nodes.push({ t: 'text', x: bx, y: by + T.inFillSub + 1, text: tag(it), face: 'sans', size: T.inFillSub, anchor: 'middle', fill: on });
        continue;
      }
      nodes.push(...nameBeside(P, it.label, tag(it), bx, by, r, dev));
    }
    nodes.push(...axis);
    return { width, height, nodes };
  }

  // Phone: the step panel, then the years down the page. Decades with few events take less room.
  const width = WIDTH.phone, left = 40, right = width - 6;
  const P = new Placer({ x: 0, y: 0, w: width, h: 6000 });
  const nodes: SceneNode[] = [];
  const end = f.step ? f.step.points[f.step.points.length - 1]![0] : f.seam;
  const xs = scale([f.x.domain[0], end], [left, width - 44]);
  if (f.step) {
    nodes.push(...step(f, P, xs, 30, 120, dev, width - 44));
    nodes.push(...xAxis(P, xs, f.x.phoneTicks ?? [f.x.domain[0], 1970, 1990, 2010], 150, dev));
  }
  const count = new Map<number, number>();
  for (const it of f.items) if (typeof it.at === 'number') count.set(it.at, (count.get(it.at) ?? 0) + 1);
  const yAt = new Map<number, number>();
  const top = (f.step ? 200 : 20) + 40;
  let acc = top + 40;
  for (let yr = f.x.domain[0]; yr <= f.x.domain[1]; yr++) { yAt.set(yr, acc); acc += 3.4 + 2.6 * Math.min(4, count.get(yr) ?? 0); }
  const yOf = (yr: number) => yAt.get(Math.round(yr))!;
  const yBefore = top + 12, yAfter = yOf(f.x.domain[1]) + 50;
  const height = yAfter + 44;
  P.bounds.h = height;
  const cx = left + (right - left) / 2, half = (right - left) / 2 - 2;
  for (let t = Math.ceil(f.x.domain[0] / 10) * 10; t <= f.x.domain[1]; t += 10) {
    if (Math.abs(t - f.seam) < 5) continue;
    nodes.push({ t: 'line', x1: left, y1: yOf(t), x2: right, y2: yOf(t), stroke: 'rule', sw: STROKE.grid }, { t: 'text', x: left - 6, y: yOf(t) + 4, text: String(t), face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
  }
  nodes.push({ t: 'line', x1: left, y1: yOf(f.seam), x2: right, y2: yOf(f.seam), stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam }, { t: 'text', x: left - 6, y: yOf(f.seam) + 4, text: String(f.seam), face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
  nodes.push({ t: 'text', x: right, y: yOf(f.seam) + 14, text: 'Projected below', face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' });
  P.block({ x: right - 100, y: yOf(f.seam) + 2, w: 100, h: 16 });
  nodes.push({ t: 'line', x1: left, y1: yBefore + 18, x2: right, y2: yBefore + 18, stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam }, { t: 'line', x1: left, y1: yAfter - 26, x2: right, y2: yAfter - 26, stroke: 'ink2', sw: STROKE.hair, dash: DASH.seam });
  twoLines(f.before).forEach((l, k) => nodes.push({ t: 'text', x: left - 6, y: yBefore - 2 + k * 12, text: l, face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' }));
  twoLines(f.after).forEach((l, k) => nodes.push({ t: 'text', x: left - 6, y: yAfter - 2 + k * 12, text: l, face: 'sans', size: T.tick, anchor: 'end', fill: 'ink2' }));
  const items = f.items.map((it) => ({ at: it.at === 'before' ? yBefore : it.at === 'after' ? yAfter : yOf(it.at), r: rOf(it.weight) }));
  const offs = pack(items, 1.1, half);
  f.items.forEach((it, i) => {
    const b = items[i]!;
    nodes.push({ t: 'circle', cx: cx + offs[i]!, cy: b.at, r: Math.max(0.7, b.r - (it.state === 'projected' && !it.focus ? 0.5 : 0)), ...fill(it) });
    P.circle(cx + offs[i]!, b.at, b.r + 1);
  });
  for (const { it, i } of named) {
    const bx = cx + offs[i]!, by = items[i]!.at, r = items[i]!.r;
    if (r * 2 > widthOf(it.label, 'sansMedium', T.inFill) + 6) {
      const on = labelOn(it.focus ? 'ed' : 'quiet3');
      nodes.push({ t: 'text', x: bx, y: by - 1, text: it.label, face: 'sansMedium', size: T.inFill, anchor: 'middle', fill: on }, { t: 'text', x: bx, y: by + T.inFillSub + 1, text: tag(it), face: 'sans', size: T.inFillSub, anchor: 'middle', fill: on });
      continue;
    }
    const t = typeof it.at === 'number' ? `${it.label} ${it.at}` : it.label;
    nodes.push(...nameSide(P, t, bx, by, r, dev));
  }
  return { width, height, nodes };
}

/** A name and its year beside a circle on the wide plate: above or below first, then any direction. */
function nameBeside(P: Placer, name: string, yr: string, bx: number, by: number, r: number, dev: Device): SceneNode[] {
  const T = TYPE[dev];
  const lw = Math.max(widthOf(name, 'sansMedium', T.label), widthOf(yr, 'sans', T.tick)), hh = T.label + T.tick + 4;
  const boxes: Box[] = [];
  for (const d of [6, 20, 36]) boxes.push({ x: bx - lw / 2, y: by - r - d - hh, w: lw, h: hh }, { x: bx - lw / 2, y: by + r + d, w: lw, h: hh });
  for (let d = 8; d <= 160; d += 12) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    boxes.push({ x: bx + Math.cos(a) * (r + d + lw / 2) - lw / 2, y: by + Math.sin(a) * (r + d + hh / 2) - hh / 2, w: lw, h: hh });
  }
  for (const box of boxes) {
    if (!P.free(box)) continue;
    P.block(box);
    const cx = box.x + lw / 2, near = box.y > by ? box.y - 1 : box.y + hh + 1;
    const out: SceneNode[] = [];
    if (Math.hypot(cx - bx, near - by) > r + 9) {
      const a = Math.atan2(near - by, cx - bx);
      out.push({ t: 'line', x1: bx + Math.cos(a) * (r + 1), y1: by + Math.sin(a) * (r + 1), x2: cx, y2: near, stroke: 'ink2', sw: 0.6 });
    }
    out.push({ t: 'text', x: cx, y: box.y + T.label - 1, text: name, face: 'sansMedium', size: T.label, anchor: 'middle', fill: 'ink' });
    out.push({ t: 'text', x: cx, y: box.y + T.label + T.tick + 1, text: yr, face: 'sans', size: T.tick, anchor: 'middle', fill: 'ink2' });
    return out;
  }
  throw new Error(`No room on the plate for "${name}"`);
}

/** A name to one side of a circle on the phone, further out with a leader when it must. */
function nameSide(P: Placer, t: string, bx: number, by: number, r: number, dev: Device): SceneNode[] {
  const T = TYPE[dev];
  const lw = widthOf(t, 'sansMedium', T.label), hh = T.label + 2;
  for (const d of [5, 16, 30, 46, 64]) for (const side of [1, -1]) for (const dy of [0, -12, 12]) {
    const box = { x: side > 0 ? bx + r + d : bx - r - d - lw, y: by - hh / 2 + dy, w: lw, h: hh };
    if (!P.free(box)) continue;
    P.block(box);
    const out: SceneNode[] = [];
    if (d > 5 || dy !== 0) out.push({ t: 'line', x1: bx + side * (r + 1), y1: by, x2: side > 0 ? box.x - 2 : box.x + lw + 2, y2: box.y + hh / 2, stroke: 'ink2', sw: 0.6 });
    out.push({ t: 'text', x: box.x, y: box.y + T.label - 1, text: t, face: 'sansMedium', size: T.label, fill: 'ink' });
    return out;
  }
  throw new Error(`No room on the plate for "${t}"`);
}
