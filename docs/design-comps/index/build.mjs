// Direction C, "Index": the book and its index. The highlighter is the hero.
// node docs/design-comps/index/build.mjs
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haul, item, byType, esc, title, hl, pad, year, swatchOf, label, hrefFor, doc, overview, emit } from '../_shared/shared.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const H = `Haul ${pad(haul.number)}`;
const haulTitle = `${haul.title.text} ${haul.title.italic ?? ''}`.trim();
const num = (it) => haul.items.indexOf(it) + 1;
const sw = (t) => swatchOf[t];
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const formName = { essay: 'Essay', paper: 'Paper', talk: 'Talk', poem: 'Poem', rhymes: 'Rhymes', 'rabbit-hole': 'Rabbit hole' };

const flame = `<span class="flame" aria-hidden="true"></span>`;
const header = (right, left = `<a href="cover.html">${H} · ${esc(haulTitle)}</a>`) => `<a class="skip" href="#main">Skip to the page</a>
<header class="top">
  <div class="top-row">
    <a class="mast" href="cover.html">${flame}<span>From the Dumpster Fire</span></a>
    <nav class="nav" aria-label="Site">
      <a href="cover.html">Latest</a><a href="cover.html">Every Haul</a><a href="cover.html">Threads</a><a href="cover.html">About</a>
      <button class="toggle" type="button" data-theme-toggle aria-label="Switch light or dark"><span></span></button>
    </nav>
  </div>
  <div class="runhead">${left}<span>${esc(right)}</span></div>
</header>`;

const folio = (left, right) => `<footer class="folio">
  <p class="folio-l">${left}</p>
  <p class="folio-r">${right}</p>
</footer>`;

/** Fore-edge thumb tabs. On an item page, one tab; on the cover, all six, as links. */
const tab = (it) => `<span class="tab n${num(it)} s-${sw(it.type)}" aria-hidden="true">${num(it)}</span>`;
const tabs = () => `<nav class="tabs" aria-label="Thumb index">${haul.items.map((it) => `<a class="tab n${num(it)} s-${sw(it.type)}" href="${hrefFor(it.id)}" aria-label="${num(it)}: ${esc(it.title.text)}">${num(it)}</a>`).join('')}</nav>`;

const machineNotes = (it) => it.marginalia.map((m) => `<p class="mnote"><span class="mnote-k">Note</span> ${esc(m.text)} <span class="cite">${esc(m.cite)}</span></p>`).join('\n');

const seeAlso = (it) => {
  const rows = [
    ...it.wiki.map((w) => `<li class="sa"><a href="${esc(w.url)}">${esc(w.title)}</a><span class="lead" aria-hidden="true"></span><span class="ptr">Wikipedia</span><span class="sa-g">${esc(w.summary)}</span></li>`),
    ...it.connections.map((c) => `<li class="sa"><a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a><span class="lead" aria-hidden="true"></span><span class="ptr">${c.itemId ? `item ${num(item(c.itemId))}` : 'thread'}</span><span class="sa-g"><span class="sa-t">${esc(c.type)}.</span> ${esc(c.note)}</span></li>`),
  ];
  return rows.length ? `<section class="seealso" aria-label="See also"><h2 class="h-small">See also</h2><ul>${rows.join('')}</ul></section>` : '';
};

const sourceLine = (it, verb) => `<p class="source"><a href="${esc(it.source.url)}">${verb} at ${esc(host(it.source.url))}</a>${it.minutes ? `<span class="muted"> · ${it.minutes} minutes</span>` : ''}</p>`;

const prevNext = (it) => {
  const i = haul.items.indexOf(it);
  const p = haul.items[i - 1], n = haul.items[i + 1];
  return `<nav class="pn" aria-label="Previous and next">
  ${p ? `<a href="${hrefFor(p.id)}"><span class="pn-k">${num(p)}</span> ${title(p.title)}</a>` : `<a href="cover.html"><span class="pn-k">Cover</span> ${title(haul.title)}</a>`}
  ${n ? `<a class="pn-n" href="${hrefFor(n.id)}"><span class="pn-k">${num(n)}</span> ${title(n.title)}</a>` : `<a class="pn-n" href="cover.html"><span class="pn-k">Cover</span> ${title(haul.title)}</a>`}
</nav>`;
};

const itemPage = (it, inner, cls = '') => doc({
  title: `${it.title.text} · ${H} · From the Dumpster Fire`,
  bodyClass: `form-${it.type} s-${sw(it.type)} ${cls}`,
  body: `${header(formName[it.type])}
${tab(it)}
<main id="main" class="item">
${inner}
${prevNext(it)}
</main>
${folio(`${H}`, `${num(it)}`)}`,
});

const why = (it, cls = 'why') => `<p class="${cls}">${esc(it.why.text)} <span class="sig">B.</span></p>`;

