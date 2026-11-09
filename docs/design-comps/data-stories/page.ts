// The story page, drawn by the codified grammar (packages/shared/src/stories): atlas.html (the
// fertility story, as the website would set it) and inks.html (plates in all eight edition inks,
// light and dark). Colours come from the website's own token CSS; the SVG is the scene with its
// colours as classes, as Chart.astro sets a chart.
// node_modules/.bin/esbuild docs/design-comps/data-stories/page.ts --bundle --platform=node --format=esm --outfile=docs/design-comps/data-stories/.page.mjs && node docs/design-comps/data-stories/.page.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupTransform, nodeAttrs, type Scene, type SceneNode } from '../../../packages/shared/src/charts/scene';
import { citable, drawFigure, drawKey, plateWidth, untraced, validateStory, type Figure, type Plate, type Story } from '../../../packages/shared/src/stories';
import type { Gallery } from '../../../packages/shared/src/stories/forms/gallery.fixture';
import { slopeFixture } from '../../../packages/shared/src/stories/forms/slope.fixture';
import { dumbbellFixture } from '../../../packages/shared/src/stories/forms/dumbbell.fixture';
import { barsFixture } from '../../../packages/shared/src/stories/forms/bars.fixture';
import { cascadeFixture } from '../../../packages/shared/src/stories/forms/heatmap.fixture';
import { ridgelineFixture } from '../../../packages/shared/src/stories/forms/ridgeline.fixture';
import { bumpFixture } from '../../../packages/shared/src/stories/forms/bump.fixture';
import { scatterFixture } from '../../../packages/shared/src/stories/forms/scatter.fixture';
import { trailFixture } from '../../../packages/shared/src/stories/forms/trail.fixture';
import { mapFixture } from '../../../packages/shared/src/stories/forms/map.fixture';
import { EDITIONS, editionInk, palettes } from '../../../packages/shared/src/tokens';
import { chartVars } from '../../../packages/shared/src/charts/scene';
import { tokensCss } from '../../../apps/web/src/lib/tokens-css';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const story: Story = JSON.parse(readFileSync(join(root, 'packages/shared/fixtures/stories/fertility.json'), 'utf8'));
const editorText = readFileSync(join(root, 'packages/shared/fixtures/stories/fertility-editor-note.txt'), 'utf8');
const problems = validateStory(story, editorText);
if (problems.length) throw new Error(problems.join('\n'));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function svg(s: Scene, label: string): string {
  const walk = (ns: SceneNode[]): string => ns.map((n) => {
    if (n.t === 'g') { const tr = groupTransform(n); return `<g${tr ? ` transform="${tr}"` : ''}>${walk(n.children)}</g>`; }
    const a = Object.entries(nodeAttrs(n)).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ');
    return n.t === 'text' ? `<text ${a}>${esc(n.text)}</text>` : `<${n.t} ${a}/>`;
  }).join('');
  return `<svg class="ch" viewBox="0 0 ${s.width} ${Math.ceil(s.height)}" width="${s.width}" height="${Math.ceil(s.height)}" role="img" aria-label="${esc(label)}">${walk(s.nodes)}</svg>`;
}
const roman = (k: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'][k - 1]!;

const fonts = ['NewsreaderText-Regular:Newsreader Text:400:normal', 'NewsreaderText-Italic:Newsreader Text:400:italic', 'NewsreaderDisplay-Regular:Newsreader Display:400:normal', 'NewsreaderDisplay-Medium:Newsreader Display:500:normal', 'NewsreaderDisplay-Italic:Newsreader Display:400:italic', 'Schibsted-Regular:Schibsted Grotesk:400:normal', 'Schibsted-Medium:Schibsted Grotesk:500:normal', 'Schibsted-SemiBold:Schibsted Grotesk:600:normal']
  .map((f) => { const [file, fam, w, st] = f.split(':'); return `@font-face{font-family:'${fam}';src:url('../../../apps/web/public/fonts/${file}.woff2') format('woff2');font-weight:${w};font-style:${st};font-display:swap}`; }).join('');

const css = `${fonts}${tokensCss()}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.55 'Newsreader Text',Georgia,serif;-webkit-font-smoothing:antialiased;font-kerning:normal}
@media(min-width:1000px){body{font-size:19px}}
::selection{background:var(--ed);color:var(--bg)}
.band{height:6px;background:var(--ed)}
.combar{font:13px/1.4 'Schibsted Grotesk',sans-serif;color:var(--ink2);padding:12px 16px;border-bottom:1px solid var(--rule);display:flex;gap:18px;flex-wrap:wrap}
.combar b{color:var(--ink);font-weight:600}.combar a{color:inherit;text-decoration:none}.combar a.on{color:var(--ink);border-bottom:2px solid var(--ember)}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
@media(min-width:640px){.wrap{padding:0 28px}}
@media(min-width:1000px){.wrap{padding:0 48px}}
.sans{font-family:'Schibsted Grotesk',system-ui,sans-serif}
.caps{font:600 11px/1.3 'Schibsted Grotesk',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--ink2)}
.grid{display:block}
@media(min-width:1000px){.grid{display:grid;grid-template-columns:17rem 38rem minmax(0,1fr);column-gap:56px}.grid>.m{grid-column:1}.grid>.c{grid-column:2}}

/* Opening */
.open{padding:52px 0 0}
.open .m{grid-row:1/6;padding-top:8px}
.kicker{color:var(--ed)}
.title{font:500 clamp(46px,7.6vw,92px)/.98 'Newsreader Display',serif;letter-spacing:-.022em;margin:18px 0 0}
.stand{font-style:italic;font-size:1.07em;line-height:1.5;margin:20px 0 0;max-width:34em}
.by{font:13px/1.5 'Schibsted Grotesk',sans-serif;color:var(--ink2);margin:16px 0 0}.by .mach{color:var(--machine)}
.contents a{display:grid;grid-template-columns:2.6em 1fr;gap:4px;padding:5px 0;border-top:1px solid var(--rule);color:var(--ink2);text-decoration:none;font:13px/1.35 'Schibsted Grotesk',sans-serif}
.contents a span{color:var(--ed);font:15px/1.2 'Newsreader Display',serif}
.contents .caps{display:block;margin:18px 0 6px;color:var(--ink)}
@media(max-width:999px){.open .m{display:none}}
.ledger{margin:36px 0 0;border-top:2px solid var(--ink)}
.ledger>div{display:grid;grid-template-columns:6.6em 1fr;column-gap:18px;align-items:baseline;padding:13px 0 12px;border-bottom:1px solid var(--rule)}
.ledger b{font:400 clamp(36px,5vw,50px)/.92 'Newsreader Display',serif;letter-spacing:-.015em;font-variant-numeric:lining-nums;text-align:right;white-space:nowrap}
.ledger b.loud{color:var(--ed)}
.ledger span{font:15px/1.4 'Schibsted Grotesk',sans-serif;color:var(--machine-text)}
.ledger-h{margin:34px 0 0}

/* Movements */
.mv{margin:84px 0 0;padding-top:16px;border-top:2px solid var(--ink)}
.mv h2{margin:0;font:400 clamp(30px,3.6vw,44px)/1.08 'Newsreader Display',serif;letter-spacing:-.012em}
.mv h2 i{color:var(--ed);font-style:italic;margin-right:.35em}
@media(min-width:1000px){.mv{display:grid;grid-template-columns:17rem 1fr;column-gap:56px}.mv h2{grid-column:2}.mv .caps{grid-column:1;align-self:end;padding-bottom:8px}}
@media(max-width:999px){.mv .caps{display:block;margin-bottom:6px}}

/* A plate */
.beat{padding:52px 0 0}
@media(min-width:1000px){.beat{display:grid;grid-template-columns:17rem 38rem minmax(0,1fr);column-gap:56px}.beat>.m{grid-column:1;grid-row:1/3}.beat>.c{grid-column:2}.beat>.plate{grid-column:1/3}.beat.fold>.plate{grid-column:1/4}.beat>.after{grid-column:2}}
.no{font:400 46px/1 'Newsreader Display',serif;color:var(--ed);letter-spacing:.01em}
.m .caps{margin-top:10px}
@media(max-width:999px){.beat>.m{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.no{font-size:30px}.beat>.m .his{flex-basis:100%}}
.head{font:500 clamp(22px,2.5vw,27px)/1.2 'Schibsted Grotesk',sans-serif;letter-spacing:-.012em;color:var(--machine-text);margin:0}
@media(max-width:999px){.head{margin-top:10px}}
.body{font:17px/1.62 'Schibsted Grotesk',sans-serif;color:var(--machine-text);margin:12px 0 0}
.his{position:relative;margin:24px 0 0;padding-left:16px;border-left:1px solid var(--rule)}
.his p{margin:0;font:italic 17px/1.47 'Newsreader Text',serif;color:var(--ink)}
.his small{display:block;margin-top:7px;font:13px/1.3 'Schibsted Grotesk',sans-serif;color:var(--ink2)}
.his small b{color:var(--ember);font:italic 600 14px 'Newsreader Text',serif;margin-right:2px}
.his::before{content:'';position:absolute;left:-6px;top:-1px;width:11px;height:9px;background:var(--ember);clip-path:polygon(50% 0,100% 100%,80% 100%,50% 38%,20% 100%,0 100%)}
.slip{margin:28px 0 0;background:var(--plate);padding:22px 22px 0;font:16.5px/1.52 'Newsreader Text',serif;clip-path:polygon(0 6px,3% 0,7% 5px,12% 1px,18% 6px,24% 0,31% 4px,38% 1px,44% 6px,51% 0,57% 5px,64% 1px,70% 6px,77% 0,83% 4px,90% 1px,95% 5px,100% 0,100% 100%,0 100%)}
.slip p{margin:0;text-indent:-.45em}.slip p::before{content:'“';color:var(--ed)}
.slip footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:18px -22px 0;padding:10px 22px 12px;border-top:1px dashed var(--ink2);font:13px/1.4 'Schibsted Grotesk',sans-serif;color:var(--ink2)}
.slip footer span:last-child{color:var(--machine)}

/* The plate: a proof with crop marks */
.plate{position:relative;margin:30px 0 0;padding:20px 24px 16px;border:.5px solid var(--ink2);container-type:inline-size}
.crop{position:absolute;width:14px;height:14px;border-color:var(--ink);border-style:solid;border-width:0}
.crop.tl{left:-21px;top:-21px;border-right-width:.75px;border-bottom-width:.75px}
.crop.tr{right:-21px;top:-21px;border-left-width:.75px;border-bottom-width:.75px}
.crop.bl{left:-21px;bottom:-21px;border-right-width:.75px;border-top-width:.75px}
.crop.br{right:-21px;bottom:-21px;border-left-width:.75px;border-top-width:.75px}
.plate-head{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:9px;border-bottom:.5px solid var(--ink2)}
.plate-head .pn{font:400 16px/1 'Newsreader Display',serif;color:var(--ed);letter-spacing:.06em}
.plate-head .pn small{font:600 10.5px/1 'Schibsted Grotesk',sans-serif;letter-spacing:.18em;color:var(--ink2);margin-right:8px}
.key{margin:12px 0 18px}
.fig .phone{display:none}
@container (max-width:600px){.fig .wide{display:none}.fig .phone{display:block}}
.fig svg,.key svg{display:block;width:100%;height:auto;overflow:visible}
.cap{margin:12px 0 0;font:13px/1.5 'Schibsted Grotesk',sans-serif;color:var(--machine)}
.cap span{color:var(--ink2)}
@media(max-width:640px){
  .plate{margin-left:-16px;margin-right:-16px;padding:14px 16px 12px;border-width:.5px 0}
  .crop.bl,.crop.br{display:none}.crop.tl{left:10px;top:-18px}.crop.tr{right:10px;top:-18px}
}
.after{margin-top:34px}
.coda{border-top:1px solid var(--rule);padding-top:14px}
.coda .row{display:flex;gap:30px;flex-wrap:wrap;margin-top:12px}
.coda .row div{font:15px/1.3 'Schibsted Grotesk',sans-serif;color:var(--ink2)}
.coda .row b{display:block;font:400 52px/1 'Newsreader Display',serif;color:var(--ink);font-variant-numeric:lining-nums}
.coda .row div+div b{color:var(--ed)}
.colophon{margin:96px 0 72px;padding-top:16px;border-top:2px solid var(--ink);font:14px/1.6 'Schibsted Grotesk',sans-serif;color:var(--ink2)}
@media(min-width:1000px){.colophon{display:grid;grid-template-columns:17rem 38rem;column-gap:56px}.colophon>*{grid-column:2}.colophon>.caps{grid-column:1;grid-row:1/9;color:var(--ink)}}
.colophon p{margin:0 0 12px}.colophon .mach{color:var(--machine)}
.colophon ul{margin:0 0 12px;padding-left:18px}
`;

const nav = (on: string) => `<div class="combar"><b>Data stories</b><a href="atlas.html" class="${on === 'atlas' ? 'on' : ''}">The fertility story</a><a href="gallery.html" class="${on === 'gallery' ? 'on' : ''}">Gallery of forms</a><a href="inks.html" class="${on === 'inks' ? 'on' : ''}">Ink specimen</a><a href="plates.html">First drafts</a><span>Drawn by packages/shared/src/stories · title is a placeholder</span></div>`;
const head = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head>`;

function plateHtml(p: Plate, n: number): string {
  const wide = drawFigure(p.figure, 'wide', p.fold), phone = drawFigure(p.figure, 'phone');
  const kw = drawKey(p.figure, 'wide', plateWidth(p, 'wide')), kp = drawKey(p.figure, 'phone', 340);
  const his = p.editorNote ? `<aside class="his"><p>${esc(p.editorNote)}</p><small><b>B.</b> on the paper</small></aside>` : '';
  const quote = p.quote ? `<blockquote class="slip"><p>${esc(p.quote.text)}</p><footer><span>${esc(p.quote.credit)}</span><span>Matched word for word</span></footer></blockquote>` : '';
  const coda = p.coda ? `<div class="after c"><div class="coda"><div class="caps">${esc(p.coda.label)}</div><div class="row">${p.coda.figures.map((f) => `<div><b>${esc(f.value)}</b>${esc(f.text)}</div>`).join('')}</div><p class="body">${esc(p.coda.text)}</p></div></div>` : '';
  // Each maker once, then each redistributor once: "United Nations, Population Division, via Our World in Data".
  const makers = [...new Set(p.sources.map((s) => s.maker))], vias = [...new Set(p.sources.flatMap((s) => (s.via ? [s.via.name] : [])))];
  const src = makers.join('; ') + (vias.length ? `, ${p.sources.every((s) => s.via) ? '' : 'partly '}via ${vias.join(' and ')}` : '');
  return `<section class="beat${p.fold ? ' fold' : ''}" id="${p.key}">
<div class="m"><div class="no">${roman(n)}</div><div class="caps">${esc(p.name)}</div>${his}</div>
<div class="c"><h3 class="head">${esc(p.headline)}</h3><p class="body">${esc(p.body)}</p>${quote}</div>
<figure class="plate fig"><span class="crop tl"></span><span class="crop tr"></span><span class="crop bl"></span><span class="crop br"></span>
<div class="plate-head"><span class="pn"><small>Plate</small>${roman(n)}</span><span class="caps">${esc(p.name)}</span></div>
${kw ? `<div class="key"><div class="wide">${svg(kw, 'Key')}</div><div class="phone">${svg(kp!, 'Key')}</div></div>` : '<div class="key"></div>'}
<div class="wide">${svg(wide, p.caption)}</div><div class="phone">${svg(phone, p.caption)}</div>
<figcaption class="cap">${esc(p.caption)} <span>${esc(src)}.</span></figcaption></figure>${coda}</section>`;
}

{
  const order = story.movements.flatMap((m) => m.plates);
  const num = (k: string) => order.indexOf(k) + 1;
  const byKey = new Map(story.plates.map((p) => [p.key, p]));
  const contents = story.movements.map((m) => `<span class="caps">${m.numeral}. ${esc(m.name)}</span>${m.plates.map((k) => `<a href="#${k}"><span>${roman(num(k))}</span>${esc(byKey.get(k)!.name)}</a>`).join('')}`).join('');
  const sources = [...new Map(story.plates.flatMap((p) => p.sources).map((s) => [`${s.dataset}|${s.via?.url ?? s.url}`, s])).values()];
  const html = `${head('The fertility story')}<body class="e-${story.edition}"><div class="band"></div>${nav('atlas')}
<main class="wrap"><header class="open grid"><div class="m"><nav class="contents">${contents}</nav></div>
<div class="c"><div class="caps kicker">Data story · Haul 002 · ${story.plates.length} plates</div>
<h1 class="title">${esc(story.title)}</h1><p class="stand">${esc(story.standfirst)}</p>
<p class="by">Chosen and annotated by Bhuvanesh · <span class="mach">words and plates by the machine, from UN data; every figure checked against the rows</span></p>
<div class="caps ledger-h">The principal figures</div>
<div class="ledger">${story.ledger.map((l) => `<div><b${l.loud ? ' class="loud"' : ''}>${esc(l.value)}</b><span>${esc(l.text)}</span></div>`).join('')}</div></div></header>
${story.movements.map((m) => `<div class="mv"><span class="caps">Movement ${m.numeral}</span><h2><i>${m.numeral}</i>${esc(m.name)}</h2></div>${m.plates.map((k) => plateHtml(byKey.get(k)!, num(k))).join('')}`).join('')}
<footer class="colophon"><span class="caps">How this was made</span>
<p>Sources:</p><ul>${sources.map((s) => `<li>${esc(s.maker)}, <i>${esc(s.dataset)}</i> (${esc(s.licence)})${s.via ? `, via ${esc(s.via.name)} (${esc(s.via.licence)})` : ''}; retrieved ${esc(s.retrieved)}.</li>`).join('')}</ul>
<p class="mach">The machine wrote the words and drew the plates. Every number in the words is read from the stored rows or from a fact worked out from them; the story is refused if one is not. ${story.facts.length} facts, each with its method, travel with the story.</p>
<p>The editor’s notes in the margin are his own, from his note on the paper in Haul 002, found unchanged in his stored text. The paper’s words are matched against its stored text.</p></footer></main></body></html>`;
  writeFileSync(join(here, 'atlas.html'), html);
}

// The ink specimen: the fall and the floor's phone plates in every edition, light and dark.
{
  const dark = [`--bg:${palettes.dark.bg}`, `--ink:${palettes.dark.ink}`, `--ink2:${palettes.dark.ink2}`, `--rule:${palettes.dark.rule}`, `--plate:${palettes.dark.plate}`, `--machine:${palettes.dark.machine}`, `--machine-text:${palettes.dark.machineText}`, ...EDITIONS.map((e) => `--ed-${e}:${editionInk.dark[e]}`), chartVars('dark')].join(';');
  const light = [`--bg:${palettes.light.bg}`, `--ink:${palettes.light.ink}`, `--ink2:${palettes.light.ink2}`, `--rule:${palettes.light.rule}`, `--plate:${palettes.light.plate}`, `--machine:${palettes.light.machine}`, `--machine-text:${palettes.light.machineText}`, ...EDITIONS.map((e) => `--ed-${e}:${editionInk.light[e]}`), chartVars('light')].join(';');
  const pick = ['fall', 'peak'].map((k) => story.plates.find((p) => p.key === k)!);
  const cells = (['light', 'dark'] as const).flatMap((sch) => EDITIONS.map((e) => `<div class="cell th-${sch} e-${e}"><div class="cell-h"><span>${e}</span><span>${sch}</span></div>${pick.map((p) => svg(drawFigure(p.figure, 'phone'), p.caption)).join('')}</div>`)).join('');
  const html = `${head('Ink specimen')}<body class="e-teal"><style>
.th-dark{${dark}}.th-light{${light}}
.cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:28px 0 60px}
.cell{background:var(--bg);color:var(--ink);padding:14px;border:.5px solid var(--rule)}
.cell svg{display:block;width:100%;height:auto;margin-top:10px}
.cell-h{display:flex;justify-content:space-between;font:600 11px/1 'Schibsted Grotesk',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--ed)}
.intro{font:15px/1.5 'Schibsted Grotesk',sans-serif;color:var(--ink2);max-width:46em;margin-top:24px}
</style><div class="band"></div>${nav('inks')}<main class="wrap"><p class="intro">The same two plates in each of the eight edition inks, light and dark. Every colour is a role (the story's ink, the greys, the machine's blue) read from the tokens; nothing is chosen per plate. Each ink is tested: the story line against the ground, text set on the ink, the hatching.</p><div class="cells">${cells}</div></main></body></html>`;
  writeFileSync(join(here, 'inks.html'), html);
}

// The gallery: every form in the grammar, each drawn from real rows, wide and phone.
{
  const g: Gallery = JSON.parse(readFileSync(join(root, 'packages/shared/fixtures/stories/gallery.json'), 'utf8'));
  const from = (k: string) => story.plates.find((p) => p.key === k)!;
  const map = mapFixture(g);
  const cascade = cascadeFixture(g), bars = barsFixture(g), bump = bumpFixture(g);
  const entries: { name: string; use: string; figure: Figure; caption: string; fold?: boolean; facts?: { key: string; value: number; method: string }[] }[] = [
    { name: 'Lines', use: 'Change over time, with every other member for shape, the source’s projection dashed and its ranges hatched, references and named zones; one or more panels on one time axis.', figure: from('fall').figure, caption: from('fall').caption },
    { name: 'Swarm', use: 'Every member placed at the moment something happened to it, sized by its weight; a step panel above on the same time scale. The fold-out form.', figure: from('crossing').figure, caption: from('crossing').caption, fold: true },
    { name: 'Heatmap', use: 'A value for every member and every year at once, on a diverging ramp turned on a meaningful midpoint; members grouped and ordered by when something happened.', figure: cascade, caption: `Total fertility rate of the ${cascade.rows.length} most populous countries, each year, ordered by when it fell below 2.1.`, facts: [{ key: 'rows', value: cascade.rows.length, method: 'Countries on the heatmap.' }] },
    { name: 'Map', use: 'A value for every country, binned on the same ramp; India drawn as India depicts its boundaries; no data in quiet grey.', figure: map, caption: `Total fertility rate in 2023.${map.unmapped.length ? ` Not on the map: ${map.unmapped.join(', ')}.` : ''}` },
    { name: 'Scatter', use: 'Two measures together, each circle a member sized by its weight, the members the words name labelled on the plot.', figure: scatterFixture(g), caption: 'Median age against total fertility rate in 2023; circle area is population.' },
    { name: 'Trail', use: 'How a few members moved through two measures over time: a path each, a dot every ten years, the projection dashed.', figure: trailFixture(g), caption: 'Median age against total fertility rate, 1950 to 2023, and the UN projection to 2100.' },
    { name: 'Ridgeline', use: 'How a distribution shifts: one density a moment on one height scale, its median marked, the projected moment hatched.', figure: ridgelineFixture(g), caption: 'Total fertility rate across countries in six years; the last is the UN projection.' },
    { name: 'Slope', use: 'Change between two moments for a dozen or so members, labels spread so none collide.', figure: slopeFixture(g), caption: 'Total fertility rate in 1990 and 2023.' },
    { name: 'Dumbbell', use: 'Two values for each member, then (a ring) and now (a dot), sorted by now.', figure: dumbbellFixture(g), caption: 'Total fertility rate in 1970 and 2023.' },
    { name: 'Bars', use: 'Amounts ranked, from zero, values at the tips, a reference where the words need one.', figure: bars, caption: `The ${bars.bars.length} lowest total fertility rates in 2023, with the world’s.`, facts: [{ key: 'bars', value: bars.bars.length, method: 'Countries on the chart.' }] },
    { name: 'Bump', use: 'Rankings over time: ranks worked out by code among the members shown, names at both ends.', figure: bump, caption: `Rank by population among the ${bump.lines.length} most populous countries of 2023, every ten years.`, facts: [{ key: 'lines', value: bump.lines.length, method: 'Countries ranked.' }, { key: 'step', value: 10, method: 'Years between ranks.' }] },
    { name: 'Multiples', use: 'The same measure for a few members on one shared scale, each against a grey reference.', figure: from('twelve').figure, caption: from('twelve').caption },
    { name: 'Stack', use: 'Shares of a whole over time, adding to 100, the projected years hatched.', figure: from('regions').figure, caption: from('regions').caption },
    { name: 'Pyramid', use: 'A population by age and sex, now in the ink and a later year as a silhouette over it.', figure: from('pyramid').figure, caption: from('pyramid').caption },
  ];
  // Every figure in a caption must be in the figure's own rows.
  for (const e of entries) {
    const nums = citable({ facts: [{ key: 'replacement', value: 2.1, method: 'Replacement fertility, a definition.' }, ...(e.facts ?? [])], plates: [{ figure: e.figure } as Plate] } as unknown as Story);
    const bad = untraced(e.caption, nums);
    if (bad.length) throw new Error(`Gallery "${e.name}": ${bad.join(', ')} not in its rows`);
  }
  const card = (e: (typeof entries)[number], n: number) => {
    const p = { fold: e.fold } as Plate;
    const wide = drawFigure(e.figure, 'wide', e.fold), phone = drawFigure(e.figure, 'phone');
    const kw = drawKey(e.figure, 'wide', plateWidth(p, 'wide')), kp = drawKey(e.figure, 'phone', 340);
    return `<section class="beat${e.fold ? ' fold' : ''}" id="f-${e.figure.form}">
