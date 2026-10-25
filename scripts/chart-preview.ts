// Render chart JSON files to PNGs (light and dark, wide and narrow) for looking at while designing.
// Usage: node scripts/chart-preview.mjs <out-dir> <chart.json>...  (run through esbuild; see docs/CHARTS.md)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { renderChart, sceneToSvg, RASTER_FONTS, type Chart } from '../packages/shared/src/charts/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ...files] = process.argv.slice(2);
mkdirSync(out!, { recursive: true });
await initWasm(readFileSync(join(root, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
const fonts = RASTER_FONTS.map((f) => new Uint8Array(readFileSync(join(root, 'apps/mobile/assets/fonts', f))));
for (const f of files) {
  const chart = JSON.parse(readFileSync(f, 'utf8')) as Chart;
  for (const layout of ['wide', 'narrow'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const scene = renderChart(chart, layout);
      const svg = sceneToSvg(scene, { scheme, edition: 'teal' });
      const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
      writeFileSync(join(out!, `${basename(f, '.json')}-${layout}-${scheme}.png`), png);
    }
  }
}
