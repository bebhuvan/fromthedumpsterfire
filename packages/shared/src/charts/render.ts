// Draw a chart: pick its form's renderer and lay it out for the wide (website) or narrow (phone and
// app) figure. Renderers read only chart.data.rows; nothing is typed in or invented on the way.

import type { Chart, ChartForm } from './types';
import type { Scene } from './scene';
import { Ctx, type Layout } from './frame';
import { drawLine } from './forms/line';
import { drawMultiples } from './forms/multiples';
import { drawArea } from './forms/area';
import { drawBar } from './forms/bar';
import { drawDot } from './forms/dot';
import { drawDumbbell } from './forms/dumbbell';
import { drawSlope } from './forms/slope';
import { drawScatter } from './forms/scatter';
import { drawBump } from './forms/bump';
import { drawStripes } from './forms/stripes';
import { drawBand } from './forms/band';
import { drawCalendar } from './forms/calendar';
import { drawHeatmap } from './forms/heatmap';
import { drawRidgeline } from './forms/ridgeline';
import { drawBeeswarm } from './forms/beeswarm';
import { drawWaffle } from './forms/waffle';

type Draw = (ctx: Ctx) => Scene;

const DRAW: Record<ChartForm, Draw> = {
  line: drawLine,
  multiples: drawMultiples,
  area: drawArea,
  bar: drawBar,
  dot: drawDot,
  dumbbell: drawDumbbell,
  slope: drawSlope,
  scatter: drawScatter,
  bump: drawBump,
  stripes: drawStripes,
  band: drawBand,
  calendar: drawCalendar,
  heatmap: drawHeatmap,
  ridgeline: drawRidgeline,
  beeswarm: drawBeeswarm,
  waffle: drawWaffle,
};

export function renderChart(chart: Chart, layout: Layout): Scene {
  const draw = DRAW[chart.form];
  if (!draw) throw new Error(`No renderer for the ${chart.form} form`);
  return draw(new Ctx(chart, layout));
}
