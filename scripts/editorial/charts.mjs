// Charts from the terminal: the shared chart kit (packages/shared/src/charts) loaded in Node, the
// local checks (CSV to chart data, the honesty validator), and chart-draw's PNGs for a look, drawn
// with resvg (WebAssembly) and the app's own font cuts as the Desk Worker draws them at publish.
// The kit is TypeScript; it is bundled once per run with esbuild (already in node_modules for Vite).

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let kit;

/** The chart kit, bundled from source. */
export async function loadKit() {
  if (kit) return kit;
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [join(ROOT, 'packages/shared/src/charts/index.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  const dir = mkdtempSync(join(tmpdir(), 'fdf-charts-'));
  const file = join(dir, 'charts.mjs');
  writeFileSync(file, out.outputFiles[0].text);
  try {
    kit = await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return kit;
}

let raster;
/** resvg with the app's fonts, at the app picture's zoom: SVG in, PNG bytes out. */
export async function rasteriser() {
  if (raster) return raster;
  const k = await loadKit();
  const { initWasm, Resvg } = await import('@resvg/resvg-wasm');
  try {
    await initWasm(readFileSync(join(ROOT, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')));
  } catch (e) {
    if (!/already/i.test(String(e?.message ?? e))) throw e;
  }
  const fontBuffers = k.RASTER_FONTS.map((f) => new Uint8Array(readFileSync(join(ROOT, 'apps/mobile/assets/fonts', f))));
  raster = (svg, zoom = k.APP_PICTURE.zoom) => new Resvg(svg, { fitTo: { mode: 'zoom', value: zoom }, font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
  return raster;
}

/** CSV or TSV text as chart data, with the problems found (nothing is cleaned or guessed at). */
export async function csvData(text) {
  const k = await loadKit();
  return k.csvToData(text);
}

/** The honesty validator's report for a chart, with the lines code would print around it. */
export async function checkChart(chart) {
  const k = await loadKit();
  const report = k.validateChart(chart);
  return { ...report, units: report.ok ? k.unitsLine(chart) : undefined, glosses: report.ok ? k.chartGlosses(chart) : undefined, description: report.ok ? k.describeChart(chart) : undefined };
}

/** Draw a chart to PNG files for a look before keeping it: wide and phone, light and dark, and its share card. */
export async function drawFiles(chart, outDir, edition = 'oxblood') {
  const k = await loadKit();
  const r = await rasteriser();
  const files = [];
  for (const layout of ['wide', 'narrow']) {
    const scene = k.renderChart(chart, layout);
    for (const scheme of ['light', 'dark']) {
      const file = join(outDir, `chart-${layout}-${scheme}.png`);
      writeFileSync(file, r(k.sceneToSvg(scene, { scheme, edition })));
      files.push(file);
    }
  }
  // The share card, as publish draws it: the chart whole with its title, credit and the masthead.
  const share = join(outDir, 'chart-share.png');
  writeFileSync(share, r(k.sceneToSvg(k.shareScene(chart, { address: 'fromthedumpsterfire.com' }), { scheme: 'light', edition }), k.SHARE.zoom));
  files.push(share);
  return files;
}
