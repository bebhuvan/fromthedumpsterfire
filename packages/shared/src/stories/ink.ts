// The story's colours by role, for any edition's ink, in either scheme, and the checks every ink
// must pass (tested for all eight editions, light and dark): the story line stands off the ground,
// text set on the ink reads, the hatching shows.

import { contrast, labelOn, paintHex } from '../charts/scene';
import { EDITIONS, type Edition, type Scheme } from '../tokens';

export interface InkCheck { edition: Edition; scheme: Scheme; line: number; onInk: number; hatch: number }

/** Blend a colour over the ground at an opacity, as the eye sees a translucent mark. */
export function over(fg: string, bg: string, a: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map((i) => Math.round(c(fg, i) * a + c(bg, i) * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function checkInk(edition: Edition, scheme: Scheme): InkCheck {
  const ed = paintHex('ed', scheme, edition), bg = paintHex('bg', scheme, edition);
  return {
    edition,
    scheme,
    line: contrast(ed, bg),
    onInk: contrast(paintHex(labelOn('ed'), scheme, edition), ed),
    // The close hatching, as seen over the ground.
    hatch: contrast(over(ed, bg, 0.75), bg),
  };
}

export const ALL_INKS: InkCheck[] = EDITIONS.flatMap((e) => (['light', 'dark'] as const).map((s) => checkInk(e, s)));
