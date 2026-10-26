// The app's chart pictures. The app has no SVG runtime, so each chart is also published as two PNGs
// (light and dark) of the phone figure, drawn from the very scene the website draws. The Desk Worker
// draws them at publish (packages/server/src/chartdraw.ts) with resvg in WebAssembly and the app's
// own font cuts, together with the chart's share card (share.ts). The terminal's chart-draw uses the
// same SVGs to show a chart locally.

import type { Edition, Scheme } from '../tokens';
import { renderChart } from './render';
import { sceneToSvg } from './scene';
import type { Chart } from './types';

/** The phone figure (375 wide) at three times its size: 1125 px wide PNGs. */
export const APP_PICTURE = { layout: 'narrow', zoom: 3, width: 1125 } as const;

/** The two SVGs to rasterise for one chart, with the Haul's edition ink resolved. */
export function appPictureSvgs(chart: Chart, edition: Edition): Record<Scheme, string> {
  const scene = renderChart(chart, APP_PICTURE.layout);
  return { light: sceneToSvg(scene, { scheme: 'light', edition }), dark: sceneToSvg(scene, { scheme: 'dark', edition }) };
}