// ---------- cover ----------
const note = haul.fieldNote;
const cover = doc({
  title: `${H}: ${haulTitle} · From the Dumpster Fire`,
  bodyClass: `cover s-${haul.swatch}`,
  body: `${header('Contents')}
${tabs()}
<main id="main">
  <section class="hero" aria-label="From the field note">
    <p class="hero-line"><mark class="big">${esc(note.highlight)}</mark></p>
    <p class="hero-sig">B., field note, ${H}</p>
  </section>

  <section class="page issue" aria-labelledby="haul-title">
    <div class="col">
      <p class="issue-k">${H} · Thursday 15 October 2026 · six objects</p>
      <h1 class="issue-t" id="haul-title">${title(haul.title)}</h1>
      <p class="deck">${esc(haul.deck)}</p>
    </div>
  </section>

  <section class="page fieldnote" aria-labelledby="fn-title">
    <div class="col">
      <h2 class="h-mid" id="fn-title">${title(note.title)}</h2>
      ${note.paragraphs.map((p) => `<p>${hl(p, note.highlight)}</p>`).join('\n      ')}
      <p class="sig-line">B.</p>
    </div>
    <aside class="side route" aria-labelledby="route-title">
      <h2 class="h-small" id="route-title">The route, by day</h2>
      <ol>
        ${note.route.map((s) => s.by === 'machine'
          ? `<li class="rt rt-m"><span class="rt-d">${esc(s.day)}</span><span class="rt-x machine">${esc(s.text)}</span><span class="rt-p"></span></li>`
          : `<li class="rt"><span class="rt-d">${esc(s.day)}</span><a class="rt-x" href="${hrefFor(s.itemId)}">${esc(s.text)}</a><span class="rt-p">${s.itemId ? num(item(s.itemId)) : ''}</span></li>`).join('\n        ')}
      </ol>
      <p class="key"><span>Serif: the editor's finds.</span> <span class="machine">Blue: a link the machine noticed.</span></p>
    </aside>
  </section>

  <section class="page contents" aria-labelledby="ix-title">
    <div class="col wide">
      <h2 class="h-mid" id="ix-title">Index of this Haul</h2>
      <ol class="ix">
        ${haul.items.map((it) => `<li class="ix-row s-${sw(it.type)}">
          <span class="ix-form"><span class="key-sq" aria-hidden="true"></span>${formName[it.type]}</span>
          <a class="ix-main" href="${hrefFor(it.id)}"><span class="ix-t">${title(it.title)}</span><span class="ix-c">, ${esc(it.creator)}, ${esc(year(it.source.date))}</span></a>
          <span class="lead" aria-hidden="true"></span>
          <span class="ix-n">${num(it)}</span>
          <p class="ix-why">${esc(it.why.text.split(/(?<=\.)\s/)[0])}</p>
        </li>`).join('\n        ')}
      </ol>
    </div>
  </section>

  <section class="page thread" aria-labelledby="th-title">
    <div class="col">
      <h2 class="h-small" id="th-title">The thread through this Haul</h2>
      <p class="th-t"><a href="cover.html">${title(haul.threads[0].title)}</a><span class="muted">, 1858 to 2025, seven points, five of them here</span></p>
      <ol class="th">
        ${haul.threads[0].points.map((p) => `<li class="${p.inHaul ? '' : 'out'}"><span class="th-y">${p.year}</span><span class="th-x">${esc(p.title)}</span><span class="th-e machine">${esc(p.edge)}</span></li>`).join('\n        ')}
      </ol>
    </div>
  </section>

  <section class="page colophon" aria-labelledby="col-title">
    <div class="col">
      <h2 class="h-small" id="col-title">Colophon</h2>
      <p>Chosen and annotated by Bhuvanesh, mostly by voice. Read, cross-linked and drafted with language models, then checked by hand. The serif is the editor; <span class="machine">the blue sans is the machine.</span> Every quotation was matched against its source and every link was fetched before publishing. Plates are public domain.</p>
      <p class="muted">Set in Newsreader and Schibsted Grotesk.</p>
    </div>
  </section>
</main>
${folio(`${H}`, 'Contents')}`,
});

// ---------- waiting ----------
const forms = [
  ['apricot', 'Essays and posts', 'set as a magazine opening'],
  ['mint', 'Papers', 'set as a journal offprint'],
  ['butter', 'Talks, videos and podcasts', 'set as a transcript'],
  ['coral', 'Poems', 'set alone, as a broadside'],
  ['sky', 'Rhymes', 'then and now, on facing pages'],
  ['pistachio', 'Rabbit holes', 'set as a catalogue card'],
];
const waiting = doc({
  title: 'From the Dumpster Fire',
  bodyClass: 'waiting s-apricot',
  body: `${header('Before Haul 001', '<span>From the Dumpster Fire, a magazine in Hauls</span>')}
<main id="main">
  <section class="hero" aria-labelledby="w-title">
    <h1 class="hero-line" id="w-title"><mark class="big">Things worth salvaging from the internet and the archive.</mark></h1>
  </section>
  <section class="page">
    <div class="col">
      <h2 class="h-mid">Haul 001 is being gathered</h2>
      <p>From the Dumpster Fire is a magazine of things worth pulling out of the internet before they burn: essays, talks, papers, poems, podcasts, passages and strange corners of Wikipedia. It arrives in Hauls, when there is enough worth sending.</p>
      <p>The first one is not out yet. <a href="cover.html">Read how it's made</a>, or follow the <a href="cover.html">RSS feed</a> to hear when it lands.</p>
    </div>
    <aside class="side">
      <h2 class="h-small">What a Haul holds</h2>
      <ol class="forms">
        ${forms.map(([s, a, b]) => `<li class="s-${s}"><span class="key-sq" aria-hidden="true"></span><span class="f-a">${a}</span><span class="lead" aria-hidden="true"></span><span class="f-b">${b}</span></li>`).join('\n        ')}
      </ol>
    </aside>
  </section>
</main>
${folio('Haul 001', 'forthcoming')}`,
});

