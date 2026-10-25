// Dot plot (Cleveland): a value for each category on a scale that need not start at zero, each row
// on a hairline guide, with its uncertainty as a whisker when the data carries it. Several series
// share a row (a key above names them); small samples are drawn hollow; a missing value is said.

import type { Cell } from '../types';
import type { Paint, Scene, SceneNode } from '../scene';
import { Ctx, hline, shortUnit, text } from '../frame';
import { linear, niceTicks } from '../scales';
import { textWidth } from '../text';
import { drawKey, drawRowLabel, drawValueAxisTop, labelColumn, orderRows, whisker } from './category';

const SMALL_N = 30;

interface Pt {
  v: number | null;
  lo: number | null;
  hi: number | null;
  n: number | null;
}

export function drawDot(ctx: Ctx): Scene {
  const W = ctx.W;
  const series = ctx.has('series') ? ctx.groups('series') : [ctx.column('y')?.label ?? ''];
  const focusList = ctx.chart.options?.focus ?? [];
  const bySeries = series.length > 1 && focusList.some((f) => series.includes(f));
  // One row per label; each holds its series' points.
  const byLabel = new Map<string, Map<string, Pt>>();
  const firstRow = new Map<string, Cell[]>();
  for (const r of ctx.rows) {
    const label = ctx.str(r, 'label');
    const s = ctx.has('series') ? ctx.str(r, 'series') : series[0]!;
    if (!byLabel.has(label)) byLabel.set(label, new Map());
    if (!firstRow.has(label)) firstRow.set(label, r);
    byLabel.get(label)!.set(s, { v: ctx.num(r, 'y'), lo: ctx.num(r, 'lo'), hi: ctx.num(r, 'hi'), n: ctx.num(r, 'n') });
  }
  const sortSeries = bySeries ? focusList.find((f) => series.includes(f))! : series[series.length - 1]!;
  const labels = orderRows(ctx, [...firstRow.values()], (r) => byLabel.get(ctx.str(r, 'label'))!.get(sortSeries)?.v ?? null).map((r) => ctx.str(r, 'label'));
  const labelFocus = (l: string) => !bySeries && focusList.includes(l);
  const col = labelColumn(ctx, labels, labelFocus);

  const vals: number[] = [];
  for (const m of byLabel.values()) for (const p of m.values()) for (const v of [p.v, p.lo, p.hi]) if (v !== null) vals.push(v);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (ctx.chart.scale?.y?.zero) ((min = Math.min(0, min)), (max = Math.max(0, max)));
  for (const a of ctx.chart.annotations ?? []) if (a.kind === 'rule' && typeof a.value === 'number') ((min = Math.min(min, a.value)), (max = Math.max(max, a.value)));
  const t = niceTicks(min, max, ctx.narrow ? 4 : 6);

  const single = series.length === 1;
  const showValues = (l: string) => (single ? labels.length <= 14 || labelFocus(l) : labels.length <= 6 || labelFocus(l));
  const valueW = Math.max(0, ...labels.flatMap((l) => [...byLabel.get(l)!.values()].map((p) => (p.v === null || !showValues(l) ? 0 : textWidth(ctx.value(p.v), 'sans', ctx.s.small)))));
  const x0 = col.width + 18;
  const x1 = W - Math.max(14, valueW + 12);
  const sx = linear(t.domain, [x0, x1]);
  const paintOf = (s: string, label: string): Paint => {
    if (bySeries || ctx.colour === 'categorical') return ctx.paintFor(s, series);
    if (!focusList.length) return 'ed';
    return focusList.includes(label) ? 'ed' : 'quiet';
  };

  const nodes: SceneNode[] = [];
  let y = 4;
  if (!single) {
    const key = drawKey(
      ctx,
      series.map((s) => ({ name: s, mark: (x: number, yy: number) => [{ t: 'circle', cx: x, cy: yy, r: 4.5, fill: paintOf(s, ''), stroke: 'bg', sw: 1.5 } as SceneNode] })),
      x0,
      y + ctx.s.label / 2,
      W,
    );
    nodes.push(...key.nodes);
    y += key.height + 4;
  }
  const top = y + ctx.s.tick + 12;
  const lh = ctx.s.label * 1.18;
  const pitch = Math.max(ctx.narrow ? 28 : 30, col.maxLines * lh + 10, single ? 0 : series.length * 7 + 18);
  const H = top + labels.length * pitch + 6;
  nodes.push(...drawValueAxisTop(ctx, sx, t.ticks, t.step, top, H - 4, shortUnit(ctx.chart.units)));

  const hasRange = ctx.has('lo') && ctx.has('hi');
  labels.forEach((label, i) => {
    const yc = top + i * pitch + pitch / 2;
    nodes.push(...drawRowLabel(ctx, col.lines.get(label)!, col.width + 8, yc, labelFocus(label)));
    nodes.push(hline(x0, x1, yc, 'rule', 1));
    const pts = byLabel.get(label)!;
    const missing = series.filter((s) => (pts.get(s)?.v ?? null) === null);
    // Quiet series first so the loud one sits on top; dodge a little when whiskers would overlap.
    const order = [...series].sort((a, b) => Number(paintOf(a, label) !== 'quiet') - Number(paintOf(b, label) !== 'quiet'));
    order.forEach((s) => {
      const p = pts.get(s);
      if (!p || p.v === null) return;
      const k = series.indexOf(s);
      const dy = hasRange && !single ? (k - (series.length - 1) / 2) * 7 : 0;
      const paint = paintOf(s, label);
      const cy = yc + dy;
      if (p.lo !== null && p.hi !== null) nodes.push(...whisker(sx(p.lo), sx(p.hi), cy, paint === 'quiet' ? 'quiet' : paint, 3.5));
      const hollow = p.n !== null && p.n < SMALL_N;
      const tip = `${label}${single ? '' : `, ${s}`}: ${ctx.value(p.v)} ${ctx.chart.units}${p.lo !== null && p.hi !== null ? ` (${ctx.value(p.lo)} to ${ctx.value(p.hi)})` : ''}${p.n !== null ? `, n = ${p.n}` : ''}`;
      nodes.push(hollow ? { t: 'circle', cx: sx(p.v), cy, r: 4.5, fill: 'bg', stroke: paint, sw: 1.75, tip } : { t: 'circle', cx: sx(p.v), cy, r: 5, fill: paint, stroke: 'bg', sw: 2, tip });
    });
    if (showValues(label)) {
      // The value beside the rightmost mark of the row.
      const ends = series.map((s) => pts.get(s)).filter((p): p is Pt => Boolean(p && p.v !== null));
      if (ends.length === 1) {
        const p = ends[0]!;
        const right = Math.max(sx(p.v!), p.hi !== null ? sx(p.hi) : 0);
        nodes.push(text(right + 9, yc + ctx.s.small * 0.35, ctx.value(p.v!), labelFocus(label) ? 'sansMedium' : 'sans', ctx.s.small, labelFocus(label) ? 'ink' : 'ink2'));
      } else if (ends.length > 1) {
        const lo = ends.reduce((a, b) => (b.v! < a.v! ? b : a));
        const hi = ends.reduce((a, b) => (b.v! > a.v! ? b : a));
        const l = Math.min(sx(lo.v!), lo.lo !== null ? sx(lo.lo) : Infinity);
        const r = Math.max(sx(hi.v!), hi.hi !== null ? sx(hi.hi) : 0);
        nodes.push(text(l - 9, yc + ctx.s.small * 0.35, ctx.value(lo.v!), 'sans', ctx.s.small, 'ink2', 'end'));
        nodes.push(text(r + 9, yc + ctx.s.small * 0.35, ctx.value(hi.v!), 'sansMedium', ctx.s.small, 'ink'));
      }
    }
    if (missing.length) {
      const what = missing.length === series.length || single ? 'no data' : `no data for ${missing.join(', ')}`;
      nodes.push(text(missing.length === series.length ? x0 + 4 : x1, yc - 6, what, 'sans', ctx.s.small, 'ink2', missing.length === series.length ? 'start' : 'end'));
    }
  });

  // Reference rules on the value axis.
  let extra = 0;
  for (const a of ctx.chart.annotations ?? []) {
    if (a.kind !== 'rule' || typeof a.value !== 'number') continue;
    const x = sx(a.value);
    nodes.push({ t: 'line', x1: x, x2: x, y1: top, y2: H - 4, stroke: 'ink2', sw: 1 });
    const face = a.by === 'editor' ? 'serifItalic' : 'sans';
    const size = a.by === 'editor' ? ctx.s.note - 1 : ctx.s.small;
    const right = x + 6 + textWidth(a.text, face, size) < W;
    nodes.push(text(right ? x + 5 : x - 5, H + size + 2, a.text, face, size, a.by === 'editor' ? 'ink' : 'mach', right ? 'start' : 'end'));
    extra = size + 8;
  }
  return { width: W, height: H + extra, nodes };
}
