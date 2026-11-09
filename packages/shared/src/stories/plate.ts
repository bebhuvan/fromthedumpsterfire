// A plate's figure for a device, and its key: the marks the figure uses, drawn as themselves and
// named in words, so a reader learns the grammar once and reads every plate with it.

import type { Scene, SceneNode } from '../charts/scene';
import { hatch, hatchPath, type Pt } from './geom';
import { DASH, HATCH, OPACITY, STROKE, TYPE, type Device } from './grammar';
import { widthOf } from './place';
import { drawLines } from './forms/lines';
import { drawMultiples, drawPyramid, drawStack } from './forms/small';
import { drawSwarm } from './forms/swarm';
import { drawBars } from './forms/bars';
import { drawBump } from './forms/bump';
import { drawDumbbell } from './forms/dumbbell';
import { drawHeatmap } from './forms/heatmap';
import { drawMap } from './forms/map';
import { drawRidgeline } from './forms/ridgeline';
import { drawScatter } from './forms/scatter';
import { drawSlope } from './forms/slope';
import { drawTrail } from './forms/trail';
import type { Figure, Plate } from './spec';

export function drawFigure(f: Figure, dev: Device, fold = false): Scene {
  switch (f.form) {
    case 'lines':
      return drawLines(f, dev, dev === 'wide' && fold ? 1030 : undefined);
    case 'swarm':
      return drawSwarm(f, dev);
    case 'multiples':
      return drawMultiples(f, dev);
    case 'stack':
      return drawStack(f, dev);
    case 'pyramid':
      return drawPyramid(f, dev);
    case 'slope':
      return drawSlope(f, dev);
    case 'dumbbell':
      return drawDumbbell(f, dev);
    case 'bars':
      return drawBars(f, dev);
    case 'heatmap':
      return drawHeatmap(f, dev);
    case 'ridgeline':
      return drawRidgeline(f, dev);
    case 'bump':
      return drawBump(f, dev);
    case 'scatter':
      return drawScatter(f, dev);
    case 'trail':
      return drawTrail(f, dev);
    case 'map':
      return drawMap(f, dev);
  }
}

export type KeyMark = 'estimated' | 'projected' | 'range80' | 'range95' | 'reference' | 'zone' | 'context' | 'hollow';

/** What a figure's key names, in a fixed order, from what the figure actually draws. */
export function keyOf(f: Figure): { mark: KeyMark; text: string }[] {
  const out: { mark: KeyMark; text: string }[] = [];
  const add = (mark: KeyMark, text: string) => out.some((k) => k.mark === mark) || out.push({ mark, text });
  if (f.form === 'lines') {
    const all = f.panels.flatMap((p) => p.series);
    if (all.some((s) => s.role === 'context')) add('context', f.contextLabel ?? 'Everything else');
    add('estimated', 'Estimated');
    if (all.some((s) => s.projectedFrom !== undefined)) add('projected', 'Projected');
    if (all.some((s) => s.range)) { add('range80', '80% range'); add('range95', '95% range'); }
    for (const p of f.panels) { if (p.rules?.length) add('reference', p.rules[0]!.label); if (p.zones?.length) add('zone', p.zones[0]!.phone ?? p.zones[0]!.label); }
  } else if (f.form === 'swarm') {
    add('estimated', 'Estimated');
    if (f.items.some((i) => i.state === 'projected')) add('hollow', 'Projected');
  } else if (f.form === 'multiples') {
    add('estimated', 'Estimated');
    if (f.panels.some((p) => p.projectedFrom !== undefined)) add('projected', 'Projected');
    if (f.rule) add('reference', f.rule.label);
  } else if (f.form === 'stack') {
    if (f.seam !== undefined) add('zone', 'Projected');
  } else if (f.form === 'bump') {
    add('estimated', 'Estimated');
    add('projected', 'Projected');
  } else if (f.form === 'trail') {
    add('estimated', 'Estimated');
    if (f.members.some((m) => m.projectedFrom !== undefined)) add('projected', 'Projected');
    if (f.rule) add('reference', f.rule.label);
  } else if (f.form === 'ridgeline') {
    if (f.ridges.some((r) => r.role === 'projected')) add('zone', 'Projected');
    if (f.rule) add('reference', f.rule.label);
  } else if ((f.form === 'slope' || f.form === 'scatter') && f.rule) {
    add('reference', f.rule.label);
  } else if ((f.form === 'bars' || f.form === 'dumbbell') && f.rule) {
    add('reference', f.rule.label);
  }
  return out;
}

/** The key as a strip of marks and words, wrapped to the width. */
export function drawKey(f: Figure, dev: Device, width: number): Scene | null {
  const items = keyOf(f);
  if (!items.length) return null;
  const T = TYPE[dev], size = T.tick, sw = 22, gap = 18, row = 18;
  const nodes: SceneNode[] = [];
  let x = 0, y = 9;
  for (const k of items) {
    const w = sw + 6 + widthOf(k.text, 'sans', size);
    if (x > 0 && x + w > width) { x = 0; y += row; }
    const box: Pt[] = [[x, y - 6], [x + sw, y - 6]], boxB: Pt[] = [[x, y + 5], [x + sw, y + 5]];
    switch (k.mark) {
      case 'estimated': nodes.push({ t: 'line', x1: x, y1: y, x2: x + sw, y2: y, stroke: 'ed', sw: STROKE.story[dev] }); break;
      case 'projected': nodes.push({ t: 'line', x1: x, y1: y, x2: x + sw, y2: y, stroke: 'ed', sw: STROKE.storyProjected[dev], dash: DASH.projected }); break;
      case 'context': nodes.push({ t: 'line', x1: x, y1: y - 2, x2: x + sw, y2: y + 1, stroke: 'quiet', sw: 1 }, { t: 'line', x1: x, y1: y + 2, x2: x + sw, y2: y - 1, stroke: 'quiet', sw: 1 }); break;
      case 'range80': nodes.push({ t: 'path', d: hatchPath(hatch(box, boxB, HATCH.close)), stroke: 'ed', sw: HATCH.weight, so: OPACITY.hatch }); break;
      case 'range95': nodes.push({ t: 'path', d: hatchPath(hatch(box, boxB, HATCH.open)), stroke: 'ed', sw: HATCH.weight * 0.8, so: OPACITY.hatch * 0.8 }); break;
      case 'reference': nodes.push({ t: 'line', x1: x, y1: y, x2: x + sw, y2: y, stroke: 'ink', sw: STROKE.hair, dash: DASH.reference }); break;
      case 'zone': nodes.push({ t: 'path', d: hatchPath(hatch(box, boxB, HATCH.zone, true)), stroke: 'quiet3', sw: 0.7 }); break;
      case 'hollow': nodes.push({ t: 'circle', cx: x + 6, cy: y, r: 5, fill: 'bg', stroke: 'quiet3', sw: 1 }, { t: 'circle', cx: x + 17, cy: y, r: 5, fill: 'quiet3', stroke: 'bg', sw: 1 }); break;
    }
    nodes.push({ t: 'text', x: x + sw + 6, y: y + size * 0.35, text: k.text, face: 'sans', size, fill: 'ink2' });
    x += w + gap;
  }
  return { width, height: y + 9, nodes };
}

export const plateWidth = (p: Plate, dev: Device) => (dev === 'phone' ? 340 : p.fold ? 1030 : 880);
