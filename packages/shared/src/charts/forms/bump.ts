// Bump: how a ranking changed over time. Code ranks the series within each period (highest first
// unless options.rank says otherwise; ties broken by name, so the drawing is deterministic) from the
// value column the rows carry. The loud series in the edition's ink, the rest quiet; names at both
// ends (only at the right on a phone, with the starting ranks as numbers at the left).

import type { Scene, SceneNode, Paint } from '../scene';
import { Ctx, linePath, text, vline } from '../frame';
import { linear } from '../scales';
import { textWidth } from '../text';

export interface Ranked {
  xs: number[];
  names: string[];
  /** For each series, its rank at each x (1 is first), or null where it has no value. */
  ranks: Map<string, Array<number | null>>;
}

/** Rank the series at each x by their value (ties: alphabetical, so the result never depends on row order). */
export function rankOf(ctx: Ctx): Ranked {
  const names = ctx.groups('series');
  const vals = new Map<number, Map<string, number>>();
  for (const r of ctx.rows) {
    const x = ctx.xval(r);
    const v = ctx.num(r, 'y');
    if (x === null || v === null) continue;
    if (!vals.has(x)) vals.set(x, new Map());
    vals.get(x)!.set(ctx.str(r, 'series'), v);
  }
  const xs = [...vals.keys()].sort((a, b) => a - b);
  const asc = ctx.chart.options?.rank === 'asc';
  const ranks = new Map<string, Array<number | null>>(names.map((n) => [n, xs.map(() => null)]));
  xs.forEach((x, k) => {
    const m = vals.get(x)!;
    const order = [...m.entries()].sort((a, b) => (asc ? a[1] - b[1] : b[1] - a[1]) || a[0].localeCompare(b[0]));
    order.forEach(([n], i) => (ranks.get(n)![k] = i + 1));
  });
  return { xs, names, ranks };
}

export function drawBump(ctx: Ctx): Scene {
  const { xs, names, ranks } = rankOf(ctx);
  const W = ctx.W;
  const n = Math.max(1, ...[...ranks.values()].flatMap((r) => r.filter((v): v is number => v !== null)));
  const rowH = ctx.narrow ? 23 : 27;
  const top = 18 + ctx.s.tick + 10;
  const H = top + (n - 1) * rowH + 22;
  const focus = ctx.chart.options?.focus ?? [];
  const loud = (s: string) => (focus.length ? focus.includes(s) : false);
  const paint = (s: string): Paint => (focus.length ? (loud(s) ? 'ed' : 'quiet') : 'ink');
  const face = (s: string) => (loud(s) ? 'sansMedium' : 'sans') as 'sans' | 'sansMedium';

  const at = (s: string, k: number) => ranks.get(s)![k] ?? null;
  const firstK = (s: string) => ranks.get(s)!.findIndex((v) => v !== null);
  const lastK = (s: string) => ranks.get(s)!.length - 1 - [...ranks.get(s)!].reverse().findIndex((v) => v !== null);
  const label = (s: string, k: number) => `${at(s, k)}  ${s}`;
  const both = !ctx.narrow;
  const leftW = both ? Math.max(...names.filter((s) => firstK(s) === 0).map((s) => textWidth(label(s, 0), face(s), ctx.s.label))) + 14 : Math.max(...Array.from({ length: n }, (_, k) => textWidth(String(k + 1), 'sans', ctx.s.label))) + 14;
  const rightW = Math.max(...names.filter((s) => lastK(s) === xs.length - 1).map((s) => textWidth(label(s, xs.length - 1), face(s), ctx.s.label))) + 14;
  const x0 = Math.ceil(leftW);
  const x1 = W - Math.ceil(rightW);
  const sx = linear([xs[0]!, xs[xs.length - 1]!], [x0, x1]);
  const sy = (rank: number) => top + (rank - 1) * rowH;

  const nodes: SceneNode[] = [];
  // Years over the plot, each with a hairline down through the ranks.
  // Year labels: the first and last always, the ones between where they clear their neighbours.
  const yw = (x: number) => textWidth(String(Math.round(x)), 'sans', ctx.s.tick);
  const shown = new Set<number>([0, xs.length - 1]);
  let lastRight = sx(xs[0]!) + yw(xs[0]!) / 2;
  const lastLeft = sx(xs[xs.length - 1]!) - yw(xs[xs.length - 1]!) / 2;
  for (let k = 1; k < xs.length - 1; k++) {
    const c = sx(xs[k]!);
    const w = yw(xs[k]!);
    if (c - w / 2 > lastRight + 6 && c + w / 2 < lastLeft - 6) {
      shown.add(k);
      lastRight = c + w / 2;
    }
  }
  xs.forEach((x, k) => {
    nodes.push(vline(Math.round(sx(x)) + 0.5, top - 8, sy(n) + 8, 'rule'));
    if (shown.has(k)) nodes.push(text(sx(x), top - 14, String(Math.round(x)), 'sans', ctx.s.tick, 'ink2', 'middle'));
  });
  const order = [...names].sort((a, b) => Number(loud(a)) - Number(loud(b)));
  for (const s of order) {
    const p = paint(s);
    const pts = ranks.get(s)!.map((r, k) => (r === null ? null : ([sx(xs[k]!), sy(r)] as [number, number])));
    nodes.push({ t: 'path', d: linePath(pts), stroke: p, sw: loud(s) ? 3 : 1.5 });
    pts.forEach((q, k) => {
      if (!q) return;
      nodes.push({ t: 'circle', cx: q[0], cy: q[1], r: loud(s) ? 4.5 : 3, fill: p, stroke: 'bg', sw: 1.5, tip: `${s}, ${Math.round(xs[k]!)}: ${ctx.str(ctx.rows.find((r) => ctx.str(r, 'series') === s && ctx.xval(r) === xs[k])!, 'y')} (rank ${at(s, k)})` });
    });
  }
  // Names at the ends: the rank and the name, quiet names in ink2.
  for (const s of names) {
    const fk = firstK(s);
    const lk = lastK(s);
    const tone: Paint = !focus.length || loud(s) ? 'ink' : 'ink2';
    if (lk >= 0) {
      const y = sy(at(s, lk)!) + ctx.s.label * 0.35;
      const x = lk === xs.length - 1 ? x1 + 10 : sx(xs[lk]!) + 8;
      nodes.push(text(x, y, label(s, lk), face(s), ctx.s.label, tone));
    }
    if (fk >= 0) {
      const y = sy(at(s, fk)!) + ctx.s.label * 0.35;
      const x = fk === 0 ? x0 - 10 : sx(xs[fk]!) - 8;
      if (both || fk > 0) nodes.push(text(x, y, both || fk === 0 ? `${s}  ${at(s, fk)}` : String(at(s, fk)), face(s), ctx.s.label, tone, 'end'));
      else nodes.push(text(x, y, String(at(s, fk)), 'sans', ctx.s.label, 'ink2', 'end'));
    }
  }
  return { width: W, height: H, nodes };
}
