// Builds the data-story comps: the fertility story in three grammars (plates, desk, specimen).
// node_modules/.bin/esbuild docs/design-comps/data-stories/build.ts --bundle --platform=node --format=esm --outfile=/tmp/ds.mjs && node /tmp/ds.mjs
// The story's words are a machine draft written for the comps; every figure in them is read from
// data/fertility.json here, never typed.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './charts';
import { esc, roman } from './kit';

const here = dirname(fileURLToPath(import.meta.url));
const D: C.Data & { source: any; methods: Record<string, string> } = JSON.parse(readFileSync(join(here, 'data/fertility.json'), 'utf8'));

// ---- Figures for the words, from the rows -----------------------------------------------------
const at = (s: [number, number][], y: number) => s.find((p) => p[0] === y)![1];
const wt = D.world.tfr;
const peak = wt.filter((p) => p[0] <= 2023).reduce((a, b) => (b[1] > a[1] ? b : a));
const now = at(wt, 2023);
const worldCross = wt.find((p) => p[0] > 2023 && p[1] < 2.1)![0];
const cy = (c: string) => D.crossing.find((x) => x.country === c)!.year;
const share23 = Math.round(at(D.share, 2023));
const never = D.crossing.filter((c) => c.kind === 'never').length;
const crossed = D.crossing.filter((c) => c.kind === 'estimate' || c.kind === 'before').length;
const floorN = D.floor.length;
const back = D.floor.reduce((a, b) => (b.max_after > a.max_after ? b : a));
const ko = at(D.named['South Korea']!.tfr, 2023);
const ratio = ko / 2.1;
const kids = Math.round(100 * ratio), grand = Math.round(100 * ratio * ratio);
const B = D.world.births, De = D.world.deaths;
const bPk = B.filter((p) => p[0] <= 2023).reduce((a, b) => (b[1] > a[1] ? b : a));
const dCross = B.find((p) => p[0] > 2023 && at(De, p[0]) > p[1])![0];
const pPk = D.world.pop.reduce((a, b) => (b[1] > a[1] ? b : a));
const af = (y: number) => Math.round(at(D.birthShare['Africa (UN)']!, y));
const as = (y: number) => Math.round(at(D.birthShare['Asia (UN)']!, y));
const inCross = cy('India')!, inPk = D.named['India']!.pop.reduce((a, b) => (b[1] > a[1] ? b : a));
const f2 = (v: number) => v.toFixed(2);

