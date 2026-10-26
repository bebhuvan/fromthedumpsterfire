// Chart pictures drawn on the server at publish (DECISIONS 2026-10-26): the app's two pictures of the
// phone figure (light and dark, 1125 px wide) and the share card (1080 px wide), all from the same
// scenes the website draws, rasterised with resvg in WebAssembly and set in the app's own font cuts.
// The Desk Worker builds the drawer (the wasm module and the fonts from its own assets) and hands it
// to publish; nothing here touches a binding, so tests can hand in a drawer of their own.

import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { APP_PICTURE, RASTER_FONTS, SHARE, appPictureSvgs, sceneToSvg, shareScene, type Chart, type ShareOptions } from '@fdf/shared/charts';
import type { Edition } from '@fdf/shared/tokens';

export interface ChartDrawer {
  /** An SVG (with the app's font family names) as a PNG at the given zoom. */
  png(svg: string, zoom: number): Uint8Array;
}

export interface ChartPictureSet {
  light: Uint8Array;
  dark: Uint8Array;
  share: Uint8Array;
}

let wasmReady: Promise<void> | null = null;

/**
 * resvg with the given wasm (a compiled module in a Worker, bytes in Node) and font files. The wasm
 * is set up once per isolate; a failed start is forgotten so the next publish tries again.
 */
export async function resvgDrawer(wasm: WebAssembly.Module | BufferSource, loadFont: (file: string) => Promise<Uint8Array>): Promise<ChartDrawer> {
  wasmReady ??= initWasm(wasm).catch((e: unknown) => {
    // initWasm refuses a second start in the same isolate; that one is fine.
    if (/already/i.test(String((e as Error)?.message ?? e))) return;
    wasmReady = null;
    throw e;
  });
  await wasmReady;
  const fontBuffers = await Promise.all(RASTER_FONTS.map(loadFont));
  return {
    png(svg, zoom) {
      const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: zoom }, font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } });
      try {
        return r.render().asPng();
      } finally {
        r.free();
      }
    },
  };
}

/** A chart's pictures: the app's light and dark phone figure, and the share card (light). */
export function drawChartPictures(drawer: ChartDrawer, chart: Chart, edition: Edition, share: ShareOptions): ChartPictureSet {
  const svgs = appPictureSvgs(chart, edition);
  return {
    light: drawer.png(svgs.light, APP_PICTURE.zoom),
    dark: drawer.png(svgs.dark, APP_PICTURE.zoom),
    share: drawer.png(sceneToSvg(shareScene(chart, share), { scheme: 'light', edition }), SHARE.zoom),
  };
}
