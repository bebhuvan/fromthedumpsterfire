// The story ramp: one binning and one key for every form that colours by a measure either side of a
// meaningful edge (the heatmap's cells, the map's countries). Bins of one width either side of the
// edge, the outermost open; the edge is itself a bin edge, so the ramp's grey middle (div5) is never
// used and every bin leans one way. The arms' steps nearest the middle are kept, so a bin just off
// the edge is pale either side. Every step the ramp uses is checked in both themes (`checkRamp`,
// tested in ramp.test.ts): off the ground, apart from its neighbours, apart from the "no data" grey,
// and the warm arm apart from ember.

import { contrast, paintHex, type Paint, type SceneNode } from '../charts/scene';
import type { ChartFace } from '../charts/metrics';
import type { Scheme } from '../tokens';
import { STROKE, TYPE, type Device } from './grammar';
import { Placer, widthOf, type Box } from './place';

export interface RampSpec {
  /** The meaningful edge (replacement, 2.1). */
  centre: number;
  /** Each bin's width, the same both sides. */
  width: number;
  /** Bins a side, the outermost open: one to five (the ramp's arm). */
  perSide: number;
}

export interface Ramp {
  spec: RampSpec;
  /** The inner edges, ascending (the end bins are open): centre ± k·width. */
  edges: number[];
  /** Each bin's paint, coolest first: 2·perSide of them. */
  paints: Paint[];
  /** The edges the key writes (every other one from the centre, so the centre always), as text. */
  labels: { edge: number; text: string }[];
  binOf: (v: number) => number;
  paintOf: (v: number) => Paint;
}

/** A place with no value: a quiet grey, kept apart from every step of the ramp. */
export const NO_DATA: Paint = 'quiet2';

const DIV: Paint[] = ['div0', 'div1', 'div2', 'div3', 'div4', 'div5', 'div6', 'div7', 'div8', 'div9', 'div10'];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const edgeText = (v: number) => String(Math.round(v * 1000) / 1000);

export function ramp(spec: RampSpec): Ramp {
  const { centre, width, perSide } = spec;
  if (!Number.isInteger(perSide) || perSide < 1 || perSide > 5) throw new Error('The diverging ramp holds one to five bins a side');
  if (!(width > 0)) throw new Error('A ramp bin needs a positive width');
  const edges = Array.from({ length: 2 * perSide - 1 }, (_, i) => r6(centre + (i - (perSide - 1)) * width));
  const paints = [...DIV.slice(5 - perSide, 5), ...DIV.slice(6, 6 + perSide)];
  // The centre value itself counts as above it (a country at exactly 2.1 is at replacement).
  const binOf = (v: number) => {
    let k = 0;
    while (k < edges.length && v >= edges[k]!) k++;
    return k;
  };
  const labels = edges.map((edge, k) => ({ edge, k })).filter(({ k }) => (k - (perSide - 1)) % 2 === 0).map(({ edge }) => ({ edge, text: edgeText(edge) }));
  return { spec, edges, paints, labels, binOf, paintOf: (v) => paints[binOf(v)]! };
}

export interface KeyOptions {
  /** The measure and its year ("Children per woman, 2023"). */
  unit: string;
  /** The centre's name with its value ("Replacement 2.1"). */
  centreLabel: string;
  /** Whether some place has no value (the map), so the key shows the grey. */
  noData: boolean;
  dev: Device;
  /** The room the key may take across. */
  width: number;
}

/**
 * The key, the same for every form: the swatches in a row, the open end ones pointed; a tick under
 * each join, every other edge written (the centre always, in medium); the centre's join drawn taller
 * and named over it; the unit over the left end (beside the centre's name when it fits); then the
 * "No data" grey after the ramp, or under it when the row is full. Drawn from (0, 0); every label
 * is placed with the placer, and a key that does not fit throws.
 */
