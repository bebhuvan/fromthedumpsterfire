// Charts in the Desk: the live preview (the shared renderer's scene as inline SVG elements, in the
// Desk's current theme, with the site's faces) and, at publish, the app's pictures (the same scene
// rasterised with resvg in WebAssembly, loaded only then). See docs/CHARTS.md.

import { createElement, useEffect, useState, type ReactNode } from 'react';
import type { Haul } from '@fdf/shared/haul';
import { APP_PICTURE, drawAppPictures, FACES, nodeAttrs, paintHex, RASTER_FONTS, renderChart, type Chart, type Layout, type Scene, type SceneNode } from '@fdf/shared/charts';
import type { Edition, Scheme } from '@fdf/shared/tokens';

/** The Desk's theme right now: the toggle's choice, else the system's. */
export function currentScheme(): Scheme {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Re-render when the editor flips the theme or the system does. */
export function useScheme(): Scheme {
  const [s, setS] = useState<Scheme>(currentScheme);
  useEffect(() => {
    const update = () => setS(currentScheme());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', update);
    return () => {
      mo.disconnect();
      mq?.removeEventListener('change', update);
    };
  }, []);
  return s;
}

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function element(n: SceneNode, key: number, scheme: Scheme, edition: Edition): ReactNode {
  if (n.t === 'g') return createElement('g', { key }, n.children.map((c, i) => element(c, i, scheme, edition)));
  const a = nodeAttrs(n);
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(a)) if (k !== 'class') props[camel(k)] = v;
  if (n.fill) props.fill = paintHex(n.fill, scheme, edition);
  if (n.stroke) props.stroke = paintHex(n.stroke, scheme, edition);
  if (n.t === 'text') {
    const f = FACES[n.face];
    props.fontFamily = f.css;
    props.fontWeight = f.weight;
    props.fontStyle = f.italic ? 'italic' : 'normal';
    return createElement('text', props, n.text);
  }
  const tip = n.tip ? createElement('title', null, n.tip) : null;
  return createElement(n.t, props, tip);
}

/** A scene as an inline SVG, its colours resolved for the theme (text is always escaped by React). */
export function SceneSvg({ scene, scheme, edition, label, width }: { scene: Scene; scheme: Scheme; edition: Edition; label: string; width?: number | string }) {
  return (
    <svg
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      width={width ?? scene.width}
      role="img"
      aria-label={label}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', background: paintHex('bg', scheme, edition) }}
    >
      {scene.nodes.map((n, i) => element(n, i, scheme, edition))}
    </svg>
  );
}

/** The chart drawn in one layout, or the renderer's complaint (an incomplete chart cannot be drawn). */
export function ChartPreview({ chart, layout, edition, width }: { chart: Chart; layout: Layout; edition: Edition; width?: number | string }) {
  const scheme = useScheme();
  let scene: Scene;
  try {
    scene = renderChart(chart, layout);
  } catch (e) {
    return <p className="small muted">Not drawn yet: {e instanceof Error ? e.message : String(e)}</p>;
  }
  return <SceneSvg scene={scene} scheme={scheme} edition={edition} label={`Preview of ${chart.title || 'the chart'}`} width={width} />;
}

// ---------------------------------------------------------------- the app's pictures

type Resvg = typeof import('@resvg/resvg-wasm');
let resvgReady: Promise<{ mod: Resvg; fonts: Uint8Array[] }> | null = null;

/**
 * resvg and the app's own font cuts, loaded once and only when a Haul with charts is published.
 * The fonts are the Desk's copies in /fonts (the same files as apps/mobile/assets/fonts; the share
 * card already loads them), so the pictures are set in exactly the app's type.
 */
function loadResvg() {
  resvgReady ??= (async () => {
    const [mod, wasm] = await Promise.all([import('@resvg/resvg-wasm'), import('@resvg/resvg-wasm/index_bg.wasm?url')]);
    await mod.initWasm(fetch(wasm.default));
    const fonts = await Promise.all(
      RASTER_FONTS.map(async (f) => {
        const r = await fetch(`/fonts/${f}`);
        if (!r.ok) throw new Error(`The font ${f} did not load (${r.status})`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
    return { mod, fonts };
  })();
  return resvgReady.catch((e) => {
    resvgReady = null;
    throw e;
  });
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Every chart's app pictures for a Haul (from its preview bundle), as the publish route takes them:
 * base64 PNGs by chart key. Empty when the Haul has no charts (resvg is then never loaded).
 */
export async function drawChartPictures(haul: Haul): Promise<Record<string, { light: string; dark: string }>> {
  if (!haul.items.some((it) => it.blocks?.some((b) => b.kind === 'chart'))) return {};
  const { mod, fonts } = await loadResvg();
  return drawAppPictures(
    haul,
    (svg) => {
      const r = new mod.Resvg(svg, { fitTo: { mode: 'zoom', value: APP_PICTURE.zoom }, font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Schibsted-Regular' } });
      const png = r.render().asPng();
      r.free();
      return png;
    },
    toBase64,
  );
}
