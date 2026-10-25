// Line: change over time. Lines are labelled at their ends (no legend); one loud line in the
// edition's ink among quiet grey ones, or up to six in the categorical order. Uncertainty is a
// wash around its line; a missing year breaks the line.

import type { Scene, SceneNode, Paint } from '../scene';
import { Ctx, drawCallouts, drawPeriods, drawXYears, drawYAxis, linePath, bandPath, shortUnit, spread, text, withGaps, yLabelWidth, annotX, type YAxis } from '../frame';
import { linear, logScale, logTicks, niceTicks, yearTicks, type Scale } from '../scales';
import { textWidth, wrapText } from '../text';

export interface SeriesPt {
  x: number;
  y: number | null;
  lo: number | null;
  hi: number | null;
  raw: string;
}

export function seriesOf(ctx: Ctx): Map<string, SeriesPt[]> {
  const out = new Map<string, SeriesPt[]>();
  const name = ctx.has('series') ? null : (ctx.column('y')?.label ?? '');
  for (const r of ctx.rows) {
    const x = ctx.xval(r);
    if (x === null) continue;
    const s = name ?? ctx.str(r, 'series');
    if (!out.has(s)) out.set(s, []);
    out.get(s)!.push({ x, y: ctx.num(r, 'y'), lo: ctx.num(r, 'lo'), hi: ctx.num(r, 'hi'), raw: ctx.str(r, 'x') });
  }
  for (const pts of out.values()) pts.sort((a, b) => a.x - b.x);
  return out;
}

/** The y axis for a set of values: nice ticks, zero when asked, log when asked. */
export function yAxisFor(ctx: Ctx, values: number[], range: [number, number], opts: { zero?: boolean; count?: number } = {}): YAxis {
  const log = Boolean(ctx.chart.scale?.y?.log);
  let min = Math.min(...values);
  let max = Math.max(...values);
  for (const a of ctx.chart.annotations ?? []) if (a.kind === 'rule' && a.axis === 'y' && typeof a.value === 'number') ((min = Math.min(min, a.value)), (max = Math.max(max, a.value)));
  if (log) {
    const t = logTicks(Math.max(min, 1e-12), max);
    return { scale: logScale(t.domain, range), ticks: t.ticks, step: 1 };
  }
  const zero = opts.zero ?? ctx.chart.scale?.y?.zero ?? false;
  if (zero) ((min = Math.min(0, min)), (max = Math.max(0, max)));
  const t = niceTicks(min, max, opts.count ?? (ctx.narrow ? 4 : 5));
  return { scale: linear(t.domain, range), ticks: t.ticks, step: t.step };
}

