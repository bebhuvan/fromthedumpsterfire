// Charts in the Desk: the live preview (the shared renderer's scene as inline SVG elements, in the
// Desk's current theme, with the site's faces). The app's pictures and the share cards are drawn by
// the Desk Worker at publish. See docs/CHARTS.md.

import { createElement, useEffect, useState, type ReactNode } from 'react';
import { FACES, nodeAttrs, paintHex, renderChart, type Chart, type Layout, type Scene, type SceneNode } from '@fdf/shared/charts';
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
  if (n.t === 'g') return createElement('g', { key, transform: n.dx || n.dy ? `translate(${n.dx ?? 0} ${n.dy ?? 0})` : undefined }, n.children.map((c, i) => element(c, i, scheme, edition)));
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
