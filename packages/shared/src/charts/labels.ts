// Labels that never collide. Every form measures its words with the faces' real widths (text.ts) and
// places them through a Placer: a list of what is already on the figure (other labels, and the marks
// a label may not cover), tried against candidate spots in order. When no spot beside a mark is free,
// a label moves further out on a short leader before it is ever dropped; a dropped label is still in
// the table under the chart. labels.test.ts checks every comps fixture at both widths.

import type { SceneNode } from './scene';
import type { ChartFace } from './metrics';
import { textWidth } from './text';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far a face reaches above and below its baseline, as a share of the size. */
const ASCENT = 0.76;
const DESCENT = 0.22;

/** The box a label covers, from its anchor, its measured width and the face's ascent and descent. */
export function boxOf(x: number, y: number, s: string, face: ChartFace, size: number, anchor: 'start' | 'middle' | 'end' = 'start'): Box & { text: string } {
  const w = textWidth(s, face, size);
  const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { text: s, x: left, y: y - size * ASCENT, w, h: size * (ASCENT + DESCENT) };
}

/** Every text node's box, anywhere in a node tree. */
export function textBoxes(nodes: SceneNode[]): Array<Box & { text: string }> {
  const out: Array<Box & { text: string }> = [];
  const walk = (ns: SceneNode[]) => {
    for (const n of ns) {
      if (n.t === 'g') walk(n.children);
      else if (n.t === 'text') out.push(boxOf(n.x, n.y, n.text, n.face, n.size, n.anchor));
    }
  };
  walk(nodes);
  return out;
}

export const hits = (a: Box, b: Box, slack = 0.5) => a.x + slack < b.x + b.w && a.x + a.w > b.x + slack && a.y + slack < b.y + b.h && a.y + a.h > b.y + slack;

/** Pairs of boxes that overlap by more than half a pixel. */
export function overlapping<T extends Box>(boxes: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hits(boxes[i]!, boxes[j]!)) out.push([boxes[i]!, boxes[j]!]);
  return out;
}

export const pad = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

/** What is already on the figure, and the area labels must stay inside. */
export class Placer {
  readonly taken: Box[] = [];
  readonly bounds: Box;
  constructor(bounds: Box, taken: Box[] = []) {
    this.bounds = bounds;
    this.taken.push(...taken);
  }
  inside(b: Box): boolean {
    return b.x >= this.bounds.x - 0.01 && b.y >= this.bounds.y - 0.01 && b.x + b.w <= this.bounds.x + this.bounds.w + 0.01 && b.y + b.h <= this.bounds.y + this.bounds.h + 0.01;
  }
  free(b: Box, gap = 1.5): boolean {
    if (!this.inside(b)) return false;
    const g = pad(b, gap);
    return !this.taken.some((t) => hits(g, t, 0));
  }
  claim(b: Box): void {
    this.taken.push(b);
  }
  /** Claim and return the first free candidate, or null. */
  first<T extends { box: Box }>(cands: T[], gap = 1.5): T | null {
    for (const c of cands) if (this.free(c.box, gap)) return (this.claim(c.box), c);
    return null;
  }
}

export interface PointLabel {
  /** The mark's centre and radius (the label keeps clear of it). */
  x: number;
  y: number;
  r: number;
  text: string;
  face: ChartFace;
  size: number;
}

export interface Placed {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  box: Box;
  /** A leader from the mark to the label, when the label had to move away from it. */
  leader?: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * A label for a point: first in one of eight spots touching the mark (right, left, above, below, the
 * four corners), then further out on a leader, in rings of growing distance and sixteen directions,
 * the nearest free spot winning. Null only when nothing is free within reach.
 */
export function placePoint(p: Placer, it: PointLabel, reach = 70): Placed | null {
  const w = textWidth(it.text, it.face, it.size);
  const asc = it.size * ASCENT;
  const h = it.size * (ASCENT + DESCENT);
  const g = it.r + 3;
  const at = (x: number, y: number, anchor: Placed['anchor']): Placed => {
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return { x, y, anchor, box: { x: left, y: y - asc, w, h } };
  };
  const mid = asc / 2 - it.size * 0.04;
  const near: Placed[] = [
    at(it.x + g, it.y + mid, 'start'),
    at(it.x - g, it.y + mid, 'end'),
    at(it.x, it.y - g - it.size * DESCENT, 'middle'),
    at(it.x, it.y + g + asc, 'middle'),
    at(it.x + g * 0.75, it.y - g * 0.75, 'start'),
    at(it.x - g * 0.75, it.y - g * 0.75, 'end'),
    at(it.x + g * 0.75, it.y + g * 0.75 + asc, 'start'),
    at(it.x - g * 0.75, it.y + g * 0.75 + asc, 'end'),
  ];
  const hit = p.first(near.map((c) => ({ ...c, box: c.box })));
  if (hit) return hit;
  // Further out, on a leader: the label's nearest edge sits at distance d from the mark.
  for (let d = g + 10; d <= reach; d += 8) {
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const cx = it.x + Math.cos(a) * d;
      const cy = it.y - Math.sin(a) * d;
      const anchor: Placed['anchor'] = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
      const ly = Math.sin(a) > 0.3 ? cy - it.size * DESCENT : Math.sin(a) < -0.3 ? cy + asc : cy + mid;
      const c = at(cx, ly, anchor);
      if (!p.free(c.box, 2)) continue;
      p.claim(c.box);
      // The leader runs from the mark's edge to the nearest point of the label's box.
      const tx = Math.max(c.box.x, Math.min(it.x, c.box.x + c.box.w));
      const ty = Math.max(c.box.y, Math.min(it.y, c.box.y + c.box.h));
      const len = Math.hypot(tx - it.x, ty - it.y) || 1;
      const ux = (tx - it.x) / len;
      const uy = (ty - it.y) / len;
      return { ...c, leader: { x1: it.x + ux * (it.r + 1.5), y1: it.y + uy * (it.r + 1.5), x2: tx - ux * 2, y2: ty - uy * 2 } };
    }
  }
  return null;
}

/** The box of a mark (a dot of radius r) for the Placer. */
export const dotBox = (x: number, y: number, r: number): Box => ({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
