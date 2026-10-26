// A short fingerprint of a chart as drawn: the spec, the edition ink and the renderer's version. The
// app's pictures are drawn by the editor's browser or terminal; publish recomputes this key from the
// chart it is about to publish and refuses pictures drawn from anything else.

import type { Chart } from './types';
import type { Edition } from '../tokens';

/** Bump when the renderer's output changes, so pictures drawn by an older renderer are redrawn. */
export const CHART_RENDER_VERSION = 2;

/** JSON with object keys sorted, so the same chart always serialises the same way. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** FNV-1a (64-bit) of the chart, edition and renderer version, as 16 hex digits. */
export function chartKey(chart: Chart, edition: Edition): string {
  const s = `${CHART_RENDER_VERSION}|${edition}|${stableJson(chart)}`;
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
