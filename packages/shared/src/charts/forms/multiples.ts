// Small multiples: the same line for many places or groups, each in its own small panel on one
// shared scale. Every panel carries all the other lines faintly behind its own, so a reader compares
// each against the rest without a legend. The focus facet is set in the edition's ink. The y ticks
// are written on the first panel of each row only: the scale is the same everywhere.

import type { Scene, SceneNode } from '../scene';
import { Ctx, bandPath, hline, linePath, shortUnit, text, vline, withGaps } from '../frame';
import { linear, yearTicks } from '../scales';
import { textWidth, wrapText } from '../text';
import { tightAxis } from './area';

interface Pt {
  x: number;
  y: number | null;
  lo: number | null;
  hi: number | null;
}

export function facetsOf(ctx: Ctx): Map<string, Pt[]> {
  const out = new Map<string, Pt[]>();
  for (const name of ctx.groups('facet')) out.set(name, []);
  for (const r of ctx.rows) {
    const x = ctx.xval(r);
    if (x === null) continue;
    out.get(ctx.str(r, 'facet'))?.push({ x, y: ctx.num(r, 'y'), lo: ctx.num(r, 'lo'), hi: ctx.num(r, 'hi') });
  }
  for (const p of out.values()) p.sort((a, b) => a.x - b.x);
  return out;
}

export function drawMultiples(ctx: Ctx): Scene {
  const facets = facetsOf(ctx);
  const names = [...facets.keys()];
  // Focus facets first is tempting, but order is the editor's (data order); keep it.
  const n = names.length;
  const cols = ctx.narrow ? 2 : n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const W = ctx.W;
  const gapX = ctx.narrow ? 14 : 22;
  const titleH = ctx.s.label * 1.25 + 8;
  const panelH = ctx.narrow ? 112 : 128;
  const axisH = 20;
  const rowGap = 18;

  const values: number[] = [];
  const xs: number[] = [];
  for (const pts of facets.values())
    for (const p of pts) {
      xs.push(p.x);
      for (const v of [p.y, p.lo, p.hi]) if (v !== null) values.push(v);
    }
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const unit = shortUnit(ctx.chart.units);

  // A provisional axis to measure tick labels, then the real one sized to the panel height.
  const probe = tightAxis(ctx, values, [panelH, 0], { counts: [3, 2, 4] });
  const labW = Math.max(...probe.ticks.map((t, i) => textWidth(`${ctx.fmt(t, probe.step)}${i === probe.ticks.length - 1 && unit ? ` ${unit}` : ''}`, 'sans', ctx.s.tick)));
  const left = Math.ceil(labW) + 8;
  const panelW = (W - left - gapX * (cols - 1) - 4) / cols;
  const H = rows * (titleH + panelH + axisH) + (rows - 1) * rowGap + 4;

  const nodes: SceneNode[] = [];
  const multi = n > 1;
  const focus = ctx.chart.options?.focus ?? [];
  const xt = yearTicks(xmin, xmax, ctx.narrow ? 2 : 3);
  // Keep the end years when they are clear of the ticks, so a reader sees the span.
  const ticksFor = (sx: (v: number) => number) => {
    const t = xt.filter((v) => v >= xmin && v <= xmax);
    const minGap = textWidth('0000', 'sans', ctx.s.tick) + 8;
    const out = [...t];
    if (!out.length || sx(out[0]!) - sx(xmin) > minGap) out.unshift(xmin);
    if (sx(xmax) - sx(out[out.length - 1]!) > minGap) out.push(xmax);
    return out;
  };

  names.forEach((name, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x0 = left + c * (panelW + gapX);
    const x1 = x0 + panelW;
    const top = r * (titleH + panelH + axisH + rowGap) + titleH;
    const bottom = top + panelH;
    const ax = tightAxis(ctx, values, [bottom, top + 6], { counts: [3, 2, 4] });
    const sx = linear([xmin, xmax], [x0, x1]);
    const sy = ax.scale;
    const loud = focus.length ? focus.includes(name) : false;

    // Title: the facet's name, in sans, medium for the focus.
    const title = wrapText(name, loud ? 'sansMedium' : 'sans', ctx.s.label, panelW)[0] ?? name;
    nodes.push(text(x0, top - 10, title, loud ? 'sansMedium' : 'sans', ctx.s.label, 'ink'));

    // Gridlines; tick labels on the first panel of the row only.
    ax.ticks.forEach((t, k) => {
      const y = Math.round(sy(t)) + 0.5;
      nodes.push(hline(x0, x1, y, t === 0 ? 'ink' : 'rule'));
      if (c === 0) {
        const lab = `${ctx.fmt(t, ax.step)}${k === ax.ticks.length - 1 && unit ? ` ${unit}` : ''}`;
        nodes.push(text(x0 - 6, sy(t) + ctx.s.tick * 0.36, lab, 'sans', ctx.s.tick, 'ink2', 'end'));
      }
    });
    // x ticks under every panel (short), labels at the ends and round years.
    for (const t of ticksFor(sx)) {
      const x = sx(t);
      nodes.push(vline(Math.round(x) + 0.5, bottom, bottom + 3, 'ink2'));
      const anchor = Math.abs(x - x0) < 2 ? 'start' : Math.abs(x - x1) < 2 ? 'end' : 'middle';
      nodes.push(text(x, bottom + 5 + ctx.s.tick, String(Math.round(t)), 'sans', ctx.s.small, 'ink2', anchor));
    }

    // Every other facet faintly, for comparison.
    if (multi) {
      for (const other of names) {
        if (other === name) continue;
        const g = withGaps(facets.get(other)!);
        nodes.push({ t: 'path', d: linePath(g.map((p) => (p ? [sx(p.x), sy(p.y!)] : null))), stroke: 'quiet', sw: 0.75 });
      }
    }
    const pts = facets.get(name)!;
    const paint = loud || !focus.length ? 'ed' : 'ink';
    if (ctx.has('lo') && ctx.has('hi')) {
      const g = withGaps(pts.map((p) => ({ ...p, y: p.lo !== null && p.hi !== null ? p.y : null })));
      nodes.push({ t: 'path', d: bandPath(g.map((p) => (p ? [sx(p.x), sy(p.lo!)] : null)), g.map((p) => (p ? [sx(p.x), sy(p.hi!)] : null))), fill: paint, fo: 0.16 });
    }
    const g = withGaps(pts);
    nodes.push({ t: 'path', d: linePath(g.map((p) => (p ? [sx(p.x), sy(p.y!)] : null))), stroke: paint, sw: loud ? 2.25 : 1.75 });
    g.forEach((p, k) => {
      if (p && !g[k - 1] && !g[k + 1]) nodes.push({ t: 'circle', cx: sx(p.x), cy: sy(p.y!), r: 2, fill: paint });
    });
    // The last value, at the end of the line.
    const last = [...pts].reverse().find((p) => p.y !== null);
    if (last) {
      nodes.push({ t: 'circle', cx: sx(last.x), cy: sy(last.y!), r: 2.75, fill: paint });
      const v = ctx.value(last.y!);
      const vy = sy(last.y!) - 8;
      nodes.push(text(sx(last.x), Math.max(top + ctx.s.small, vy), v, 'sans', ctx.s.small, 'ink2', 'end'));
    }
  });
  return { width: W, height: H, nodes };
}
