// Measuring chart text with the real advance widths of the faces (metrics.ts), so labels are placed,
// wrapped and kept apart the same way on the website and in the app's picture.

import { ADVANCES, type ChartFace } from './metrics';

const tables = new Map<ChartFace, Map<number, number>>();

function table(face: ChartFace): Map<number, number> {
  let t = tables.get(face);
  if (!t) {
    t = new Map();
    for (const pair of ADVANCES[face].widths.split(',')) {
      const [cp, w] = pair.split(':');
      t.set(parseInt(cp!, 16), Number(w));
    }
    tables.set(face, t);
  }
  return t;
}

/** Width of a string in px at the given size. Unknown characters count as an "n". */
export function textWidth(text: string, face: ChartFace, size: number): number {
  const t = table(face);
  const fb = ADVANCES[face].fallback;
  let w = 0;
  for (const ch of text) w += t.get(ch.codePointAt(0)!) ?? fb;
  return (w * size) / 1000;
}

/** Break text into lines no wider than max px (words are never split). */
export function wrapText(text: string, face: ChartFace, size: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textWidth(next, face, size) > max) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shorten text to fit max px, ending in an ellipsis. */
export function fitText(text: string, face: ChartFace, size: number, max: number): string {
  if (textWidth(text, face, size) <= max) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, face, size) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
