// Helpers for the multiples, area, scatter, bump and beeswarm tests: the comps fixtures, every
// shape in a scene, and checks that geometry is finite and text stays on the canvas. Tests only.

import multiples from '../../../../../docs/design-comps/charts/data/multiples-life-expectancy.json';
import area from '../../../../../docs/design-comps/charts/data/area-india-electricity.json';
import scatter from '../../../../../docs/design-comps/charts/data/scatter-wealth-health.json';
import bump from '../../../../../docs/design-comps/charts/data/bump-population.json';
import beeswarm from '../../../../../docs/design-comps/charts/data/beeswarm-life-expectancy.json';
import type { Chart } from '../types';
import type { Scene, SceneNode } from '../scene';
import { textWidth } from '../text';

const FIX = { multiples, area, scatter, bump, beeswarm } as Record<string, unknown>;

export const fixtureC = (name: 'multiples' | 'area' | 'scatter' | 'bump' | 'beeswarm'): Chart => JSON.parse(JSON.stringify(FIX[name])) as Chart;

export type Shape = Exclude<SceneNode, { t: 'g' }>;

export function shapes(scene: Scene): Shape[] {
  const out: Shape[] = [];
  const walk = (ns: SceneNode[]) => ns.forEach((n) => (n.t === 'g' ? walk(n.children) : out.push(n)));
  walk(scene.nodes);
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

/** The box a text node covers (baseline y; ascent about 0.8 of the size). */
export function textBox(n: Extract<Shape, { t: 'text' }>): Box {
  const w = textWidth(n.text, n.face, n.size);
  const x = n.anchor === 'end' ? n.x - w : n.anchor === 'middle' ? n.x - w / 2 : n.x;
  return { x, y: n.y - n.size * 0.8, w, h: n.size, text: n.text };
}

export const overlap = (a: Box, b: Box, slack = 0.5) => a.x + slack < b.x + b.w && a.x + a.w > b.x + slack && a.y + slack < b.y + b.h && a.y + a.h > b.y + slack;

/** Problems: non-finite numbers anywhere, text past the canvas edges. */
export function sceneProblems(scene: Scene): string[] {
  const out: string[] = [];
  for (const n of shapes(scene)) {
    for (const [k, v] of Object.entries(n)) if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${n.t}.${k} is ${v}`);
    if (n.t === 'path' && /NaN|Infinity/.test(n.d)) out.push('path has NaN');
    if (n.t === 'text') {
      const b = textBox(n);
      if (b.x < -0.5 || b.x + b.w > scene.width + 0.5 || b.y < -0.5 || b.y + b.h > scene.height + 2) out.push(`text "${n.text}" off the canvas`);
    }
  }
  return out;
}
