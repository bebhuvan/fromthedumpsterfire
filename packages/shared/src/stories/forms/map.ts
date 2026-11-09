// map: a measure for every country of the world, binned on the diverging ramp around a threshold the
// story turns on (cool below, warm above), on the chart kit's outlines: Natural Earth in India's point
// of view, Equal Earth, so areas are true (charts/geo/world.ts; imported, never copied). A country
// with no value is a quiet grey; the story's member is outlined in the edition's ink and named. The
// key is the story ramp's (ramp.ts), the heatmap's too. Countries too small to draw are dots, as
// small and quiet as can still carry their bin, the same for every one.

import type { Scene, SceneNode } from '../../charts/scene';
import { WORLD, WORLD_BOX } from '../../charts/geo/world';
import { worldIndex } from '../../charts/geo/countries';
import { TYPE, WIDTH, type Device } from '../grammar';
import type { Pt } from '../geom';
import { place, Placer, type Anchor } from '../place';
import { NO_DATA, ramp, rampKey, type RampSpec } from '../ramp';

export interface MapValue { code: string; name: string; v: number }

export interface MapFigure {
  form: 'map';
  /** The year the values are for. */
  year: number;
  values: MapValue[];
  /**
   * Bins of equal width either side of the centre, `perSide` on each, the outermost open: below the
   * lowest edge and at or above the highest. The centre is an edge, so the ramp's grey middle is
   * not used and every bin leans one way.
   */
  bins: RampSpec;
  /** What the key says the centre is ("Replacement"). */
  centreLabel: string;
  /** The key's title: the measure and its year. */
  unit: string;
  /** Codes (ISO 3166 alpha-3) of the story's members, outlined and named. */
  focus: string[];
}

