// Mock-ups of the data story's own identity: three printed forms (the atlas folio, the blue book,
// the almanac's number), each shown where a reader meets it: the /data index, the story's opening,
// its card in the Haul's contents, and the link from the item it answers (Haul 002's paper).
// node_modules/.bin/esbuild docs/design-comps/data-stories/identity.ts --bundle --platform=node --format=esm --outfile=docs/design-comps/data-stories/.identity.mjs && node docs/design-comps/data-stories/.identity.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawFigure, type Story } from '../../../packages/shared/src/stories';
import { tokensCss } from '../../../apps/web/src/lib/tokens-css';
import { svgOf } from './peek';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const story: Story = JSON.parse(readFileSync(join(root, 'packages/shared/fixtures/stories/fertility.json'), 'utf8'));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plate = (k: string) => story.plates.find((p) => p.key === k)!;
const thumb = svgOf(drawFigure(plate('crossing').figure, 'phone'));
const fallThumb = svgOf(drawFigure(plate('fall').figure, 'phone'));
const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const order = story.movements.flatMap((m) => m.plates);
const share = story.ledger.find((l) => l.value.endsWith('%'))!;

const fonts = ['NewsreaderText-Regular:Newsreader Text:400:normal', 'NewsreaderText-Italic:Newsreader Text:400:italic', 'NewsreaderDisplay-Regular:Newsreader Display:400:normal', 'NewsreaderDisplay-Medium:Newsreader Display:500:normal', 'NewsreaderDisplay-Italic:Newsreader Display:400:italic', 'Schibsted-Regular:Schibsted Grotesk:400:normal', 'Schibsted-Medium:Schibsted Grotesk:500:normal', 'Schibsted-SemiBold:Schibsted Grotesk:600:normal']
  .map((f) => { const [file, fam, w, st] = f.split(':'); return `@font-face{font-family:'${fam}';src:url('../../../apps/web/public/fonts/${file}.woff2') format('woff2');font-weight:${w};font-style:${st}}`; }).join('');

