// slope: change between two moments for a dozen or so members. Two posts headed by their moments,
// each member a straight line between its two values, in grey; one member (at most two) in the
// edition's ink. Values stand at both posts and names at the right one, spread so none touch, with
// a short leader wherever a label had to move off its point. A reference runs between the posts.

import type { Scene, SceneNode } from '../../charts/scene';
import { fmt } from '../axes';
import { scale, type Pt } from '../geom';
import { DASH, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, spread, widthOf, type Box } from '../place';

export interface SlopeMember {
  label: string;
  /** The value at the left post and at the right one. */
  from: number;
  to: number;
  /** 'loud' is the story's member (the edition's ink at full weight); 'second' a lighter companion. */
  focus?: 'loud' | 'second';
}

export interface SlopeFigure {
  form: 'slope';
  /** The posts' heads: the two moments. */
  from: string;
  to: string;
  /** What the values count, above the figure. */
  unit: string;
  y: { domain: [number, number] };
  /** Decimals the values are written with. */
  decimals: 0 | 1 | 2;
  members: SlopeMember[];
  rule?: { y: number; label: string };
}

const LAYOUT = {
  wide: { plotH: 470, span: 400, lead: 34 },
  phone: { plotH: 400, span: 0, lead: 24 },
} as const;

/** A leader from a point to its moved label: level out of the point, a slant, level into the label. */
function leader(xa: number, ya: number, xb: number, yb: number): SceneNode {
  const k = Math.sign(xb - xa) * 5, r = (v: number) => v.toFixed(1);
  return { t: 'path', d: `M${r(xa)} ${r(ya)}H${r(xa + k)}L${r(xb - k)} ${r(yb)}H${r(xb)}`, stroke: 'ink2', sw: 0.6 };
}

const formatOf = (d: 0 | 1 | 2) => (d === 0 ? 'int' : d === 1 ? 'one' : 'two');