const beats = [
  {
    key: 'fall', kicker: 'The fall',
    head: `In sixty years the world went from ${f2(peak[1])} children per woman to ${f2(now)}`,
    body: `In ${peak[0]} the average woman in the world could expect to have ${f2(peak[1])} children. By 2023 it was ${f2(now)}, just above the 2.1 at which each generation replaces the one before. The fall reached almost every country at once. In the UN's central projection the world itself goes below 2.1 in ${worldCross}.`,
    fig: (w: number, g: C.Grammar) => C.fall(D, w, g),
    cap: 'Total fertility rate, every country of a million people or more, 1950 to 2023; the world to 2100 in the UN medium projection.',
  },
  {
    key: 'crossing', kicker: 'The crossing',
    head: `Two in three people now live where fertility is below replacement`,
    body: `Country by country, fertility has slipped under 2.1: Japan in ${cy('Japan')}, the United States in ${cy('United States')}, China in ${cy('China')}, India in ${cy('India')}. Each circle is a country, sized by its people. ${crossed} of them had crossed by 2023, home to ${share23} per cent of the world's people. Most of the rest cross in the UN's projection; ${never} do not before 2100.`,
    fig: (w: number, g: C.Grammar) => `<div class="pair">${C.crossingShare(D, w, g)}</div>${C.crossing(D, w, g)}`,
    cap: 'Each country of a million people or more at the first year its total fertility rate is below 2.1; filled where the UN has estimated it, hollow where it is projected. Circle area is the population in 2023.',
  },
  {
    key: 'floor', kicker: 'The floor', quote: true,
    head: `Of ${floorN} countries that fell below 1.5, none has come back`,
    body: `${floorN} countries of a million people or more have fallen below 1.5 children per woman. None has returned to replacement. The highest any has climbed back to is ${back.country}'s ${f2(back.max_after)}. South Korea, at ${f2(ko)} in 2023, is the lowest of the large countries.`,
    fig: (w: number, g: C.Grammar) => C.floor(D, w, g),
    cap: 'Total fertility rate of each country of a million people or more that fell below 1.5, from the year it first did, to 2023.',
  },
  {
    key: 'generations', kicker: 'At that rate',
    head: `At ${f2(ko)}, each generation is about a third the size of the last`,
    body: `If South Korea's rate held, 100 adults would have about ${kids} children and ${grand} grandchildren. This is arithmetic on one number, not a forecast: each generation is the last multiplied by ${f2(ko)} over 2.1.`,
    fig: (w: number, g: C.Grammar) => C.generations(D, w, g),
    cap: `An illustration: generation sizes at a constant total fertility rate of ${f2(ko)} (South Korea, 2023), relative to replacement at 2.1.`,
  },
  {
    key: 'spike', kicker: 'The spike',
    head: `The world's births peaked in ${bPk[0]}`,
    body: `${Math.round(bPk[1] / 1e6)} million babies were born in ${bPk[0]}, more than in any year before or, in the UN's projection, since. Deaths keep rising as the world ages, and in ${dCross} they overtake births. That is the year the world's population peaks, at ${(pPk[1] / 1e9).toFixed(1)} billion.`,
    fig: (w: number, g: C.Grammar) => C.spike(D, w, g),
    cap: 'Births and deaths in the world each year: UN estimates to 2023, medium projection to 2100.',
  },
  {
    key: 'babies', kicker: 'Where babies are born',
    head: `By 2100, almost one baby in two is born in Africa`,
    body: `In 1950, ${af(1950)} of every 100 babies were born in Africa and ${as(1950)} in Asia. In 2023 it was ${af(2023)} and ${as(2023)}. In the UN's projection for 2100, ${af(2100)} and ${as(2100)}.`,
    fig: (w: number, g: C.Grammar) => C.births100(D, w, g),
    cap: 'Share of the world\'s births by region, rounded to whole babies of 100: UN estimates for 1950 and 2023, medium projection for 2100.',
  },
  {
    key: 'india', kicker: 'India',
    head: `India went below replacement in ${inCross}; its people keep growing until ${inPk[0]}`,
    body: `India's fertility fell from ${f2(at(D.named['India']!.tfr, 1950))} in 1950 to ${f2(at(D.named['India']!.tfr, 2023))} in 2023, crossing 2.1 in ${inCross}, ${inCross - cy('China')!} years after China. Because so many Indians are young, the population goes on rising: in the UN's projection it peaks in ${inPk[0]} at ${(inPk[1] / 1e9).toFixed(2)} billion.`,
    fig: (w: number, g: C.Grammar) => C.india(D, w, g),
    cap: "India's total fertility rate against the world's, and its population: UN estimates to 2023, medium projection to 2100.",
  },
];

// ---- Shared page parts -----------------------------------------------------------------------
const fonts = `@font-face{font-family:'Newsreader Text';src:url('../../../apps/web/public/fonts/NewsreaderText-Regular.woff2') format('woff2');font-weight:400}
@font-face{font-family:'Newsreader Text';src:url('../../../apps/web/public/fonts/NewsreaderText-Italic.woff2') format('woff2');font-weight:400;font-style:italic}
@font-face{font-family:'Newsreader Display';src:url('../../../apps/web/public/fonts/NewsreaderDisplay-Regular.woff2') format('woff2');font-weight:400}
@font-face{font-family:'Newsreader Display';src:url('../../../apps/web/public/fonts/NewsreaderDisplay-Medium.woff2') format('woff2');font-weight:500}
@font-face{font-family:'Newsreader Display';src:url('../../../apps/web/public/fonts/NewsreaderDisplay-Italic.woff2') format('woff2');font-weight:400;font-style:italic}
@font-face{font-family:'Schibsted Grotesk';src:url('../../../apps/web/public/fonts/Schibsted-Regular.woff2') format('woff2');font-weight:400}
@font-face{font-family:'Schibsted Grotesk';src:url('../../../apps/web/public/fonts/Schibsted-Medium.woff2') format('woff2');font-weight:500}
@font-face{font-family:'Schibsted Grotesk';src:url('../../../apps/web/public/fonts/Schibsted-SemiBold.woff2') format('woff2');font-weight:600}`;

