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

/**
 * Wrap into as few lines as wrapText would, but with the lines as even as they can be (the narrowest
 * width that still gives that many lines), as CSS's text-wrap: balance does: no word left alone.
 */
export function wrapBalanced(text: string, face: ChartFace, size: number, max: number): string[] {
  const lines = wrapText(text, face, size, max);
  if (lines.length < 2) return lines;
  let lo = max / lines.length;
  let hi = max;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (wrapText(text, face, size, mid).length > lines.length) lo = mid;
    else hi = mid;
  }
  return wrapText(text, face, size, hi);
}

/**
 * Wrap as wrapText does, but never leave one word alone on the last line: the line before gives up a
 * word (as CSS's text-wrap: pretty), unless that would leave it with one word itself.
 */
export function wrapPretty(text: string, face: ChartFace, size: number, max: number): string[] {
  const lines = wrapText(text, face, size, max);
  if (lines.length < 2) return lines;
  const last = lines[lines.length - 1]!.split(' ');
  const prev = lines[lines.length - 2]!.split(' ');
  if (last.length > 1 || prev.length < 3) return lines;
  const moved = [prev.pop()!, ...last].join(' ');
  if (textWidth(moved, face, size) > max) return lines;
  return [...lines.slice(0, -2), prev.join(' '), moved];
}
