// The chart ramps of chartInk (packages/shared/src/tokens.ts), generated in OKLCH so lightness steps
// evenly, with chroma clipped into sRGB. Prints the hexes as JSON; paste them into tokens.ts and run
// each ramp through the dataviz palette validator (--ordinal, each diverging arm on its own, and the
// arms' matching steps as pairs for colour-blind separation). Usage: node scripts/chart-ramps.mjs
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklchToRgb(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
export function hex(L, C, h) {
  let c = C;
  let rgb = oklchToRgb(L, c, h);
  while (!inGamut(rgb) && c > 0) {
    c -= 0.002;
    rgb = oklchToRgb(L, Math.max(0, c), h);
  }
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, toGam(Math.max(0, v)))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const lerp = (a, b, t) => a + (b - a) * t;

// Sequential, cool (the default for magnitude): one hue, blue with a little green at the pale end.
// Seven steps; the palest clears 2:1 against the ground so the smallest values never read as gaps.
function seqCool(dark) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const L = dark ? lerp(0.43, 0.91, t) : lerp(0.775, 0.3, t);
    const C = dark ? lerp(0.07, 0.075, t) : lerp(0.06, 0.1, t);
    const h = dark ? lerp(250, 228, t) : lerp(228, 252, t);
    out.push(hex(L, C, h));
  }
  return out;
}

// Sequential, heat (only where heat is the meaning): orange to deep red, one hue family.
function seqHeat(dark) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const L = dark ? lerp(0.45, 0.9, t) : lerp(0.785, 0.34, t);
    const tt = dark ? t : 1 - t; // tt: 1 at the pale end
    const h = lerp(28, 64, tt);
    const C = dark ? lerp(0.15, 0.1, t) : lerp(0.14, 0.11, tt);
    out.push(hex(L, C, h));
  }
  return out;
}

// Diverging: blue to a grey middle to red. The arms are equal in lightness step for step, so the same
// distance from the midpoint looks equally strong either side; the first tint on each arm clears 2:1
// against the ground (a small departure is visible), and only the middle sits near the ground.
function diverging(dark) {
  const cool = 252;
  const warm = 27;
  const mid = dark ? 0.32 : 0.94;
  const first = dark ? 0.47 : 0.775;
  const end = dark ? 0.86 : 0.37;
  const out = new Array(11);
  out[5] = hex(mid, 0.003, 90);
  for (let k = 1; k <= 5; k++) {
    const t = (k - 1) / 4;
    const L = lerp(first, end, t);
    const C = dark ? lerp(0.1, 0.13, t) : lerp(0.088, 0.155, t);
    out[5 - k] = hex(L, C, cool);
    out[5 + k] = hex(L, C * 1.05, warm);
  }
  return out;
}

const neutrals = (dark) =>
  dark
    ? { quiet: hex(0.42, 0.006, 270), quiet2: hex(0.33, 0.006, 270), quiet3: hex(0.55, 0.006, 270), record: hex(0.255, 0.004, 270), normal: hex(0.345, 0.006, 270) }
    : { quiet: hex(0.82, 0.006, 270), quiet2: hex(0.9, 0.005, 270), quiet3: hex(0.68, 0.007, 270), record: hex(0.945, 0.003, 270), normal: hex(0.865, 0.005, 270) };

const res = {};
for (const scheme of ['light', 'dark']) {
  const dark = scheme === 'dark';
  const div = diverging(dark);
  res[scheme] = { seq: seqCool(dark), heat: seqHeat(dark), div, ...neutrals(dark), hot: div[9], cold: div[1] };
}
console.log(JSON.stringify(res, null, 2));
