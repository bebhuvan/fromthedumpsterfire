// slope: change between two moments for a dozen or so members. Two posts headed by their moments,
// each member a straight line between its two values, in grey; one member (at most two) in the
// edition's ink. Every member is named at both posts, its value next to the post, so a line can be
// followed in from either side; the labels are spread into columns so none touch, each on a hairline
// leader from its point. A reference runs dashed between the posts and on, like a member's leader,
// to its own label in the right-hand column, so it is never printed across the lines.

import type { Scene, SceneNode } from '../../charts/scene';
import { fmt } from '../axes';
import { scale, type Pt } from '../geom';
import { DASH, OPACITY, DOT, STROKE, TYPE, WIDTH, type Device } from '../grammar';
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
  wide: { plotH: 470, span: 400, lead: 28 },
  phone: { plotH: 440, span: 0, lead: 16 },
} as const;

/** A leader from a point to its label: level out of the point, a slant, level into the label. */
function leader(xa: number, ya: number, xb: number, yb: number, dash?: string): SceneNode {
  const k = Math.sign(xb - xa) * 5, r = (v: number) => v.toFixed(1);
  const d = Math.abs(yb - ya) < 0.5 ? `M${r(xa)} ${r(ya)}H${r(xb)}` : `M${r(xa)} ${r(ya)}H${r(xa + k)}L${r(xb - k)} ${r(yb)}H${r(xb)}`;
  return { t: 'path', d, stroke: 'ink2', sw: STROKE.hair * 0.8, ...(dash ? { dash, so: 0.8 } : {}) };
}

const formatOf = (d: 0 | 1 | 2) => (d === 0 ? 'int' : d === 1 ? 'one' : 'two');

export function drawSlope(f: SlopeFigure, dev: Device): Scene {
  const focus = f.members.filter((m) => m.focus);
  if (focus.length > 2 || f.members.filter((m) => m.focus === 'loud').length > 1) throw new Error('A slope has one loud member and at most one more in the ink.');
  const T = TYPE[dev], L = LAYOUT[dev], width = WIDTH[dev], size = T.label;
  const val = (v: number) => fmt(v, formatOf(f.decimals));
  const faceOf = (m: SlopeMember) => (m.focus ? 'sansMedium' : 'sans');
  const valW = Math.max(...f.members.flatMap((m) => [widthOf(val(m.from), faceOf(m), size), widthOf(val(m.to), faceOf(m), size)]));
  const nameW = Math.max(...f.members.map((m) => widthOf(m.label, faceOf(m), size)), f.rule ? widthOf(f.rule.label, 'sans', T.small) : 0);
  // Left: names, then values; the posts; right: values, then names (and the reference's label).
  const gap = 5, colW = L.lead + valW + gap + nameW;
  const span = dev === 'phone' ? width - 2 * colW - 4 : L.span;
  if (span < 80) throw new Error('No room between the posts');
  const x0 = Math.round((width - span) / 2), x1 = x0 + span;
  const unitY = T.tick + 2, headY = unitY + 26, top = headY + 22, bottom = top + L.plotH;
  const y = scale(f.y.domain, [bottom, top]);
  const back: SceneNode[] = [], lines: SceneNode[] = [], front: SceneNode[] = [], labels: SceneNode[] = [];

  // The columns first, so the figure is as tall as its lowest label.
  const min = size * 1.32;
  type Row = { m?: SlopeMember; raw: number; y: number };
  const column = (side: 'left' | 'right'): Row[] => {
    const rows: Row[] = f.members.map((m) => ({ m, raw: y(side === 'left' ? m.from : m.to), y: 0 }));
    if (side === 'right' && f.rule) rows.push({ raw: y(f.rule.y), y: 0 });
    const ys = spread(rows.map((r) => r.raw), min, top, bottom + size * 3);
    rows.forEach((r, i) => (r.y = ys[i]!));
    return rows;
  };
  const left = column('left'), right = column('right');
  const height = Math.max(bottom, ...left.map((r) => r.y), ...right.map((r) => r.y)) + size + 4;
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
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
    for (const [cx, cy] of [a, b]) front.push({ t: 'circle', cx, cy, r, fill: paint, stroke: 'bg', sw: STROKE.ring * 0.75 });
    P.path([a, b], 3);
  }

  // The reference: a dashed hairline between the posts that carries on to its label in the column.
  if (f.rule) {
    const ry = y(f.rule.y);
    back.push({ t: 'line', x1: x0, y1: ry, x2: x1, y2: ry, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: OPACITY.reference });
  }

  // Each label on a hairline from its point: level when it could stay, bent when it was spread.
  for (const [side, rows] of [['left', left], ['right', right]] as const) for (const row of rows) {
    const post = side === 'left' ? x0 : x1, dir = side === 'left' ? -1 : 1;
    const valX = post + dir * L.lead, nameX = valX + dir * (valW + gap);
    const base = row.y + size * 0.35;
    if (!row.m) {
      // The reference's label, smaller, in the names' place; its leader dashed like the rule.
      const text = f.rule!.label, w = widthOf(text, 'sans', T.small), b = row.y + T.small * 0.35;
      claim({ x: nameX, y: b - T.small * 0.8, w, h: T.small * 1.05 }, text);
      labels.push({ t: 'text', x: nameX, y: b, text, face: 'sans', size: T.small, fill: 'ink2' });
      back.push(leader(post, row.raw, nameX - 4, row.y, DASH.reference));
      continue;
    }
    const m = row.m, face = faceOf(m), fill = m.focus ? 'ink' : 'ink2';
    const v = val(side === 'left' ? m.from : m.to), nw = widthOf(m.label, face, size);
    const box = side === 'left' ? { x: nameX - nw, y: base - size * 0.8, w: nw + gap + valW, h: size * 1.05 } : { x: valX, y: base - size * 0.8, w: valW + gap + nw, h: size * 1.05 };
    claim(box, m.label);
    labels.push(
      { t: 'text', x: side === 'left' ? valX : valX + valW, y: base, text: v, face, size, anchor: 'end', fill },
      { t: 'text', x: nameX, y: base, text: m.label, face, size, anchor: side === 'left' ? 'end' : 'start', fill },
    );
    const into = side === 'left' ? valX + 4 : valX + valW - widthOf(v, face, size) - 4;
    front.push(leader(post + dir * 5, row.raw, into, row.y));
  }
  return { width, height, nodes: [...back, ...lines, ...front, ...labels] };
}