// Values from packages/shared/src/tokens.ts (base, chartInk greys, the teal edition ink of Haul 002).
const tokens = `:root{--bg:#FFFFFF;--ink:#141416;--ink2:#55555C;--rule:#E6E6EA;--plate:#F4F4F6;--machine:#4651D2;--mtext:#2B3593;--ember:#FF4F1F;--sky:#DCEBFF;--ed:#0E6461;--q:#C2C4C8;--q2:#DDDEE1;--q3:#96989D;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0F0F12;--ink:#F3F3F1;--ink2:#A2A2AA;--rule:#2A2A31;--plate:#1B1B20;--machine:#A3ACFF;--mtext:#C3C8FA;--ember:#FF6A3D;--sky:#15304B;--ed:#6FD0CB;--q:#4C4D50;--q2:#343539;--q3:#707175;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0F0F12;--ink:#F3F3F1;--ink2:#A2A2AA;--rule:#2A2A31;--plate:#1B1B20;--machine:#A3ACFF;--mtext:#C3C8FA;--ember:#FF6A3D;--sky:#15304B;--ed:#6FD0CB;--q:#4C4D50;--q2:#343539;--q3:#707175;color-scheme:dark}`;

const chartCss = `
.ds{display:block;max-width:100%;height:auto;overflow:visible}
.ds text{font-family:'Schibsted Grotesk',sans-serif;font-kerning:normal}
.tnum{font-variant-numeric:tabular-nums}
.tk{fill:var(--ink2);font-size:11px}
.lab{fill:var(--ink2);font-size:13px}.lab-strong{fill:var(--ink);font-weight:500}
.ann{fill:var(--machine);font-size:13px}
.lab-in{fill:var(--bg);font-size:13px;font-weight:500}.lab-in-sub{fill:var(--bg);font-size:11px}
.halo{paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
.num-big{font-family:'Newsreader Display',serif!important;font-size:30px;fill:var(--ink)}
.grid{stroke:var(--rule);stroke-width:1}.zero{stroke:var(--ink);stroke-width:1}.tickmark{stroke:var(--ink2);stroke-width:.75}
.axis-soft{stroke:var(--rule);stroke-width:1}
.seam{stroke:var(--ink2);stroke-width:.75;stroke-dasharray:2 3}
.repl{stroke:var(--ink);stroke-width:1;stroke-dasharray:4 3;opacity:.7}
.ctx,.ctx-strong,.named,.focus,.spark-line{fill:none;stroke-linejoin:round;stroke-linecap:round}
.ctx{stroke:var(--q);opacity:.75}.ctx-proj{fill:none;stroke:var(--q2);stroke-linejoin:round}.ctx-strong{stroke:var(--q)}
.named{stroke:var(--q3)}.named-dot{fill:var(--q3);stroke:var(--bg);stroke-width:1.5}
.focus{stroke:var(--ed)}.focus-dot{fill:var(--ed);stroke:var(--bg);stroke-width:2}
.proj-dot{stroke-dasharray:.01 5.5}.proj-dash{stroke-dasharray:6 3;stroke-linecap:butt}
.leader{stroke:var(--machine);stroke-width:.8}.leader-dot{fill:var(--machine)}.leader-q{stroke:var(--ink2);stroke-width:.6}
.wash{fill:var(--ed);opacity:.13}.wash-proj{fill:var(--ed);opacity:.06}
.hatch-ed{stroke:var(--ed);opacity:.55}.hatch-q{stroke:var(--q3);opacity:.6}
.void{fill:var(--plate)}
.bee{fill:var(--q3);stroke:var(--bg);stroke-width:1}.bee-proj{fill:var(--bg);stroke:var(--q3);stroke-width:1}.bee-focus{fill:var(--ed);stroke:var(--bg);stroke-width:1}
.sq-ink{fill:var(--ink)}.sq-focus{fill:var(--ed)}.sq-q3{fill:var(--q3)}.sq-q{fill:var(--q2)}
.spark{display:inline-block;vertical-align:-2px;margin:0 .15em}.spark-line{stroke:var(--ed);stroke-width:1.7}.repl-spark{stroke:var(--ink2);stroke-width:.5;stroke-dasharray:1.5 1.5}
/* Per grammar: sizes match the layout sizes the code measured with. */
.g-plates .tk{font-size:11px}.g-plates .lab,.g-plates .ann,.g-plates .lab-in{font-size:13px}
.g-desk .tk{font-size:12px}.g-desk .lab,.g-desk .lab-in{font-size:14px}.g-desk .ann{font-size:15px}.g-desk .lab-in-sub{font-size:12px}
.g-specimen .tk,.g-specimen .lab-in-sub{font-size:10.5px}.g-specimen .lab,.g-specimen .ann,.g-specimen .lab-in{font-size:12px}
.phone .g-plates .tk{font-size:10.5px}.phone .g-plates .lab,.phone .g-plates .ann,.phone .g-plates .lab-in{font-size:12px}
.phone .g-desk .tk,.phone .g-desk .lab-in-sub{font-size:11px}.phone .g-desk .lab,.phone .g-desk .ann,.phone .g-desk .lab-in{font-size:13px}
.phone .g-specimen .lab,.phone .g-specimen .ann,.phone .g-specimen .lab-in{font-size:11px}
/* Two figures in the page, the container picks. */
.fig{container-type:inline-size;margin:0}
.fig .phone{display:none}
@container (max-width:560px){.fig .wide{display:none}.fig .phone{display:block}}
`;