// ---------- essay ----------
const essayIt = byType('essay');
const essay = itemPage(essayIt, `<article class="essay">
  <header class="col open">
    <h1 class="t-essay">${title(essayIt.title)}</h1>
    <p class="byline">${esc(essayIt.creator)}, <span class="muted">${esc(essayIt.source.name)}, ${esc(essayIt.source.date)}</span></p>
    ${why(essayIt, 'standfirst')}
  </header>
  <div class="grid">
    <div class="col">
      <blockquote class="pullin">
        <p>${hl(essayIt.excerpt.text, essayIt.excerpt.highlight, 'big')}</p>
        <footer>${esc(essayIt.creator)}, ${esc(essayIt.title.text)}, ${esc(essayIt.excerpt.locator.toLowerCase())}</footer>
      </blockquote>
      ${sourceLine(essayIt, 'Read the essay')}
    </div>
    <aside class="side">${machineNotes(essayIt)}</aside>
  </div>
  <div class="grid"><div class="col">${seeAlso(essayIt)}</div></div>
</article>`);

// ---------- paper ----------
const paperIt = byType('paper');
let sec = 0;
const S = (t) => `<h2 class="sec"><span class="sec-n">${++sec}</span>${t}</h2>`;
const paper = itemPage(paperIt, `<article class="offprint">
  <p class="cite-run">${esc(paperIt.creator)}. ${esc(paperIt.title.text)}. <em>${esc(paperIt.source.name)}</em>, ${esc(paperIt.source.date)}. ${esc(host(paperIt.source.url))}${esc(new URL(paperIt.source.url).pathname)}</p>
  <div class="grid">
    <div class="col">
      <h1 class="t-paper">${title(paperIt.title)}</h1>
      <p class="authors">${esc(paperIt.creator)}</p>
      <div class="abstract">
        <p><span class="abs-k">Abstract.</span> ${hl(paperIt.excerpt.text, paperIt.excerpt.highlight)}</p>
        <p class="abs-f">From the abstract. The rest of the paper is at the source.</p>
      </div>
      ${S("Why it's here")}
      ${why(paperIt, 'body-why')}
      ${paperIt.marginalia.length ? S('Notes') + machineNotes(paperIt) : ''}
      ${S('References')}
      <ol class="refs">${paperIt.wiki.map((w, i) => `<li><span class="ref-n">[${i + 1}]</span> <a href="${esc(w.url)}">${esc(w.title)}</a>. Wikipedia. ${esc(w.summary)}</li>`).join('')}</ol>
      ${S('Related')}
      <ol class="refs">${paperIt.connections.map((c) => `<li><span class="ref-n">${esc(c.type)}.</span> <a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a>. ${esc(c.note)}</li>`).join('')}</ol>
    </div>
    <aside class="side">
      <p class="side-k">Read</p>
      ${sourceLine(paperIt, 'The paper')}
      <p class="side-note">Start with the abstract and the first two pages, then Figure 1.</p>
    </aside>
  </div>
</article>`);

// ---------- talk ----------
const talkIt = byType('talk');
const talk = itemPage(talkIt, `<article class="transcript">
  <header class="col open">
    <h1 class="t-talk">${title(talkIt.title)}</h1>
    <p class="byline">${esc(talkIt.creator)}, <span class="muted">a talk at ${esc(talkIt.source.name)}, ${esc(talkIt.source.date)}, ${talkIt.minutes} minutes</span></p>
  </header>
  <div class="grid">
    <ol class="col tx">
      <li class="tx-row tx-date"><span class="tx-m">${esc(talkIt.source.name)},<br>${esc(talkIt.source.date)}</span><span class="tx-b muted">From the transcript.</span></li>
      <li class="tx-row tx-src"><span class="tx-m">Hamming</span><p class="tx-b">${hl(talkIt.excerpt.text, talkIt.excerpt.highlight)}</p></li>
      <li class="tx-row tx-ed"><span class="tx-m">B.</span><p class="tx-b">${esc(talkIt.why.text)}</p></li>
      ${talkIt.marginalia.map((m) => `<li class="tx-row tx-mc"><span class="tx-m machine">Note</span><p class="tx-b machine">${esc(m.text)} <span class="cite">${esc(m.cite)}</span></p></li>`).join('\n      ')}
    </ol>
    <aside class="side">
      <p class="side-k">Listen</p>
      ${sourceLine(talkIt, 'The transcript')}
      ${seeAlso(talkIt)}
    </aside>
  </div>
</article>`);

