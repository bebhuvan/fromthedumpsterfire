// map: a measure for every country of the world, binned on the diverging ramp around a threshold the
// story turns on (cool below, warm above), on the chart kit's outlines: Natural Earth in India's point
// of view, Equal Earth, so areas are true (charts/geo/world.ts; imported, never copied). A country
// with no value is a quiet grey; the story's member is outlined in the edition's ink and named. The
// key is the ramp itself, its swatches and their edges, the threshold marked at the middle.

import type { Paint, Scene, SceneNode } from '../../charts/scene';
import { WORLD, WORLD_BOX } from '../../charts/geo/world';
import { worldIndex } from '../../charts/geo/countries';
import { STROKE, TYPE, WIDTH, type Device } from '../grammar';
import { Placer, widthOf } from '../place';

export interface MapValue { code: string; name: string; v: number }

export interface MapFigure {
  form: 'map';
  values: MapValue[];
  /**
   * Bins of equal width either side of the centre, `perSide` on each, the outermost open: below the
   * lowest edge and at or above the highest. The centre is an edge, so the ramp's grey middle is
   * not used and every bin leans one way.
   */
  bins: { centre: number; width: number; perSide: number };
  /** What the key says the centre is ("Replacement"). */
  centreLabel: string;
  /** The key's title: the measure and its year. */
  unit: string;
  /** Codes (ISO 3166 alpha-3) of the story's members, outlined and named. */
  focus: string[];
}

const DIV: Paint[] = ['div0', 'div1', 'div2', 'div3', 'div4', 'div5', 'div6', 'div7', 'div8', 'div9', 'div10'];
const MISSING: Paint = 'quiet2';
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The bins' edges (inner ones only: the end bins are open) and each bin's paint, coolest first. */
export function mapBins(f: MapFigure): { edges: number[]; paints: Paint[]; paintOf: (v: number) => Paint } {
  const { centre, width, perSide } = f.bins;
  if (perSide < 1 || perSide > 5) throw new Error('The diverging ramp holds one to five bins a side');
  const edges = Array.from({ length: 2 * perSide - 1 }, (_, i) => r3(centre + (i - (perSide - 1)) * width));
  // The arms' steps nearest the middle are kept, so a bin just off the centre is pale either side.
  const paints = [...DIV.slice(5 - perSide, 5), ...DIV.slice(6, 6 + perSide)];
  const paintOf = (v: number) => {
    let k = 0;
    while (k < edges.length && v >= edges[k]!) k++;
    return paints[k]!;
  };
  return { edges, paints, paintOf };
}

const fmtEdge = (v: number) => String(r3(v));

