// Contents as a specimen table: each item shown as a small specimen of its own printed form, laid out
// at different sizes like salvaged things on a table. Comp for the Haul cover's "In this Haul".
// node docs/design-comps/salvage/specimens.mjs  (run build.mjs first; this reuses its style.css)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haul, byType, esc, title, hl, pad, year, doc } from '../_shared/shared.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const n = (it) => haul.items.indexOf(it) + 1;
const first = (s) => s.split(/(?<=[.!?])\s/)[0];
const cap = (it, form) => `<p class="sp-cap"><span class="sp-n">${pad(n(it), 2)}</span><span>${form}</span><span class="sp-why">${esc(first(it.why.text))}</span></p>`;

const essay = byType('essay'), rhymes = byType('rhymes'), talk = byType('talk'), paper = byType('paper'), poem = byType('poem'), rabbit = byType('rabbit-hole');

const specimens = `
<li class="sp sp-essay t-essay">
  <a href="essay.html" class="sp-obj"><span class="sp-meta">The Atlantic · July 1945</span><span class="sp-et">${title(essay.title)}</span><span class="sp-by">${esc(essay.creator)}</span><span class="sp-ex">${hl(essay.excerpt.highlight, essay.excerpt.highlight, 'hl')}</span></a>
  ${cap(essay, 'Essay')}
</li>
<li class="sp sp-rhymes t-rhymes">
  <a href="rhymes.html" class="sp-obj"><span class="sp-l"><span class="sp-y">${rhymes.rhyme.then.year}</span><span class="sp-q">${esc(rhymes.rhyme.then.quote.split('. ')[0])}.</span></span><span class="sp-r"><span class="sp-y">${rhymes.rhyme.now.year}</span><span class="sp-q">${esc(rhymes.rhyme.now.quote)}</span></span></a>
  ${cap(rhymes, 'Rhymes · ' + title(rhymes.title))}
</li>
<li class="sp sp-talk t-talk">
  <a href="talk.html" class="sp-obj"><span class="sp-who">Hamming</span><span class="sp-said">${hl(talk.excerpt.text, talk.excerpt.highlight, 'hl')}</span><span class="sp-when">Bellcore, 7 March 1986</span></a>
  ${cap(talk, 'Talk · ' + title(talk.title))}
</li>
<li class="sp sp-paper t-paper">
  <a href="paper.html" class="sp-obj"><span class="sp-rc">arXiv · 2017</span><span class="sp-ot">${title(paper.title)}</span><span class="sp-ob">${esc(paper.creator)}</span><span class="sp-ab">Abstract</span><span class="sp-at">${hl(paper.excerpt.text, paper.excerpt.highlight, 'hl')}</span></a>
  ${cap(paper, 'Paper')}
</li>
<li class="sp sp-poem t-poem">
  <a href="poem.html" class="sp-obj"><span class="sp-pt">${esc(poem.excerpt.text)}</span><span class="sp-pf">${esc(poem.creator)}</span></a>
  ${cap(poem, 'Poem')}
</li>
<li class="sp sp-card t-rabbit-hole">
  <a href="rabbit-hole.html" class="sp-obj"><span class="sp-call"><span>FDF 001.6</span><span>London</span></span><span class="sp-hw">Great Stink, <i>The</i></span><span class="sp-d">London, summer 1858</span><span class="sp-punch"></span></a>
  ${cap(rabbit, 'Rabbit hole')}
</li>`;

