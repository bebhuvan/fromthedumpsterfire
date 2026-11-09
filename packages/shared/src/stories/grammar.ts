// The data-story grammar's numbers, in one place (docs/DATA-STORIES.md): widths, type, strokes,
// dashes and hatching. Every form reads these; nothing in a form invents its own.

export type Device = 'wide' | 'phone';

/** Figure widths: the plate across margin and column, the fold-out across the page, the phone. */
export const WIDTH = { wide: 880, fold: 1030, phone: 340 } as const;

export const TYPE = {
  wide: { tick: 11, label: 13, note: 13, inFill: 13, inFillSub: 11, small: 11 },
  phone: { tick: 10.5, label: 12, note: 12, inFill: 12, inFillSub: 10.5, small: 10.5 },
} as const;

export const STROKE = {
  story: { wide: 2.5, phone: 2.25 },
  storyProjected: { wide: 1.8, phone: 1.6 },
  named: 1.2,
  context: 0.55,
  grid: 1,
  hair: 0.75,
  ring: 2,
} as const;

/** Dashes: projected lines, references, seams. */
export const DASH = { projected: '6 3', reference: '4 3', seam: '1.5 3' } as const;

/** Hatching for ranges ("not yet"): 80 per cent close, 95 per cent open, and the grey of a zone. */
export const HATCH = { close: 3.2, open: 6, zone: 4, weight: 0.9 } as const;

/** Plot margins: room for ticks on the left, for end labels on the right (wide) or none (phone). */
export const MARGIN = {
  wide: { left: 38, right: 112, top: 46, bottom: 30 },
  phone: { left: 30, right: 16, top: 46, bottom: 30 },
} as const;

export const DOT = { story: 3.5, named: 2.6, note: 2 } as const;

/** Opacity of context lines and their projections, and of the story's wash. */
export const OPACITY = { context: 0.7, contextProjected: 0.45, wash: 0.14, hatch: 0.75 } as const;