export function drawMap(f: MapFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev];
  const s = width / WORLD_BOX.width;
  const mapH = (WORLD_BOX.bottom - WORLD_BOX.top) * s;
  const top = 4;
  const at = (x: number, y: number): [number, number] => [x * s, top + (y - WORLD_BOX.top) * s];
  const { paintOf, ...bins } = mapBins(f);
  const byIndex = new Map<number, MapValue>();
  for (const v of f.values) {
    const i = worldIndex(v.code) ?? worldIndex(v.name);
    if (i === undefined) throw new Error(`${v.name} (${v.code}) is not on the map`);
    if (byIndex.has(i)) throw new Error(`${v.name} is on the map twice`);
    byIndex.set(i, v);
  }
  const shapes: SceneNode[] = [], dots: SceneNode[] = [];
  WORLD.forEach(([, name, , d, lx, ly], i) => {
    const got = byIndex.get(i);
    const fill = got ? paintOf(got.v) : MISSING;
    const tip = got ? `${got.name}: ${got.v}` : `${name}: no data`;
    if (d.startsWith('P')) {
      const [x, y] = at(lx, ly);
      dots.push({ t: 'circle', cx: x, cy: y, r: dev === 'phone' ? 1.3 : 1.9, fill, stroke: 'bg', sw: 0.5, tip });
    } else shapes.push({ t: 'path', d, fill, stroke: 'bg', sw: (dev === 'phone' ? 0.3 : 0.45) / s, tip });
  });
  const focus = f.focus.map((c) => {
    const i = worldIndex(c);
    if (i === undefined) throw new Error(`${c} is not on the map`);
    return i;
  });
  const outlines: SceneNode[] = focus.filter((i) => !WORLD[i]![3].startsWith('P')).map((i) => ({ t: 'path', d: WORLD[i]![3], stroke: 'ed', sw: (dev === 'phone' ? 1.4 : 1.8) / s }));
  const group = (children: SceneNode[]): SceneNode => ({ t: 'g', dy: top - WORLD_BOX.top * s, s, children });
  const nodes: SceneNode[] = [group(shapes), ...dots, group(outlines)];

  const key = rampKey(f, bins, dev, width);
  const keyTop = top + mapH + (dev === 'phone' ? 14 : 18);
  const height = keyTop + key.height;
  const P = new Placer({ x: 0, y: 0, w: width, h: keyTop - 4 });
  // The members' names: over the sea where they can be, on a hairline from the label point.
  for (const i of focus) {
    const [, name, , , lx, ly] = WORLD[i]!;
    const got = byIndex.get(i);
    const ob = outlineBox(WORLD[i]![3].startsWith('P') ? `M${lx} ${ly}` : WORLD[i]![3]);
    const [x0, y0] = at(ob.x0, ob.y0), [x1, y1] = at(ob.x1, ob.y1);
    nodes.push(...nameOnMap(P, got ? got.name : name, got ? got.v.toFixed(2) : 'no data', at(lx, ly)[0], { x0, y0, x1, y1 }, dev));
  }
  nodes.push({ t: 'g', dy: keyTop, children: key.nodes });
  return { width, height, nodes };
}

/** The bounding box of an outline (absolute and relative moves, lines, and closes, as world.ts writes them). */
function outlineBox(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let x = 0, y = 0, sx = 0, sy = 0, cmd = 'M';
  const tokens = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const num = () => Number(tokens.shift());
  const see = () => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
  while (tokens.length) {
    if (/[A-Za-z]/.test(tokens[0]!)) cmd = tokens.shift()!;
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; cmd = 'L'; break;
      case 'm': x += num(); y += num(); sx = x; sy = y; cmd = 'l'; break;
      case 'L': x = num(); y = num(); break;
      case 'l': x += num(); y += num(); break;
      case 'H': x = num(); break;
      case 'h': x += num(); break;
      case 'V': y = num(); break;
      case 'v': y += num(); break;
      case 'Z': case 'z': x = sx; y = sy; continue;
      default: throw new Error(`An outline command the map does not read: ${cmd}`);
    }
    see();
  }
  return b;
}

/**
 * A member's name and value, set in the sea just off its outline: below it first (India's in the
 * Indian Ocean under the peninsula), then to the right, the left, above. Close enough to need no
 * leader.
 */
function nameOnMap(P: Placer, name: string, value: string, lx: number, box: { x0: number; y0: number; x1: number; y1: number }, dev: Device): SceneNode[] {
  const size = TYPE[dev].label, small = TYPE[dev].tick;
  const w1 = widthOf(name, 'sansMedium', size), w2 = widthOf(value, 'sans', small);
  const w = w1 + 4 + w2, h = size * 1.05, gap = dev === 'phone' ? 3 : 5;
  const midY = (box.y0 + box.y1) / 2 - h / 2;
  const tries: [number, number][] = [[lx - w / 2, box.y1 + gap], [box.x1 + gap, midY], [box.x0 - gap - w, midY], [lx - w / 2, box.y0 - gap - h]];
  for (const [bx, by] of tries) {
    const b = { x: bx - 2, y: by, w: w + 4, h };
    if (!P.free(b)) continue;
    P.block(b);
    return [
      { t: 'text', x: bx, y: by + size * 0.8, text: name, face: 'sansMedium', size, fill: 'ink', stroke: 'bg', sw: 3 },
      { t: 'text', x: bx + w1 + 4, y: by + size * 0.8, text: value, face: 'sans', size: small, fill: 'ink2', stroke: 'bg', sw: 3 },
    ];
  }
  throw new Error(`No room on the map for "${name}"`);
}