const css = `${fonts}${tokensCss()}
*{box-sizing:border-box}html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.55 'Newsreader Text',Georgia,serif;-webkit-font-smoothing:antialiased}
.band{height:6px;background:var(--ed)}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}@media(min-width:640px){.wrap{padding:0 28px}}@media(min-width:1000px){.wrap{padding:0 48px}}
.sans{font-family:'Schibsted Grotesk',system-ui,sans-serif}
.caps{font:600 11px/1.3 'Schibsted Grotesk',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--ink2)}
.mach{color:var(--machine)}
.dir{border-top:3px solid var(--ink);margin-top:80px;padding-top:18px}
.dir>h1{font:500 clamp(30px,4vw,44px)/1.1 'Newsreader Display',serif;margin:6px 0 0}
.dir>p.why{font:15px/1.55 'Schibsted Grotesk',sans-serif;color:var(--ink2);max-width:44em;margin:10px 0 0}
.where{margin:46px 0 14px;display:flex;gap:12px;align-items:baseline;border-bottom:1px solid var(--rule);padding-bottom:8px}
.where b{font:600 11px/1 'Schibsted Grotesk';letter-spacing:.16em;text-transform:uppercase;color:var(--ink)}
.where span{font:13px/1.3 'Schibsted Grotesk';color:var(--ink2)}
.ch{display:block;width:100%;height:auto}
.nav{display:flex;justify-content:space-between;align-items:center;font:14px 'Schibsted Grotesk';color:var(--ink2);padding:14px 0;border-bottom:1px solid var(--rule)}
.nav i{font-family:'Newsreader Text';font-style:italic;color:var(--ink);font-size:18px}.nav .on{color:var(--ink);border-bottom:2px solid var(--ember)}
.nav span{display:flex;gap:18px}@media(max-width:700px){.nav span{display:none}}
.title{font:500 clamp(42px,7vw,84px)/.98 'Newsreader Display',serif;letter-spacing:-.02em;margin:0}
.stand{font-style:italic;max-width:34em;margin:16px 0 0}
.by{font:13px/1.5 'Schibsted Grotesk';color:var(--ink2);margin-top:12px}

/* ---------- 1. Atlas folio ---------- */
.a-proof{position:relative;border:.5px solid var(--ink2);padding:34px 36px}
.a-proof::before,.a-proof::after,.a-proof>.c2::before,.a-proof>.c2::after{content:'';position:absolute;width:14px;height:14px;border:0 solid var(--ink)}
.a-proof::before{left:-21px;top:-21px;border-right-width:.75px;border-bottom-width:.75px}
.a-proof::after{right:-21px;top:-21px;border-left-width:.75px;border-bottom-width:.75px}
.a-proof>.c2::before{left:-21px;bottom:-21px;border-right-width:.75px;border-top-width:.75px}
.a-proof>.c2::after{right:-21px;bottom:-21px;border-left-width:.75px;border-top-width:.75px}
.a-proof>.c2{position:absolute;inset:0;pointer-events:none}
@media(max-width:600px){.a-proof{padding:20px 16px}}
.a-series{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:space-between;align-items:baseline;border-bottom:.5px solid var(--ink2);padding-bottom:10px;margin-bottom:28px}
.a-series .no{white-space:nowrap;font:400 17px/1 'Newsreader Display';color:var(--ed);letter-spacing:.06em}
.a-series .no small{font:600 10.5px 'Schibsted Grotesk';letter-spacing:.18em;color:var(--ink2);margin-right:8px}
.a-open{display:grid;gap:28px}@media(min-width:900px){.a-open{grid-template-columns:1.25fr 1fr;align-items:end}}
.a-front{margin-bottom:22px}.a-front p{margin:6px 0 0}
.a-contents{font:13px/1.4 'Schibsted Grotesk';color:var(--ink2);border-top:1px solid var(--ink)}
.a-contents div{display:grid;grid-template-columns:2.4em 1fr;padding:5px 0;border-bottom:1px solid var(--rule)}
.a-contents div span{color:var(--ed);font:15px/1.2 'Newsreader Display'}
.a-index-h{display:grid;gap:8px 56px;margin:30px 0 26px}@media(min-width:900px){.a-index-h{grid-template-columns:17rem 1fr}}
.a-index-h h2{font:500 clamp(54px,9vw,112px)/.9 'Newsreader Display';letter-spacing:-.03em;margin:0}
.a-index-h p{font:15px/1.5 'Schibsted Grotesk';color:var(--ink2);margin:0;align-self:end;max-width:30em}
.a-entry{display:grid;gap:24px;padding:26px 0;border-top:1px solid var(--ink)}@media(min-width:800px){.a-entry{grid-template-columns:17rem 1fr 300px}}
.a-entry .meta{font:13px/1.5 'Schibsted Grotesk';color:var(--ink2)}.a-entry .meta b{display:block;font:400 34px/1 'Newsreader Display';color:var(--ed);margin-bottom:8px}
.a-entry h3{font:500 34px/1.05 'Newsreader Display';margin:0}
.a-entry .mv{font:13px/1.6 'Schibsted Grotesk';color:var(--ink2);margin-top:10px}
.a-thumb{position:relative;border:.5px solid var(--ink2);padding:10px;background:var(--bg)}
.a-card{display:grid;gap:18px;max-width:640px}@media(min-width:700px){.a-card{grid-template-columns:1fr 220px}}
.cardhead{display:flex;gap:10px;align-items:baseline;border-top:1px solid var(--rule);padding-top:8px;margin-bottom:8px;font:13px 'Schibsted Grotesk';color:var(--ink2)}
.cardhead b{font:400 22px/1 'Newsreader Display';color:var(--ed)}
.a-cardbody{position:relative;border:.5px solid var(--ink2);padding:18px 20px 16px}
.a-cardbody h4{font:500 30px/1.05 'Newsreader Display';margin:8px 0 0}
.a-cardbody p{font:14px/1.5 'Schibsted Grotesk';color:var(--machine-text);margin:10px 0 0}
.a-link{position:relative;border:.5px solid var(--ink2);padding:16px 18px;display:grid;gap:14px;max-width:38rem}@media(min-width:600px){.a-link{grid-template-columns:150px 1fr}}
.a-link h5{font:500 22px/1.15 'Newsreader Display';margin:4px 0 0}.a-link p{font:13px/1.5 'Schibsted Grotesk';color:var(--ink2);margin:6px 0 0}
.a-link .go{font:14px 'Schibsted Grotesk';color:var(--ink);border-bottom:1px solid var(--ed);display:inline-block;margin-top:10px}

/* ---------- 2. Blue book ---------- */
.b-cloth{background:var(--ed);color:var(--bg);position:relative}
.b-cover{padding:40px 30px 34px;text-align:center;border:1px solid var(--ed);outline:1px solid var(--bg);outline-offset:-8px}
.b-cover .st{font:600 11px/1 'Schibsted Grotesk';letter-spacing:.3em;text-transform:uppercase;opacity:.85}
.b-cover h2{font:500 clamp(34px,5vw,56px)/1.02 'Newsreader Display';letter-spacing:-.01em;margin:18px auto 0;max-width:12em}
.b-cover .rule{width:70px;height:0;border-top:1px solid currentColor;margin:20px auto;opacity:.7}
.b-cover .sub{font:italic 17px/1.4 'Newsreader Text';opacity:.92}
.b-title{text-align:center;padding:46px 0 10px;max-width:46rem;margin:0 auto}
.b-title .st{font:600 12px/1 'Schibsted Grotesk';letter-spacing:.32em;text-transform:uppercase;color:var(--ed)}
.b-title .rules{border-top:3px double var(--ink);border-bottom:3px double var(--ink);padding:26px 0 22px;margin-top:18px}
.b-title .title{font-size:clamp(40px,6.4vw,76px)}
.b-title .comp{font:13px/1.6 'Schibsted Grotesk';color:var(--ink2);margin-top:16px}
.b-seal{width:132px;height:132px;border-radius:50%;border:1.5px solid var(--ed);color:var(--ed);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font:600 9.5px/1.35 'Schibsted Grotesk';letter-spacing:.16em;text-transform:uppercase;transform:rotate(-8deg);margin:22px auto 0;outline:1px solid var(--ed);outline-offset:-6px}
.b-seal b{font:400 30px/1 'Newsreader Display';letter-spacing:0;margin:2px 0}
.b-toc{max-width:34rem;margin:26px auto 0;font:14px/1.45 'Schibsted Grotesk'}
.b-toc div{display:flex;gap:10px;padding:5px 0;border-bottom:1px dotted var(--ink2)}.b-toc div span:first-child{color:var(--ed);width:2.4em;font:15px 'Newsreader Display'}.b-toc div span:last-child{margin-left:auto;color:var(--ink2)}
.b-shelf{display:flex;gap:14px;align-items:flex-end;padding:30px 0 0;border-bottom:4px solid var(--ink);overflow:hidden}
.b-spine{width:74px;height:300px;writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;justify-content:space-between;padding:14px 0;font:500 17px/1 'Newsreader Display';color:var(--bg);background:var(--ed)}
.b-spine small{font:600 10px 'Schibsted Grotesk';letter-spacing:.2em;text-transform:uppercase}
.b-spine.ghost{background:none;border:1px dashed var(--rule);color:var(--ink2)}
.b-index-copy{max-width:36rem}
.b-card{max-width:300px}
.b-link{display:flex;gap:16px;align-items:center;max-width:38rem;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:14px 0}
.b-mini{width:64px;height:88px;flex:none;background:var(--ed);color:var(--bg);display:flex;align-items:center;justify-content:center;text-align:center;font:600 8px/1.3 'Schibsted Grotesk';letter-spacing:.14em;text-transform:uppercase;outline:1px solid var(--bg);outline-offset:-4px}
.b-link h5{font:500 21px/1.15 'Newsreader Display';margin:2px 0 0}.b-link p{font:13px/1.4 'Schibsted Grotesk';color:var(--ink2);margin:4px 0 0}

/* ---------- 3. The number ---------- */
.n-open{display:grid;gap:10px 56px;padding:84px 0 10px}@media(min-width:1000px){.n-open{grid-template-columns:17rem 1fr}}
.n-big{font:400 clamp(150px,30vw,340px)/.78 'Newsreader Display';letter-spacing:-.05em;color:var(--ed);font-variant-numeric:lining-nums;margin:0}
.n-line{font:500 clamp(18px,2vw,22px)/1.35 'Schibsted Grotesk';color:var(--machine-text);max-width:22em;margin-top:18px}
.n-side{font:13px/1.6 'Schibsted Grotesk';color:var(--ink2)}.n-side b{display:block;color:var(--ink);font-weight:600;letter-spacing:.16em;text-transform:uppercase;font-size:11px}
.n-index div{display:grid;grid-template-columns:minmax(150px,280px) 1fr;gap:24px;align-items:end;padding:18px 0;border-top:1px solid var(--ink)}
.n-index .v{font:400 clamp(70px,11vw,130px)/.8 'Newsreader Display';letter-spacing:-.04em;color:var(--ed)}
.n-index .v.ghost{color:var(--rule)}
.n-index h3{font:500 30px/1.05 'Newsreader Display';margin:0}.n-index p{font:13px/1.5 'Schibsted Grotesk';color:var(--ink2);margin:6px 0 0}
.n-card{max-width:320px;border-top:3px solid var(--ed);padding-top:10px}
.n-card .v{font:400 110px/.8 'Newsreader Display';letter-spacing:-.04em;color:var(--ed)}
.n-card h4{font:500 24px/1.1 'Newsreader Display';margin:12px 0 0}.n-card p{font:13px/1.5 'Schibsted Grotesk';color:var(--ink2);margin:6px 0 0}
.n-link{display:flex;gap:18px;align-items:center;max-width:38rem;border-left:3px solid var(--ed);padding:6px 0 6px 16px}
.n-link .v{font:400 60px/.8 'Newsreader Display';color:var(--ed);letter-spacing:-.03em}
.n-link h5{font:500 20px/1.15 'Newsreader Display';margin:0}.n-link p{font:13px/1.4 'Schibsted Grotesk';color:var(--ink2);margin:4px 0 0}
.note{font:13px/1.5 'Schibsted Grotesk';color:var(--ink2);background:var(--plate);padding:10px 14px;margin:30px 0 0}
`;