export function drawSlope(f: SlopeFigure, dev: Device): Scene {
  const focus = f.members.filter((m) => m.focus);
  if (focus.length > 2 || f.members.filter((m) => m.focus === 'loud').length > 1) throw new Error('A slope has one loud member and at most one more in the ink.');
  const T = TYPE[dev], L = LAYOUT[dev], width = WIDTH[dev], size = T.label;
  const val = (v: number) => fmt(v, formatOf(f.decimals));
  const faceOf = (m: SlopeMember) => (m.focus ? 'sansMedium' : 'sans');
  const valW = Math.max(...f.members.flatMap((m) => [widthOf(val(m.from), faceOf(m), size), widthOf(val(m.to), faceOf(m), size)]));
  const nameW = Math.max(...f.members.map((m) => widthOf(m.label, faceOf(m), size)));
  // Left: the values; the posts; right: the values in a column, then the names.
  const leftW = L.lead + valW, rightW = L.lead + valW + 6 + nameW;
  const span = dev === 'phone' ? width - leftW - rightW - 4 : L.span;
  const x0 = dev === 'phone' ? leftW + 2 : Math.round((width - (leftW + span + rightW)) / 2 + leftW);
  const x1 = x0 + span;
  const unitY = T.tick + 2, headY = unitY + 26, top = headY + 22, bottom = top + L.plotH;
  const height = bottom + 12;
  const y = scale(f.y.domain, [bottom, top]);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const back: SceneNode[] = [], lines: SceneNode[] = [], front: SceneNode[] = [], labels: SceneNode[] = [];
  const claim = (b: Box, what: string) => {
    if (!P.free(b)) throw new Error(`No room on the plate for "${what}"`);
    P.block(b);
  };

  labels.push({ t: 'text', x: 0, y: unitY, text: f.unit, face: 'sans', size: T.tick, fill: 'ink2' });
  claim({ x: 0, y: unitY - T.tick, w: widthOf(f.unit, 'sans', T.tick), h: T.tick + 2 }, f.unit);
  for (const [px, head] of [[x0, f.from], [x1, f.to]] as const) {
    const w = widthOf(head, 'sansMedium', size);
    labels.push({ t: 'text', x: px, y: headY, text: head, face: 'sansMedium', size, anchor: 'middle', fill: 'ink' });
    claim({ x: px - w / 2, y: headY - size, w, h: size + 3 }, head);
    back.push({ t: 'line', x1: px, y1: headY + 8, x2: px, y2: bottom, stroke: 'ink2', sw: STROKE.hair });
  }

  // Lines: context first, the loud member last, so it is never crossed.
  const rank = (m: SlopeMember) => (m.focus === 'loud' ? 2 : m.focus ? 1 : 0);
  const order = f.members.slice().sort((a, b) => rank(a) - rank(b));
  for (const m of order) {
    const a: Pt = [x0, y(m.from)], b: Pt = [x1, y(m.to)];
    const paint = m.focus ? 'ed' : 'quiet3';
    const sw = m.focus === 'loud' ? STROKE.story[dev] : m.focus ? STROKE.named * 1.5 : STROKE.named;
    lines.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: paint, sw });
    const r = m.focus === 'loud' ? DOT.story : DOT.named;
    for (const [cx, cy] of [a, b]) front.push({ t: 'circle', cx, cy, r, fill: paint, stroke: 'bg', sw: 1.5 });
    if (m.focus) P.path([a, b], 3);
  }

  // The values at each post (and the names at the right), spread into a column with leaders.
  const min = size * 1.32;
  const column = (side: 'left' | 'right') => {
    const raw = f.members.map((m) => y(side === 'left' ? m.from : m.to));
    const ys = spread(raw, min, top, bottom);
    f.members.forEach((m, i) => {
      const yt = raw[i]!, yl = ys[i]!, strong = !!m.focus;
      const face = faceOf(m), fill = strong ? 'ink' : 'ink2';
      const v = val(side === 'left' ? m.from : m.to);
      const moved = Math.abs(yl - yt) > 1.5;
      const base = yl + size * 0.35;
      if (side === 'right') {
        const vx = x1 + L.lead, nx = vx + valW + 6;
        claim({ x: vx, y: base - size * 0.8, w: valW + 6 + widthOf(m.label, face, size), h: size * 1.05 }, m.label);
        labels.push({ t: 'text', x: vx + valW, y: base, text: v, face, size, anchor: 'end', fill }, { t: 'text', x: nx, y: base, text: m.label, face, size, fill });
        if (moved) front.push(leader(x1 + 5, yt, x1 + L.lead - 4, yl));
      } else {
        const vx = x0 - L.lead;
        claim({ x: vx - valW, y: base - size * 0.8, w: valW, h: size * 1.05 }, `${m.label} ${v}`);
        labels.push({ t: 'text', x: vx, y: base, text: v, face, size, anchor: 'end', fill });
        if (moved) front.push(leader(x0 - 5, yt, x0 - L.lead + 4, yl));
      }
    });
  };
  column('left');
  column('right');

  // The reference: a dashed hairline between the posts, named once just above it, where the
  // label is clear of the loud line; the grey lines pass under its halo.
  if (f.rule) {
    const ry = y(f.rule.y);
    back.push({ t: 'line', x1: x0, y1: ry, x2: x1, y2: ry, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: 0.8 });
    const w = widthOf(f.rule.label, 'sans', T.small);
    const tries = [0.5, 0.35, 0.65, 0.2, 0.8].flatMap((t) => [[x0 + span * t - w / 2, ry - 5], [x0 + span * t - w / 2, ry + T.small + 4]] as const);
    const spot = tries.find(([lx, ly]) => P.free({ x: lx - 2, y: ly - T.small * 0.8, w: w + 4, h: T.small * 1.05 }));
    if (!spot) throw new Error(`No room on the plate for "${f.rule.label}"`);
    P.block({ x: spot[0] - 2, y: spot[1] - T.small * 0.8, w: w + 4, h: T.small * 1.05 });
    labels.push({ t: 'text', x: spot[0], y: spot[1], text: f.rule.label, face: 'sans', size: T.small, fill: 'ink2', stroke: 'bg', sw: 4 });
  }
  return { width, height, nodes: [...back, ...lines, ...front, ...labels] };
}
