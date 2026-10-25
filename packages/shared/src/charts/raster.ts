// The app's chart pictures. The app has no SVG runtime, so each chart is also published as two PNGs
// (light and dark) of the phone figure, drawn from the very scene the website draws. The Workers
// free plan's CPU limit rules out rasterising on the server (DECISIONS 2026-10-24, share cards), so
// the editor's side draws them at publish: the Desk in the browser and `npm run editorial -- publish`
// in the terminal, both with resvg (WebAssembly) and the app's own font cuts. publish.ts accepts
// a picture only under the chartKey of the chart it is publishing.

import type { Haul } from '../haul';
import { editionOf, type Edition, type Scheme } from '../tokens';
import { renderChart } from './render';
import { sceneToSvg } from './scene';
import { chartKey } from './key';
import type { Chart } from './types';

/** The phone figure (375 wide) at three times its size: 1125 px wide PNGs. */
export const APP_PICTURE = { layout: 'narrow', zoom: 3, width: 1125 } as const;

/** The two SVGs to rasterise for one chart, with the Haul's edition ink resolved. */
export function appPictureSvgs(chart: Chart, edition: Edition): Record<Scheme, string> {
  const scene = renderChart(chart, APP_PICTURE.layout);
  return { light: sceneToSvg(scene, { scheme: 'light', edition }), dark: sceneToSvg(scene, { scheme: 'dark', edition }) };
}

/** Every chart in a Haul (from its preview bundle), with the key publish will look for. */
export function chartsIn(haul: Haul): Array<{ key: string; chart: Chart; itemId: string }> {
  const edition = editionOf(haul.number, haul.edition);
  const out: Array<{ key: string; chart: Chart; itemId: string }> = [];
  for (const item of haul.items) for (const b of item.blocks ?? []) if (b.kind === 'chart') out.push({ key: chartKey(b.chart, edition), chart: b.chart, itemId: item.id });
  return out;
}

/**
 * Draw every chart's pictures with the given rasteriser (resvg at zoom 3 with RASTER_FONTS) and
 * return them as the publish route wants them: base64 PNGs by chart key.
 */
export async function drawAppPictures(
  haul: Haul,
  rasterise: (svg: string) => Uint8Array | Promise<Uint8Array>,
  toBase64: (bytes: Uint8Array) => string,
): Promise<Record<string, { light: string; dark: string }>> {
  const edition = editionOf(haul.number, haul.edition);
  const out: Record<string, { light: string; dark: string }> = {};
  for (const { key, chart } of chartsIn(haul)) {
    if (out[key]) continue;
    const svgs = appPictureSvgs(chart, edition);
    out[key] = { light: toBase64(await rasterise(svgs.light)), dark: toBase64(await rasterise(svgs.dark)) };
  }
  return out;
}