const nav = `<div class="nav"><i>From the <s>Internet</s> Dumpster Fire</i><span>Latest Threads Archive <b class="on">Data</b> Shelf Search About Subscribe</span></div>`;
const where = (b: string, s: string) => `<div class="where"><b>${b}</b><span>${s}</span></div>`;
const contents = order.map((k, i) => `<div><span>${romans[i]}</span>${esc(plate(k).name)}</div>`).join('');
const moves = story.movements.map((m) => `${m.numeral}. ${esc(m.name)}`).join(' · ');
const by = `<p class="by">Chosen and annotated by Bhuvanesh · <span class="mach">words and plates by the machine, from UN data; every figure checked</span></p>`;

const atlas = `<section class="dir"><div class="caps">Direction 1</div><h1>The atlas folio</h1>
<p class="why">The plates we have, given a title page of their own: the story opens framed like a proof, with crop marks and its number in a series ("Atlas No. 1"), and is everywhere else a small framed plate. Closest to what you already saw; the identity is the proof frame and the numbered series.</p>
${where('The section', '/data, every story in the series')}
${nav}
<div class="a-index-h"><div class="caps">The atlas</div><div><h2>Atlas</h2><p>A data story most weeks, told in numbered plates. Every number on them is checked against the rows it came from.</p></div></div>
<div class="a-entry"><div class="meta"><b>No. 1</b>10 November 2026<br>From Haul 002<br>${order.length} plates</div><div><h3>${esc(story.title)}</h3><p class="stand">${esc(story.standfirst)}</p><p class="mv">${moves}</p></div><div class="a-thumb">${fallThumb}</div></div>
${where('The story', '/data/fertility, the opening')}
${nav}
<div style="padding:44px 22px"><div class="a-proof"><span class="c2"></span><div class="a-series"><span class="no"><small>Atlas</small>No. 1</span><span class="caps">Haul 002 · 10 November 2026</span></div>
<div class="a-open"><div><h2 class="title">${esc(story.title)}</h2><p class="stand">${esc(story.standfirst)}</p>${by}</div><div><div class="a-front">${fallThumb}<p class="caps">Frontispiece: Plate I</p></div><div class="a-contents">${contents}</div></div></div></div></div>
${where('In the Haul', 'its own card in "In this Haul", beside the paper it answers')}
<div class="a-card"><div><div class="cardhead"><b>17</b>Data story</div><div class="a-cardbody"><span class="caps" style="color:var(--ed)">Atlas No. 1 · ${order.length} plates</span><h4>${esc(story.title)}</h4><p>${esc(story.plates[1]!.headline)}.</p></div></div><div class="a-thumb">${thumb}</div></div>
${where('From the item', 'on the Geruso and Spears page, after the note')}
<div class="a-link"><div class="a-thumb">${fallThumb}</div><div><span class="caps">The data story</span><h5>${esc(story.title)}</h5><p>The numbers behind this paper, in ${order.length} plates from the UN's data.</p><span class="go">Read Atlas No. 1</span></div></div>
</section>`;

