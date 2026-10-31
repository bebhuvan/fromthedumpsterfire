// The share cards (1200 x 630 PNG), drawn here in the editor's browser at publish so no Worker spends
// CPU on them. The Haul's: white ground, the edition ink band, the masthead, HAUL and its number, the
// title as large as fits in three lines, and the fingerprint along the bottom. Each item's: the same
// frame, the item's number in a block of its type's colour, its title and maker, and the fingerprint
// with its own mark picked out. Sent with the publish; publish.ts checks each is a PNG of this size and
// stores it next to the bundle. If the canvas or the fonts fail, a card is null and the Haul or item
// publishes without one.

import { curlQuotes, type Haul, type Item } from '@fdf/shared/haul';
import { typeLabel } from '@fdf/shared/tokens';
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

type Ctx = CanvasRenderingContext2D;

/** The title's runs set as large as fits `room` in at most `max` lines; the size and the lines, or null.
 * `loose`: when nothing fits the room, the smallest size that fits the lines anyway. */
function fit(ctx: Ctx, runs: Run[], width: number, room: number, max: number, from: number, to = 36, loose = false) {
  for (let size = from; size >= to; size -= 4) {
    const laid = lines(ctx, runs, size, width, max);
    if (laid && laid.length * size * 1.04 <= room) return { size, laid };
  }
  const laid = loose ? lines(ctx, runs, to, width, max) : null;
  return laid ? { size: to, laid } : null;
}

function setTitle(ctx: Ctx, laid: Run[][], size: number, x: number, top: number) {
  ctx.fillStyle = INK;
  laid.forEach((line, i) => {
    let lx = x;
    const y = top + size * 0.86 + i * size * 1.04;
    line.forEach((w, j) => {
      ctx.font = w.italic ? `italic 400 ${size}px "${DISPLAY}"` : `500 ${size}px "${DISPLAY}"`;
      const t = (j ? ' ' : '') + w.text;
      ctx.fillText(t, lx, y);
      lx += ctx.measureText(t).width;
    });
  });
}

/** White ground, the edition band, the masthead top left and a quiet line top right. */
function frame(ctx: Ctx, ed: string, right: string) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = ed;
  ctx.fillRect(0, 0, CARD_W, 14);

  // The masthead: "From the" italic, "Internet" struck through in ember, "Dumpster Fire".
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
  ctx.fillText(right, CARD_W - M, mastY);
  ctx.textAlign = 'left';
}

const LINE_Y = CARD_H - M - 34;
const stem = (lane: number) => 18 + lane * 20;

/** The top of the fingerprint, which decides the room left above it. */
function fingerprintTop(haul: Haul) {
  return LINE_Y - stem(Math.max(0, fingerprint(haul).lanes - 1)) - 16;
}

/** The fingerprint: the line, each object a square in its type's swatch on a stem, the end years.
 * With `focus`, that item's mark is drawn whole and the others faint. */
