// Comps for Lives, built from the real Sukumar Sen draft (.editorial/lives-sen/profile.json, or the
// copy beside this file). node docs/design-comps/lives/build.mjs, then shoot with
// node docs/design-comps/_shared/shoot.mjs docs/design-comps/lives docs/design-comps/lives/shots
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const local = join(here, 'sen.json');
const src = join(here, '../../../.editorial/lives-sen/profile.json');
if (existsSync(src)) writeFileSync(local, readFileSync(src));
const life = JSON.parse(readFileSync(local, 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const key = (s) => (s.author.split(' ').length >= 3 && / of /.test(s.author) ? s.author.split(' ').filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('') : s.author.split(' ').pop());
const byId = Object.fromEntries(life.sources.map((s) => [s.id, s]));
const why =
  "I wanted to add a profile of Sukumar Sen, India’s first election commissioner. The context here is the debates about the special intensive revision, SIR, and all the debates about disenfranchisement. I think it’s important to know how far we have come. It’s important to know how radical and revolutionary our past elections were, and how monumentally challenging they were, and yet how far we have come: how we started at a place where we protected the sacred right of people to vote and express their democratic choice at all costs.";

const cited = (lines) => {
  const ids = [...new Set(lines.flatMap((l) => l.cites.map((c) => c.source)))];
  return ids.map((id) => { const at = [...new Set(lines.flatMap((l) => l.cites.filter((c) => c.source === id && c.at).map((c) => c.at)))]; return key(byId[id]) + (at.length ? ' ' + at.join(', ') : ''); }).join('; ');
};
const poss = (a) => (/^(Election|Press)/.test(a) ? 'the ' : '') + a + '’s';
const byline = `<span class="lb-lead">Written by ${esc(life.writer)} from</span> ${life.sources
  .map((s, i, a) => `${i === a.length - 1 ? 'and ' : ''}${esc(poss(s.author))} ${s.kind === 'book' || s.kind === 'report' ? `<cite class="wt">${esc(s.title)}</cite>` : `“${esc(s.title)}”`}`)
  .join(', ')}.`;

const head = (variant) => `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sukumar Sen: Lives, Haul 001 (comp ${variant})</title>
<link rel="stylesheet" href="lives.css"></head>
<body class="e-oxblood v-${variant}">
<header class="top wrap"><a class="top-home" href="#"><span class="flame" aria-hidden="true"></span><span class="mast-s"><span class="it">From the</span> <s>Internet</s> Dumpster Fire</span></a>
<nav class="top-nav"><a href="#">Latest</a><a href="#">Threads</a><a href="#">Archive</a><a href="#">Search</a></nav></header>
<div class="wrap"><p class="runhead"><a href="#">Haul 001 · What cheap things cost</a><span>The life</span></p></div>`;

const section = (s, i) => `
<section class="wrap lf-sec" aria-labelledby="s${i}">
  <div class="g"><h2 class="c lf-h" id="s${i}">${esc(s.heading)}</h2></div>
  ${s.paragraphs
    .map(
      (p) => `<div class="g lf-p"><p class="m lf-cite">${esc(cited(p))}</p><p class="c lf-text">${p.map((l) => esc(l.text)).join(' ')}</p></div>`,
    )
    .join('\n  ')}
</section>`;

const words = life.words
  ? `<figure class="wrap g lf-words"><div class="c">
  <blockquote class="lf-q"><p><span class="hang">“</span>${esc(life.words.text[0].toUpperCase() + life.words.text.slice(1))}<span>”</span></p></blockquote>
  <figcaption><span class="lf-ctx">${esc(life.words.context.text)}</span><span class="lf-rec">As Ramachandra Guha records it in <cite class="wt">India After Gandhi</cite>, matched word for word</span></figcaption>
</div></figure>`
  : '';

const figures = `<section class="wrap g lf-fig" aria-labelledby="fig">
  <h2 class="m lf-mh machine" id="fig">${esc(life.figures.title)}</h2>
  <dl class="c lf-ledger">${life.figures.rows.map((r) => `<div><dt>${esc(r.value)}</dt><dd>${esc(r.line.text)}<span class="lf-k">${esc(cited([r.line]))}</span></dd></div>`).join('')}</dl>
</section>`;

const dates = `<section class="wrap lf-dates" aria-labelledby="dates">
  <div class="g"><h2 class="m lf-mh" id="dates">A life in dates</h2></div>
  <ol>${life.dates.map((d) => `<li class="g"><span class="m lf-y">${esc(d.year)}</span><span class="c lf-e">${esc(d.line.text)}</span></li>`).join('')}</ol>
</section>`;

const reading = `<section class="wrap g lf-read" aria-labelledby="read">
  <h2 class="m lf-mh" id="read">Further reading</h2>
  <ul class="c">${life.reading
    .map((r) => `<li><a class="lf-rt" href="${esc(r.url ?? '#')}">${esc(r.title)}</a><span class="lf-ra">${esc(r.author)}${r.publisher ? `. ${esc(r.publisher)}` : ''}${r.year ? `, ${esc(r.year)}` : ''}.</span></li>`)
    .join('')}</ul>
</section>`;

const sources = `<section class="wrap g lf-src" aria-labelledby="src">
  <h2 class="m lf-mh" id="src">Written from</h2>
  <div class="c">
  <ol>${life.sources
    .map(
      (s) =>
        `<li><span class="lf-sk">${esc(key(s))}</span><span>${esc(s.author)}, ${s.kind === 'book' || s.kind === 'report' ? `<cite class="wt">${esc(s.title)}</cite>` : `“${esc(s.title)}”`}${s.publisher ? `, ${esc(s.publisher)}` : ''}${s.year ? `, ${esc(s.year)}` : ''}.${s.via ? ` ${esc(s.via)}.` : ''} <a href="${esc(s.url)}">Where we read it</a></span></li>`,
    )
    .join('')}</ol>
  <p class="lf-how">Every sentence above cites these sources. Code found each cited passage word for word in the text we fetched and checked every figure against it; a second model checked each sentence against its passages, and anything it could not confirm was left out. The editor read and approved the profile before it was published.</p>
  </div>
</section>`;

const headerA = `<header class="wrap g lf-head">
  <p class="m meta"><span><span class="key" aria-hidden="true"></span>Lives</span><span>Haul 001, item 4</span></p>
  <h1 class="mc lf-name">${esc(life.name)}</h1>
  <p class="mc lf-years">${life.born.year}<span class="dash">–</span>${life.died.year}</p>
  <p class="c lf-epi">${esc(life.epithet.text)}</p>
</header>`;

const headerB = `<header class="wrap g lf-head lf-runin">
  <p class="m meta"><span><span class="key" aria-hidden="true"></span>Lives</span><span>Haul 001, item 4</span></p>
  <h1 class="mc lf-entry"><span class="lf-n">${esc(life.name)}</span> <span class="lf-yy">(${life.born.year}–${life.died.year}),</span> <span class="lf-e2">${esc(life.epithet.text.charAt(0).toLowerCase() + life.epithet.text.slice(1))}</span></h1>
</header>`;

const body = (header) => `
<main class="t-life">
${header}
<section class="wrap g why"><p class="m mh">Why it's here</p><div class="c"><p class="standfirst">${esc(why)} <span class="sign-in">B.</span></p>
<p class="voice"><span class="play" aria-hidden="true"></span>This note, in my voice <span class="ink2">1:12</span></p></div></section>
<div class="wrap g lf-label"><p class="c">${byline}</p></div>
${section(life.sections[0], 0)}
${section(life.sections[1], 1)}
${words}
${section(life.sections[2], 2)}
${figures}
${section(life.sections[3], 3)}
${section(life.sections[4], 4)}
${dates}
${reading}
${sources}
</main>
<p class="folio wrap"><span>Haul 001</span><span class="folio-n">4</span></p>
<script>matchMedia('(prefers-color-scheme: dark)')</script>
</body></html>`;

const portrait = `<figure class="lf-portrait"><img src="sen-1953.jpg" width="759" height="774" alt="Sukumar Sen in 1953: a studio portrait in round spectacles and a checked jacket, mounted on a Colonial Office file sheet marked Photo No. AA/5242"><figcaption>Sukumar Sen in 1953, as the Colonial Office filed him during the Sudan election. By an unknown photographer. The National Archives UK, CO 1069/14. Open Government Licence v1.0.</figcaption></figure>`;
const headerP = headerA.replace('<p class="c lf-epi">', portrait + '<p class="c lf-epi">');
writeFileSync(join(here, 'life-a.html'), head('a') + body(headerA));
writeFileSync(join(here, 'life-b.html'), head('b') + body(headerB));
writeFileSync(join(here, 'life-deep.html'), head('deep') + body(headerP));
writeFileSync(join(here, 'life-ink.html'), head('ink') + body(headerP));
console.log('built');
