// For tests: every text node of a scene with its box (groups moved into place), and the one check
// every plate must pass: no label off the figure, no two labels on each other.

import { expect } from 'vitest';
import type { Scene, SceneNode } from '../charts/scene';
import { textWidth } from '../charts/text';

export interface TextBox { t: string; x: number; y: number; w: number; h: number }

export function texts(nodes: SceneNode[], dx = 0, dy = 0): TextBox[] {
  return nodes.flatMap((n) => {
    if (n.t === 'g') return texts(n.children, dx + (n.dx ?? 0), dy + (n.dy ?? 0));
    if (n.t !== 'text') return [];
    const w = textWidth(n.text, n.face, n.size);
    const x = dx + (n.anchor === 'end' ? n.x - w : n.anchor === 'middle' ? n.x - w / 2 : n.x);
    return [{ t: n.text, x, y: dy + n.y - n.size * 0.75, w, h: n.size * 0.95 }];
  });
}

export function expectClean(s: Scene): void {
  const boxes = texts(s.nodes);
  for (const b of boxes) {
    expect(b.x, `"${b.t}" off the left`).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.w, `"${b.t}" off the right`).toBeLessThanOrEqual(s.width + 1);
    expect(b.y, `"${b.t}" off the top`).toBeGreaterThanOrEqual(-1);
    expect(b.y + b.h, `"${b.t}" off the bottom`).toBeLessThanOrEqual(s.height + 1);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    expect(ox > 1 && oy > 1, `"${a.t}" overlaps "${b.t}"`).toBe(false);
  }
}
