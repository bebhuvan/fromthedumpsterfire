// Ridgeline: how a distribution shifts across groups. Each ridge is a kernel density estimate drawn
// from that group's raw values in the rows (Gaussian kernel, bandwidth by Silverman's rule of thumb:
// 0.9 × min(standard deviation, interquartile range / 1.34) × n^(−1/5)), on one shared value axis,
// all ridges on one height scale so their areas compare. Ridges overlap and are separated by a line
// of ground; each carries a tick at its median. The loud group is in the edition's ink. A group with
// fewer than 30 values also shows every value as a tick under its ridge, because a curve drawn from
// so few is mostly the kernel.

import type { Scene, SceneNode, Paint } from '../scene';
import { Ctx, hline, shortUnit, text, vline } from '../frame';
import { linear, niceTicks } from '../scales';
import { textWidth } from '../text';

const SMALL = 30;

export function silverman(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 1;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const s = [...vals].sort((a, b) => a - b);
  const iqr = quantile(s, 0.75) - quantile(s, 0.25);
  const spread = Math.min(sd, iqr / 1.34) || sd || 1;
  return 0.9 * spread * n ** -0.2;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

export function kde(vals: number[], h: number, grid: number[]): number[] {
  const k = 1 / (vals.length * h * Math.sqrt(2 * Math.PI));
  return grid.map((x) => {
    let s = 0;
    for (const v of vals) {
      const u = (x - v) / h;
      if (u > -6 && u < 6) s += Math.exp(-0.5 * u * u);
    }
    return s * k;
  });
}

export function drawRidgeline(ctx: Ctx): Scene {
  let groups = ctx.groups('series');
  if (ctx.column('series')?.type === 'year' || groups.every((g) => /^-?\d+$/.test(g))) groups = groups.sort((a, b) => Number(a) - Number(b));
  const byGroup = new Map<string, number[]>(groups.map((g) => [g, []]));
  for (const r of ctx.rows) {
    const v = ctx.num(r, 'y');
    if (v !== null) byGroup.get(ctx.str(r, 'series'))?.push(v);
  }
  const all = [...byGroup.values()].flat();
  const W = ctx.W;
  const size = ctx.s.tick;
  const unit = shortUnit(ctx.chart.units);
  const bws = new Map(groups.map((g) => [g, silverman(byGroup.get(g)!)]));
  const maxBw = Math.max(...bws.values());
  // The axis runs three bandwidths past the extreme values (where every kernel has all but vanished),
  // with round ticks inside it.
  const lo0 = Math.min(...all) - maxBw * 3;
  const hi0 = Math.max(...all) + maxBw * 3;
  const nt = niceTicks(lo0, hi0, ctx.narrow ? 4 : 6);
  const t = { domain: [lo0, hi0] as [number, number], ticks: nt.ticks.filter((v) => v >= lo0 && v <= hi0), step: nt.step };
  const labelW = Math.max(...groups.map((g) => textWidth(g, ctx.isFocus(g, groups) ? 'sansMedium' : 'sans', ctx.s.label)));
  const left = Math.ceil(labelW) + 14;
  const right = W - 8;
  const sx = linear(t.domain, [left, right]);
  const N = 160;
  const grid = Array.from({ length: N + 1 }, (_, i) => t.domain[0] + ((t.domain[1] - t.domain[0]) * i) / N);
  const dens = new Map(groups.map((g) => [g, byGroup.get(g)!.length ? kde(byGroup.get(g)!, bws.get(g)!, grid) : grid.map(() => 0)]));
  const peak = Math.max(...[...dens.values()].flat(), 1e-9);

  const step = ctx.narrow ? 30 : 36;
  const overlap = step * 2.1;
  const top = overlap - step + 6;
  const baseOf = (i: number) => top + step * (i + 1);
  const bottom = baseOf(groups.length - 1);
  const nodes: SceneNode[] = [];
  const sequential = ctx.colour === 'sequential';
  const paint = (g: string, i: number): Paint => (sequential ? (`seq${Math.round(1 + (6 * i) / Math.max(1, groups.length - 1))}` as Paint) : ctx.isFocus(g, groups) ? 'ed' : 'quiet');

  // Gridlines at the value ticks, behind everything.
  for (const v of t.ticks) nodes.push(vline(Math.round(sx(v)) + 0.5, 4, bottom, 'rule'));

  groups.forEach((g, i) => {
    const base = baseOf(i);
    const d = dens.get(g)!;
    const pts = grid.map((x, k) => [sx(x), base - (d[k]! / peak) * overlap] as const);
    const path = `M${pts[0]![0].toFixed(2)},${base.toFixed(2)}L${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}L${pts[pts.length - 1]![0].toFixed(2)},${base.toFixed(2)}Z`;
    const p = paint(g, i);
    const vals = byGroup.get(g)!;
    nodes.push({ t: 'path', d: path, fill: p, stroke: 'bg', sw: 1.5, tip: `${g}: ${vals.length} values` });
    nodes.push(hline(left, right, base, 'ink2', 0.75));
    // The median, as a short ink tick standing on the baseline.
    const sorted = [...vals].sort((a, b) => a - b);
    if (sorted.length) {
      const med = quantile(sorted, 0.5);
      const k = Math.round(((med - t.domain[0]) / (t.domain[1] - t.domain[0])) * N);
      const hgt = (d[Math.max(0, Math.min(N, k))]! / peak) * overlap;
      nodes.push({ t: 'line', x1: sx(med), x2: sx(med), y1: base, y2: base - hgt, stroke: p === 'ed' || p.startsWith('seq') ? 'bg' : 'ink2', sw: 1.25, tip: `${g}: median ${ctx.value(med, 1)}` });
    }
    if (vals.length && vals.length < SMALL) for (const v of vals) nodes.push(vline(sx(v), base + 2, base + 6, 'ink'));
    const focus = ctx.isFocus(g, groups);
    nodes.push(text(left - 10, base - 3, g, focus ? 'sansMedium' : 'sans', ctx.s.label, focus ? 'ink' : 'ink2', 'end'));
  });

  // The value axis.
  const ay = bottom + 4;
  t.ticks.forEach((v, i) => {
    nodes.push(vline(Math.round(sx(v)) + 0.5, ay, ay + 4, 'ink2'));
    const last = i === t.ticks.length - 1;
    const lab = `${ctx.fmt(v, t.step)}${last && unit ? ` ${unit}` : ''}`;
    const anchor = last && sx(v) + textWidth(lab, 'sans', size) / 2 > W ? 'end' : 'middle';
    nodes.push(text(anchor === 'end' ? Math.min(W, sx(v) + textWidth(ctx.fmt(v, t.step), 'sans', size) / 2) : sx(v), ay + 6 + size, lab, 'sans', size, 'ink2', anchor));
  });
  let y = ay + 6 + size + 18;
  // How the ridges are drawn, in the machine's voice.
  const bw = [...bws.values()];
  const lo = Math.min(...bw);
  const hi = Math.max(...bw);
  const bwText = Math.abs(hi - lo) < 0.05 ? ctx.value(lo, 1) : `${ctx.value(lo, 1)} to ${ctx.value(hi, 1)}`;
  const note = `Smoothed with a Gaussian kernel, bandwidth ${bwText}${unit ? ` ${unit}` : ''} (Silverman’s rule). The tick in each ridge is its median.`;
  const small = groups.filter((g) => byGroup.get(g)!.length < SMALL);
  const lines = [note, ...(small.length ? [`Fewer than ${SMALL} values in ${small.join(', ')}: each value is marked under the ridge.`] : [])];
  for (const l of lines) {
    for (const part of wrap(l, ctx.s.small, W - 4)) {
      nodes.push(text(0, y, part, 'sans', ctx.s.small, 'mach'));
      y += ctx.s.small + 4;
    }
  }
  return { width: W, height: Math.ceil(y), nodes };
}

function wrap(s: string, size: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, 'sans', size) > max) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