export function drawMap(f: MapFigure, dev: Device): Scene {
  const T = TYPE[dev], width = WIDTH[dev], phone = dev === 'phone';
  // The world is 2.3 times as wide as it is tall in Equal Earth, so the map takes the whole width on
  // every device; a taller phone map would have to cut countries off.
  const s = width / WORLD_BOX.width;
  const mapH = (WORLD_BOX.bottom - WORLD_BOX.top) * s;
  const top = 4;
  const at = (x: number, y: number): [number, number] => [x * s, top + (y - WORLD_BOX.top) * s];
  const R = ramp(f.bins);
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
    const fill = got ? R.paintOf(got.v) : NO_DATA;
    const tip = got ? `${got.name}: ${got.v}` : `${name}: no data`;
    // A country too small to outline is a dot just big enough to show its bin, with no ring, so a
    // scatter of islands stays quiet beside the countries drawn whole.
    if (d.startsWith('P')) {
      const [x, y] = at(lx, ly);
      dots.push({ t: 'circle', cx: x, cy: y, r: phone ? 0.9 : 1.25, fill, tip });
    } else shapes.push({ t: 'path', d, fill, stroke: 'bg', sw: (phone ? 0.3 : 0.45) / s, tip });
  });
  const focus = f.focus.map((c) => {
    const i = worldIndex(c);
    if (i === undefined) throw new Error(`${c} is not on the map`);
    return i;
  });
  const outlines: SceneNode[] = focus.filter((i) => !WORLD[i]![3].startsWith('P')).map((i) => ({ t: 'path', d: WORLD[i]![3], stroke: 'ed', sw: (phone ? 1.4 : 1.8) / s }));
  const group = (children: SceneNode[]): SceneNode => ({ t: 'g', dy: top - WORLD_BOX.top * s, s, children });
  const nodes: SceneNode[] = [group(shapes), ...dots, group(outlines)];

  const key = rampKey(R, { unit: f.unit, centreLabel: `${f.centreLabel} ${R.labels.find((l) => l.edge === f.bins.centre)!.text}`, noData: true, dev, width });
  const keyTop = top + mapH + (phone ? 14 : 18);
  const height = keyTop + key.height;
  const P = new Placer({ x: 0, y: 0, w: width, h: keyTop - 4 });
  // The members' names, with the placer: off the member (each of its parts filled column by column)
  // and off every coast and border near it (their vertices), so a name sits in the sea and never on
  // a neighbour (Bangladesh, Sri Lanka, the Maldives beside India).
  const partsOf = (i: number): Pt[][] => {
    const [, , , d, lx, ly] = WORLD[i]!;
    return (d.startsWith('P') ? [[[lx, ly] as Pt]] : outlineParts(d)).map((part) => part.map(([x, y]) => at(x, y)));
  };
  const near = 150 * (width / WIDTH.wide);
  for (const i of focus) {
    const own = partsOf(i), all = own.flat();
    const [cx0, cx1] = [Math.min(...all.map((p) => p[0])) - near, Math.max(...all.map((p) => p[0])) + near];
    const [cy0, cy1] = [Math.min(...all.map((p) => p[1])) - near, Math.max(...all.map((p) => p[1])) + near];
    for (const part of own) {
      const xs = part.map((p) => p[0]);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) {
        const ys = part.filter((p) => p[0] >= x - 1.5 && p[0] < x + 4.5).map((p) => p[1]);
        if (ys.length) P.block({ x, y: Math.min(...ys), w: 3, h: Math.max(...ys) - Math.min(...ys) });
      }
    }
    WORLD.forEach((_, j) => {
      if (j === i) return;
      for (const part of partsOf(j)) {
        let last: Pt | null = null;
        for (const p of part) {
          if (p[0] < cx0 || p[0] > cx1 || p[1] < cy0 || p[1] > cy1) continue;
          if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 2.5) continue;
          P.block({ x: p[0] - 1.5, y: p[1] - 1.5, w: 3, h: 3 });
          last = p;
        }
      }
    });
  }
  const size = T.label;
  for (const i of focus) {
    const [, name, , , lx] = WORLD[i]!;
    const got = byIndex.get(i), all = partsOf(i).flat();
    const b = { x: Math.min(...all.map((p) => p[0])), y: Math.min(...all.map((p) => p[1])), w: 0, h: 0 };
    b.w = Math.max(...all.map((p) => p[0])) - b.x;
    b.h = Math.max(...all.map((p) => p[1])) - b.y;
    const text = `${got ? got.name : name} ${got ? got.v.toFixed(2) : 'no data'}`;
    const gap = phone ? 3 : 5;
    nodes.push(...place(P, {
      lines: [text], at: [at(lx, 0)[0], b.y + b.h], face: 'sansMedium', size, paint: 'ink',
      // Straight down into the sea first, then down and to either side, then beside the member.
      prefer: [
        ...[0, 1, 2, 3].flatMap((k): [number, number, Anchor][] => [[0, gap + size * (0.8 + k), 'middle'], [gap, gap + size * (0.8 + k), 'start'], [-gap, gap + size * (0.8 + k), 'end']]),
        [b.x + b.w - at(lx, 0)[0] + gap, -b.h / 2, 'start'], [b.x - at(lx, 0)[0] - gap, -b.h / 2, 'end'],
      ],
      reach: 90,
    }, `the name of ${name}`));
  }
  nodes.push({ t: 'g', dy: keyTop, children: key.nodes });
  return { width, height, nodes };
}

/** An outline's parts as their vertices (absolute and relative moves, lines, and closes, as world.ts writes them). */
function outlineParts(d: string): Pt[][] {
  const parts: Pt[][] = [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = 'M';
  const tokens = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const num = () => Number(tokens.shift());
  while (tokens.length) {
    if (/[A-Za-z]/.test(tokens[0]!)) cmd = tokens.shift()!;
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; cmd = 'L'; parts.push([]); break;
      case 'm': x += num(); y += num(); sx = x; sy = y; cmd = 'l'; parts.push([]); break;
      case 'L': x = num(); y = num(); break;
      case 'l': x += num(); y += num(); break;
      case 'H': x = num(); break;
      case 'h': x += num(); break;
      case 'V': y = num(); break;
      case 'v': y += num(); break;
      case 'Z': case 'z': x = sx; y = sy; continue;
      default: throw new Error(`An outline command the map does not read: ${cmd}`);
    }
    parts[parts.length - 1]!.push([x, y]);
  }
  return parts;
}
