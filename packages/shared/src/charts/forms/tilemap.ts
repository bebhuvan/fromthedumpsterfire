// Tile map of India: every state and union territory one equal square (geo/india.ts), placed
// roughly where it is on the map, coloured on the ramp the chart asks for, its code and value
// written in it in the colour that reads on the fill. A tile the data has no row for is outlined and
// says so; the editor's focus is outlined in ink. The key sits under the grid.

import { labelOn, type Scene, type SceneNode } from '../scene';
import { Ctx, halo, shortUnit, text } from '../frame';
import { Placer, placePoint } from '../labels';
import { drawKey, rampFor } from '../ramp';
import { INDIA_TILES, indiaTile } from '../geo/india';
import { textWidth } from '../text';

export function drawTilemap(ctx: Ctx): Scene {
  const W = ctx.W;
  const value = new Map<string, number | null>();
  for (const r of ctx.rows) {
    const t = indiaTile(ctx.has('code') ? ctx.str(r, 'code') : ctx.str(r, 'label')) ?? indiaTile(ctx.str(r, 'label'));
    if (t) value.set(t.code, ctx.num(r, 'y'));
  }
  const present = [...value.values()].filter((v): v is number => v !== null);
  const ramp = rampFor(ctx, present.length ? present : [0]);
  const cols = Math.max(...INDIA_TILES.map((t) => t.col)) + 1;
  const rows = Math.max(...INDIA_TILES.map((t) => t.row)) + 1;
  const gap = 3;
  const tile = Math.floor(Math.min(ctx.narrow ? 46 : 54, (W - (cols - 1) * gap) / cols));
  const pitch = tile + gap;
  const focus = new Set((ctx.chart.options?.focus ?? []).map((f) => indiaTile(f)?.code).filter(Boolean) as string[]);
  const nodes: SceneNode[] = [];
  const unit = shortUnit(ctx.chart.units) ?? '';
  const size = ctx.narrow ? 10.5 : 11.5;
  let missing = false;
  for (const t of INDIA_TILES) {
    const x = t.col * pitch;
    const y = t.row * pitch;
    const v = value.has(t.code) ? value.get(t.code)! : null;
    if (v === null) {
      missing = true;
      nodes.push({ t: 'rect', x: x + 0.5, y: y + 0.5, w: tile - 1, h: tile - 1, stroke: 'rule', sw: 1, tip: `${t.name}: no data` });
      nodes.push(text(x + 5, y + size + 3, t.code, 'sansMedium', size, 'ink2'));
      continue;
    }
    const p = ramp.paint(v);
    nodes.push({ t: 'rect', x, y, w: tile, h: tile, fill: p, tip: `${t.name}: ${ctx.value(v)} ${ctx.chart.units}` });
    const ink = labelOn(p);
    nodes.push(text(x + 5, y + size + 3, t.code, 'sansMedium', size, ink));
    const s = ctx.value(v);
    if (textWidth(s, 'sans', size - 0.5) <= tile - 8) nodes.push(text(x + 5, y + tile - 6, s, 'sans', size - 0.5, ink));
    if (focus.has(t.code)) nodes.push({ t: 'rect', x: x - 1.5, y: y - 1.5, w: tile + 3, h: tile + 3, stroke: 'ink', sw: 1.5 });
  }
  // The focus, named in full with its value beside its tile, clear of every tile.
  const placer = new Placer({ x: 0, y: 0, w: W, h: rows * pitch }, INDIA_TILES.map((t) => ({ x: t.col * pitch - 1, y: t.row * pitch - 1, w: tile + 2, h: tile + 2 })));
  for (const t of INDIA_TILES) {
    if (!focus.has(t.code)) continue;
    const v = value.get(t.code);
    const s = `${t.name} ${v === null || v === undefined ? 'no data' : ctx.value(v)}`;
    const p = placePoint(placer, { x: t.col * pitch + tile / 2, y: t.row * pitch + tile / 2, r: tile / 2 + 2, text: s, face: 'sansMedium', size: ctx.s.small + 0.5 }, 140);
    if (!p) continue;
    if (p.leader) nodes.push({ t: 'line', ...p.leader, stroke: 'ink', sw: 0.75 });
    nodes.push(halo(p.x, p.y, s, 'sansMedium', ctx.s.small + 0.5, 'ink', p.anchor));
  }
  const gridW = cols * pitch - gap;
  const gridH = rows * pitch - gap;
  // The key under the grid, as wide as the grid.
  const key = drawKey(ctx, ramp, 0, gridH + 16, ctx.narrow ? W : Math.max(gridW, 360), { unit, missing });
  nodes.push(...key.nodes);
  const height = gridH + 16 + key.height;
  return { width: W, height: Math.ceil(height + 4), nodes };
}
