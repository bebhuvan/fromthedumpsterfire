// Price and drawdown: a price or index over time (the upper panel, on a log scale when asked, since
// equal steps then mean equal percentage moves), and under it the drawdown: how far the price stood
// below its highest value up to then, from 0 down (the lower panel). Both are worked out by code from
// the rows (drawdowns.ts). The deepest fall is shaded through both panels from its peak to its
// recovery and its low is marked; a gloss under the chart says how deep, from when to when, and when
// the price got back.

import type { Scene, SceneNode } from '../scene';
import { Ctx, drawYAxis, halo, linePath, shortUnit, text, vline, withGaps, yLabelWidth } from '../frame';
import { formatTime, linear, niceTicks, yearTicks, type Scale } from '../scales';
import { textWidth } from '../text';
import { yAxisFor } from './line';
import { drawdowns } from '../drawdowns';

/** The drawdown of each row and the deepest fall, from the chart's rows. */
export function drawdownOf(ctx: Ctx) {
  return drawdowns(
    ctx.rows
      .map((r) => ({ x: ctx.xval(r), raw: ctx.cell(r, 'x') as string | number, v: ctx.num(r, 'y') }))
      .filter((p): p is { x: number; raw: string | number; v: number } => p.x !== null && p.v !== null),
  );
}

export function drawDrawdown(ctx: Ctx): Scene {
  const W = ctx.W;
  const { pts, deepest } = drawdownOf(ctx);
  const type = (ctx.column('x')?.type ?? 'year') as 'year' | 'date';
  const when = (raw: string | number) => (type === 'date' ? formatTime(String(raw), 'date').replace(/^\d+ /, '') : String(raw));
  const unit = shortUnit(ctx.chart.units);
  const topH = ctx.narrow ? 190 : 250;
  const ddH = ctx.narrow ? 100 : 120;
  const gapH = 30;
  const top = 18;
  const priceBottom = top + topH;
  const ddTop = priceBottom + gapH;
  const ddBottom = ddTop + ddH;
  const ax = yAxisFor(ctx, pts.map((p) => p.v), [priceBottom, top]);
  const minDd = Math.min(0, ...pts.map((p) => p.dd)) * 100;
  const dt = niceTicks(minDd, 0, 3);
  const ddAx = { scale: linear([dt.domain[0], 0], [ddBottom, ddTop]), ticks: dt.ticks.filter((t) => t <= 0), step: dt.step };
  const left = Math.ceil(Math.max(yLabelWidth(ctx, ax, unit), yLabelWidth(ctx, ddAx, '%'))) + 10;
  const right = W - 10;
  const xs = pts.map((p) => p.x);
  const sx = linear([Math.min(...xs), Math.max(...xs)], [left, right]);
  const nodes: SceneNode[] = [];

  // The deepest fall, shaded from its peak to its recovery (or to the end) through both panels.
  if (deepest) {
    const a = sx(pts[deepest.peak]!.x);
    const b = sx(pts[deepest.recovery ?? pts.length - 1]!.x);
    nodes.push({ t: 'rect', x: a, y: top, w: b - a, h: topH, fill: 'plate' }, { t: 'rect', x: a, y: ddTop, w: b - a, h: ddH, fill: 'plate' });
  }
  nodes.push(...drawYAxis(ctx, ax, left, right, { unit }));
  if (ax.scale.log) nodes.push(text(left, top - 6, 'Log scale: each step is ten times the last', 'sans', ctx.s.small, 'mach'));
  nodes.push(...drawYAxis(ctx, ddAx as { scale: Scale; ticks: number[]; step: number }, left, right, { unit: '%' }));
  nodes.push(text(left, ddTop - 8, 'Below the last peak', 'sansMedium', ctx.s.small, 'ink2'));

  const g = withGaps(pts.map((p) => ({ ...p, y: p.v as number | null })));
  nodes.push({ t: 'path', d: linePath(g.map((p) => (p ? [sx(p.x), ax.scale(p.v)] : null))), stroke: 'ed', sw: 2 });
  const ddLine = pts.map((p) => [sx(p.x), ddAx.scale(p.dd * 100)] as [number, number]);
  if (ddLine.length > 1) {
    const z = ddAx.scale(0);
    nodes.push({ t: 'path', d: `M${ddLine[0]![0].toFixed(2)},${z.toFixed(2)}L${ddLine.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}L${ddLine[ddLine.length - 1]![0].toFixed(2)},${z.toFixed(2)}Z`, fill: 'ed', fo: 0.22 });
    nodes.push({ t: 'path', d: linePath(ddLine), stroke: 'ed', sw: 1.25 });
  }
  // The last value, at the end of the price line.
  const last = pts[pts.length - 1];
  if (last) {
    nodes.push({ t: 'circle', cx: sx(last.x), cy: ax.scale(last.v), r: 3.25, fill: 'ed', stroke: 'bg', sw: 1.5 });
  }

  // Time along the bottom.
  const ticks = type === 'date' ? yearTicks(Math.min(...xs), Math.max(...xs), ctx.narrow ? 4 : 7) : yearTicks(Math.min(...xs), Math.max(...xs), ctx.narrow ? 4 : 8);
  for (const t of ticks) {
    const x = sx(t);
    nodes.push(vline(Math.round(x) + 0.5, ddBottom, ddBottom + 4, 'ink2'));
    nodes.push(text(x, ddBottom + 6 + ctx.s.tick, String(t), 'sans', ctx.s.tick, 'ink2', 'middle'));
  }

  // The deepest fall's low, marked and labelled with its depth (the gloss under the chart says the rest).
  const height = ddBottom + 6 + ctx.s.tick + 6;
  if (deepest) {
    const tp = pts[deepest.trough]!;
    const tx = sx(tp.x);
    const ty = ddAx.scale(tp.dd * 100);
    nodes.push({ t: 'circle', cx: tx, cy: ty, r: 3, fill: 'ed', stroke: 'bg', sw: 1.5 });
    const s = `–${ctx.value(Math.abs(tp.dd * 100), 0)}%, ${when(tp.raw)}`;
    const w = textWidth(s, 'sansMedium', ctx.s.small + 0.5);
    const toRight = tx + 8 + w <= right;
    nodes.push(halo(toRight ? tx + 8 : tx - 8, Math.min(ddBottom - 3, ty + 4), s, 'sansMedium', ctx.s.small + 0.5, 'ink', toRight ? 'start' : 'end'));
  }
  return { width: W, height: Math.ceil(height), nodes };
}
