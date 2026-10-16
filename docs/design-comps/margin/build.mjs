// Direction A, "Margin": the struck-through masthead is the one loud thing; every page is a sheet
// with a wide left margin that holds the apparatus (dates, speakers, numbers, the machine's notes)
// beside an off-centre reading column. Colour enters only as the highlighter and the type key.
// node docs/design-comps/margin/build.mjs
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haul, byType, esc, title, hl, pad, year, swatchOf, label, hrefFor, doc, overview, emit } from '../_shared/shared.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const H = `Haul ${pad(haul.number)}`;
const sw = (t) => `sw-${swatchOf[t]}`;

const toggle = `<button class="tog" type="button" data-theme-toggle aria-label="Switch light or dark"><span aria-hidden="true"></span></button>`;
const flame = `<span class="flame" aria-hidden="true"></span>`;

/** Top bar. `mast` adds the small struck masthead (item pages); the cover carries the big one. */
const top = ({ mast = true, bare = false } = {}) => `<header class="top wrap">
  <a class="top-home" href="cover.html">${flame}${mast ? `<span class="mast-s"><span class="it">From the</span> <s>Internet</s> Dumpster Fire</span>` : `<span class="sr">From the Dumpster Fire</span>`}</a>
  <nav class="top-nav" aria-label="Sections">${bare ? `<a href="cover.html">${H}</a>` : `<a href="cover.html">Hauls</a><a href="cover.html">Threads</a><a href="waiting.html">About</a>`}${toggle}</nav>
</header>`;

const foot = `<footer class="foot wrap g">
  <p class="m foot-mark">${flame}<span><span class="it">From the</span> <s>Internet</s> Dumpster Fire</span></p>
  <p class="c foot-line">Things worth salvaging from the internet and the archive. The serif is the editor; <span class="machine">the blue sans is the machine.</span></p>
  <nav class="c foot-nav" aria-label="Elsewhere"><a href="cover.html">Every Haul</a><a href="cover.html">Threads</a><a href="waiting.html">How it's made</a><a href="waiting.html">RSS</a></nav>
</footer>`;

/** Index form of a name: "Joseph Bazalgette" becomes "Bazalgette, Joseph". */
const inverted = (n) => { const w = n.split(' '); return w.length === 2 ? `${w[1]}, ${w[0]}` : n; };

const key = (t) => `<span class="key ${sw(t)}" aria-hidden="true"></span>`;

/** Machine notes: blue sans, each with its citation. */
const notes = (it) => it.marginalia.map((n) => `<p class="note machine">${esc(n.text)} <cite>${esc(n.cite)}</cite></p>`).join('\n');

/** Wikipedia, connections and the source, set as the item's apparatus rows. */
const apparatus = (it, from = 1) => {
  let n = from;
  const rows = [];
  if (it.wiki.length) rows.push(`<section class="wrap g row" aria-labelledby="wk">
    <h2 class="m mh" id="wk">Wikipedia</h2>
    <ul class="c wiki">${it.wiki.map((w) => `<li><a href="${esc(w.url)}">${esc(w.title)}</a><p>${esc(w.summary)}</p></li>`).join('')}</ul>
  </section>`);
  if (it.connections.length) rows.push(`<section class="wrap g row" aria-labelledby="cx">
    <h2 class="m mh" id="cx">Connections</h2>
    <ul class="c conx">${it.connections.map((c) => `<li><span class="rel">${esc(c.type)}</span><a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a><p>${esc(c.note)}</p></li>`).join('')}</ul>
  </section>`);
  void n;
  return rows.join('\n');
};

const source = (it, verb = 'Read it') => `<p class="src"><a href="${esc(it.source.url)}">${verb} at ${esc(it.source.name)}</a><span>${esc(it.source.date)}${it.minutes ? ` · ${it.minutes} minutes` : ''}</span></p>`;

// ---------- cover ----------

/** The words the editor marked in each item, shown under its title on the cover. */
const marked = (it) => it.excerpt?.highlight ?? it.excerpt?.text ?? it.rhyme?.now.quote ?? null;