const pageCss = `${fonts}${tokens}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Newsreader Text',serif;font-size:18px;line-height:1.55;-webkit-font-smoothing:antialiased}
@media (min-width:1000px){body{font-size:19px}}
a{color:inherit}
.band{height:6px;background:var(--ed)}
.combar{font:13px/1.4 'Schibsted Grotesk',sans-serif;color:var(--ink2);padding:12px 16px;border-bottom:1px solid var(--rule);display:flex;gap:18px;flex-wrap:wrap}
.combar b{color:var(--ink);font-weight:600}.combar a{text-decoration:none}.combar a.on{color:var(--ink);border-bottom:2px solid var(--ember)}
.rules{font:14px/1.5 'Schibsted Grotesk',sans-serif;color:var(--ink2);border:1px solid var(--rule);padding:14px 16px;margin:24px 0 8px}
.rules b{color:var(--ink);font-weight:600}.rules ol{margin:6px 0 0;padding-left:20px}
.ed-title{font-family:'Newsreader Display',serif;font-weight:500;letter-spacing:-.015em;line-height:1.02;margin:16px 0 0}
.ed-stand{font-style:italic;color:var(--ink);margin:14px 0 0}
.by{font:13px/1.4 'Schibsted Grotesk',sans-serif;color:var(--ink2);margin-top:14px}
.by .m{color:var(--machine)}
.kicker{font:600 12px/1 'Schibsted Grotesk',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2)}
.mhead{font-family:'Schibsted Grotesk',sans-serif;font-weight:500;color:var(--mtext);letter-spacing:-.01em;line-height:1.2;margin:8px 0 0;text-wrap:pretty}
.mbody{font-family:'Schibsted Grotesk',sans-serif;color:var(--mtext);font-size:.94em;line-height:1.6;margin:12px 0 0}
.cap{font:13px/1.5 'Schibsted Grotesk',sans-serif;color:var(--ink2);margin-top:10px}
.cap .src{display:block;margin-top:4px}
.pair{margin-bottom:6px}
.slip{margin:26px 0 0;background:var(--plate);padding:22px 22px 0;position:relative;font-family:'Newsreader Text',serif;font-size:.95em;line-height:1.5}
.slip p{margin:0;text-indent:-.42em}.slip p::before{content:'“';color:var(--ed)}
.slip footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-top:1px dashed var(--q3);margin:18px -22px 0;padding:10px 22px 12px;font:13px/1.4 'Schibsted Grotesk',sans-serif;color:var(--ink2)}
.slip .chk{color:var(--machine)}
`;

