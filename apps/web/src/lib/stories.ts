// A data story's plates as scenes, drawn once per story version per isolate (drawing places every
// label against every mark, which is the costly part), and the small words the pages share.

import { drawFigure, drawKey, plateWidth, type Plate, type PublishedStory } from '@fdf/shared/stories';
import type { Scene } from '@fdf/shared/charts';

export interface DrawnPlate { wide: Scene | null; phone: Scene | null; keyWide: Scene | null; keyPhone: Scene | null }

const drawn = new Map<string, Map<string, DrawnPlate>>();
function draw(p: Plate): DrawnPlate {
  const safe = (f: () => Scene | null) => {
    try {
      return f();
    } catch (err) {
      console.error(`[fdf] plate "${p.key}" could not be drawn: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };
  return {
    wide: safe(() => drawFigure(p.figure, 'wide', p.fold)),
    phone: safe(() => drawFigure(p.figure, 'phone')),
    keyWide: safe(() => drawKey(p.figure, 'wide', plateWidth(p, 'wide'))),
    keyPhone: safe(() => drawKey(p.figure, 'phone', plateWidth(p, 'phone'))),
  };
}

/** Every plate of a story, drawn (or null where a plate cannot be drawn: its words still show). */
export function platesOf(s: PublishedStory): Map<string, DrawnPlate> {
  const k = `${s.slug}@${s.version}`;
  let m = drawn.get(k);
  if (!m) {
    m = new Map(s.story.plates.map((p) => [p.key, draw(p)]));
    drawn.set(k, m);
  }
  return m;
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
/** The series' name for a story: "Atlas No. 1". */
export const atlasNo = (n: number) => `Atlas No. ${n}`;