const cover = () => {
  const fn = haul.fieldNote;
  const typeOf = new Map(haul.items.map((i) => [i.id, i.type]));
  const route = fn.route.map((r) => {
    const t = r.itemId ? typeOf.get(r.itemId) : null;
    const body = r.itemId ? `<a href="${hrefFor(r.itemId)}">${esc(r.text)}</a>` : esc(r.text);
    return `<li class="${r.by === 'machine' ? 'by-machine' : ''}"><span class="day">${esc(r.day)}</span><span class="rt${r.by === 'machine' ? ' machine' : ''}">${t ? key(t) : ''}${body}</span></li>`;
  }).join('\n');
  const contents = haul.items.map((it, i) => `<li class="g entry">
    <p class="m e-m"><span class="e-n">${i + 1}</span><span class="e-f">${key(it.type)}${esc(label[it.type])}</span></p>
    <div class="c e-c">
      <h3 class="e-t"><a href="${hrefFor(it.id)}">${title(it.title)}</a></h3>
      <p class="e-by">${esc(it.creator)}, ${esc(it.source.date)}</p>
      ${marked(it) ? `<p class="e-mk"><mark class="hl ${sw(it.type)}">${esc(marked(it))}</mark></p>` : ''}
      <p class="e-why">${esc(it.why.text.split(/(?<=[.!?])\s/)[0])}</p>
    </div>
  </li>`).join('\n');
  const th = haul.threads[0];
  return doc({ title: `${H}: What cheap things cost`, body: `${top({ mast: false })}
<main>
<section class="wrap g mast" aria-label="From the Dumpster Fire">
  <p class="mc mast-a">From the</p>
  <p class="mc mast-b"><s>Internet</s></p>
  <p class="mast-c">Dumpster Fire</p>
</section>

<section class="wrap g head" aria-labelledby="ht">
  <p class="m meta"><span>${H}</span><span>Thursday 15 October 2026</span><span>Six objects</span></p>
  <div class="c">
    <h1 class="h-title" id="ht">${title(haul.title)}</h1>
    <p class="deck">${esc(haul.deck)}</p>
  </div>
</section>

<section class="wrap g fn" aria-labelledby="fnt">
  <div class="m fn-m">
    <h3 class="mh">The route</h3>
    <ol class="route">${route}</ol>
  </div>
  <div class="c fn-c">
    <h2 class="h-sec" id="fnt">${title(fn.title)}</h2>
    ${fn.paragraphs.map((p) => `<p>${hl(p, fn.highlight, 'hl sw-butter')}</p>`).join('\n')}
    <p class="sign">B.</p>
  </div>
</section>

<section class="wrap contents" aria-labelledby="cnt">
  <div class="g"><h2 class="m mh" id="cnt">In this Haul</h2></div>
  <ol>${contents}</ol>
</section>

<section class="wrap g row" aria-labelledby="thr">
  <h2 class="m mh" id="thr">The thread</h2>
  <div class="c thread">
    <p class="th-t"><a href="cover.html">${title(th.title)}</a></p>
    <ol class="years">${th.points.map((p) => `<li class="${p.inHaul ? 'in' : ''}"><span>${esc(p.year)}</span>${esc(p.title)}</li>`).join('')}</ol>
    <p class="machine small">${esc(th.provenance)}</p>
  </div>
</section>

<section class="wrap g row colo" aria-labelledby="col">
  <h2 class="m mh" id="col">Colophon</h2>
  <p class="c">${esc(haul.colophon)}</p>
</section>
</main>
${foot}` });
};

// ---------- waiting ----------

const waiting = () => doc({ title: 'From the Dumpster Fire', body: `${top({ mast: false })}
<main>
<section class="wrap g mast" aria-label="From the Dumpster Fire">
  <p class="mc mast-a">From the</p>
  <p class="mc mast-b"><s>Internet</s></p>
  <p class="mast-c">Dumpster Fire</p>
</section>
<section class="wrap g head" aria-labelledby="wt">
  <p class="m meta"><span>${H}</span><span>Being gathered</span></p>
  <div class="c">
    <h1 class="h-title" id="wt">Haul 001 is being <em>gathered</em></h1>
    <p class="deck">A magazine of things worth pulling out of the internet and the archive before they burn. It arrives in Hauls, when there is enough worth sending.</p>
  </div>
</section>
<section class="wrap g row" aria-labelledby="wh">
  <h2 class="m mh" id="wh">What a Haul holds</h2>
  <ul class="c forms">
    <li>${key('essay')}<span><b>Essays</b>, set as a magazine opens one.</span></li>
    <li>${key('paper')}<span><b>Papers</b>, as offprints: abstract first, sections numbered.</span></li>
    <li>${key('talk')}<span><b>Talks and podcasts</b>, as transcripts, speakers in the margin.</span></li>
    <li>${key('poem')}<span><b>Poems</b>, as broadsides: one sheet, nothing else on it.</span></li>
    <li>${key('rhymes')}<span><b>Rhymes</b>, as facing pages: then on the left, now on the right.</span></li>
    <li>${key('rabbit-hole')}<span><b>Rabbit holes</b>, as encyclopedia entries with their cross-references.</span></li>
  </ul>
</section>
<section class="wrap g row" aria-labelledby="wn">
  <h2 class="m mh" id="wn">Until then</h2>
  <div class="c"><p>The first one is not out yet. Read <a href="waiting.html">how it's made</a>, or follow the <a href="waiting.html">RSS feed</a> to hear when it lands.</p>
  <p class="machine small">Chosen and annotated by one editor, mostly by voice. Language models read, cross-link and check; anything they write is set in this blue.</p></div>
</section>
</main>
${foot}` });

