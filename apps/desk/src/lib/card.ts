// The Haul's share card (1200 x 630 PNG), drawn here in the editor's browser at publish so no
// Worker spends CPU on it: white ground, the edition ink band, the masthead, HAUL and its number,
// the title as large as fits in three lines, and the fingerprint along the bottom. Sent with the
// publish; publish.ts checks it is a PNG of this size and stores it next to the bundle. If the
// canvas or the fonts fail, drawCard returns null and the Haul publishes without a card.

import type { Haul } from '@fdf/shared/haul';
import { fingerprint } from '@fdf/shared/fingerprint';
import { editionInk, editionOf, palettes, typeSwatch } from '@fdf/shared/tokens';

export const CARD_W = 1200;
export const CARD_H = 630;
const M = 64;
const INK = '#141416';
const GREY = '#55555C';
const EMBER = '#FF4F1F';
const DISPLAY = 'FDF Card Display';
const SANS = 'FDF Card Sans';

/** The Desk's own copies of the site's faces, loaded under names of their own. */
const FACES: Array<[string, string, FontFaceDescriptors]> = [
  [DISPLAY, '/fonts/NewsreaderDisplay-Regular.ttf', { weight: '400', style: 'normal' }],
  [DISPLAY, '/fonts/NewsreaderDisplay-Medium.ttf', { weight: '500', style: 'normal' }],
  [DISPLAY, '/fonts/NewsreaderDisplay-Italic.ttf', { weight: '400', style: 'italic' }],
  [SANS, '/fonts/Schibsted-Regular.ttf', { weight: '400' }],
  [SANS, '/fonts/Schibsted-SemiBold.ttf', { weight: '600' }],
];

let fontsLoaded: Promise<void> | null = null;
function loadFonts(): Promise<void> {
  fontsLoaded ??= Promise.all(
    FACES.map(async ([family, url, desc]) => {
      const f = new FontFace(family, `url(${url})`, desc);
      await f.load();
      document.fonts.add(f);
    }),
  ).then(() => undefined);
  return fontsLoaded.catch((e) => {
    fontsLoaded = null;
    throw e;
  });
}

type Run = { text: string; italic: boolean };

/** Break the title's words into at most `max` lines of `width` at `size`; null if it does not fit. */
function lines(ctx: CanvasRenderingContext2D, runs: Run[], size: number, width: number, max: number): Run[][] | null {
  const words = runs.flatMap((r) => r.text.split(/\s+/).filter(Boolean).map((w) => ({ text: w, italic: r.italic })));
  const font = (it: boolean) => (it ? `italic 400 ${size}px "${DISPLAY}"` : `500 ${size}px "${DISPLAY}"`);
  const measure = (line: Run[]) =>
    line.reduce((x, w, i) => {
      ctx.font = font(w.italic);
      return x + ctx.measureText((i ? ' ' : '') + w.text).width;
    }, 0);
  const out: Run[][] = [[]];
  for (const w of words) {
    const cur = out[out.length - 1]!;
    if (!cur.length || measure([...cur, w]) <= width) cur.push(w);
    else out.push([w]);
    if (measure([w]) > width) return null;
  }
  return out.length <= max ? out : null;
}

