// World map: a value for each country, shaded on the ramp the chart asks for, on Natural Earth's
// outlines in India's point of view (geo/world.ts: India's boundaries as India depicts them), in the
// Equal Earth projection, which keeps areas true so a big country is not louder than it should be.
// A country with no value is a quiet grey and the key says so; one too small to draw is a dot. The
// editor's focus is outlined in ink and named with its value, placed clear of the others.

import type { Scene, SceneNode } from '../scene';
import { Ctx, halo, shortUnit } from '../frame';
import { drawKey, rampFor } from '../ramp';
import { WORLD, WORLD_BOX } from '../geo/world';
import { worldIndex } from '../geo/countries';
import { Placer, dotBox, placePoint } from '../labels';

export function drawChoropleth(ctx: Ctx): Scene {
  const W = ctx.W;
  const value = new Map<number, { v: number | null; name: string }>();
  for (const r of ctx.rows) {
    const i = (ctx.has('code') ? worldIndex(ctx.str(r, 'code')) : undefined) ?? worldIndex(ctx.str(r, 'label'));
    if (i !== undefined) value.set(i, { v: ctx.num(r, 'y'), name: ctx.str(r, 'label') });
  }
  const present = [...value.values()].map((x) => x.v).filter((v): v is number => v !== null);
  const ramp = rampFor(ctx, present.length ? present : [0]);
  const s = W / WORLD_BOX.width;
  const mapH = (WORLD_BOX.bottom - WORLD_BOX.top) * s;
  const at = (x: number, y: number) => [x * s, (y - WORLD_BOX.top) * s] as const;
  const shapes: SceneNode[] = [];
  const dots: SceneNode[] = [];
  const focusNames = ctx.chart.options?.focus ?? [];
  const focus = new Set(focusNames.map((f) => worldIndex(f)).filter((i): i is number => i !== undefined));
  let missing = false;
  WORLD.forEach(([, name, , d, lx, ly], i) => {
    const got = value.get(i);
    const v = got?.v ?? null;
    if (v === null) missing = true;
    const fill = v === null ? 'quiet2' : ramp.paint(v);
    const tip = `${got?.name || name}: ${v === null ? 'no data' : `${ctx.value(v)} ${ctx.chart.units}`}`;
    if (d.startsWith('P')) {
      const [x, y] = at(lx, ly);
      dots.push({ t: 'circle', cx: x, cy: y, r: ctx.narrow ? 1.6 : 2.2, fill, stroke: 'bg', sw: 0.75, tip });
    } else shapes.push({ t: 'path', d, fill, stroke: 'bg', sw: 0.5 / s, tip });
  });
  const nodes: SceneNode[] = [{ t: 'g', dy: -WORLD_BOX.top * s, s, children: shapes }, ...dots];
  // The focus: outlined in ink, named with its value where there is room.
  const outlines: SceneNode[] = [];
  const placer = new Placer({ x: 0, y: 0, w: W, h: mapH });
  for (const i of focus) {
    const [, , , d, lx, ly] = WORLD[i]!;
    if (!d.startsWith('P')) outlines.push({ t: 'path', d, stroke: 'ink', sw: 1.1 / s });
    const [x, y] = at(lx, ly);
    placer.claim(dotBox(x, y, 2));
  }
  if (outlines.length) nodes.push({ t: 'g', dy: -WORLD_BOX.top * s, s, children: outlines });
  for (const i of focus) {
    const [, name, , , lx, ly] = WORLD[i]!;
    const got = value.get(i);
    const label = `${got?.name || name} ${got && got.v !== null ? ctx.value(got.v) : 'no data'}`;
    const [x, y] = at(lx, ly);
    const p = placePoint(placer, { x, y, r: 3, text: label, face: 'sansMedium', size: ctx.s.small + 0.5 }, 80);
    if (!p) continue;
    if (p.leader) nodes.push({ t: 'line', ...p.leader, stroke: 'ink', sw: 0.75 });
    nodes.push(halo(p.x, p.y, label, 'sansMedium', ctx.s.small + 0.5, 'ink', p.anchor));
  }
  const key = drawKey(ctx, ramp, 0, mapH + 14, ctx.narrow ? W : Math.min(W, 420), { unit: shortUnit(ctx.chart.units) ?? '', missing, missingPaint: 'quiet2' });
  nodes.push(...key.nodes);
  return { width: W, height: Math.ceil(mapH + 14 + key.height + 2), nodes };
}