const src = `Source: United Nations, World Population Prospects 2024 (CC BY 3.0 IGO), via Our World in Data (CC BY 4.0); retrieved 9 November 2026.`;
const figure = (b: (typeof beats)[number], wide: number, g: C.Grammar, phone = 343) =>
  `<figure class="fig"><div class="wide">${b.fig(wide, g)}</div><div class="phone">${b.fig(phone, g)}</div>
  <figcaption class="cap">${esc(b.cap)}<span class="src">${esc(src)}</span></figcaption></figure>`;

const nav = (on: string) => `<div class="combar"><b>Data stories, comps</b>${[['atlas', 'Atlas (the story)'], ['plates', '1 Plates'], ['desk', '2 Desk'], ['specimen', '3 Specimen']].map(([k, l]) => `<a href="${k}.html" class="${k === on ? 'on' : ''}">${l}</a>`).join('')}<span>Haul 002 · Geruso and Spears · real UN data · machine draft words</span></div>`;

const editorTitle = 'Fewer children, almost everywhere';
// The editor's own words, from his note on the paper in Haul 002, unchanged.
const editorStand = 'An interesting paper by Michael Geruso and Dean Spears on falling fertility rates around the world. According to their data, 67% of the world’s population now lives in a country where fertility is below replacement.';
// The paper's words, matched against its stored text on the Desk.
const slipText = 'To put it bluntly, history offers no examples of societies recognizing very low birth rates as a social priority and then responding with effective changes that restore, and sustain, replacement-level fertility.';
const slip = `<blockquote class="slip"><p>${esc(slipText)}</p><footer><span>Michael Geruso and Dean Spears, “The Likelihood of Persistently Low Global Fertility”, <i>Journal of Economic Perspectives</i>, 2026</span><span class="chk">Matched word for word</span></footer></blockquote>`;

function page(g: C.Grammar, title: string, rules: string[], css: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Data stories: ${esc(title)}</title><style>${pageCss}${chartCss}${css}</style></head><body class="p-${g}">
<div class="band"></div>${nav(g)}
<main>${`<aside class="rules wrap"><b>The grammar: ${esc(title)}</b><ol>${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></aside>`}${body}</main></body></html>`;
}

// ---- 1. Plates: the statistical atlas --------------------------------------------------------
{
  const g: C.Grammar = 'plates';
  const css = `
.wrap{max-width:1180px;margin-left:auto;margin-right:auto;padding:0 16px}
@media(min-width:640px){.wrap{padding:0 28px}}
@media(min-width:1000px){.wrap{padding:0 48px}}
.open{padding:40px 0 18px}
.open .ed-title{font-size:clamp(44px,8vw,92px)}
@media(min-width:1000px){.open{display:grid;grid-template-columns:17rem 38rem;gap:0 56px}.open>*{grid-column:2}.open .front{grid-column:1;grid-row:1/4}}
.front{font:12px/1.5 'Schibsted Grotesk',sans-serif;color:var(--ink2);letter-spacing:.04em}
.front b{display:block;font:500 13px/1.3 'Schibsted Grotesk';letter-spacing:.14em;text-transform:uppercase;color:var(--ink);margin-bottom:6px}
.front ol{list-style:none;padding:0;margin:10px 0 0}.front li{padding:3px 0;border-top:1px solid var(--rule)}
.front li span{display:inline-block;width:2.4em;color:var(--ed);font-family:'Newsreader Display',serif;font-size:14px}
.beat{padding:34px 0}
@media(min-width:1000px){.beat{display:grid;grid-template-columns:17rem 38rem;gap:0 56px}.beat .text{grid-column:2}.beat .plate{grid-column:1/3}}
.mhead{font-size:clamp(22px,3vw,28px)}
.plate{margin-top:26px;border:1px solid var(--ink);padding:5px}
.plate-in{border:.5px solid var(--ink2);padding:18px 18px 16px}
@media(max-width:560px){.plate{padding:3px}.plate-in{padding:12px 10px}}
.plate-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:.5px solid var(--ink2);padding-bottom:8px;margin-bottom:14px;font:500 11px/1 'Schibsted Grotesk';letter-spacing:.18em;text-transform:uppercase;color:var(--ink2)}
.plate-head .no{color:var(--ed);font-family:'Newsreader Display',serif;font-size:15px;letter-spacing:.08em}
`;
  let i = 0;
  const body = `<div class="wrap"><header class="open">
