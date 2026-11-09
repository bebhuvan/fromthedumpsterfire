// Drawing primitives for the data-story comps: scales, paths, measured text, a beeswarm packer and
// a label placer. Every colour is a class (tokens in the page's CSS), so light and dark come free and
// the SVG carries no inline styles, as the site's CSP requires.

import { textWidth } from '../../../packages/shared/src/charts/text';
import type { ChartFace } from '../../../packages/shared/src/charts/metrics';

export const esc = (s: string | number) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type Scale = ((v: number) => number) & { d: [number, number]; r: [number, number]; inv: (p: number) => number };
export function lin(d: [number, number], r: [number, number]): Scale {
  const f = ((v: number) => r[0] + ((v - d[0]) / (d[1] - d[0])) * (r[1] - r[0])) as Scale;
  f.d = d; f.r = r; f.inv = (p) => d[0] + ((p - r[0]) / (r[1] - r[0])) * (d[1] - d[0]);
  return f;
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();
export const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('');
export const areaOf = (top: [number, number][], base: [number, number][]) =>
  pathOf(top) + base.slice().reverse().map(([x, y]) => `L${n(x)} ${n(y)}`).join('') + 'Z';

export type Face = ChartFace;
export const measure = (t: string, face: Face, size: number) => textWidth(t, face, size);

/** One SVG element string. Attributes with undefined values are dropped. */
export function el(tag: string, a: Record<string, string | number | undefined>, inner = ''): string {
  const at = Object.entries(a).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}="${esc(typeof v === 'number' ? n(v) : v)}"`).join(' ');
  return inner === '' && tag !== 'text' && tag !== 'tspan' ? `<${tag} ${at}/>` : `<${tag} ${at}>${inner}</${tag}>`;
}
export const line = (x1: number, y1: number, x2: number, y2: number, cls: string, extra: Record<string, string | number> = {}) =>
  el('line', { x1, y1, x2, y2, class: cls, ...extra });
export const text = (x: number, y: number, s: string, cls: string, anchor: 'start' | 'middle' | 'end' = 'start', extra: Record<string, string | number> = {}) =>
  el('text', { x, y, class: cls, 'text-anchor': anchor === 'start' ? undefined : anchor, ...extra }, esc(s));
export const circle = (cx: number, cy: number, r: number, cls: string) => el('circle', { cx, cy, r, class: cls });

export function svg(w: number, h: number, body: string, label: string, cls = 'ds'): string {
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
}

/** Hatching for what has not happened yet: the UN's projections. */
export const hatch = (id: string, cls: string, gap = 4.5, weight = 1) =>
  `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(45)">${line(0, 0, 0, gap, cls, { 'stroke-width': weight })}</pattern></defs>`;

// --- Beeswarm: every country a circle at its year, packed so none overlaps, biggest first. ---
export type Bee = { key: string; x: number; r: number; y?: number };
export function swarm(bees: Bee[], gap = 1.2, limit = Infinity): Bee[] {
  const placed: Bee[] = [];
  for (const b of bees.slice().sort((a, c) => c.r - a.r || a.key.localeCompare(c.key))) {
    let best = 0;
    for (let step = 0; step < 4000; step++) {
      const off = step === 0 ? 0 : Math.ceil(step / 2) * 0.5 * (step % 2 ? 1 : -1);
      const ok = placed.every((p) => Math.hypot(p.x - b.x, p.y! - off) >= p.r + b.r + gap);
      if (ok && Math.abs(off) + b.r <= limit) { best = off; break; }
      best = off;
    }
    placed.push({ ...b, y: best });
  }
  return placed;
}

// --- Labels: boxes that must not touch each other or the marks given as obstacles. ---
export type Box = { x: number; y: number; w: number; h: number };
export const hit = (a: Box, b: Box, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
export class Placer {
  boxes: Box[] = [];
  constructor(public bounds: Box) {}
  free(b: Box) {
    const B = this.bounds;
    return b.x >= B.x && b.y >= B.y && b.x + b.w <= B.x + B.w && b.y + b.h <= B.y + B.h && !this.boxes.some((o) => hit(o, b));
  }
  take(b: Box) { this.boxes.push(b); return b; }
  block(b: Box) { this.boxes.push(b); }
  blockCircle(cx: number, cy: number, r: number) { this.boxes.push({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }); }
}

/** Spread label centres along one axis so none are closer than `min`, keeping order and staying in [lo, hi]. */
export function spread(ys: number[], min: number, lo: number, hi: number): number[] {
  const idx = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const out = idx.map(([y]) => y);
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let i = 1; i < out.length; i++) if (out[i]! - out[i - 1]! < min) {
      const mid = (out[i]! + out[i - 1]!) / 2; out[i - 1] = mid - min / 2; out[i] = mid + min / 2; moved = true;
    }
    for (let i = 0; i < out.length; i++) out[i] = Math.min(hi, Math.max(lo, out[i]!));
    if (!moved) break;
  }
  const res = new Array<number>(ys.length);
  idx.forEach(([, i], k) => (res[i] = out[k]!));
  return res;
}

export const fmtPop = (p: number) => (p >= 1e9 ? `${(p / 1e9).toFixed(2)} billion` : `${Math.round(p / 1e6)} million`);
export const roman = (k: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][k - 1]!;