const blue = `<section class="dir"><div class="caps">Direction 2</div><h1>The blue book</h1>
<p class="why">The government statistical report, salvaged: each story is a "Statement", bound in the Haul's edition ink like the shelf's cloth, with a formal title page, double rules, a contents list with dotted leaders, and a seal stamped with what was checked. Most distinct from the rest of the site; most "archive". The plates inside stay as they are.</p>
${where('The section', '/data, the statements on a shelf')}
${nav}
<div style="display:grid;gap:30px;margin-top:30px"><div class="b-index-copy"><div class="caps">Statements</div><h2 class="title" style="font-size:clamp(46px,7vw,84px)">Statements</h2><p class="stand">Data stories, bound one a week. Every figure in them is checked against the rows it came from.</p></div>
<div class="b-shelf"><div class="b-spine"><small>No. 1</small>${esc(story.title)}<small>Haul 002</small></div><div class="b-spine ghost"><small>No. 2</small>next week</div></div></div>
${where('The story', '/data/fertility, the title page')}
${nav}
<div class="b-title"><div class="st">Statement No. 1</div><div class="rules"><h2 class="title">${esc(story.title)}</h2><p class="stand" style="margin:16px auto 0">${esc(story.standfirst)}</p></div>
<p class="comp">Compiled by the machine from the United Nations, World Population Prospects 2024 · chosen and annotated by Bhuvanesh · Haul 002 · 10 November 2026</p>
<div class="b-seal">Checked<b>${story.facts.length}</b>facts<br>0 untraced</div>
<div class="b-toc">${order.map((k, i) => `<div><span>${romans[i]}</span><span>${esc(plate(k).name)}</span><span>Plate ${romans[i]}</span></div>`).join('')}</div></div>
${where('In the Haul', 'its card: the report itself, bound in the Haul’s ink')}
<div class="cardhead" style="max-width:300px"><b>17</b>Data story</div><div class="b-card b-cloth b-cover"><div class="st">Statement No. 1</div><h2 style="font-size:30px">${esc(story.title)}</h2><div class="rule"></div><div class="sub">${order.length} plates from the UN's data</div></div>
${where('From the item', 'on the Geruso and Spears page')}
<div class="b-link"><div class="b-mini">Statement<br>No. 1</div><div><span class="caps">The data story</span><h5>${esc(story.title)}</h5><p>The numbers behind this paper, bound as Statement No. 1.</p></div></div>
</section>`;

