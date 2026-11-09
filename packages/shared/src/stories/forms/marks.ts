// What the scatter and the trail share: naming a round mark (beside it, or on a short leader that
// crosses no other mark), and a reference rule across a plot with its label at one end.

import type { SceneNode } from '../../charts/scene';
import type { ChartFace } from '../../charts/metrics';
import type { Pt } from '../geom';
import { DASH, OPACITY, STROKE, TYPE, type Device } from '../grammar';
import { widthOf, type Box, type Placer } from '../place';

/** A run of words in one line, each part in its own face and ink ("India" in ink, "2023" in grey). */
export interface Part { text: string; face: ChartFace; paint: 'ink' | 'ink2' }
export const runWidth = (parts: Part[], size: number) =>
  parts.reduce((a, p, i) => a + widthOf(p.text, p.face, size) + (i ? widthOf(' ', 'sans', size) : 0), 0);

export interface Mark { cx: number; cy: number; r: number }

/** How far a box is from a round mark's edge. */
export const gapTo = (b: Box, m: Mark) => Math.hypot(Math.max(b.x - m.cx, 0, m.cx - b.x - b.w), Math.max(b.y - m.cy, 0, m.cy - b.y - b.h)) - m.r;

/** How far a point is from a segment. */
function toSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Whether a leader crosses nothing on the plate: sampled along it, leaving its first few px (on its own mark). */
function clear(P: Placer, [ax, ay]: Pt, [bx, by]: Pt): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  for (let t = 4; t <= len; t += 2) {
    const px = ax + ((bx - ax) * t) / len, py = ay + ((by - ay) * t) / len;
    if (!P.free({ x: px - 0.25, y: py - 0.25, w: 0.5, h: 0.5 })) return false;
  }
  return true;
}

/** Labels closer than this to their mark's edge stand without a leader. */
export const BESIDE = 7;
/** A leader this long or shorter that crosses nothing is preferred to any that must cross a line. */
const SHORT = 26;

/**
 * Name a round mark: try spots just off its edge (the way it leans first, when it leans: behind a
 * path's start, beyond its end; then right, left, the diagonals, above, below), then further out on a
 * hairline leader, never past `reach`, one that crosses no line before one that must. A label beside its mark must be nearer it than any of the
 * `others`; a leader may not touch another of them, so it never leads into a neighbour. The leader is
 * registered too, so no later label sits on it. Throws when nothing fits.
 */
export function nameMark(P: Placer, parts: Part[], size: number, mark: Mark, opts: { reach?: number; toward?: number; others?: readonly Mark[] } = {}): SceneNode[] {
  const { cx, cy, r } = mark, reach = opts.reach ?? 60, toward = opts.toward;
  const others = (opts.others ?? []).filter((o) => o !== mark && (o.cx !== cx || o.cy !== cy));
  const w = runWidth(parts, size), h = size * 1.05;
  const lean = toward === undefined ? [] : [toward, toward - Math.PI / 4, toward + Math.PI / 4, toward - Math.PI / 2, toward + Math.PI / 2];
  const first = [...lean, 0, Math.PI, -Math.PI / 4, (-3 * Math.PI) / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2, Math.PI / 2];
  const ring = Array.from({ length: 24 }, (_, k) => (k / 24) * Math.PI * 2);
  const tries: [number, number][] = [];
  for (const d of [3, BESIDE]) for (const a of first) tries.push([d, a]);
  for (let d = 14; d <= reach; d += 6) for (const a of [...lean, ...ring]) tries.push([d, a]);
  // First a short leader that crosses nothing; failing that, any within reach that crosses a line
  // (a path, a rule) but no mark or word.
  for (const strict of [true, false]) for (const [d, a] of tries) {
    if (strict ? d > SHORT : d <= BESIDE) continue;
    const c = Math.cos(a), s = Math.sin(a);
    const px = cx + c * (r + d), py = cy + s * (r + d);
    const x = c > 0.35 ? px : c < -0.35 ? px - w : px - w / 2;
    const y = s > 0.35 ? py : s < -0.35 ? py - h : py - h / 2;
    const box: Box = { x: x - 1, y, w: w + 2, h };
    if (!P.free(box)) continue;
    // A label set close without a leader must be nearer its own mark than any other, or a reader
    // could give it to a neighbour.
    if (d <= BESIDE && others.some((o) => gapTo(box, o) < gapTo(box, mark) + 3)) continue;
    const out: SceneNode[] = [];
    if (d > BESIDE) {
      const lx = Math.min(Math.max(cx, box.x), box.x + box.w), ly = Math.min(Math.max(cy, box.y), box.y + box.h);
      const la = Math.atan2(ly - cy, lx - cx);
      const from: Pt = [cx + Math.cos(la) * (r + 1), cy + Math.sin(la) * (r + 1)];
      const to: Pt = [lx - Math.cos(la) * 2, ly - Math.sin(la) * 2];
      if (others.some((o) => toSegment([o.cx, o.cy], from, to) < o.r + 1)) continue;
      if (others.some((o) => gapTo(box, o) < 1)) continue;
      if (strict && !clear(P, from, to)) continue;
      out.push({ t: 'line', x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: 'ink2', sw: STROKE.hair });
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

/** A reference rule across the plot, dashed, its label at the right end above it (or below, or at the left). */
export function referenceRule(P: Placer, rule: { y: number; label: string }, y: (v: number) => number, x0: number, x1: number, dev: Device): SceneNode[] {
  const T = TYPE[dev], yy = y(rule.y);
  const out: SceneNode[] = [{ t: 'line', x1: x0, y1: yy, x2: x1, y2: yy, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference, so: OPACITY.reference }];
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