/** Draw the card; a PNG as base64 (for the publish) and a data URL (for the preview), or null. */
export async function drawCard(haul: Haul): Promise<{ base64: string; dataUrl: string } | null> {
  try {
    await loadFonts();
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const ed = editionInk.light[editionOf(haul.number, haul.edition)];

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = ed;
    ctx.fillRect(0, 0, CARD_W, 14);

    // The masthead, top left: "From the" italic, "Internet" struck through in ember, "Dumpster Fire".
    ctx.textBaseline = 'alphabetic';
    let x = M;
    const mastY = 14 + 58;
    const part = (text: string, font: string, color: string) => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(text, x, mastY);
      const w = ctx.measureText(text).width;
      x += w;
      return w;
    };
    part('From the ', `italic 400 30px "${DISPLAY}"`, INK);
    const strikeAt = x;
    const iw = part('Internet', `400 30px "${DISPLAY}"`, GREY);
    ctx.strokeStyle = EMBER;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(strikeAt - 2, mastY - 9);
    ctx.lineTo(strikeAt + iw + 2, mastY - 11);
    ctx.stroke();
    part(' Dumpster Fire', `500 30px "${DISPLAY}"`, INK);

    ctx.font = `400 18px "${SANS}"`;
    ctx.fillStyle = GREY;
    ctx.textAlign = 'right';
    ctx.fillText('fromthedumpsterfire.com', CARD_W - M, mastY);
    ctx.textAlign = 'left';

    // HAUL over the number, in the edition ink.
    const number = String(haul.number).padStart(3, '0');
    ctx.fillStyle = ed;
    ctx.font = `600 18px "${SANS}"`;
    ctx.letterSpacing = '3px';
    ctx.fillText('HAUL', M, 190);
    ctx.letterSpacing = '0px';
    ctx.font = `400 120px "${DISPLAY}"`;
    ctx.fillText(number, M - 4, 300);
    const colW = Math.max(ctx.measureText(number).width, 120);

    // The fingerprint's height decides the room left for the title.
    const fp = fingerprint(haul);
    const lineY = CARD_H - M - 34;
    const stem = (lane: number) => 18 + lane * 20;
    const fpTop = lineY - stem(Math.max(0, fp.lanes - 1)) - 16;

    // The title, as large as fits in three lines.
    const tx = M + colW + 48;
    const tw = CARD_W - M - tx;
    const top = 150;
    const room = fpTop - 28 - top;
    const runs: Run[] = [{ text: haul.title.text, italic: false }, ...(haul.title.italic ? [{ text: haul.title.italic, italic: true }] : [])];
    let size = 92;
    let laid: Run[][] | null = null;
    for (; size >= 36; size -= 4) {
      laid = lines(ctx, runs, size, tw, 3);
      if (laid && laid.length * size * 1.04 <= room) break;
    }
    if (laid) {
      ctx.fillStyle = INK;
      laid.forEach((line, i) => {
        let lx = tx;
        const y = top + size * 0.86 + i * size * 1.04;
        line.forEach((w, j) => {
          ctx.font = w.italic ? `italic 400 ${size}px "${DISPLAY}"` : `500 ${size}px "${DISPLAY}"`;
          const t = (j ? ' ' : '') + w.text;
          ctx.fillText(t, lx, y);
          lx += ctx.measureText(t).width;
        });
      });
    }

    // The fingerprint: the line, each object a square in its type's swatch on a stem, the end years.
    const span = CARD_W - 2 * M - 16;
    const xAt = (at: number) => M + (at / 92) * span;
    ctx.strokeStyle = ed;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(M, lineY);
    ctx.lineTo(CARD_W - M, lineY);
    ctx.stroke();
    for (const m of fp.marks) {
      const mx = Math.round(xAt(m.at)) + 0.5;
      const h = stem(m.lane);
      ctx.strokeStyle = ed;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx + 8, lineY);
      ctx.lineTo(mx + 8, lineY - h);
      ctx.stroke();
      ctx.fillStyle = palettes.light.swatch[typeSwatch[m.item.type] ?? 'apricot'];
      ctx.fillRect(mx, lineY - h - 16, 16, 16);
      ctx.strokeStyle = INK;
      ctx.strokeRect(mx, lineY - h - 16, 16, 16);
    }
    ctx.font = `400 18px "${SANS}"`;
    ctx.fillStyle = GREY;
    ctx.fillText(String(fp.from), M, lineY + 28);
    ctx.textAlign = 'right';
    ctx.fillText(String(fp.to), CARD_W - M, lineY + 28);
    ctx.textAlign = 'left';

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return base64 ? { base64, dataUrl } : null;
  } catch (e) {
    console.warn('share card not drawn', e);
    return null;
  }
}