/**
 * The key: the unit, then the swatches in a row, the end ones set apart (they are open), each inner
 * edge written under its join, the centre's edge drawn taller and named above; then "No data".
 */
function rampKey(f: MapFigure, bins: { edges: number[]; paints: Paint[] }, dev: Device, width: number): Scene {
  const T = TYPE[dev], size = T.tick;
  const n = bins.paints.length;
  const sw = dev === 'phone' ? 25 : 38, sh = 10, gapEnd = 3;
  const nodes: SceneNode[] = [];
  const centreText = `${f.centreLabel} ${fmtEdge(f.bins.centre)}`;
  nodes.push({ t: 'text', x: 0, y: size * 0.8, text: f.unit, face: 'sans', size, fill: 'ink2' });
  const y0 = size * 1.2 + 6 + size + 6;
  const xs: number[] = [];
  let x = 0;
  for (let k = 0; k < n; k++) {
    if (k === 1 || k === n - 1) x += gapEnd;
    xs.push(x);
    nodes.push({ t: 'rect', x, y: y0, w: sw, h: sh, fill: bins.paints[k]! });
    x += sw;
  }
  const right = x;
  // Edge k sits between swatch k and k+1.
  const edgeX = (k: number) => (k === 0 ? xs[1]! - gapEnd / 2 : k === n - 2 ? xs[n - 1]! - gapEnd / 2 : xs[k + 1]!);
  const centreK = (n - 2) / 2;
  const P = new Placer({ x: -1, y: 0, w: width + 2, h: 200 });
  const every = dev === 'phone' ? 2 : 1;
  bins.edges.forEach((e, k) => {
    const ex = edgeX(k);
    const strong = k === centreK;
    const lab = fmtEdge(e), lw = widthOf(lab, strong ? 'sansMedium' : 'sans', size);
    nodes.push({ t: 'line', x1: ex, y1: y0 + sh, x2: ex, y2: y0 + sh + 4, stroke: 'ink2', sw: STROKE.hair });
    if ((k - centreK) % every !== 0) return;
    const box = { x: ex - lw / 2 - 1, y: y0 + sh + 5, w: lw + 2, h: size };
    if (!P.free(box)) throw new Error(`No room in the key for ${lab}`);
    P.block(box);
    nodes.push({ t: 'text', x: ex, y: y0 + sh + 5 + size * 0.85, text: lab, face: strong ? 'sansMedium' : 'sans', size, anchor: 'middle', fill: strong ? 'ink' : 'ink2' });
  });
  // The centre, marked above the ramp.
  const cx = edgeX(centreK);
  nodes.push({ t: 'line', x1: cx, y1: y0 - 6, x2: cx, y2: y0 + sh + 4, stroke: 'ink', sw: 1 });
  nodes.push({ t: 'text', x: cx, y: y0 - 9, text: centreText, face: 'sans', size, anchor: 'middle', fill: 'ink' });
  // No data: a grey swatch after the ramp, or under it when the row is full.
  const nd = 'No data', ndw = sw * 0.6 + 6 + widthOf(nd, 'sans', size);
  let nx = right + 20, ny = y0;
  if (nx + ndw > width) { nx = 0; ny = y0 + sh + 5 + size + 12; }
  nodes.push({ t: 'rect', x: nx, y: ny, w: sw * 0.6, h: sh, fill: MISSING });
  nodes.push({ t: 'text', x: nx + sw * 0.6 + 6, y: ny + sh / 2 + size * 0.35, text: nd, face: 'sans', size, fill: 'ink2' });
  return { width, height: Math.max(ny + sh, y0 + sh + 5 + size) + 4, nodes };
}
