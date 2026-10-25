// Charts from the terminal: the shared chart kit (packages/shared/src/charts) loaded in Node, the
// local checks (CSV to chart data, the honesty validator), and the app's pictures drawn at publish
// with resvg (WebAssembly) and the app's own font cuts, exactly as the Desk draws them in the browser.
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
  raster = (svg) => new Resvg(svg, { fitTo: { mode: 'zoom', value: k.APP_PICTURE.zoom }, font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } }).render().asPng();
  return raster;
}

/** Every chart in a previewed Haul, drawn for the app: { [chartKey]: { light, dark } } as base64. */
export async function drawPictures(haul) {
  const k = await loadKit();
  if (!k.chartsIn(haul).length) return {};
  const r = await rasteriser();
  return k.drawAppPictures(haul, r, (bytes) => Buffer.from(bytes).toString('base64'));
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

/** Draw a chart to PNG files for a look before keeping it: wide and phone, light and dark. */
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
  return files;
}