export function drawLine(ctx: Ctx): Scene {
  const series = seriesOf(ctx);
  const names = [...series.keys()];
  const W = ctx.W;
  const H = ctx.narrow ? 300 : 400;
  const top = ctx.chart.scale?.y?.log ? 30 : 18;
  const bottom = H - 30;
  const values: number[] = [];
  for (const pts of series.values()) for (const p of pts) for (const v of [p.y, p.lo, p.hi]) if (v !== null) values.push(v);
  const xs = [...series.values()].flatMap((p) => p.map((q) => q.x));
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);

  const ax = yAxisFor(ctx, values, [bottom, top]);
  const unit = shortUnit(ctx.chart.units);
  const left = Math.ceil(yLabelWidth(ctx, ax, unit)) + 10;

  // End labels: the loud series (or every series when they are coloured by name), with their last value.
  const labelled = names.filter((n) => ctx.paintFor(n, names) !== 'quiet');
  const single = names.length === 1;
  const maxLabelW = ctx.narrow ? 92 : 150;
  const labelLines = new Map<string, string[]>();
  for (const n of labelled) {
    const pts = series.get(n)!;
    const last = [...pts].reverse().find((p) => p.y !== null);
    const valueText = last && (single || ctx.chart.options?.focus?.includes(n)) ? ctx.value(last.y!) : '';
    const lines = single ? [valueText] : wrapText(n, 'sans', ctx.s.label, maxLabelW);
    if (!single && valueText) lines.push(valueText);
    labelLines.set(n, lines.filter(Boolean));
  }
  const labelW = Math.max(0, ...[...labelLines.values()].flat().map((s) => textWidth(s, 'sans', ctx.s.label)));
  const right = W - (labelW ? labelW + 16 : 8);
  const sx = linear([xmin, xmax], [left, right]);
  const sy: Scale = ax.scale;

  const nodes: SceneNode[] = [];
  const frame = {
    x0: left,
    x1: right,
    y0: top,
    y1: bottom,
    sx: (v: string | number | null) => {
      const x = annotX(v, ctx);
      return x === null ? null : sx(Math.max(xmin, Math.min(xmax, x)));
    },
    sy,
    point: (a: { x: string | number | null; series?: string }) => {
      const pts = series.get(a.series ?? names[0]!);
      const x = annotX(a.x, ctx);
      const p = pts?.find((q) => x !== null && Math.abs(q.x - x) < 1e-6 && q.y !== null);
      return p ? { x: sx(p.x), y: sy(p.y!) } : null;
    },
  };
  nodes.push(...drawPeriods(ctx, frame));
  nodes.push(...drawYAxis(ctx, ax, left, right, { unit }));
  if (ctx.chart.scale?.y?.log) nodes.push(text(left, top - 14, 'Log scale: each step is ten times the last', 'sans', ctx.s.small, 'mach'));
  const span = xmax - xmin;
  const ticks = ctx.column('x')?.type === 'number' ? niceTicks(xmin, xmax, ctx.narrow ? 4 : 7).ticks.filter((t) => t >= xmin && t <= xmax) : yearTicks(xmin, xmax, ctx.narrow ? 4 : 8);
  nodes.push(...drawXYears(ctx, sx, ticks.length ? ticks : [xmin, xmax], bottom, (v) => (span < 3 && ctx.column('x')?.type === 'date' ? String(v) : String(v))));

  // Quiet lines first, the loud ones on top.
  const order = [...names].sort((a, b) => Number(ctx.paintFor(a, names) !== 'quiet') - Number(ctx.paintFor(b, names) !== 'quiet'));
  const ends: Array<{ name: string; x: number; y: number; paint: Paint }> = [];
  for (const n of order) {
    const pts = series.get(n)!;
    const paint = ctx.paintFor(n, names);
    const quiet = paint === 'quiet';
    if (ctx.has('lo') && ctx.has('hi')) {
      const g = withGaps(pts.map((p) => ({ ...p, y: p.lo !== null && p.hi !== null ? p.y : null })));
      nodes.push({ t: 'path', d: bandPath(g.map((p) => (p ? [sx(p.x), sy(p.lo!)] : null)), g.map((p) => (p ? [sx(p.x), sy(p.hi!)] : null))), fill: paint, fo: quiet ? 0.12 : 0.16 });
    }
    const g = withGaps(pts);
    nodes.push({ t: 'path', d: linePath(g.map((p) => (p ? [sx(p.x), sy(p.y!)] : null))), stroke: paint, sw: quiet ? 1.25 : 2.25 });
    // A lone point between gaps would vanish as a line; mark it.
    g.forEach((p, i) => {
      if (p && !g[i - 1] && !g[i + 1]) nodes.push({ t: 'circle', cx: sx(p.x), cy: sy(p.y!), r: quiet ? 1.5 : 2.25, fill: paint });
    });
    const last = [...pts].reverse().find((p) => p.y !== null);
    if (last && !quiet) ends.push({ name: n, x: sx(last.x), y: sy(last.y!), paint });
  }

  // End dots and labels, spread so they never overlap, with a leader when a label had to move.
  const lh = ctx.s.label * 1.2;
  const blocks = ends.map((e) => ({ y: e.y, text: e.name, lines: labelLines.get(e.name) ?? [] }));
  const gapFor = Math.max(lh, ...blocks.map((b) => b.lines.length * lh)) + 2;
  const ys = spread(blocks.map((b) => ({ y: b.y, text: b.text })), gapFor, top, bottom);
  ends.forEach((e, i) => {
    nodes.push({ t: 'circle', cx: e.x, cy: e.y, r: 3.5, fill: e.paint, stroke: 'bg', sw: 2 });
    const lines = blocks[i]!.lines;
    if (!lines.length) return;
    const ly = ys[i]!;
    const lx = right + 10;
    if (Math.abs(ly - e.y) > 3) nodes.push({ t: 'path', d: `M${(e.x + 5).toFixed(2)},${e.y.toFixed(2)}L${(lx - 3).toFixed(2)},${ly.toFixed(2)}`, stroke: 'ink2', sw: 0.75 });
    const y0 = ly - ((lines.length - 1) * lh) / 2 + ctx.s.label * 0.35;
    lines.forEach((s, k) => {
      const isValue = k === lines.length - 1 && !single && lines.length > 1 && /\d/.test(s) && s === lines[lines.length - 1];
      nodes.push(text(lx, y0 + k * lh, s, e.paint === 'ed' && !isValue ? 'sansMedium' : 'sans', ctx.s.label, isValue || single ? 'ink2' : 'ink'));
    });
  });

  const marks: Array<[number, number]> = [];
  for (const pts of series.values()) for (const p of pts) if (p.y !== null) marks.push([sx(p.x), sy(p.y)]);
  nodes.push(...drawCallouts(ctx, { ...frame, marks }, ends.map((e, i) => ({ x: right + 8, y: ys[i]! - lh, w: labelW, h: (blocks[i]!.lines.length + 1) * lh }))));
  return { width: W, height: H, nodes };
}