// ---------- essay: magazine opening ----------

const essay = () => {
  const it = byType('essay');
  return doc({ title: `${it.title.text}: ${H}`, body: `${top()}
<main class="t-essay">
<header class="wrap g open">
  <p class="m meta"><span>${key('essay')}Essay</span><span>${esc(it.source.name)}, ${esc(it.source.date)}</span><span>${it.minutes} minutes</span></p>
  <h1 class="mc essay-t">${title(it.title)}</h1>
  <p class="c byline">${esc(it.creator)}</p>
</header>
<section class="wrap g why" aria-label="Why it's here">
  <p class="m mh">Why it's here</p>
  <p class="c standfirst">${esc(it.why.text)}</p>
</section>
<section class="wrap g pull" aria-label="From the essay">
  <div class="m pull-m"><p class="loc">${esc(it.excerpt.locator)}</p>${notes(it)}</div>
  <blockquote class="c pull-q"><p>${hl(it.excerpt.text, it.excerpt.highlight, `hl ${sw('essay')}`)}</p></blockquote>
</section>
<div class="wrap g"><div class="c">${source(it, 'Read the essay')}</div></div>
${apparatus(it)}
</main>
${foot}` });
};

// ---------- paper: journal offprint ----------

const paper = () => {
  const it = byType('paper');
  const secs = [['Why it\'s here', `<p>${esc(it.why.text)}</p>`]];
  if (it.marginalia.length) secs.push(['Notes', notes(it)]);
  secs.push(['References', `<ul class="refs">${it.wiki.map((w, i) => `<li><span class="rn">[${i + 1}]</span><span><a href="${esc(w.url)}">${esc(w.title)}</a>. ${esc(w.summary)} <span class="small ink2">Wikipedia.</span></span></li>`).join('')}</ul>`]);
  secs.push(['Related in this Haul', `<ul class="refs">${it.connections.map((c) => `<li><span class="rn">${esc(c.type)}</span><span><a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a>. <i>${esc(c.note)}</i></span></li>`).join('')}</ul>`]);
  return doc({ title: `${it.title.text}: ${H}`, body: `${top()}
<main class="t-paper">
<div class="wrap"><p class="runcite"><span>${esc(it.creator)}. ${esc(it.title.text)}. ${esc(it.source.name)}, ${esc(it.source.date)}.</span><span>Offprint, ${H}</span></p></div>
<header class="wrap g off">
  <p class="m meta"><span>${key('paper')}Paper</span><span>${it.minutes} minutes</span></p>
  <div class="c off-c">
    <h1 class="off-t">${title(it.title)}</h1>
    <p class="off-by">${esc(it.creator)}</p>
  </div>
</header>
<section class="wrap g" aria-labelledby="abs">
  <div class="c abstract">
    <h2 id="abs">Abstract</h2>
    <p>${hl(it.excerpt.text, it.excerpt.highlight, `hl ${sw('paper')}`)}</p>
    <p class="small ink2">From the abstract, as the editor marked it. <a href="${esc(it.source.url)}">Read the paper at arXiv</a>.</p>
  </div>
</section>
${secs.map(([h, b], i) => `<section class="wrap g sec" aria-labelledby="s${i}">
  <p class="m sec-n" aria-hidden="true">${i + 1}</p>
  <div class="c"><h2 class="sec-h" id="s${i}"><span class="sr">${i + 1} </span>${h}</h2>${b}</div>
</section>`).join('\n')}
</main>
${foot}` });
};

// ---------- talk: transcript ----------