// ---------- poem ----------
const poemIt = byType('poem');
const poem = itemPage(poemIt, `<article class="broadside">
  <h1 class="sr">${esc(poemIt.title.text)}, by ${esc(poemIt.creator)}</h1>
  <p class="poem">${hl(poemIt.excerpt.text, poemIt.excerpt.highlight)}</p>
  <p class="poem-foot">${esc(poemIt.creator)}<br><em>${esc(poemIt.source.name)}</em>, ${esc(poemIt.source.date)}</p>
  <p class="poem-why">${esc(poemIt.why.text)} <span class="sig">B.</span></p>
  <div class="poem-more">${seeAlso(poemIt)}</div>
</article>`, 'quiet');

// ---------- rhymes ----------
const rhIt = byType('rhymes');
const r = rhIt.rhyme;
const rhymes = itemPage(rhIt, `<article class="facing">
  <header class="col open">
    <h1 class="t-rhymes">${title(rhIt.title)}</h1>
    ${why(rhIt, 'standfirst')}
  </header>
  <div class="spread">
    <section class="leaf leaf-l" aria-label="Then, ${r.then.year}">
      <p class="leaf-y">${esc(r.then.year)}</p>
      <p class="leaf-q">${esc(r.then.quote)}</p>
      <p class="leaf-c">${esc(r.then.cite)}</p>
      <p class="leaf-f">then</p>
    </section>
    <div class="gutter"><p>${esc(r.bridge)}</p></div>
    <section class="leaf leaf-r" aria-label="Now, ${r.now.year}">
      <p class="leaf-y">${esc(r.now.year)}</p>
      <p class="leaf-q">${esc(r.now.quote)}</p>
      <p class="leaf-c">${esc(r.now.cite)}</p>
      <p class="leaf-f">now</p>
    </section>
  </div>
  <div class="grid"><div class="col">${sourceLine(rhIt, 'The Coal Question')}${seeAlso(rhIt)}</div></div>
</article>`);

// ---------- rabbit hole ----------
const rhole = byType('rabbit-hole');
const pl = rhole.plate;
const rabbit = itemPage(rhole, `<article class="entry">
  <div class="grid">
    <div class="col">
      <div class="card">
        <h1 class="headword">Great Stink, <span class="hw-inv">The</span></h1>
        <p class="hw-d">${esc(rhole.source.date)}. Summer.</p>
        <p class="entry-t">${esc(rhole.why.text)} <span class="sig">B.</span></p>
        ${machineNotes(rhole)}
        <p class="sa-inline"><span class="sa-k">See also</span> ${rhole.wiki.map((w) => `<a href="${esc(w.url)}">${esc(w.title.split(' ').reverse().join(', '))}</a>, ${esc(w.summary.replace(/\.$/, '').replace(/^The /, 'the '))}`).join('; ')}; <a href="cover.html">Price of plenty, The</a>, this Haul's thread, where it is the first point.</p>
        <span class="punch" aria-hidden="true"></span>
      </div>
      ${sourceLine(rhole, 'The entry')}
    </div>
    <figure class="side plate">
      <img src="silent-highwayman.jpg" width="${pl.width}" height="${pl.height}" alt="Punch cartoon: a skeleton rowing a boat on the filthy Thames.">
      <figcaption><span class="cap">${esc(pl.caption)}</span> <span class="credit">${esc(pl.credit)}. ${esc(pl.licence[0].toUpperCase() + pl.licence.slice(1))}.</span></figcaption>
    </figure>
  </div>
</article>`);

