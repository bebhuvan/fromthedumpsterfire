// Draws one comps fixture to PNGs (wide and narrow, light and dark) for a quick look while working.
// Bundle like build-comps.ts, then: node preview-one.mjs <fixture> <outdir> [edition]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderChart, sceneToSvg, RASTER_FONTS, type Chart } from '../../../packages/shared/src/charts/index.ts';

const [name, out, edition = 'teal'] = process.argv.slice(2);
const root = process.cwd();
const { initWasm, Resvg } = await import('@resvg/resvg-wasm');
await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fonts = RASTER_FONTS.map((f) => new Uint8Array(readFileSync(join(root, 'apps/mobile/assets/fonts', f))));
const chart = JSON.parse(readFileSync(join(root, 'docs/design-comps/charts/data', `${name}.json`), 'utf8')) as Chart;
for (const layout of ['wide', 'narrow'] as const)
  for (const scheme of ['light', 'dark'] as const) {
    const svg = sceneToSvg(renderChart(chart, layout), { scheme, edition: edition as 'teal' });
    const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, background: scheme === 'light' ? '#fff' : '#111', font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
    writeFileSync(join(out!, `${name}-${layout}-${scheme}.png`), png);
  }