const css = String.raw`
.t-essay { --tint: var(--apricot); } .t-rhymes { --tint: var(--sky); } .t-talk { --tint: var(--butter); } .t-paper { --tint: var(--mint); } .t-poem { --tint: var(--coral); } .t-rabbit-hole { --tint: var(--pistachio); }
.spec { padding-block: 24px 48px; }
.sp-list { display: grid; gap: 40px 28px; grid-template-columns: repeat(12, minmax(0, 1fr)); align-items: start; }
.sp { grid-column: 1 / -1; display: grid; gap: 12px; }
.sp-obj { display: flex; flex-direction: column; text-decoration: none; color: var(--ink); position: relative; }
.sp-obj:hover { outline: 1px solid var(--ink); outline-offset: 4px; }
.sp-cap { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; font: 500 13px/1.5 var(--sans); color: var(--ink2); }
.sp-n { color: var(--ember); font: 400 17px/1.2 var(--display); }
.sp-why { grid-column: 2; font: italic 400 15px/1.45 var(--serif); }
.sp-cap em { font-style: italic; }

/* essay: a cropped magazine opening on white, framed by a hairline */
.sp-essay .sp-obj { border: 1px solid var(--rule); padding: 18px 20px 20px; gap: 6px; }
.sp-meta { font: 400 12px var(--sans); color: var(--ink2); }
.sp-et { font: 500 clamp(44px, 7vw, 76px)/0.86 var(--display); letter-spacing: -0.035em; margin-top: 6px; }
.sp-by { font-style: italic; font-size: 16px; margin-top: 6px; }
.sp-ex { font: 400 17px/1.4 var(--display); margin-top: 10px; max-width: 26em; }

/* poem: a narrow coral broadside */
.sp-poem .sp-obj { background: var(--tint); padding: 36px 22px 16px; min-height: 300px; justify-content: space-between; gap: 28px; }
.sp-pt { font: 400 26px/1.22 var(--display); }
.sp-pf { font: 500 14px var(--display); border-top: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); padding-top: 8px; }

/* rhymes: a tiny two-page spread */
.sp-rhymes .sp-obj { flex-direction: row; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); }
.sp-l, .sp-r { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 14px 14px 16px 0; }
.sp-r { padding: 14px 0 16px 14px; border-left: 1px solid var(--rule); }
.sp-y { font: 400 40px/0.9 var(--display); letter-spacing: -0.02em; }
.sp-l .sp-y { color: var(--ink2); }
.sp-q { font: 400 15px/1.35 var(--display); }

/* talk: a transcript strip, speaker in the margin */
.sp-talk .sp-obj { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 6px 12px; padding-block: 14px; border-block: 1px solid var(--rule); }
.sp-who { font: 600 11px/2 var(--sans); letter-spacing: 0.1em; text-transform: uppercase; }
.sp-said { font: 400 22px/1.28 var(--display); }
.sp-when { grid-column: 2; font: 400 12px var(--sans); color: var(--ink2); }

/* paper: an offprint, centred title, abstract */
.sp-paper .sp-obj { border: 1px solid var(--rule); padding: 0 18px 18px; text-align: center; gap: 6px; }
.sp-rc { font: 400 11px var(--sans); color: var(--ink2); padding: 7px 0; border-bottom: 1px solid var(--rule); margin-inline: -18px; padding-inline: 18px; text-align: left; }
.sp-ot { font: 500 24px/1.08 var(--display); margin-top: 18px; }
.sp-ob { font-style: italic; font-size: 14px; }
.sp-ab { font: 500 11px var(--sans); margin-top: 12px; }
.sp-at { font-size: 14px; line-height: 1.45; text-align: left; }

/* rabbit hole: a 3x5 catalogue card with its punch hole */
.sp-card .sp-obj { background: var(--tint); aspect-ratio: 5 / 3; max-width: 100%; padding: 16px 20px; gap: 6px; }
.sp-call { display: flex; justify-content: space-between; font: 500 11px var(--sans); color: var(--ink2); }
.sp-hw { font: 500 30px/1 var(--display); margin-top: 10px; }
.sp-hw i { font-weight: 400; }
.sp-d { font-style: italic; font-size: 14px; color: var(--ink2); padding-bottom: 8px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); }
.sp-punch { position: absolute; left: 50%; bottom: 12px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--bg); }

.sp mark.hl { background: var(--tint); }
.sp-card mark, .sp-poem mark { background: transparent; }

/* phone: one column, but each object keeps its own width and side */
@media (max-width: 699px) {
  .sp-poem { justify-self: end; width: 72%; }
  .sp-card { width: 92%; }
  .sp-paper { width: 84%; justify-self: center; }
}
/* desktop: objects of different sizes on the table, placed where they fit their shape */
@media (min-width: 700px) {
  .sp-essay { grid-column: 1 / span 7; grid-row: 1; }
  .sp-rhymes { grid-column: 1 / span 6; grid-row: 2; }
  .sp-talk { grid-column: 1 / span 7; grid-row: 3; margin-left: 12%; }
  .sp-paper { grid-column: 8 / span 4; grid-row: 3 / span 2; margin-top: -24px; }
  .sp-poem { grid-column: 9 / span 4; grid-row: 1 / span 2; margin-top: 56px; }
  .sp-card { grid-column: 2 / span 6; grid-row: 4; }
  .sp-poem .sp-obj { min-height: 420px; }
  .sp-pt { font-size: 30px; }
}
@media (min-width: 1000px) { .spec .sp-list { grid-column: 2 / -1; } }
`;

const body = `<header class="top wrap"><a class="top-home" href="cover.html"><span class="flame" aria-hidden="true"></span><span class="mast-s"><span class="it">From the</span> <s>Internet</s> Dumpster Fire</span></a><nav class="top-nav"><a href="index.html">All comps</a><button class="tog" type="button" data-theme-toggle aria-label="Switch light or dark"><span aria-hidden="true"></span></button></nav></header>
<main>
<section class="wrap g head"><p class="m meta"><span>Comp</span><span>Contents as specimens</span></p><div class="c"><h1 class="h-title">In this <em>Haul</em></h1><p class="deck">Each piece shown as a small specimen of its own form, so you can tell what you're holding before you read a word.</p></div></section>
<section class="wrap g spec" aria-label="In this Haul">
  <h2 class="m mh">Six objects</h2>
  <ol class="sp-list mc">${specimens}</ol>
</section>
</main>`;

writeFileSync(join(out, 'specimens.css'), css);
writeFileSync(join(out, 'cover-specimens.html'), doc({ title: 'In this Haul: specimens', body }).replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="specimens.css">'));
console.log('specimens: built');