const number = `<section class="dir"><div class="caps">Direction 3</div><h1>The number</h1>
<p class="why">An almanac: every story is keyed to one number, set huge in the Haul's ink, the way the ledger signature sets figures. The number is the cover, the index is a column of numbers, and the card and the link carry it small. Loudest and simplest; it needs one number per story that can stand alone.</p>
${where('The section', '/data, a column of numbers')}
${nav}
<div style="margin-top:28px"><div class="caps">Numbers</div><h2 class="title" style="font-size:clamp(46px,7vw,84px);margin-bottom:20px">Numbers</h2>
<div class="n-index"><div><span class="v">${esc(share.value)}</span><div><h3>${esc(story.title)}</h3><p>No. 1 · Haul 002 · ${esc(share.text)}</p></div></div><div><span class="v ghost">—</span><div><p>Next week's number</p></div></div></div></div>
${where('The story', '/data/fertility, the opening')}
${nav}
<div class="n-open"><div class="n-side"><b>Numbers No. 1</b>Haul 002<br>10 November 2026<br>${order.length} plates</div><div><p class="n-big">${esc(share.value)}</p><p class="n-line">${esc(share.text)}.</p><h2 class="title" style="margin-top:34px;font-size:clamp(36px,5vw,60px)">${esc(story.title)}</h2><p class="stand">${esc(story.standfirst)}</p>${by}</div></div>
${where('In the Haul', 'its card')}
<div class="cardhead" style="max-width:320px"><b>17</b>Data story</div><div class="n-card"><div class="v">${esc(share.value)}</div><h4>${esc(story.title)}</h4><p>${esc(share.text)}. ${order.length} plates.</p></div>
${where('From the item', 'on the Geruso and Spears page')}
<div class="n-link"><span class="v">${esc(share.value)}</span><div><span class="caps">The data story</span><h5>${esc(story.title)}</h5><p>The numbers behind this paper, in ${order.length} plates.</p></div></div>
</section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Data stories: an identity</title><style>${css}</style></head><body class="e-teal"><div class="band"></div><main class="wrap">
<div style="padding-top:40px"><div class="caps">Data stories · mock-ups for the editor</div><h1 class="title" style="font-size:clamp(40px,6vw,72px);margin-top:10px">Three printed forms for the data story</h1>
<p class="stand">Each direction is shown where a reader meets a story: the section's index, the story's opening, its card in the Haul, and the link from the item it answers. The plates inside are the same in all three; what changes is the story's own object. Words are the fertility story's; section copy and series names are placeholders.</p>
<p class="note">"Data" in the menu, the section names (Atlas, Statements, Numbers) and the series numbering are suggestions to choose or change. The dashed "No. 2" is a layout example, not a story.</p></div>
${atlas}${blue}${number}<div style="height:80px"></div></main></body></html>`;
writeFileSync(join(here, 'identity.html'), html);
console.log('built identity.html');
