// heatmap, "the cascade": one row per member, one column per year, each cell coloured by which side
// of a meaningful midpoint its value falls (cool below, warm above) on the story ramp (ramp.ts: equal
// bins either side of the midpoint, the end bins open, the grey middle unused, so every cell says
// plainly which side it is on). Rows run in the order the members crossed, in groups (crossed,
// projected to cross, not by the end of the projection), with the crossing year at the right. Every
// row is drawn at both widths (the phone's are a little thinner). The key is the ramp's, as the map's.
// A group whose rows sat in one end bin every year (a solid band) is named in the band, so the solid
// colour reads as what it is: never near the midpoint.

import type { Paint, Scene, SceneNode } from '../../charts/scene';
import type { ChartFace } from '../../charts/metrics';
import { labelOn } from '../../charts/scene';
import { TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf, type Box } from '../place';
import { ramp, rampKey } from '../ramp';

export interface HeatmapRow {
  key: string;
  label: string;
  /** A shorter name for the phone. */
  phoneLabel?: string;
  focus?: boolean;
  /** One value a year, from `years[0]` to `years[1]`, as stored. */
  values: number[];
  /** The first year the value fell below the midpoint (estimated or projected), or null. */
  crossed: number | null;
  /** Which group the row sits in (an index into `groups`). */
  group: number;
}

export interface HeatmapFigure {
  form: 'heatmap';
  years: [number, number];
  /** The meaningful midpoint the ramp turns on, and its name. */
  mid: number;
  midLabel: string;
  /** The width of each bin, the same both sides of the midpoint. */
  step: number;
  /** Bins either side of the midpoint, the outermost open-ended (at most 5: the ramp's arm). */
  perSide: number;
  /** What the key counts. */
  unit: string;
  /** The heading over the right-hand column of crossing years, in lines, wide and phone. */
  crossedHead: [string[], string[]];
  groups: { label: string; phone?: string }[];
  rows: HeatmapRow[];
}

/** A label at a fixed spot, kept clear of everything placed before it, or a throw. */
function fixed(P: Placer, x: number, y: number, text: string, face: ChartFace, size: number, fill: Paint, anchor: 'start' | 'middle' | 'end' = 'start'): SceneNode {
  const w = widthOf(text, face, size);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const box: Box = { x: left, y: y - size * 0.75, w, h: size * 0.95 };
  if (!P.free(box)) throw new Error(`No room on the plate for "${text}"`);
  P.block(box);
  return { t: 'text', x, y, text, face, size, anchor, fill };
}