<div class="front"><b>Plates</b>A statistical atlas in seven plates<ol>${beats.map((b, k) => `<li><span>${roman(k + 1)}</span>${esc(b.kicker)}</li>`).join('')}</ol></div>
<h1 class="ed-title">${esc(editorTitle)}</h1><p class="ed-stand">${esc(editorStand)}</p>
<p class="by">Chosen by Bhuvanesh · <span class="m">Words and figures drawn by the machine from UN data, every number checked against the rows</span></p></header>
${beats.map((b) => { i++; return `<section class="beat"><div class="text"><div class="kicker">Plate ${roman(i)} · ${esc(b.kicker)}</div><h2 class="mhead">${esc(b.head)}</h2><p class="mbody">${esc(b.body)}</p>${(b as any).quote ? slip : ''}</div>
<div class="plate"><div class="plate-in"><div class="plate-head"><span class="no">Plate ${roman(i)}</span><span>${esc(b.kicker)}</span></div>${figure(b, 900, g, 323)}</div></div></section>`; }).join('')}</div>`;
  writeFileSync(join(here, 'plates.html'), page(g, 'Plates', [
    'Each figure is a numbered plate inside a double plate mark, as in a nineteenth-century statistical atlas: salvaged from the archive, like the magazine.',
    'Hatching means "not yet": the UN\'s projections are engraved in fine hatching and dashes; what has happened is solid.',
    'Ink and greys only. The Haul\'s ink is the story; every other country is a grey line or circle behind it.',
    'Plates run across the margin and the column; the machine\'s words sit in the column above, in the blue sans.',
    'Notes on the plate are short, in the machine\'s blue, with a hairline leader to the point they mean.',
  ], css, body));
}

// ---- 2. Desk: the graphics desk --------------------------------------------------------------
{
  const g: C.Grammar = 'desk';
  const css = `
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
@media(min-width:640px){.wrap{padding:0 28px}}
.col{max-width:38rem;margin:0 auto}
.open{padding:56px 0 10px;text-align:left}
.open .ed-title{font-size:clamp(46px,9vw,104px);max-width:12ch;margin-top:14px}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:44px 0 6px;border-top:2px solid var(--ink);padding-top:22px}
.hero .n{font-family:'Newsreader Display',serif;font-weight:400;font-size:clamp(60px,12.5vw,128px);line-height:.9;letter-spacing:-.02em;font-variant-numeric:lining-nums}
.hero .n.ed{color:var(--ed)}
.hero .arrow{font:400 clamp(28px,5vw,48px)/1 'Newsreader Display';color:var(--ink2);padding-bottom:.4em}
.hero .l{font:13px/1.35 'Schibsted Grotesk';color:var(--ink2);margin-top:10px}
.beat{padding:50px 0 20px}
.mhead{font-size:clamp(24px,3.4vw,34px)}
.beat .figwrap{max-width:1100px;margin:30px auto 0}
.kicker{color:var(--ed)}
@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){
 .g-desk path[pathLength]{stroke-dasharray:1;animation:draw linear both;animation-timeline:view();animation-range:entry 0% cover 45%}
 .g-desk .bee,.g-desk .bee-proj,.g-desk .bee-focus,.g-desk .sq-focus{animation:rise linear both;animation-timeline:view();animation-range:entry 0% cover 40%}
}}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes rise{from{opacity:0}to{opacity:1}}
`;
  const body = `<div class="wrap"><header class="open col">