const talk = () => {
  const it = byType('talk');
  const speaker = it.creator.split(' ').pop().toUpperCase();
  return doc({ title: `${it.title.text}: ${H}`, body: `${top()}
<main class="t-talk">
<header class="wrap g tr-head">
  <p class="m meta"><span>${key('talk')}Talk</span><span>Transcript</span><span>${it.minutes} minutes</span></p>
  <div class="c"><h1 class="h-item">${title(it.title)}</h1><p class="byline">${esc(it.creator)} at ${esc(it.source.name)}</p></div>
</header>
<section class="wrap transcript" aria-label="Transcript">
  <div class="g tl"><p class="m when">${esc(it.source.name)}<br>${esc(it.source.date)}</p></div>
  <div class="g tl"><p class="m who">${esc(speaker)}</p><p class="c said">${hl(it.excerpt.text, it.excerpt.highlight, `hl ${sw('talk')}`)}</p></div>
  <div class="g tl"><p class="m who">B.</p><p class="c ed">${esc(it.why.text)}</p></div>
  ${it.marginalia.map((n) => `<div class="g tl"><p class="m who machine">Machine</p><p class="c note machine">${esc(n.text)} <cite>${esc(n.cite)}</cite></p></div>`).join('\n')}
</section>
<div class="wrap g"><div class="c">${source(it, 'Read the transcript')}</div></div>
${apparatus(it)}
</main>
${foot}` });
};

// ---------- poem: broadside ----------

const poem = () => {
  const it = byType('poem');
  return doc({ title: `${it.title.text}: ${H}`, bodyClass: 'bs-body', body: `${top({ mast: false, bare: true })}
<main class="t-poem">
<article class="wrap broadside" aria-labelledby="pt">
  <h1 class="sr" id="pt">${esc(it.title.text)}, ${esc(it.creator)}</h1>
  <p class="bs-poem">${esc(it.excerpt.text)}</p>
  <p class="bs-foot"><span class="bs-who">${esc(it.creator)}</span><span>from <i>${esc(it.title.text)}</i>, ${esc(it.source.date)}</span></p>
</article>
<section class="wrap g why bs-why" aria-label="Why it's here">
  <p class="m mh">${key('poem')}Poem</p>
  <p class="c ed">${esc(it.why.text)}</p>
</section>
${apparatus(it)}
</main>
${foot}` });
};

// ---------- rhymes: facing pages ----------

const rhymes = () => {
  const it = byType('rhymes');
  const r = it.rhyme;
  return doc({ title: `${it.title.text} ${it.title.italic}: ${H}`, body: `${top()}
<main class="t-rhymes">
<header class="wrap g rh-head">
  <p class="m meta"><span>${key('rhymes')}Rhymes</span><span>${esc(r.then.year)} and ${esc(r.now.year)}</span></p>
  <div class="c"><h1 class="h-item">${title(it.title)}</h1></div>
</header>
<section class="wrap spread" aria-label="Then and now">
  <div class="page then"><p class="yr">${esc(r.then.year)}</p><blockquote><p>${esc(r.then.quote)}</p></blockquote><p class="cite">${esc(r.then.cite)}</p></div>
  <div class="gutter"><p>${esc(r.bridge)}</p></div>
  <div class="page now"><p class="yr">${esc(r.now.year)}</p><blockquote><p>${esc(r.now.quote)}</p></blockquote><p class="cite">${esc(r.now.cite)}</p></div>
</section>
<section class="wrap g why" aria-label="Why it's here">
  <p class="m mh">Why it's here</p>
  <p class="c ed">${esc(it.why.text)}</p>
</section>
<div class="wrap g"><div class="c">${source(it, 'Read about it')}</div></div>
${apparatus(it)}
</main>
${foot}` });
};

// ---------- rabbit hole: encyclopedia entry ----------

const rabbit = () => {
  const it = byType('rabbit-hole');
  const p = it.plate;
  return doc({ title: `${it.title.text}: ${H}`, body: `${top()}
<main class="t-rabbit">
<article class="wrap g entry-page" aria-labelledby="hw">
  <p class="m meta"><span>${key('rabbit-hole')}Rabbit hole</span><span>${esc(it.source.date)}</span></p>
  <div class="c ent">
    <h1 class="hw" id="hw">Great Stink, <span class="hw-the">The</span></h1>
    <p class="hw-d">London, summer ${year(it.source.date)}</p>
    <p class="ent-t ed">${esc(it.why.text)}</p>
    ${notes(it)}
    <p class="seealso"><span>See also</span> ${it.wiki.map((w) => `<a href="${esc(w.url)}">${esc(inverted(w.title))}</a>`).join('; ')}; <a href="cover.html">Price of plenty, The</a> <span class="ink2">(thread)</span>; <a href="${esc(it.source.url)}">Great Stink</a> <span class="ink2">(Wikipedia)</span></p>
  </div>
  <figure class="m plate">
    <img src="silent-highwayman.jpg" width="${p.width}" height="${p.height}" alt="A Punch cartoon: Death, a skeleton in a cloak, rows a boat along the filthy Thames.">
    <figcaption><span>${esc(p.caption)}</span><span class="cr">${esc(p.credit)}. ${esc(p.licence[0].toUpperCase() + p.licence.slice(1))}.</span></figcaption>
  </figure>
</article>
${apparatus({ ...it, wiki: it.wiki })}
</main>
${foot}` });
};

