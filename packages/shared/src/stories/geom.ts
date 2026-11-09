// Geometry for the plates: scales, paths, and hatching drawn as real line segments (no SVG
// patterns), so a hatched range renders the same inline on the website and in resvg's pictures.

export type Pt = [number, number];

export type Scale = ((v: number) => number) & { domain: [number, number]; range: [number, number] };
export function scale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const f = ((v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)) as Scale;
  f.domain = domain;
  f.range = range;
  return f;
}

const n = (v: number) => String(Math.round(v * 10) / 10);
export const pathOf = (pts: readonly Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('');
/** A closed area between an upper and a lower edge, both left to right. */
export const areaOf = (top: readonly Pt[], bottom: readonly Pt[]) =>
  pathOf(top) + bottom.slice().reverse().map(([x, y]) => `L${n(x)} ${n(y)}`).join('') + 'Z';

/** A yearly value as a step: it holds for the year, then moves. */
export function steps(pts: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  pts.forEach((p, i) => {
    if (i) out.push([p[0], pts[i - 1]![1]]);
    out.push(p);
  });
  return out;
}

/** The y of an edge at x, by straight lines between its points (the edge runs left to right). */
function yAt(edge: readonly Pt[], x: number): number {
  if (x <= edge[0]![0]) return edge[0]![1];
  for (let i = 1; i < edge.length; i++) {
    const a = edge[i - 1]!, b = edge[i]!;
    if (x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]);
  }
  return edge[edge.length - 1]![1];
}

/**
 * Hatching over the area between two edges (top above bottom on screen), as segments of parallel
 * lines at 45 degrees (rising to the right, or falling when `down`), `gap` px apart. Each line is
 * walked in small steps and kept where it is inside the area, so the hatching follows any shape.
 */
export function hatch(top: readonly Pt[], bottom: readonly Pt[], gap: number, down = false): Pt[][] {
  if (top.length < 2) return [];
  const x0 = top[0]![0], x1 = top[top.length - 1]![0];
  const ys = [...top, ...bottom].map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const segs: Pt[][] = [];
  const s = down ? -1 : 1;
  // Lines y = -s*x + c, c spaced so lines are `gap` apart on the perpendicular.
  const step = gap * Math.SQRT2;
  const cMin = down ? y0 - x1 : y0 + x0, cMax = down ? y1 - x0 : y1 + x1;
  const start = Math.floor(cMin / step) * step;
  for (let c = start; c <= cMax; c += step) {
    let run: Pt | null = null;
    let last: Pt | null = null;
    for (let x = x0; x <= x1 + 0.01; x += 0.5) {
      const y = -s * x + c;
      const inside = y >= yAt(top, x) && y <= yAt(bottom, x);
      if (inside && !run) run = [x, y];
      if (inside) last = [x, y];
      if (!inside && run && last) { if (Math.hypot(last[0] - run[0], last[1] - run[1]) > 0.8) segs.push([run, last]); run = null; }
    }
    if (run && last && Math.hypot(last[0] - run[0], last[1] - run[1]) > 0.8) segs.push([run, last]);
  }
  return segs;
}

/** Hatching as one path: many short segments, one SVG element. */
export const hatchPath = (segs: Pt[][]) => segs.map(([a, b]) => `M${n(a![0])} ${n(a![1])}L${n(b![0])} ${n(b![1])}`).join('');