export function drawHeatmap(f: HeatmapFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev], phone = dev === 'phone';
  const size = T.small;
  const rows = f.rows;
  const [y0, y1] = f.years;
  const nYears = y1 - y0 + 1;
  if (rows.some((r) => r.values.length !== nYears)) throw new Error('A heatmap row must hold one value a year');
  const R = ramp({ centre: f.mid, width: f.step, perSide: f.perSide });

  const name = (r: HeatmapRow) => (phone ? r.phoneLabel ?? r.label : r.label);
  const nameW = Math.max(...rows.map((r) => widthOf(name(r), r.focus ? 'sansMedium' : 'sans', size)));
  const x0 = Math.ceil(nameW + (phone ? 8 : 12));
  const yearsW = widthOf('0000', 'sans', size);
  const x1 = width - Math.ceil(yearsW + (phone ? 6 : 10));
  const cw = (x1 - x0) / nYears;
  const xOf = (year: number) => x0 + (year - y0) * cw;
  // The phone draws every row too, a little thinner: the pitch is the least its names clear each other at.
  const rowH = phone ? 10 : 12, pitch = rowH + 2;

  const key = rampKey(R, { unit: f.unit, centreLabel: f.midLabel, noData: false, dev, width });
  const keyTop = 6;
  const kx = phone ? Math.round((width - key.width) / 2) : x0;
  const ticksY = keyTop + key.height + (phone ? 24 : 26);
  let top = ticksY + 10;
  const layout: { r: HeatmapRow; y: number }[] = [];
  const heads: { label: string; y: number }[] = [];
  let group = -1;
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      // A group's heading sits close over its rows, with more room above it than below.
      top += layout.length ? 18 : 16;
      heads.push({ label: phone ? f.groups[group]!.phone ?? f.groups[group]!.label : f.groups[group]!.label, y: top });
      top += 6;
    }
    layout.push({ r, y: top });
    top += pitch;
  }
  const height = Math.ceil(top + 6);
  const P = new Placer({ x: 0, y: 0, w: width, h: height });
  const cells: SceneNode[] = [], marks: SceneNode[] = [], labels: SceneNode[] = [];
  P.block({ x: kx, y: keyTop, w: key.width, h: key.height });
  marks.push({ t: 'g', dx: kx, dy: keyTop, children: key.nodes });

  // Decade ticks along the top; the right-hand column's heading.
  const every = phone ? 20 : 10;
  for (let yr = y0; yr <= y1; yr += every) {
    const x = xOf(yr);
    marks.push({ t: 'line', x1: x, y1: ticksY - 2, x2: x, y2: ticksY + 4, stroke: 'ink2', sw: 0.75 });
    labels.push(fixed(P, x, ticksY - 6, String(yr), 'sans', T.tick, 'ink2', yr === y0 ? 'start' : 'middle'));
  }
  const head = f.crossedHead[phone ? 1 : 0];
  head.forEach((line, i) => labels.push(fixed(P, width, ticksY - 6 - (head.length - 1 - i) * T.tick * 1.25, line, 'sans', T.tick, 'ink2', 'end')));
  for (const h of heads) labels.push(fixed(P, 0, h.y, h.label, 'sans', T.tick, 'ink2'));

  // A group that sat in one end bin every year is named in its band, before its rows are blocked.
  for (let g = 0; g < f.groups.length; g++) {
    const inG = layout.filter((l) => l.r.group === g);
    if (!inG.length) continue;
    const bins = new Set(inG.flatMap((l) => l.r.values.map(R.binOf)));
    if (bins.size !== 1) continue;
    const bin = [...bins][0]!;
    if (bin !== 0 && bin !== R.paints.length - 1) continue;
    const edge = bin === 0 ? R.edges[0]! : R.edges[R.edges.length - 1]!;
    const words = `${bin === 0 ? 'Below' : 'At or above'} ${edge} every year${phone ? '' : `, ${y0} to ${y1}`}`;
    const mid = inG[Math.floor((inG.length - 1) / 2)]!;
    const cy = inG.length % 2 ? mid.y + rowH / 2 : mid.y + rowH + 1;
    labels.push(fixed(P, (x0 + x1) / 2, cy + size * 0.35, words, 'sans', size, labelOn(R.paints[bin]!), 'middle'));
  }

  // Each row: runs of one bin drawn as one rect (no seams between equal neighbours), then its name.
  for (const { r, y } of layout) {
    let from = 0;
    for (let i = 1; i <= nYears; i++) {
      if (i < nYears && R.binOf(r.values[i]!) === R.binOf(r.values[from]!)) continue;
      cells.push({ t: 'rect', x: xOf(y0 + from), y, w: (i - from) * cw, h: rowH, fill: R.paintOf(r.values[from]!) });
      from = i;
    }
    P.block({ x: x0, y, w: x1 - x0, h: rowH });
    const by = y + rowH / 2 + size * 0.35;
    labels.push(fixed(P, x0 - (phone ? 6 : 8), by, name(r), r.focus ? 'sansMedium' : 'sans', size, r.focus ? 'ink' : 'ink2', 'end'));
    if (r.focus) {
      const nx = x0 - (phone ? 6 : 8) - widthOf(name(r), 'sansMedium', size) - 7;
      marks.push({ t: 'rect', x: nx, y: y + rowH / 2 - 2.5, w: 5, h: 5, fill: 'ed' });
    }
    if (r.crossed !== null) labels.push(fixed(P, width, by, String(r.crossed), r.focus ? 'sansMedium' : 'sans', size, r.focus ? 'ink' : 'ink2', 'end'));
  }
  return { width, height, nodes: [...cells, ...marks, ...labels] };
}