// ---------- CSS ----------

const css = String.raw`
/* Layout: a wide left margin for the apparatus, an off-centre reading column, air on the right. */
:root { --serif: 'Newsreader Text', Georgia, serif; --display: 'Newsreader Display', 'Newsreader Text', Georgia, serif; --sans: 'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif; --gut: 16px; --colgap: 0px; }
@media (min-width: 640px) { :root { --gut: 28px; } }
@media (min-width: 1000px) { :root { --gut: 48px; --colgap: clamp(40px, 5vw, 72px); } }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 18px/1.55 var(--serif); font-synthesis: none; -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }
h1, h2, h3, p, ol, ul, figure, blockquote { margin: 0; }
ol, ul { list-style: none; padding: 0; }
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.18em; text-decoration-color: var(--ink2); }
a:hover { text-decoration-color: currentColor; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
em, i { font-style: italic; }
b { font-weight: 400; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.it { font-style: italic; }
.ink2 { color: var(--ink2); }
.small { font-size: 15px; line-height: 1.5; }
.machine { font-family: var(--sans); color: var(--machine); font-size: 15px; line-height: 1.5; }
.machine cite { font-style: normal; color: var(--ink2); white-space: nowrap; }
.machine cite::before { content: '· '; }

.wrap { max-width: 1280px; margin-inline: auto; padding-left: max(var(--gut), env(safe-area-inset-left, 0px)); padding-right: max(var(--gut), env(safe-area-inset-right, 0px)); }
.g { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 12px; }
@media (min-width: 1000px) {
  .g { grid-template-columns: minmax(0, 17rem) minmax(0, 38rem) minmax(0, 1fr); column-gap: var(--colgap); row-gap: 0; align-items: start; }
  .m { grid-column: 1; }
  .c { grid-column: 2; }
  .mc { grid-column: 1 / 3; }
}

/* The highlighter and the type key: the only places colour enters. */
.sw-apricot { --sw: var(--apricot); } .sw-coral { --sw: var(--coral); } .sw-butter { --sw: var(--butter); }
.sw-sky { --sw: var(--sky); } .sw-mint { --sw: var(--mint); } .sw-pistachio { --sw: var(--pistachio); }
mark.hl { background: var(--sw); color: inherit; padding: 0.04em 0.12em; margin: 0 -0.12em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.key { display: inline-block; width: 0.7em; height: 0.7em; background: var(--sw); margin-right: 0.5em; vertical-align: 0.02em; outline: 1px solid var(--rule); outline-offset: -1px; }

/* Top bar and the brand flame (ember, brand only). */
.top { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-block: 18px; font: 500 14px/1 var(--sans); color: var(--ink2); }
.top a { text-decoration: none; }
.top-home { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); }
.mast-s { font: 400 18px/1 var(--display); letter-spacing: -0.005em; white-space: nowrap; }
.mast-s s, .foot-mark s { color: var(--ink2); text-decoration-thickness: 0.1em; text-decoration-color: var(--ember); }
.top-nav { display: flex; align-items: center; gap: 22px; }
.top-nav a:hover { color: var(--ink); }
@media (max-width: 520px) { .top-nav a { display: none; } .t-poem ~ * .top-nav a, .bs-body .top-nav a { display: inline; } }
.flame { width: 9px; height: 9px; background: var(--ember); border-radius: 0 50% 50% 50%; transform: rotate(45deg); display: inline-block; flex: none; }
.tog { width: 28px; height: 28px; border: 0; background: none; padding: 0; display: grid; place-items: center; cursor: pointer; }
.tog span { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--ink); overflow: hidden; position: relative; }
.tog span::after { content: ''; position: absolute; inset: 0 50% 0 0; background: var(--ink); }

/* The one loud thing: the struck masthead. */
.mast { padding-block: clamp(28px, 6vw, 72px) clamp(36px, 6vw, 80px); font-family: var(--display); font-weight: 500; line-height: 0.88; letter-spacing: -0.03em; font-size: clamp(44px, 12.6vw, 128px); row-gap: 0; }
@media (min-width: 640px) { .mast { font-size: clamp(54px, 9.6vw, 128px); } }
.mast-a { font-weight: 400; font-style: italic; font-size: 0.36em; letter-spacing: 0; margin-bottom: 0.12em; }
.mast-b s { color: var(--ink2); text-decoration-thickness: 0.07em; text-decoration-color: var(--ember); text-decoration-skip-ink: none; font-weight: 400; }
.mast-c { grid-column: 1 / -1; padding-left: 0.5em; white-space: nowrap; }
@media (min-width: 1000px) { .mast-c { grid-column: 2 / -1; padding-left: 0; margin-left: -0.04em; } }

/* Margin labels: quiet sans, sentence case. */
.mh { font: 500 14px/1.4 var(--sans); color: var(--ink2); }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font: 400 14px/1.45 var(--sans); color: var(--ink2); }
@media (min-width: 1000px) { .meta { flex-direction: column; padding-top: 0.5em; } }
.row { padding-block: 36px; }
@media (min-width: 1000px) { .row { padding-block: 48px; } }

/* Cover. */
.head { padding-bottom: 48px; }
.h-title { font: 500 clamp(36px, 5vw, 56px)/1.02 var(--display); letter-spacing: -0.015em; text-wrap: balance; }
.h-title em, .h-sec em, .h-item em, .e-t em, .th-t em, .essay-t em { font-weight: 400; }
.deck { margin-top: 14px; font-size: 21px; line-height: 1.45; color: var(--ink2); max-width: 32em; }
.fn { padding-block: 24px 56px; row-gap: 28px; }
.fn-c p { margin-top: 0.8em; }
.fn-c p:first-of-type { margin-top: 16px; }
.h-sec { font: 500 30px/1.1 var(--display); letter-spacing: -0.01em; }
.sign { font: 400 italic 26px/1 var(--display); text-align: right; color: var(--ember); }
.fn-m { order: 2; }
@media (min-width: 1000px) { .fn-m { order: 0; padding-top: 6px; } }
.route { margin-top: 12px; display: grid; gap: 10px; }
.route li { display: grid; grid-template-columns: 2.6em minmax(0, 1fr); gap: 8px; font-size: 15px; line-height: 1.42; }
.route .day { font: 500 12px/1.9 var(--sans); color: var(--ink2); }
.route .rt.machine { font-size: 14px; }
.route a { text-decoration: none; }
.route a:hover { text-decoration: underline; }
.route .key { width: 0.55em; height: 0.55em; margin-right: 0.4em; }

.contents { padding-block: 24px 24px; }
.contents > ol { margin-top: 20px; display: grid; gap: 40px; }
@media (min-width: 1000px) { .contents > ol { gap: 52px; } }
.entry { row-gap: 6px; }
.e-m { display: flex; align-items: baseline; gap: 14px; font: 400 14px/1.4 var(--sans); color: var(--ink2); }
@media (min-width: 1000px) { .e-m { flex-direction: column; align-items: flex-end; gap: 10px; } }
.e-n { font: 400 15px/1 var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; }
@media (min-width: 1000px) { .e-n { font: 400 44px/0.9 var(--display); color: var(--ink); } }
.e-mk { margin-top: 12px; font-size: 19px; line-height: 1.5; max-width: 34em; }
.e-t { font: 500 clamp(28px, 3.4vw, 40px)/1.05 var(--display); letter-spacing: -0.012em; text-wrap: balance; }
.e-t a { text-decoration: none; }
.e-t a:hover { text-decoration: underline; text-decoration-thickness: 1px; }
.e-by { margin-top: 6px; color: var(--ink2); font-size: 16px; }
.e-why { margin-top: 10px; font-style: italic; font-size: 16px; color: var(--ink2); max-width: 34em; }
.thread .th-t { font: 500 26px/1.15 var(--display); }
.years { margin: 14px 0 12px; display: grid; gap: 4px; font-size: 16px; }
.years li { display: grid; grid-template-columns: 3.2em minmax(0, 1fr); color: var(--ink2); }
.years li.in { color: var(--ink); }
.years span { font-variant-numeric: tabular-nums; }
.colo p { font-size: 16px; color: var(--ink2); max-width: 36em; }

.foot { padding-block: 40px 48px; margin-top: 24px; border-top: 1px solid var(--rule); row-gap: 10px; font-size: 15px; }
.foot-mark { display: flex; align-items: center; gap: 10px; font: 400 17px/1.2 var(--display); }
.foot-line { font-style: italic; color: var(--ink2); }
.foot-line .machine { font-style: normal; font-size: 14px; }
.foot-nav { display: flex; flex-wrap: wrap; gap: 6px 20px; font: 500 13px/1.6 var(--sans); color: var(--ink2); }
.foot-nav a { text-decoration: none; }
@media (min-width: 1000px) { .foot-nav { grid-row: 2; } }

/* Waiting page. */
.forms { display: grid; gap: 10px; font-size: 18px; }
.forms li { display: grid; grid-template-columns: 1.2em minmax(0, 1fr); align-items: baseline; }
.forms b { font-family: var(--display); font-weight: 500; }

/* Item pages, shared. */
.byline { margin-top: 10px; font-style: italic; font-size: 20px; }
.why { padding-block: 28px; }
.standfirst { font-size: 22px; line-height: 1.5; font-style: italic; }
.ed { font-style: italic; font-size: 19px; }
.note { margin-top: 10px; }
.note:first-child { margin-top: 0; }
.src { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; padding-block: 12px 8px; font-size: 17px; }
.src span { font: 400 14px var(--sans); color: var(--ink2); }
.wiki, .conx { display: grid; gap: 18px; }
.wiki a, .conx a { font-size: 19px; }
.wiki p { color: var(--ink2); font-size: 16px; margin-top: 2px; }
.conx .rel { display: block; font: 500 13px/1.6 var(--sans); color: var(--ink2); }
.conx p { font-style: italic; font-size: 16px; margin-top: 2px; }
.h-item { font: 500 clamp(36px, 5.2vw, 60px)/1.02 var(--display); letter-spacing: -0.015em; text-wrap: balance; }

/* Essay: the magazine opening. The title is the moment. */
.open { padding-block: clamp(24px, 5vw, 64px) 8px; row-gap: 14px; }
.essay-t { font: 500 clamp(58px, 12vw, 164px)/0.86 var(--display); letter-spacing: -0.035em; text-wrap: balance; }
@media (min-width: 1000px) { .open .meta { grid-row: 1 / 3; align-self: end; padding-bottom: 0.6em; } .essay-t { grid-column: 2 / -1; } }
.pull { padding-block: 12px 24px; row-gap: 20px; }
.pull-q p { font: 400 clamp(24px, 2.6vw, 31px)/1.32 var(--display); letter-spacing: -0.005em; }
.pull-m { order: 2; }
@media (min-width: 1000px) { .pull-m { order: 0; padding-top: 8px; } }
.loc { font: 500 13px/1.4 var(--sans); color: var(--ink2); margin-bottom: 10px; }

/* Paper: the offprint. */
.runcite { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 24px; padding-block: 10px; border-block: 1px solid var(--rule); font: 400 13px/1.5 var(--sans); color: var(--ink2); margin-top: 4px; }
.off { padding-block: 48px 28px; row-gap: 18px; }
.off-c { text-align: center; }
.off-t { font: 500 clamp(34px, 4.4vw, 50px)/1.06 var(--display); letter-spacing: -0.01em; text-wrap: balance; }
.off-by { margin-top: 10px; font-style: italic; font-size: 19px; }
.abstract { padding: 20px 0 8px; margin-inline: clamp(0px, 3vw, 40px); font-size: 17px; }
.abstract h2 { font: 500 14px/1.4 var(--sans); text-align: center; margin-bottom: 10px; }
.abstract p { margin-top: 8px; }
.sec { padding-block: 24px; row-gap: 4px; }
.sec-n { font: 400 30px/1 var(--display); color: var(--ink2); }
@media (min-width: 1000px) { .sec-n { text-align: right; padding-top: 2px; } }
.sec-h { font: 500 24px/1.2 var(--display); margin-bottom: 10px; }
.refs { display: grid; gap: 12px; font-size: 17px; }
.refs li { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: 12px; }
.refs .rn { font: 400 13px/1.9 var(--sans); color: var(--ink2); min-width: 2em; }
.t-paper .sec:last-of-type .refs li { grid-template-columns: minmax(0, 1fr); gap: 0; }

/* Talk: the transcript. Speakers live in the margin. */
.tr-head { padding-block: 32px 24px; row-gap: 14px; }
.transcript { display: grid; gap: 22px; padding-block: 16px 24px; }
.tl { row-gap: 4px; }
.who { font: 600 13px/1.9 var(--sans); letter-spacing: 0.1em; text-transform: uppercase; }
@media (min-width: 1000px) { .who, .when { text-align: right; } }
.when { font: 400 13px/1.5 var(--sans); color: var(--ink2); }
.said { font: 400 clamp(26px, 3vw, 34px)/1.25 var(--display); }
.transcript .note { margin: 0; }

/* Poem: the broadside. One sheet, the poem alone. */
.broadside { padding-block: clamp(80px, 14vw, 200px) clamp(80px, 12vw, 180px); display: grid; }
.bs-poem { font: 400 clamp(36px, 6vw, 76px)/1.1 var(--display); font-style: italic; letter-spacing: -0.012em; max-width: 11.5em; text-wrap: balance; }
.bs-foot { margin-top: 1.6em; display: flex; flex-direction: column; gap: 2px; font-size: 18px; color: var(--ink2); }
.bs-who { color: var(--ink); font-family: var(--display); font-weight: 500; font-size: 20px; }
@media (min-width: 1000px) { .broadside { padding-left: calc(var(--gut) + 17rem + var(--colgap)); } }
.bs-why { border-top: 1px solid var(--rule); padding-top: 32px; }

/* Rhymes: facing pages, the bridge in the gutter. */
.rh-head { padding-block: 32px 28px; row-gap: 14px; }
.spread { display: grid; gap: 28px; padding-block: 12px 24px; }
.page { padding: 24px 0; }
.yr { font: 500 clamp(56px, 7vw, 96px)/0.9 var(--display); letter-spacing: -0.03em; margin-bottom: 18px; font-variant-numeric: lining-nums; }
.page blockquote p { font: 400 clamp(22px, 2.2vw, 27px)/1.35 var(--display); }
.cite { margin-top: 14px; font-size: 15px; color: var(--ink2); font-style: italic; }
.gutter p { font-size: 16px; line-height: 1.5; color: var(--ink2); }
.then .yr { color: var(--ink2); }
@media (min-width: 900px) {
  .spread { grid-template-columns: minmax(0, 1fr) minmax(0, 15rem) minmax(0, 1fr); gap: 0; }
  .page { padding: 32px 40px 40px; }
  .then { padding-left: 0; }
  .now { padding-right: 0; }
  .gutter { border-inline: 1px solid var(--rule); padding: 140px 24px 32px; }
}
@media (max-width: 899px) { .gutter { border-block: 1px solid var(--rule); padding-block: 18px; } }

/* Rabbit hole: the encyclopedia entry, plate beside it. */
.entry-page { padding-block: 32px 24px; row-gap: 22px; }
.hw { font: 500 clamp(40px, 5.6vw, 64px)/1 var(--display); letter-spacing: -0.015em; }
.hw-the { font-weight: 400; font-style: italic; }
.hw-d { margin-top: 8px; font: 400 15px var(--sans); color: var(--ink2); }
.ent-t { margin-top: 18px; }
.ent .note { margin-top: 16px; }
.seealso { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--rule); font-size: 17px; }
.seealso > span:first-child { font-style: italic; margin-right: 6px; }
.plate img { width: 100%; }
.plate figcaption { margin-top: 8px; display: grid; gap: 4px; font-size: 15px; font-style: italic; }
.plate .cr { font: 400 13px/1.45 var(--sans); color: var(--ink2); font-style: normal; }
@media (min-width: 1000px) { .entry-page .meta { grid-row: 1; } .plate { grid-row: 2; padding-top: 10px; } .ent { grid-row: 1 / 3; } }
`;

emit(out, {
  index: overview({ name: 'Margin', letter: 'A', lines: [
    'The struck-through masthead is the one loud thing: From the Internet, crossed out, Dumpster Fire.',
    'Every page is a sheet with a wide left margin that holds the apparatus: dates, speakers, section numbers and the machine\'s notes, beside an off-centre reading column.',
    'Colour comes in only as the highlighter on the line you marked and a small key for each type. The forms do the rest.',
  ] }),
  cover: cover(), waiting: waiting(), essay: essay(), paper: paper(), talk: talk(), poem: poem(), rhymes: rhymes(), 'rabbit-hole': rabbit(),
}, css);
console.log('margin: built');