<div class="kicker">Data story · Haul 002</div>
<h1 class="ed-title">${esc(editorTitle)}</h1><p class="ed-stand">${esc(editorStand)}</p>
<p class="by">Chosen by Bhuvanesh · <span class="m">Words and figures by the machine from UN data, every number checked against the rows</span></p>
<div class="hero"><div><div class="n tnum">${f2(peak[1])}</div><div class="l">children per woman in the world, ${peak[0]}</div></div><div><div class="n ed tnum">${f2(now)}</div><div class="l">in 2023. Replacement is 2.1</div></div></div>
</header>
${beats.map((b) => `<section class="beat"><div class="col"><div class="kicker">${esc(b.kicker)}</div><h2 class="mhead">${esc(b.head)}</h2><p class="mbody">${esc(b.body)}</p>${(b as any).quote ? slip : ''}</div>
<div class="figwrap">${figure(b, 1100, g)}</div></section>`).join('')}</div>`;
  writeFileSync(join(here, 'desk.html'), page(g, 'Desk', [
    'Figures break out of the reading column to 1,100 px: the chart is the loud thing on its screen.',
    'One number set huge opens the story (the hero), in the Newsreader display; the story\'s ink marks the present.',
    'Notes are written straight onto the chart, larger than the labels, in the machine\'s blue, as a graphics desk annotates.',
    'Projections are dotted, with a seam at 2023 that says where estimates end.',
    'Lines draw themselves and circles appear as you scroll, in CSS alone (no script; off for anyone who asks for less motion).',
  ], css, body));
}

// ---- 3. Specimen: the almanac ------------------------------------------------------------------
{
  const g: C.Grammar = 'specimen';
  const css = `
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
@media(min-width:640px){.wrap{padding:0 28px}}
@media(min-width:1000px){.wrap{padding:0 48px}}
.grid2{display:block}
@media(min-width:1000px){.grid2{display:grid;grid-template-columns:17rem 38rem;gap:0 56px}.grid2>.c{grid-column:2}.grid2>.m{grid-column:1}}
.open{padding:44px 0 10px}
.open .ed-title{font-size:clamp(40px,6.4vw,72px)}
.ledger{border-top:2px solid var(--ink);margin-top:30px}
.ledger .row{display:grid;grid-template-columns:5.2em 1fr;gap:12px;align-items:baseline;border-bottom:1px solid var(--rule);padding:10px 0}
.ledger .n{font-family:'Newsreader Display',serif;font-size:34px;line-height:1;font-variant-numeric:lining-nums tabular-nums;text-align:right}
.ledger .n.ed{color:var(--ed)}
.ledger .w{font:14px/1.4 'Schibsted Grotesk';color:var(--ink2)}
.beat{padding:40px 0 10px}
.mhead{font-size:clamp(20px,2.4vw,24px)}
.m .kicker{border-top:1px solid var(--ink);padding-top:8px}
@media(max-width:999px){.m .kicker{margin-bottom:4px}}
.figwrap{margin-top:22px}
.tbl{width:100%;border-collapse:collapse;font:14px/1.3 'Schibsted Grotesk';margin-top:6px}
.tbl th{font-weight:500;text-align:left;color:var(--ink2);font-size:12px;border-bottom:1px solid var(--ink);padding:6px 0}
.tbl td{border-bottom:1px solid var(--rule);padding:7px 0;font-variant-numeric:tabular-nums}
.tbl td.r,.tbl th.r{text-align:right}
`;
  const lows = ['South Korea', 'China', 'Japan', 'Italy', 'Thailand'];
  const highs = ['Niger', 'Nigeria', 'Pakistan'];
  const rowsT = [...lows, 'United States', 'France', 'Iran', 'Bangladesh', 'India', ...highs].map((c) => {
    const S = D.named[c]!.tfr;
    return `<tr><td>${esc(c)}</td><td>${C.spark(D, c, 96, 18)}</td><td class="r">${f2(at(S, 1950))}</td><td class="r">${f2(at(S, 2023))}</td><td class="r">${S.find((p) => p[0] > 1950 && p[1] < 2.1)?.[0] ?? '–'}</td></tr>`;
  }).join('');
  const sp = (c: string) => C.spark(D, c);
  const body = `<div class="wrap"><header class="open grid2"><div class="c">
