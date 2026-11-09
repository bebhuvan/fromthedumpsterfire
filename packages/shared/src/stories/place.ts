// The placer: every label and note on a plate is put where nothing else is. It knows the ticks,
// the points and the story line (as small boxes along it), tries a label's preferred spots, then
// rings of growing distance, and draws a leader when the label moved away. When nothing fits it
// throws: a plate never drops a label in silence.

import type { SceneNode } from '../charts/scene';
import { textWidth } from '../charts/text';
import type { ChartFace } from '../charts/metrics';
import type { Pt } from './geom';

export interface Box { x: number; y: number; w: number; h: number }
export const overlaps = (a: Box, b: Box, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export class Placer {
  readonly taken: Box[] = [];
  constructor(public bounds: Box) {}
  free(b: Box): boolean {
    const B = this.bounds;
    return b.x >= B.x && b.y >= B.y && b.x + b.w <= B.x + B.w && b.y + b.h <= B.y + B.h && !this.taken.some((o) => overlaps(o, b));
  }
  block(b: Box): void { this.taken.push(b); }
  circle(cx: number, cy: number, r: number): void { this.block({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }); }
  /** A line as small boxes along it, so no text sits on it. */
  path(pts: readonly Pt[], r = 3): void {
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i]!;
      this.block({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
      const nx = pts[i + 1];
      if (!nx) continue;
      const k = Math.ceil(Math.hypot(nx[0] - x, nx[1] - y) / (2 * r));
      for (let j = 1; j < k; j++) this.block({ x: x + ((nx[0] - x) * j) / k - r, y: y + ((nx[1] - y) * j) / k - r, w: 2 * r, h: 2 * r });
    }
  }
}

export const LEADING = 1.3;
export const widthOf = (t: string, face: ChartFace, size: number) => textWidth(t, face, size);

export type Anchor = 'start' | 'middle' | 'end';
export interface LabelSpec {
  lines: string[];
  /** The mark the label speaks of. */
  at: Pt;
  face: ChartFace;
  size: number;
  /** The machine's blue (a note) or the label inks. */
  paint: 'mach' | 'ink' | 'ink2';
  /** Preferred offsets from the mark (to the first baseline), tried before the rings. */
  prefer?: [number, number, Anchor][];
  /** Whether to try the rings at all (end labels that must stay put do not). */
  roam?: boolean;
  /** How far the rings may go, px. */
  reach?: number;
}

/** Place a label, or throw. Returns its nodes (leader, dot, the lines with a halo). */
export function place(P: Placer, L: LabelSpec, what = L.lines.join(' ')): SceneNode[] {
  const w = Math.max(...L.lines.map((l) => widthOf(l, L.face, L.size)));
  const h = L.lines.length * L.size * LEADING;
  const tries: [number, number, Anchor][] = [...(L.prefer ?? [])];
  if (L.roam !== false) {
    for (let d = 16; d <= (L.reach ?? 240); d += 12) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d * 0.7;
      tries.push([dx, dy + (dy < 0 ? 0 : L.size), dx > 4 ? 'start' : dx < -4 ? 'end' : 'middle']);
    }
  }
  const [ax, ay] = L.at;
  for (const [dx, dy, anchor] of tries) {
    const left = anchor === 'start' ? ax + dx : anchor === 'end' ? ax + dx - w : ax + dx - w / 2;
    const box: Box = { x: left - 2, y: ay + dy - L.size * 0.8, w: w + 4, h: h };
    if (!P.free(box)) continue;
    P.block(box);
    const out: SceneNode[] = [];
    if (Math.hypot(dx, dy) > 16 && L.paint === 'mach') {
      // The leader runs from the mark to the nearest edge of the label.
      const lx = Math.min(Math.max(ax, box.x), box.x + box.w), ly = Math.min(Math.max(ay, box.y), box.y + box.h);
      out.push({ t: 'line', x1: ax, y1: ay, x2: lx, y2: ly, stroke: 'mach', sw: 0.8 }, { t: 'circle', cx: ax, cy: ay, r: 2, fill: 'mach' });
    } else if (Math.hypot(dx, dy) > 22) {
      const lx = Math.min(Math.max(ax, box.x), box.x + box.w), ly = Math.min(Math.max(ay, box.y), box.y + box.h);
      out.push({ t: 'line', x1: ax, y1: ay, x2: lx, y2: ly, stroke: 'ink2', sw: 0.6 });
    }
    const tx = anchor === 'start' ? left : anchor === 'end' ? left + w : left + w / 2;
    L.lines.forEach((line, i) => out.push({ t: 'text', x: tx, y: ay + dy + i * L.size * LEADING, text: line, face: L.face, size: L.size, anchor, fill: L.paint, stroke: 'bg', sw: 4 }));
    return out;
  }
  throw new Error(`No room on the plate for "${what}"`);
}

/** Spread label centres along one axis so none are closer than `min`, keeping their order. */
export function spread(ys: number[], min: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const out = order.map(([y]) => y);
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let i = 1; i < out.length; i++) if (out[i]! - out[i - 1]! < min) {
      const mid = (out[i]! + out[i - 1]!) / 2;
      out[i - 1] = mid - min / 2;
      out[i] = mid + min / 2;
      moved = true;
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.min(hi, Math.max(lo, out[i]!));
    if (!moved) break;
  }
  const res = new Array<number>(ys.length);
  order.forEach(([, i], k) => (res[i] = out[k]!));
  return res;
}