// ---------- css ----------
const css = String.raw`
/* Direction C, Index. Layout: a left reading column (38rem) with objects in the right field;
   book apparatus (running head, folio, fore-edge thumb tabs) on every page; one highlighted
   line is each page's bold moment. */
:root {
  --serif: 'Newsreader Text', Georgia, serif;
  --display: 'Newsreader Display', 'Newsreader Text', Georgia, serif;
  --sans: 'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif;
  --g: 16px;
  --col: 38rem;
  --hl: var(--apricot);
}
@media (min-width: 700px) { :root { --g: 32px; } }
@media (min-width: 1100px) { :root { --g: 56px; } }
.s-apricot { --hl: var(--apricot); } .s-coral { --hl: var(--coral); } .s-butter { --hl: var(--butter); }
.s-sky { --hl: var(--sky); } .s-mint { --hl: var(--mint); } .s-pistachio { --hl: var(--pistachio); }

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 18px/1.55 var(--serif); position: relative; overflow-x: clip; font-synthesis: none; -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }
h1, h2, p, ol, ul, figure, blockquote { margin: 0; }
ol, ul { list-style: none; padding: 0; }
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; text-decoration-color: var(--ink2); }
a:hover { text-decoration-color: currentColor; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
mark { background: var(--hl); color: inherit; padding: 0 0.1em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: var(--g); top: 8px; background: var(--bg); padding: 4px 8px; z-index: 5; }
.muted { color: var(--ink2); }
.machine { font-family: var(--sans); color: var(--machine); font-size: 0.86em; }
em { font-style: italic; }

/* chrome: small and receding */
.top { padding: 18px var(--g) 0; padding-left: max(var(--g), env(safe-area-inset-left, 0px)); padding-right: max(var(--g), env(safe-area-inset-right, 0px)); }
.top-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.mast { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; font: italic 400 19px/1 var(--serif); white-space: nowrap; }
.flame { width: 9px; height: 9px; background: var(--ember); border-radius: 0 50% 50% 50%; transform: rotate(45deg); margin-top: 3px; flex: none; }
.nav { display: flex; align-items: center; gap: 22px; font: 500 13px/1 var(--sans); color: var(--ink2); }
.nav a { text-decoration: none; }
.nav a:hover { color: var(--ink); }
.toggle { background: none; border: 0; padding: 4px; cursor: pointer; color: var(--ink); display: inline-flex; }
.toggle span { width: 15px; height: 15px; border: 1.5px solid currentColor; border-radius: 50%; position: relative; overflow: hidden; }
.toggle span::after { content: ""; position: absolute; inset: 0 0 0 50%; background: currentColor; }
.runhead { display: flex; justify-content: space-between; gap: 16px; margin-top: 16px; padding-top: 8px; border-top: 1px solid var(--rule); font: 400 12.5px/1.4 var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; }
.runhead a { text-decoration: none; }
@media (max-width: 699px) {
  .nav a:not(:first-child) { display: none; }
  .nav { gap: 14px; }
}

/* fore-edge thumb tabs: square tabs flush on the right edge, stepped down by item number */
.tab { position: absolute; right: 0; width: 28px; height: 46px; background: var(--hl); color: var(--ink); font: 600 12px/46px var(--sans); text-align: center; text-decoration: none; font-variant-numeric: tabular-nums; }
.tab.n1 { top: 150px; } .tab.n2 { top: 198px; } .tab.n3 { top: 246px; } .tab.n4 { top: 294px; } .tab.n5 { top: 342px; } .tab.n6 { top: 390px; }
.tabs .tab { z-index: 1; }
@media (max-width: 1099px) { .tab { width: 7px; color: transparent; font-size: 0; } }

/* layout */
.page, .hero, .grid, article > .col, article > header, .folio, .pn, .spread, .broadside {
  padding-left: max(var(--g), env(safe-area-inset-left, 0px)); padding-right: max(var(--g), env(safe-area-inset-right, 0px));
}
@media (min-width: 1100px) {
  .page, .hero, .grid, article > .col, article > header, .folio, .pn, .spread, .broadside { padding-right: calc(var(--g) + 40px); }
}
.page { display: grid; gap: 40px; padding-block: 40px; }
.grid { display: grid; gap: 40px; }
.col { min-width: 0; max-width: var(--col); }
.col.wide { max-width: 60rem; }
.side { min-width: 0; }
@media (min-width: 1000px) {
  .page, .grid { grid-template-columns: minmax(0, var(--col)) minmax(0, 1fr); column-gap: clamp(48px, 7vw, 120px); align-items: start; }
  .page > .col.wide { grid-column: 1 / -1; }
  .side { max-width: 26rem; }
}
.col > p + p { margin-top: 0.9em; }

.h-mid { font: 500 clamp(28px, 3.2vw, 38px)/1.1 var(--display); letter-spacing: -0.01em; text-wrap: balance; margin-bottom: 18px; }
.h-mid em, .issue-t em, h1 em { font-weight: 400; }
.h-small { font: 600 13px/1.3 var(--sans); color: var(--ink2); margin-bottom: 14px; }
.sig, .sig-line { font-style: italic; }
.sig-line { margin-top: 14px; text-align: right; }

/* the bold moment: a highlighted line set very large */
.hero { padding-block: clamp(40px, 7vw, 96px) clamp(24px, 4vw, 48px); }
.hero-line { font: 400 clamp(38px, 7.6vw, 112px)/1.1 var(--display); letter-spacing: -0.02em; max-width: 15.5em; text-wrap: balance; }
/* a flat marker stroke through the lower body of each line, not a filled box */
mark.big { background: linear-gradient(to bottom, transparent 30%, var(--hl) 30%, var(--hl) 90%, transparent 90%); padding: 0 0.04em; }
.hero-sig { margin-top: 22px; font: italic 400 18px/1.4 var(--serif); color: var(--ink2); }
.waiting .hero-line { max-width: 13em; }

.issue { padding-block: 24px 8px; border-top: 1px solid var(--rule); margin-inline: max(var(--g), env(safe-area-inset-left, 0px)); padding-inline: 0; }
@media (min-width: 1100px) { .issue { margin-right: calc(var(--g) + 40px); } }
.issue-k { font: 400 14px/1.4 var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; margin-bottom: 10px; }
.issue-t { font: 500 clamp(34px, 4.4vw, 54px)/1.04 var(--display); letter-spacing: -0.015em; }
.deck { margin-top: 12px; font-size: 20px; line-height: 1.45; color: var(--ink2); }

.fieldnote mark { background: var(--hl); }
.route ol { border-top: 1px solid var(--rule); }
.rt { display: grid; grid-template-columns: 2.6em minmax(0, 1fr) 1.4em; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--rule); font-size: 16px; line-height: 1.4; align-items: baseline; }
.rt-d { font: 500 12.5px/1.4 var(--sans); color: var(--ink2); }
.rt-x { text-decoration: none; }
.rt-x:hover { text-decoration: underline; }
.rt-p { text-align: right; font: 400 13px var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; }
.rt-m .rt-d { color: var(--machine); }
.key { margin-top: 12px; font-size: 14px; color: var(--ink2); display: flex; flex-wrap: wrap; gap: 4px 12px; }

/* the index */
.contents { border-top: 1px solid var(--rule); margin-top: 16px; }
.ix { border-top: 2px solid var(--ember); }
.ix-row { display: grid; grid-template-columns: 8.5rem minmax(0, auto) minmax(24px, 1fr) 2rem; column-gap: 12px; align-items: baseline; padding: 18px 0 20px; border-bottom: 1px solid var(--rule); }
.ix-form { font: 500 13px/1.4 var(--sans); color: var(--ink2); display: inline-flex; align-items: center; gap: 8px; }
.key-sq { width: 12px; height: 12px; background: var(--hl); flex: none; outline: 1px solid var(--rule); outline-offset: -1px; }
.ix-main { text-decoration: none; min-width: 0; }
.ix-t { font: 500 clamp(22px, 2.4vw, 28px)/1.15 var(--display); }
.ix-t em { font-weight: 400; }
.ix-c { font-size: 17px; color: var(--ink2); }
.ix-main:hover .ix-t { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; }
.lead { border-bottom: 1.5px dotted var(--ink2); align-self: end; margin-bottom: 0.4em; opacity: 0.7; }
.ix-n { text-align: right; font: 500 18px var(--display); font-variant-numeric: tabular-nums; }
.ix-why { grid-column: 2 / 4; margin-top: 6px; font-style: italic; color: var(--ink); font-size: 17px; line-height: 1.45; max-width: 36rem; }
@media (max-width: 699px) {
  .ix-row { grid-template-columns: minmax(0, 1fr) 2rem; }
  .ix-form { grid-column: 1 / -1; margin-bottom: 4px; }
  .ix-row .lead { display: none; }
  .ix-why { grid-column: 1 / 2; }
}

.thread { border-top: 1px solid var(--rule); margin-top: 16px; }
.th-t { font: 500 26px/1.2 var(--display); margin-bottom: 14px; }
.th-t .muted { font: 400 17px var(--serif); }
.th-t em { font-weight: 400; }
.th li { display: grid; grid-template-columns: 3.2em minmax(0, 1fr); column-gap: 14px; padding: 6px 0; font-size: 16px; line-height: 1.4; border-bottom: 1px solid var(--rule); }
.th-y { font: 500 13px/1.6 var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; grid-row: span 2; }
.th-e { font-size: 13px; }
.th li.out .th-x { color: var(--ink2); font-style: italic; }

.colophon { border-top: 1px solid var(--rule); margin-top: 16px; }
.colophon p { font-size: 16px; line-height: 1.55; }
.colophon p + p { margin-top: 10px; font-size: 14px; }

/* folio and prev/next */
.folio { display: flex; justify-content: space-between; padding-block: 28px 36px; margin-top: 24px; font: 500 13px/1 var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; }
.folio-r { font: 500 20px/1 var(--display); color: var(--ember); }
.pn { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding-block: 28px 0; margin-top: 48px; }
.pn > a { border-top: 1px solid var(--ink); padding-top: 12px; text-decoration: none; font: 500 19px/1.25 var(--display); min-width: 0; }
.pn > a em { font-weight: 400; }
.pn-k { display: block; font: 400 12.5px/1.4 var(--sans); color: var(--ink2); margin-bottom: 4px; }
.pn-n { text-align: right; }
@media (min-width: 1000px) { .pn { max-width: calc(var(--col) + 2 * var(--g)); } }

/* shared item furniture */
.open { padding-block: clamp(36px, 6vw, 72px) 28px; }
.byline { margin-top: 14px; font-size: 18px; }
.standfirst { margin-top: 22px; font: italic 400 21px/1.5 var(--serif); max-width: 34rem; }
.source { margin-top: 26px; font: 500 15px/1.4 var(--sans); }
.source a { text-decoration-color: var(--ink2); }
.source .muted { font-weight: 400; }
.mnote { font: 400 14.5px/1.5 var(--sans); color: var(--machine); padding: 12px 0; border-top: 1px solid var(--rule); }
.mnote:first-child { border-top: 0; padding-top: 0; }
.mnote-k { font-weight: 600; }
.cite { display: block; margin-top: 4px; font-size: 12.5px; opacity: 0.85; }
.seealso { margin-top: 48px; }
.seealso ul { border-top: 1px solid var(--rule); }
.sa { display: grid; grid-template-columns: auto minmax(16px, 1fr) auto; column-gap: 10px; align-items: baseline; padding: 10px 0 12px; border-bottom: 1px solid var(--rule); font-size: 17px; }
.sa > a { min-width: 0; }
.ptr { font: 400 13px var(--sans); color: var(--ink2); }
.sa-g { grid-column: 1 / -1; font-size: 15px; line-height: 1.45; color: var(--ink2); margin-top: 3px; }
.sa-t { color: var(--ink); }
.side-k { font: 600 13px/1.3 var(--sans); color: var(--ink2); }
.side .source { margin-top: 6px; }
.side-note { margin-top: 10px; font-size: 16px; font-style: italic; color: var(--ink2); }

/* essay: magazine opening, the highlighted span is the moment */
.t-essay { font: 500 clamp(40px, 4.6vw, 60px)/1.02 var(--display); letter-spacing: -0.02em; text-wrap: balance; }
.pullin { margin-top: 8px; }
.pullin p { font: 400 clamp(26px, 3.3vw, 40px)/1.22 var(--display); letter-spacing: -0.01em; text-wrap: pretty; }
.pullin footer { margin-top: 16px; font-size: 15px; color: var(--ink2); }
.essay .side { padding-top: 10px; }

/* paper: journal offprint */
.cite-run { padding-block: 20px 10px; font: 400 13.5px/1.45 var(--serif); color: var(--ink2); border-bottom: 1px solid var(--rule); margin-inline: max(var(--g), env(safe-area-inset-left, 0px)); padding-inline: 0; }
@media (min-width: 1100px) { .cite-run { margin-right: calc(var(--g) + 40px); } }
.offprint .grid { padding-top: 44px; }
.t-paper { font: 500 clamp(32px, 4vw, 48px)/1.08 var(--display); letter-spacing: -0.01em; text-wrap: balance; }
.authors { margin-top: 10px; font-style: italic; font-size: 19px; }
.abstract { margin: 32px 0 8px; padding: 0 2.2em; font-size: 17px; line-height: 1.55; }
.abstract mark { background: var(--hl); }
.abs-k { font-variant: small-caps; letter-spacing: 0.04em; font-size: 1.05em; }
.abs-f { margin-top: 8px; font-size: 13.5px; color: var(--ink2); }
.sec { display: flex; gap: 14px; align-items: baseline; font: 500 21px/1.3 var(--display); margin: 36px 0 12px; }
.sec-n { font: 500 15px var(--sans); color: var(--ink2); min-width: 1.2em; font-variant-numeric: tabular-nums; }
.body-why { font-size: 18px; }
.refs li { font-size: 16px; line-height: 1.5; padding: 4px 0; padding-left: 2.2em; text-indent: -2.2em; }
.ref-n { color: var(--ink2); font-variant-numeric: tabular-nums; }

/* talk: transcript, speaker in the margin */
.tx { border-top: 1px solid var(--ink); max-width: 44rem; }
.tx-row { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); column-gap: 20px; padding: 18px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
.tx-m { font: 500 12.5px/1.45 var(--sans); color: var(--ink2); letter-spacing: 0.06em; text-transform: uppercase; }
.tx-src .tx-m { font: 400 15px/1.3 var(--serif); letter-spacing: 0.08em; color: var(--ink); }
.tx-ed .tx-m { font: italic 400 18px/1.3 var(--serif); letter-spacing: 0; text-transform: none; color: var(--ink); }
.tx-date .tx-m { text-transform: none; letter-spacing: 0; }
.tx-date .tx-b { font-size: 15px; font-style: italic; }
.tx-src .tx-b { font: 400 clamp(24px, 2.8vw, 32px)/1.25 var(--display); }
.tx-ed .tx-b { font-style: italic; }
.tx-mc .tx-m { text-transform: uppercase; }
.tx-mc .tx-b { font-size: 15px; line-height: 1.5; }
.t-talk { font: 500 clamp(40px, 5.6vw, 72px)/1.02 var(--display); letter-spacing: -0.02em; text-wrap: balance; }
@media (max-width: 599px) { .tx-row { grid-template-columns: minmax(0, 1fr); row-gap: 6px; } }

/* poem: broadside, the poem alone */
.quiet .runhead span { visibility: hidden; }
.broadside { padding-block: clamp(72px, 14vw, 200px) 40px; display: grid; }
@media (min-width: 1000px) { .broadside { padding-left: 24vw; } }
.poem { font: italic 400 clamp(36px, 5.8vw, 80px)/1.14 var(--display); letter-spacing: -0.015em; max-width: 12em; text-wrap: balance; }
.poem-foot { margin-top: clamp(40px, 6vw, 72px); font-size: 17px; line-height: 1.5; font-variant: small-caps; letter-spacing: 0.04em; }
.poem-foot em { font-variant: normal; letter-spacing: 0; }
.poem-why { margin-top: 64px; max-width: 26rem; font-size: 16px; font-style: italic; color: var(--ink2); }
.poem-more { max-width: 30rem; }
.quiet .pn { max-width: none; }
@media (min-width: 1000px) { .quiet .pn { padding-left: 24vw; } }

/* rhymes: facing pages */
.t-rhymes { font: 500 clamp(36px, 4.8vw, 60px)/1.05 var(--display); letter-spacing: -0.015em; text-wrap: balance; }
.spread { display: grid; gap: 0; margin-top: 12px; }
.leaf { padding: 28px 0 22px; display: flex; flex-direction: column; border-top: 1px solid var(--ink); }
.leaf-y { font: 400 clamp(64px, 9vw, 120px)/0.9 var(--display); letter-spacing: -0.03em; font-variant-numeric: lining-nums; }
.leaf-q { margin-top: 22px; font: 400 clamp(21px, 2.2vw, 26px)/1.35 var(--display); }
.leaf-c { margin-top: 14px; font-size: 15px; color: var(--ink2); }
.leaf-f { margin-top: auto; padding-top: 28px; font: italic 400 15px var(--serif); color: var(--ink2); }
.leaf-r .leaf-f { text-align: right; }
.gutter { padding: 22px 0; }
.gutter p { font: italic 400 17px/1.5 var(--serif); padding-block: 14px; border-block: 1px solid var(--rule); }
@media (min-width: 900px) {
  .spread { grid-template-columns: minmax(0, 1fr) 15rem minmax(0, 1fr); }
  .leaf { padding: 32px 36px 24px 0; border-bottom: 1px solid var(--rule); }
  .leaf-r { padding: 32px 0 24px 36px; }
  .gutter { border-left: 1px solid var(--rule); border-right: 1px solid var(--rule); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 32px 0; display: flex; align-items: center; }
  .gutter p { border: 0; padding: 0 20px; font-size: 16px; text-align: center; }
}

/* rabbit hole: catalogue card beside its plate */
.entry .grid { padding-top: clamp(36px, 6vw, 72px); }
.card { position: relative; border: 1px solid var(--ink); padding: 26px 24px 52px; }
.headword { font: 500 clamp(34px, 4.4vw, 50px)/1.05 var(--display); letter-spacing: -0.015em; }
.hw-inv { font-weight: 400; font-style: italic; }
.hw-d { margin: 8px -24px 24px; padding: 0 24px 14px; border-bottom: 2px solid var(--hl); font: 500 13px/1.4 var(--sans); color: var(--ink2); }
.entry-t { font-size: 19px; line-height: 1.55; }
.card .mnote { margin-top: 18px; border-top: 1px solid var(--rule); padding: 12px 0 0; }
.sa-inline { margin-top: 20px; font-size: 16px; line-height: 1.55; }
.sa-k { font-style: italic; }
.punch { position: absolute; left: 50%; bottom: 16px; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; border: 1px solid var(--ink); background: var(--bg); }
.plate img { width: 100%; }
.plate figcaption { margin-top: 12px; font-size: 15px; line-height: 1.45; }
.plate .credit { display: block; margin-top: 4px; font: 400 12.5px/1.45 var(--sans); color: var(--ink2); }
@media (min-width: 1000px) { .plate { margin-top: 100px; } }

/* waiting page index of forms */
.forms { border-top: 1px solid var(--ink); }
.forms li { display: grid; grid-template-columns: 10px auto minmax(16px, 1fr) auto; column-gap: 10px; align-items: baseline; padding: 11px 0; border-bottom: 1px solid var(--rule); font-size: 17px; }
.forms .key-sq { align-self: center; }
.f-b { font-style: italic; color: var(--ink2); font-size: 16px; }
@media (max-width: 499px) {
  .forms li { grid-template-columns: 10px minmax(0, 1fr); }
  .forms .lead { display: none; }
  .forms .f-b { grid-column: 2; }
}
`;

emit(out, {
  cover, waiting, essay, paper, talk, poem, rhymes, 'rabbit-hole': rabbit,
}, css);
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(out, 'index.html'), overview({
  name: 'Index',
  letter: 'C',
  lines: [
    'The magazine as a book with an index. Every page carries a running head, a folio, and a coloured thumb tab on the right edge that tells you which object you are holding.',
    "The highlighter is the hero: on the cover, the line you underlined in the field note is set huge. Everything else stays small and exact.",
  ],
}));
console.log('built', out);