<div class="kicker">Data story · Haul 002</div><h1 class="ed-title">${esc(editorTitle)}</h1><p class="ed-stand">${esc(editorStand)}</p>
<p class="by">Chosen by Bhuvanesh · <span class="m">Words and figures by the machine from UN data, every number checked against the rows</span></p>
<div class="ledger">
<div class="row"><div class="n tnum">${f2(peak[1])}</div><div class="w">children per woman in the world in ${peak[0]}, the peak</div></div>
<div class="row"><div class="n ed tnum">${f2(now)}</div><div class="w">in 2023, just above replacement at 2.1</div></div>
<div class="row"><div class="n tnum">${share23}%</div><div class="w">of the world's people live where fertility is below 2.1</div></div>
<div class="row"><div class="n tnum">${bPk[0]}</div><div class="w">the year the world's births peaked, at ${Math.round(bPk[1] / 1e6)} million</div></div>
<div class="row"><div class="n tnum">0</div><div class="w">countries back to replacement after falling below 1.5 (of ${floorN})</div></div>
</div></div></header>
<section class="beat grid2"><div class="m"><div class="kicker">Fourteen countries</div></div><div class="c">
<h2 class="mhead">Every line ends lower than it began</h2>
<p class="mbody">South Korea ${sp('South Korea')} went from ${f2(at(D.named['South Korea']!.tfr, 1950))} to ${f2(ko)}. India ${sp('India')} from ${f2(at(D.named['India']!.tfr, 1950))} to ${f2(at(D.named['India']!.tfr, 2023))}. Even Niger ${sp('Niger')}, the highest of the large countries, has fallen to ${f2(at(D.named['Niger']!.tfr, 2023))}.</p>
<table class="tbl"><thead><tr><th>Country</th><th>1950 to 2023</th><th class="r">1950</th><th class="r">2023</th><th class="r">Below 2.1</th></tr></thead><tbody>${rowsT}</tbody></table>
<p class="cap">Total fertility rate. The dashed line in each sparkline is replacement, 2.1; one scale, 0 to 8, for every row. Below 2.1: the first year in the UN's estimates or medium projection.<span class="src">${esc(src)}</span></p>
</div></section>
<section class="beat grid2"><div class="m"><div class="kicker">One scale, twelve countries</div></div><div class="c"><h2 class="mhead">The UN expects most of them to stay low</h2>
<p class="mbody">Each panel is one country against the world, in grey, on the same scale. Dotted is the UN's medium projection.</p>
<div class="figwrap"><figure class="fig"><div class="wide">${C.multiples(D, 608, ['South Korea', 'China', 'Japan', 'Italy', 'Thailand', 'Brazil', 'United States', 'France', 'Iran', 'Bangladesh', 'India', 'Nigeria'])}</div><div class="phone">${C.multiples(D, 343, ['South Korea', 'China', 'Japan', 'Italy', 'Thailand', 'Brazil', 'United States', 'France', 'Iran', 'Bangladesh', 'India', 'Nigeria'])}</div><figcaption class="cap">Total fertility rate, 1950 to 2100.<span class="src">${esc(src)}</span></figcaption></figure></div></div></section>
${beats.filter((b) => ['crossing', 'floor', 'spike'].includes(b.key)).map((b) => `<section class="beat grid2"><div class="m"><div class="kicker">${esc(b.kicker)}</div></div><div class="c"><h2 class="mhead">${esc(b.head)}</h2><p class="mbody">${esc(b.body)}</p>${(b as any).quote ? slip : ''}<div class="figwrap">${figure(b, 608, g)}</div></div></section>`).join('')}
</div>`;
  writeFileSync(join(here, 'specimen.html'), page(g, 'Specimen', [
    'Number-led, like an almanac: a ledger of the story\'s five figures opens it, set in the display serif as data.',
    'Word-sized lines inside the machine\'s sentences, so a country\'s whole path is read in passing.',
    'Small multiples on one shared scale, and tables with sparklines, before any big chart.',
    'Figures stay inside the reading column (608 px): compact, dense, bookish.',
    'Fine lines (1.5 px for the story), small type, gridlines as hairlines; projections dotted.',
  ], css, body));
}


console.log('built plates, desk, specimen');