function drawFingerprint(ctx: Ctx, haul: Haul, ed: string, focus?: Item) {
  const fp = fingerprint(haul);
  const span = CARD_W - 2 * M - 16;
  const xAt = (at: number) => M + (at / 92) * span;
  ctx.strokeStyle = ed;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(M, LINE_Y);
  ctx.lineTo(CARD_W - M, LINE_Y);
  ctx.stroke();
  for (const m of fp.marks) {
    const own = focus ? m.item.id === focus.id : true;
    const mx = Math.round(xAt(m.at)) + 0.5;
    const h = stem(m.lane);
    ctx.globalAlpha = own ? 1 : 0.42;
    ctx.strokeStyle = own && focus ? INK : ed;
    ctx.lineWidth = own && focus ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(mx + 8, LINE_Y);
    ctx.lineTo(mx + 8, LINE_Y - h);
    ctx.stroke();
    ctx.fillStyle = palettes.light.swatch[typeSwatch[m.item.type] ?? 'apricot'];
    ctx.fillRect(mx, LINE_Y - h - 16, 16, 16);
    ctx.strokeStyle = INK;
    ctx.lineWidth = own && focus ? 2 : 1;
    ctx.strokeRect(mx, LINE_Y - h - 16, 16, 16);
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.font = `400 18px "${SANS}"`;
  ctx.fillStyle = GREY;
  ctx.fillText(String(fp.from), M, LINE_Y + 28);
  ctx.textAlign = 'right';
  ctx.fillText(String(fp.to), CARD_W - M, LINE_Y + 28);
  ctx.textAlign = 'left';
}

async function canvasFor(): Promise<{ canvas: HTMLCanvasElement; ctx: Ctx } | null> {
  await loadFonts();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

function png(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return base64 ? { base64, dataUrl } : null;
}

/** Draw the Haul's card; a PNG as base64 (for the publish) and a data URL (for the preview), or null. */
export async function drawCard(haul: Haul): Promise<{ base64: string; dataUrl: string } | null> {
  try {
    const c = await canvasFor();
    if (!c) return null;
    const { canvas, ctx } = c;
    const ed = editionInk.light[editionOf(haul.number, haul.edition)];
    frame(ctx, ed, 'fromthedumpsterfire.com');

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

    // The title, as large as fits in three lines.
    const tx = M + colW + 48;
    const top = 150;
    const runs: Run[] = [{ text: haul.title.text, italic: false }, ...(haul.title.italic ? [{ text: haul.title.italic, italic: true }] : [])];
    const set = fit(ctx, runs, CARD_W - M - tx, fingerprintTop(haul) - 28 - top, 3, 92, 36, true);
    if (set) setTitle(ctx, set.laid, set.size, tx, top);

    drawFingerprint(ctx, haul, ed);
    return png(canvas);
  } catch (e) {
    console.warn('share card not drawn', e);
    return null;
  }
}

/** Draw one item's card: its number in a block of its type's colour, the type under it, its title as
 * large as fits, its maker and where it was published, and the Haul's fingerprint with its mark picked out. */
export async function drawItemCard(haul: Haul, item: Item): Promise<{ base64: string; dataUrl: string } | null> {
  try {
    const at = haul.items.findIndex((i) => i.id === item.id);
    if (at < 0) return null;
    const c = await canvasFor();
    if (!c) return null;
    const { canvas, ctx } = c;
    const ed = editionInk.light[editionOf(haul.number, haul.edition)];
    frame(ctx, ed, `Haul ${String(haul.number).padStart(3, '0')} · ${at + 1} of ${haul.items.length}`);

    // The number in its block, the type under it.
    const top = 150;
    const B = 150;
    ctx.fillStyle = palettes.light.swatch[typeSwatch[item.type] ?? 'apricot'];
    ctx.fillRect(M, top, B, B);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(M + 0.5, top + 0.5, B - 1, B - 1);
    ctx.fillStyle = INK;
    ctx.font = `400 96px "${DISPLAY}"`;
    ctx.fillText(String(at + 1).padStart(2, '0'), M + 14, top + B - 20);
    ctx.fillStyle = GREY;
    ctx.font = `600 16px "${SANS}"`;
    ctx.letterSpacing = '3px';
    ctx.fillText(typeLabel[item.type].toUpperCase(), M, top + B + 36);
    ctx.letterSpacing = '0px';

    // The title, as large as fits in three lines (four when small), with room for the byline.
    const tx = M + B + 48;
    const tw = CARD_W - M - tx;
    const room = fingerprintTop(haul) - 36 - top - 54;
    const runs: Run[] = [{ text: curlQuotes(item.title.text), italic: false }, ...(item.title.italic ? [{ text: curlQuotes(item.title.italic), italic: true }] : [])];
    const set = fit(ctx, runs, tw, room, 3, 84, 44) ?? fit(ctx, runs, tw, room, 4, 44, 32, true);
    let y = top;
    if (set) {
      setTitle(ctx, set.laid, set.size, tx, top);
      y = top + set.laid.length * set.size * 1.04;
    }

    // The maker, and where it was published when that says something more.
    const who = item.creator.trim();
    const titled = [item.title.text, item.title.italic].filter(Boolean).join(' ').trim();
    const named = item.source.name.trim();
    const where = who && named.startsWith(`${who}, `) ? named.slice(who.length + 2) : named;
    const place = where && where !== titled && where !== who ? where : '';
    // Too long for the line: the place without its parenthesis and pages, then the maker alone.
    const short = place.replace(/\s*\([^)]*\)/g, '').replace(/,\s*pp?\.\s*[\d–-]+$/, '').trim();
    ctx.font = `italic 400 32px "${DISPLAY}"`;
    const by = [[who, place], [who, short], [who], [place]]
      .map((parts) => parts.filter(Boolean).join(', '))
      .find((line) => line && ctx.measureText(line).width <= tw);
    if (by) {
      ctx.fillStyle = GREY;
      ctx.fillText(curlQuotes(by), tx, y + 44);
    }

    drawFingerprint(ctx, haul, ed, item);
    return png(canvas);
  } catch (e) {
    console.warn('item card not drawn', e);
    return null;
  }
}

/** Every item's card, by item id; items whose card could not be drawn are left out. */
export async function drawItemCards(haul: Haul): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const item of haul.items) {
    const card = await drawItemCard(haul, item);
    if (card) out[item.id] = card.base64;
  }
  return out;
}
