// Helpers for the form tests: load a comps fixture, collect a scene's shapes, and find text that
// overlaps other text. Only the tests import this.

import south_asia_gdp_bar from '../../../../../docs/design-comps/charts/data/south-asia-gdp-bar.json';
import india_growth_columns from '../../../../../docs/design-comps/charts/data/india-growth-columns.json';
import south_asia_life_dot from '../../../../../docs/design-comps/charts/data/south-asia-life-dot.json';
import hemispheres_dot from '../../../../../docs/design-comps/charts/data/hemispheres-dot.json';
import south_asia_life_dumbbell from '../../../../../docs/design-comps/charts/data/south-asia-life-dumbbell.json';
import south_asia_life_slope from '../../../../../docs/design-comps/charts/data/south-asia-life-slope.json';
import india_electricity_waffle from '../../../../../docs/design-comps/charts/data/india-electricity-waffle.json';
import type { Chart } from '../types';
import type { Scene, SceneNode } from '../scene';
import { textWidth } from '../text';

const FIXTURES: Record<string, unknown> = {
  'south-asia-gdp-bar': south_asia_gdp_bar,
  'india-growth-columns': india_growth_columns,
  'south-asia-life-dot': south_asia_life_dot,
  'hemispheres-dot': hemispheres_dot,
  'south-asia-life-dumbbell': south_asia_life_dumbbell,
  'south-asia-life-slope': south_asia_life_slope,
  'india-electricity-waffle': india_electricity_waffle,
};

/** A comps fixture (docs/design-comps/charts/data), as a fresh copy. */
export function fixture(name: string): Chart {
  const f = FIXTURES[name];
  if (!f) throw new Error(`No fixture ${name}`);
  return JSON.parse(JSON.stringify(f)) as Chart;
}

export function flat(scene: Scene): Array<Exclude<SceneNode, { t: 'g' }>> {
  const out: Array<Exclude<SceneNode, { t: 'g' }>> = [];
  const walk = (ns: SceneNode[]) => ns.forEach((n) => (n.t === 'g' ? walk(n.children) : out.push(n)));
  walk(scene.nodes);
  return out;
}

export interface Box {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The box a text node covers: from its anchor and measured width, ascender to descender. */
export function textBoxes(scene: Scene): Box[] {
  return flat(scene)
    .filter((n): n is Extract<SceneNode, { t: 'text' }> => n.t === 'text')
    .map((n) => {
      const w = textWidth(n.text, n.face, n.size);
      const x = n.anchor === 'end' ? n.x - w : n.anchor === 'middle' ? n.x - w / 2 : n.x;
      return { text: n.text, x, y: n.y - n.size * 0.72, w, h: n.size * 0.92 };
    });
}

/** Pairs of text boxes that overlap by more than a pixel. */
export function overlaps(boxes: Box[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1) out.push([a.text, b.text]);
    }
  return out;
}

/** Text that runs off the drawing. */
export function outside(scene: Scene): string[] {
  return textBoxes(scene)
    .filter((b) => b.x < -1 || b.x + b.w > scene.width + 1 || b.y < -1 || b.y + b.h > scene.height + 1)
    .map((b) => b.text);
}