export function rampKey(r: Ramp, o: KeyOptions): { width: number; height: number; nodes: SceneNode[] } {
  const size = TYPE[o.dev].tick, phone = o.dev === 'phone';
  const n = r.paints.length, sw = phone ? 24 : 38, sh = 10, tip = 5;
  const P = new Placer({ x: 0, y: 0, w: o.width, h: 400 });
  const nodes: SceneNode[] = [];
  const text = (x: number, y: number, t: string, face: ChartFace, fill: 'ink' | 'ink2', anchor: 'start' | 'middle' | 'end', must = true): boolean => {
    const w = widthOf(t, face, size);
    const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    const box: Box = { x: left, y: y - size * 0.8, w, h: size };
    if (!P.free(box)) {
      if (must) throw new Error(`No room in the key for "${t}"`);
      return false;
    }
    P.block(box);
    nodes.push({ t: 'text', x, y, text: t, face, size, anchor, fill });
    return true;
  };

  const row1 = size * 0.85, row2 = row1 + size * 1.35;
  const cx = (n / 2) * sw;
  // The centre's name over its join; the unit on the same line when it clears it, else a line above.
  text(cx, row2, o.centreLabel, 'sansMedium', 'ink', 'middle');
  const unitSame = text(0, row2, o.unit, 'sans', 'ink2', 'start', false);
  if (!unitSame) text(0, row1, o.unit, 'sans', 'ink2', 'start');
  const y0 = row2 + 7;

  for (let k = 0; k < n; k++) {
    const x = k * sw, fill = r.paints[k]!, gap = k < n - 1 ? 1 : 0;
    if (k === 0) nodes.push({ t: 'path', d: `M${x + tip} ${y0}H${x + sw - gap}V${y0 + sh}H${x + tip}L${x} ${y0 + sh / 2}Z`, fill });
    else if (k === n - 1) nodes.push({ t: 'path', d: `M${x} ${y0}H${x + sw - tip}L${x + sw} ${y0 + sh / 2}L${x + sw - tip} ${y0 + sh}H${x}Z`, fill });
    else nodes.push({ t: 'rect', x, y: y0, w: sw - gap, h: sh, fill });
  }
  const right = n * sw;
  if (right > o.width) throw new Error('No room for the ramp key');
  P.block({ x: 0, y: y0, w: right, h: sh });
  // Edge k sits at the join between swatch k and k + 1.
  r.edges.forEach((_, k) => {
    const ex = (k + 1) * sw - 0.5;
    nodes.push({ t: 'line', x1: ex, y1: y0 + sh, x2: ex, y2: y0 + sh + 4, stroke: 'ink2', sw: STROKE.hair });
  });
  for (const l of r.labels) {
    const k = r.edges.indexOf(l.edge), strong = l.edge === r.spec.centre;
    text((k + 1) * sw - 0.5, y0 + sh + 5 + size * 0.85, l.text, strong ? 'sansMedium' : 'sans', strong ? 'ink' : 'ink2', 'middle');
  }
  nodes.push({ t: 'line', x1: cx - 0.5, y1: y0 - 5, x2: cx - 0.5, y2: y0 + sh + 4, stroke: 'ink', sw: 1 });
  let bottom = y0 + sh + 5 + size;

  if (o.noData) {
    const nd = 'No data', ndw = sw * 0.6;
    let nx = right + (phone ? 14 : 20), ny = y0;
    if (nx + ndw + 6 + widthOf(nd, 'sans', size) > o.width) { nx = 0; ny = bottom + 10; }
    nodes.push({ t: 'rect', x: nx, y: ny, w: ndw, h: sh, fill: NO_DATA });
    P.block({ x: nx, y: ny, w: ndw, h: sh });
    text(nx + ndw + 6, ny + sh / 2 + size * 0.35, nd, 'sans', 'ink2', 'start');
    bottom = Math.max(bottom, ny + sh);
  }
  const width = Math.max(...P.taken.map((b) => b.x + b.w));
  return { width, height: Math.ceil(bottom + 4), nodes };
}

// OKLab, for telling colours apart by eye (luminance contrast alone calls a pale blue and a grey of
// one lightness the same).
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** The OKLab distance between two colours (0 the same; about 0.1 plainly different side by side). */
export function deltaE(a: string, b: string): number {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export interface RampCheck {
  scheme: Scheme;
  paints: Paint[];
  /** Each step against the ground (luminance contrast). */
  ground: number[];
  /** Each step against the next (OKLab distance). */
  neighbours: number[];
  /** Each step against the "no data" grey (OKLab distance). */
  noData: number[];
  /** Each warm step against ember (OKLab distance). */
  ember: number[];
}

export function checkRamp(r: Ramp, scheme: Scheme): RampCheck {
  const hex = (p: Paint) => paintHex(p, scheme, 'teal');
  const bg = hex('bg'), nd = hex(NO_DATA), em = hex('ember');
  const cols = r.paints.map(hex);
  return {
    scheme,
    paints: r.paints,
    ground: cols.map((c) => contrast(c, bg)),
    neighbours: cols.slice(1).map((c, i) => deltaE(c, cols[i]!)),
    noData: cols.map((c) => deltaE(c, nd)),
    ember: cols.slice(r.spec.perSide).map((c) => deltaE(c, em)),
  };
}