<div class="m"><div class="no">${roman(n) ?? n}</div><div class="caps">${esc(e.name)}</div><p class="gx-form">${esc(e.figure.form)}</p></div>
<div class="c"><p class="body gx-use">${esc(e.use)}</p></div>
<figure class="plate fig"><span class="crop tl"></span><span class="crop tr"></span><span class="crop bl"></span><span class="crop br"></span>
<div class="plate-head"><span class="pn"><small>Form</small>${esc(e.name)}</span><span class="caps">${esc(e.figure.form)}</span></div>
${kw ? `<div class="key"><div class="wide">${svg(kw, 'Key')}</div><div class="phone">${svg(kp!, 'Key')}</div></div>` : '<div class="key"></div>'}
<div class="wide">${svg(wide, e.caption)}</div><div class="phone">${svg(phone, e.caption)}</div>
<figcaption class="cap">${esc(e.caption)} <span>United Nations, World Population Prospects 2024, via Our World in Data.</span></figcaption></figure></section>`;
  };
  const html = `${head('Gallery of forms')}<body class="e-${story.edition}"><style>.gx-form{font:12px/1.3 'DM Mono',ui-monospace,monospace;color:var(--ink2);margin:6px 0 0}.gx-use{color:var(--ink2)}.no{font-size:30px}.gx-end{height:80px}</style><div class="band"></div>${nav('gallery')}
<main class="wrap"><header class="open grid"><div class="c"><div class="caps kicker">Data stories · the grammar’s forms</div><h1 class="title">A gallery of forms</h1>
<p class="by">Fourteen forms, each drawn by <span class="mach">packages/shared/src/stories</span> from real UN rows, in the plate, the key and the colours every story uses. Every label is placed against the marks; none collide at either width.</p></div></header>
${entries.map((e, i) => card(e, i + 1)).join('')}<div class="gx-end"></div></main></body></html>`;
  writeFileSync(join(here, 'gallery.html'), html);
}
console.log('built atlas.html, gallery.html and inks.html from the story and the gallery');
