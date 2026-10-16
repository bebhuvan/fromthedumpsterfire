// Direction D, "Salvage": the best of the three comps, one loud thing per screen.
// From A (Margin): the struck masthead (waiting page, and small in every header), the wide working
// margin for dates, speakers and machine notes, the essay, paper and talk forms.
// From B (Sheets): the ghost Haul number on the cover, the fanned stack of sheets, the coral
// broadside and the catalogue card. From C (Index): the running head, ember folio, thumb tabs,
// facing pages, and See also set as an index with leaders.
// node docs/design-comps/salvage/build.mjs
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haul, byType, esc, title, hl, pad, year, swatchOf, label, hrefFor, doc, overview, emit } from '../_shared/shared.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const H = `Haul ${pad(haul.number)}`;
const num = (it) => haul.items.indexOf(it) + 1;
const haulTitle = `${haul.title.text} ${haul.title.italic ?? ''}`.trim();
const sw = (t) => `sw-${swatchOf[t]}`;

const toggle = `<button class="tog" type="button" data-theme-toggle aria-label="Switch light or dark"><span aria-hidden="true"></span></button>`;
const flame = `<span class="flame" aria-hidden="true"></span>`;

/** Top bar. `mast` adds the small struck masthead (item pages); the cover carries the big one. */
const top = ({ mast = true, bare = false, run = null } = {}) => `<header class="top wrap">
  <a class="top-home" href="cover.html">${flame}${mast ? `<span class="mast-s"><span class="it">From the</span> <s>Internet</s> Dumpster Fire</span>` : `<span class="sr">From the Dumpster Fire</span>`}</a>
  <nav class="top-nav" aria-label="Sections">${bare ? `<a href="cover.html">${H}</a>` : `<a href="cover.html">Hauls</a><a href="cover.html">Threads</a><a href="waiting.html">About</a>`}${toggle}</nav>
</header>${run ? `
<div class="wrap"><p class="runhead"><a href="cover.html">${H} · ${esc(haulTitle)}</a><span>${esc(run)}</span></p></div>` : ''}`;

/** Fore-edge thumb tabs: one per item, in its colour, stepped down by number. */
const tabLink = (it, here) => `<a class="tab n${num(it)} ${sw(it.type)}${here ? ' here' : ''}" href="${hrefFor(it.id)}" aria-label="${num(it)}: ${esc(it.title.text)}"${here ? ' aria-current="page"' : ''}>${num(it)}</a>`;
const tabs = (cur) => `<nav class="tabs" aria-label="Thumb index">${haul.items.filter((it) => !cur || it === cur).map((it) => tabLink(it, it === cur)).join('')}</nav>`;

const foot = (folio = '') => `${folio ? `<p class="folio wrap"><span>${H}</span><span class="folio-n">${folio}</span></p>` : ''}
<footer class="foot wrap g">
  <p class="m foot-mark">${flame}<span><span class="it">From the</span> <s>Internet</s> Dumpster Fire</span></p>
  <p class="c foot-line">Things worth salvaging from the internet and the archive. The serif is the editor; <span class="machine">the blue sans is the machine.</span></p>
  <nav class="c foot-nav" aria-label="Elsewhere"><a href="cover.html">Every Haul</a><a href="cover.html">Threads</a><a href="waiting.html">How it's made</a><a href="waiting.html">RSS</a></nav>
</footer>`;

/** Index form of a name: "Joseph Bazalgette" becomes "Bazalgette, Joseph". */
const inverted = (n) => { const w = n.split(' '); return w.length === 2 ? `${w[1]}, ${w[0]}` : n; };

const key = (t) => `<span class="key ${sw(t)}" aria-hidden="true"></span>`;

/** Machine notes: blue sans, each with its citation. */
const notes = (it) => it.marginalia.map((n) => `<p class="note machine">${esc(n.text)} <cite>${esc(n.cite)}</cite></p>`).join('\n');

/** Wikipedia and connections, set as an index: entry, dotted leader, pointer, gloss. */
const apparatus = (it) => {
  const rows = [
    ...it.wiki.map((w) => `<li class="sa"><a href="${esc(w.url)}">${esc(w.title)}</a><span class="lead" aria-hidden="true"></span><span class="ptr">Wikipedia</span><span class="sa-g">${esc(w.summary)}</span></li>`),
    ...it.connections.map((c) => `<li class="sa"><a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a><span class="lead" aria-hidden="true"></span><span class="ptr">${c.itemId ? `item ${haul.items.findIndex((x) => x.id === c.itemId) + 1}` : 'thread'}</span><span class="sa-g"><span class="sa-t">${esc(c.type)}.</span> <i>${esc(c.note)}</i></span></li>`),
  ];
  return rows.length ? `<section class="wrap g row" aria-labelledby="sa-${it.id}">
    <h2 class="m mh" id="sa-${it.id}">See also</h2>
    <ul class="c seealso">${rows.join('')}</ul>
  </section>` : '';
};

const source = (it, verb = 'Read it') => `<p class="src"><a href="${esc(it.source.url)}">${verb} at ${esc(it.source.name)}</a><span>${esc(it.source.date)}${it.minutes ? ` · ${it.minutes} minutes` : ''}</span></p>`;

// ---------- cover ----------

/** The words the editor marked in each item, shown on its sheet in the contents. */
const marked = (it) => it.excerpt?.highlight ?? it.excerpt?.text ?? it.rhyme?.now.quote ?? null;

const cover = () => {
  const fn = haul.fieldNote;
  const typeOf = new Map(haul.items.map((i) => [i.id, i.type]));
  const route = fn.route.map((r) => {
    const t = r.itemId ? typeOf.get(r.itemId) : null;
    const body = r.itemId ? `<a href="${hrefFor(r.itemId)}">${esc(r.text)}</a>` : esc(r.text);
    return `<li class="${r.by === 'machine' ? 'by-machine' : ''}"><span class="day">${esc(r.day)}</span><span class="rt${r.by === 'machine' ? ' machine' : ''}">${t ? key(t) : ''}${r.by === 'machine' ? '<span class="sr">The machine noticed: </span>' : ''}${body}</span></li>`;
  }).join('\n');
  const contents = haul.items.map((it, i) => `<li class="band ${sw(it.type)} step-${i + 1}">
    <a href="${hrefFor(it.id)}">
      <span class="b-num">${pad(i + 1, 2)}</span>
      <span class="b-form">${esc(label[it.type])}</span>
      <span class="b-main">
        <span class="b-title">${title(it.title)}</span>
        <span class="b-by">${esc(it.creator)}, ${esc(year(it.source.date))}</span>
        ${marked(it) ? `<span class="b-mk">${esc(marked(it))}</span>` : ''}
        <span class="b-why">${esc(it.why.text.split(/(?<=[.!?])\s/)[0])}</span>
      </span>
    </a>
  </li>`).join('\n');
  const th = haul.threads[0];
  return doc({ title: `${H}: ${haulTitle}`, body: `${top()}

<main>
<section class="ghost sw-${haul.swatch}" aria-labelledby="ht">
  <div class="wrap ghost-in">
    <span class="numeral" aria-hidden="true">${pad(haul.number)}</span>
    <p class="gmeta">${H} · Thursday 15 October 2026 · six objects</p>
    <h1 class="cover-title" id="ht"><span class="sr">${H}: </span>${title(haul.title)}</h1>
    <p class="cover-deck">${esc(haul.deck)}</p>
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

<section class="wrap g contents" aria-labelledby="cnt">
  <h2 class="m mh" id="cnt">In this Haul</h2>
  <ol class="mc stack">${contents}</ol>
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
${foot()}` });
};

// ---------- waiting: the front door, under the struck masthead ----------

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
    <li>${key('rabbit-hole')}<span><b>Rabbit holes</b>, as catalogue cards with their cross-references.</span></li>
  </ul>
</section>
<section class="wrap g row" aria-labelledby="wn">
  <h2 class="m mh" id="wn">Until then</h2>
  <div class="c"><p>The first one is not out yet. Read <a href="waiting.html">how it's made</a>, or follow the <a href="waiting.html">RSS feed</a> to hear when it lands.</p>
  <p class="machine small">Chosen and annotated by one editor, mostly by voice. Language models read, cross-link and check; anything they write is set in this blue.</p></div>
</section>
</main>
${foot()}` });

// ---------- essay: magazine opening ----------

const essay = () => {
  const it = byType('essay');
  return doc({ title: `${it.title.text}: ${H}`, body: `${top({ run: 'Essay' })}
${tabs(it)}
<main class="t-essay">
<header class="wrap g open">
  <p class="m meta"><span>${key('essay')}Essay</span><span>${esc(it.source.name)}, ${esc(it.source.date)}</span><span>${it.minutes} minutes</span></p>
  <h1 class="mc essay-t">${title(it.title)}</h1>
  <p class="c byline">${esc(it.creator)}</p>
</header>
<section class="wrap g why" aria-label="Why it's here">
  <p class="m mh">Why it's here</p>
  <div class="c"><p class="standfirst">${esc(it.why.text)} <span class="sign-in">B.</span></p></div>
</section>
<section class="wrap g pull" aria-label="From the essay">
  <div class="m pull-m"><p class="loc">${esc(it.excerpt.locator)}</p>${notes(it)}</div>
  <blockquote class="c pull-q"><p>${hl(it.excerpt.text, it.excerpt.highlight, `hl ${sw('essay')}`)}</p></blockquote>
</section>
<div class="wrap g"><div class="c">${source(it, 'Read the essay')}</div></div>
${apparatus(it)}
</main>
${foot(num(it))}` });
};

// ---------- paper: journal offprint ----------

const paper = () => {
  const it = byType('paper');
  const secs = [['Why it\'s here', `<p>${esc(it.why.text)} <span class="sign-in">B.</span></p>`]];
  if (it.marginalia.length) secs.push(['Notes', notes(it)]);
  secs.push(['References', `<ul class="refs">${it.wiki.map((w, i) => `<li><span class="rn">[${i + 1}]</span><span><a href="${esc(w.url)}">${esc(w.title)}</a>. ${esc(w.summary)} <span class="small ink2">Wikipedia.</span></span></li>`).join('')}</ul>`]);
  return doc({ title: `${it.title.text}: ${H}`, body: `${top({ run: 'Paper' })}
${tabs(it)}
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
${apparatus({ ...it, wiki: [] })}
</main>
${foot(num(it))}` });
};

// ---------- talk: transcript ----------

const talk = () => {
  const it = byType('talk');
  const speaker = it.creator.split(' ').pop();
  return doc({ title: `${it.title.text}: ${H}`, body: `${top({ run: 'Talk' })}
${tabs(it)}
<main class="t-talk">
<header class="wrap g tr-head">
  <p class="m meta"><span>${key('talk')}Talk</span><span>Transcript</span><span>${it.minutes} minutes</span></p>
  <div class="c"><h1 class="h-item">${title(it.title)}</h1><p class="byline">${esc(it.creator)} at ${esc(it.source.name)}</p></div>
</header>
<section class="wrap transcript" aria-label="Transcript">
  <div class="g tl"><p class="m when">${esc(it.source.name)}<br>${esc(it.source.date)}</p></div>
  <div class="g tl"><p class="m who">${esc(speaker)}</p><p class="c said">${hl(it.excerpt.text, it.excerpt.highlight, `hl ${sw('talk')}`)}</p></div>
  <div class="g tl"><p class="m who who-ed">B.</p><p class="c ed">${esc(it.why.text)}</p></div>
  ${it.marginalia.map((n) => `<div class="g tl"><p class="m who machine">Machine</p><p class="c note machine">${esc(n.text)} <cite>${esc(n.cite)}</cite></p></div>`).join('\n')}
</section>
<div class="wrap g"><div class="c">${source(it, 'Read the transcript')}</div></div>
${apparatus(it)}
</main>
${foot(num(it))}` });
};

// ---------- poem: broadside, one coral sheet ----------

const poem = () => {
  const it = byType('poem');
  return doc({ title: `${it.title.text}: ${H}`, body: `${top({ run: 'Poem' })}
${tabs(it)}
<main class="t-poem">
<div class="wrap">
  <article class="bs ${sw('poem')}" aria-labelledby="pt">
    <h1 class="sr" id="pt">${esc(it.title.text)}, ${esc(it.creator)}</h1>
    <p class="bs-poem">${esc(it.excerpt.text)}</p>
    <p class="bs-foot"><span class="bs-who">${esc(it.creator)}</span><span><i>${esc(it.title.text)}</i>, ${esc(it.source.date)}</span></p>
  </article>
</div>
<section class="wrap g why" aria-label="Why it's here">
  <p class="m mh">Why it's here</p>
  <div class="c"><p class="ed">${esc(it.why.text)} <span class="sign-in">B.</span></p></div>
</section>
${apparatus(it)}
</main>
${foot(num(it))}` });
};

// ---------- rhymes: facing pages ----------

const rhymes = () => {
  const it = byType('rhymes');
  const r = it.rhyme;
  const leaf = (k, x) => `<section class="leaf leaf-${k}" aria-label="${k === 'then' ? 'Then' : 'Now'}, ${esc(x.year)}">
    <p class="leaf-y">${esc(x.year)}</p>
    <blockquote><p class="leaf-q">${esc(x.quote)}</p></blockquote>
    <p class="leaf-c">${esc(x.cite)}</p>
    <p class="leaf-f">${k}</p>
  </section>`;
  return doc({ title: `${it.title.text} ${it.title.italic}: ${H}`, body: `${top({ run: 'Rhymes' })}
${tabs(it)}
<main class="t-rhymes">
<header class="wrap g rh-head">
  <p class="m meta"><span>${key('rhymes')}Rhymes</span><span>${esc(r.then.year)} and ${esc(r.now.year)}</span></p>
  <div class="c"><h1 class="h-item">${title(it.title)}</h1><p class="standfirst rh-sf">${esc(it.why.text)} <span class="sign-in">B.</span></p></div>
</header>
<div class="wrap"><div class="spread">
  ${leaf('then', r.then)}
  <div class="gutter"><p>${esc(r.bridge)}</p></div>
  ${leaf('now', r.now)}
</div></div>
<div class="wrap g"><div class="c">${source(it, 'Read about it')}</div></div>
${apparatus(it)}
</main>
${foot(num(it))}` });
};

// ---------- rabbit hole: catalogue card, the plate beside it ----------

const rabbit = () => {
  const it = byType('rabbit-hole');
  const p = it.plate;
  const [place, yr] = it.source.date.split(', ');
  return doc({ title: `${it.title.text}: ${H}`, body: `${top({ run: 'Rabbit hole' })}
${tabs(it)}
<main class="t-rabbit">
<div class="wrap card-lay">
  <article class="card ${sw('rabbit-hole')}" aria-labelledby="hw">
    <p class="c-call"><span>FDF ${pad(haul.number)}.${num(it)}</span><span>${esc(place)}</span></p>
    <h1 class="c-head" id="hw">Great Stink, <span class="hw-the">The</span></h1>
    <p class="c-dates">${esc(place)}, summer ${esc(yr)}</p>
    <p class="c-ed">${esc(it.why.text)} <span class="sign-in">B.</span></p>
    ${it.marginalia.map((m) => `<p class="c-m machine">${esc(m.text)} <cite>${esc(m.cite)}</cite></p>`).join('')}
    <p class="c-see"><i>See also</i> ${it.wiki.map((w) => `<a href="${esc(w.url)}">${esc(inverted(w.title))}</a>`).join('; ')}; <a href="cover.html">Price of plenty, The</a> <span class="ink2">(thread)</span>.</p>
    <p class="c-src">Source: <a href="${esc(it.source.url)}">${esc(it.source.name)}, ${esc(it.title.text)}</a></p>
    <span class="punch" aria-hidden="true"></span>
  </article>
  <figure class="plate">
    <img src="silent-highwayman.jpg" width="${p.width}" height="${p.height}" alt="A Punch cartoon: Death, a skeleton in a cloak, rows a boat along the filthy Thames.">
    <figcaption><span>${esc(p.caption)}</span><span class="cr">${esc(p.credit)}. ${esc(p.licence[0].toUpperCase() + p.licence.slice(1))}.</span></figcaption>
  </figure>
</div>
${apparatus(it)}
</main>
${foot(num(it))}` });
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

/* ---------- Salvage additions ---------- */
body { position: relative; overflow-x: hidden; }
.sign-in { font-family: var(--display); font-style: italic; color: var(--ember); white-space: nowrap; }

/* Book apparatus: running head, ember folio, thumb tabs on the fore-edge. */
.runhead { display: flex; justify-content: space-between; gap: 16px; padding-top: 9px; border-top: 1px solid var(--rule); font: 400 13px/1.4 var(--sans); color: var(--ink2); }
.runhead a { text-decoration: none; }
.folio { display: flex; justify-content: space-between; align-items: baseline; padding-block: 40px 0; font: 500 13px/1 var(--sans); color: var(--ink2); }
.folio-n { font: 400 24px/1 var(--display); color: var(--ember); font-variant-numeric: lining-nums; }
.tab { position: absolute; right: 0; z-index: 3; width: 7px; height: 44px; background: var(--sw); font-size: 0; color: transparent; text-decoration: none; }
.tab.n1 { top: 140px; } .tab.n2 { top: 186px; } .tab.n3 { top: 232px; } .tab.n4 { top: 278px; } .tab.n5 { top: 324px; } .tab.n6 { top: 370px; }
@media (min-width: 1100px) { .tab { width: 28px; font: 600 12px/44px var(--sans); color: var(--ink); text-align: center; font-variant-numeric: tabular-nums; } .tab.here { width: 36px; } }

/* Cover: the ghost number is the one loud thing. */
.ghost { position: relative; overflow: hidden; --sw: var(--apricot); }
.ghost-in { position: relative; padding-block: 0 40px; }
.numeral { display: block; margin-right: calc(-0.2em - var(--gut)); text-align: right; font: 500 clamp(200px, 62vw, 760px)/0.74 var(--display); letter-spacing: -0.04em; color: var(--sw); user-select: none; white-space: nowrap; padding-top: 0.12em; margin-bottom: -0.1em; }
.gmeta, .cover-title, .cover-deck { position: relative; z-index: 1; }
.gmeta { font: 400 14px/1.4 var(--sans); color: var(--ink2); margin-bottom: 16px; }
.cover-title { font: 500 clamp(52px, 12vw, 132px)/0.95 var(--display); letter-spacing: -0.025em; max-width: 7.2em; text-wrap: balance; }
.cover-title em { font-weight: 400; }
.cover-deck { font-size: 20px; line-height: 1.45; max-width: 25em; margin-top: 20px; }
@media (min-width: 700px) {
  .ghost-in { padding-block: 190px 72px; }
  .numeral { position: absolute; top: 0; right: -0.14em; margin: 0; padding: 0; font-size: clamp(300px, 50vw, 720px); line-height: 0.8; z-index: 0; }
  .cover-deck { font-size: 22px; }
}

/* Contents: a fanned stack of sheets, each carrying the line the editor marked. */
.contents { padding-block: 24px 40px; row-gap: 14px; }
.contents > ol.stack { display: grid; gap: 0; margin-top: 0; }
@media (min-width: 1000px) { .stack { grid-column: 2 / -1; padding-right: 48px; } }
.band { background: var(--sw); }
.band a { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 2px 10px; padding: 18px 18px 22px; text-decoration: none; }
.b-num { font: 500 13px/1.7 var(--sans); color: var(--ink2); font-variant-numeric: tabular-nums; }
.b-form { font: 500 13px/1.7 var(--sans); color: var(--ink2); }
.b-main { grid-column: 1 / -1; display: grid; gap: 3px; }
.b-title { font: 500 clamp(27px, 3vw, 34px)/1.08 var(--display); letter-spacing: -0.012em; margin-top: 4px; }
.b-title em { font-weight: 400; }
.b-by { font-size: 16px; color: var(--ink2); }
.b-mk { font: 400 19px/1.42 var(--display); margin-top: 10px; max-width: 32em; }
.b-why { font-style: italic; font-size: 16px; margin-top: 6px; color: var(--ink2); max-width: 34em; }
.band a:hover .b-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.12em; }
.step-2 { margin-left: 6px; } .step-3 { margin-left: 12px; } .step-4 { margin-left: 18px; } .step-5 { margin-left: 24px; } .step-6 { margin-left: 30px; }
.step-1 { margin-right: 30px; } .step-2 { margin-right: 24px; } .step-3 { margin-right: 18px; } .step-4 { margin-right: 12px; } .step-5 { margin-right: 6px; }
@media (min-width: 700px) {
  .band a { grid-template-columns: 40px 104px minmax(0, 1fr); padding: 22px 28px 26px; }
  .b-main { grid-column: 3; grid-row: 1 / 3; }
  .step-2 { margin-left: 14px; } .step-3 { margin-left: 28px; } .step-4 { margin-left: 42px; } .step-5 { margin-left: 56px; } .step-6 { margin-left: 70px; }
  .step-1 { margin-right: 70px; } .step-2 { margin-right: 56px; } .step-3 { margin-right: 42px; } .step-4 { margin-right: 28px; } .step-5 { margin-right: 14px; }
}

/* See also: an index with dotted leaders. */
.seealso { border-top: 1px solid var(--rule); }
.sa { display: grid; grid-template-columns: auto minmax(16px, 1fr) auto; column-gap: 10px; align-items: baseline; padding: 11px 0 13px; border-bottom: 1px solid var(--rule); font-size: 18px; }
.sa > a { min-width: 0; }
.lead { border-bottom: 1.5px dotted var(--ink2); align-self: end; margin-bottom: 0.42em; opacity: 0.6; }
.ptr { font: 400 13px var(--sans); color: var(--ink2); }
.sa-g { grid-column: 1 / -1; font-size: 15.5px; line-height: 1.45; color: var(--ink2); margin-top: 3px; }
.sa-t { color: var(--ink); font-style: normal; }

/* Talk: the editor speaks in ember italic, as B. */
.who-ed { font: 400 italic 20px/1.3 var(--display); color: var(--ember); letter-spacing: 0; text-transform: none; }

/* Poem: a single coral broadside. */
.bs { background: var(--sw); padding: 72px 28px 28px; min-height: 64vh; display: flex; flex-direction: column; justify-content: space-between; gap: 72px; margin-top: 16px; }
.bs-poem { font: 400 clamp(38px, 6.4vw, 78px)/1.1 var(--display); font-style: italic; letter-spacing: -0.012em; max-width: 11em; text-wrap: balance; }
.bs-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 24px; font-size: 17px; border-top: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); padding-top: 14px; }
.bs-who { font-family: var(--display); font-weight: 500; font-size: 19px; }
@media (min-width: 1000px) { .bs { max-width: 820px; margin-left: calc(17rem + var(--colgap)); margin-right: 64px; padding: 120px 88px 36px; min-height: 0; } }

/* Rhymes: facing pages, the bridge in the gutter. */
.rh-head { padding-block: 32px 28px; row-gap: 14px; }
.rh-sf { margin-top: 18px; font-size: 20px; }
.spread { display: grid; margin-top: 8px; }
.leaf { padding: 28px 0 22px; display: flex; flex-direction: column; border-top: 1px solid var(--ink); }
.leaf-y { font: 400 clamp(64px, 9vw, 120px)/0.9 var(--display); letter-spacing: -0.03em; font-variant-numeric: lining-nums; }
.leaf-then .leaf-y { color: var(--ink2); }
.leaf-q { margin-top: 22px; font: 400 clamp(21px, 2.2vw, 27px)/1.35 var(--display); }
.leaf-c { margin-top: 14px; font-size: 15px; color: var(--ink2); font-style: italic; }
.leaf-f { margin-top: auto; padding-top: 28px; font: italic 400 15px var(--serif); color: var(--ink2); }
.leaf-now .leaf-f { text-align: right; }
.gutter { padding: 6px 0 22px; }
.gutter p { font: italic 400 17px/1.5 var(--serif); padding-block: 14px; border-block: 1px solid var(--rule); color: var(--ink2); }
@media (min-width: 900px) {
  .spread { grid-template-columns: minmax(0, 1fr) 15rem minmax(0, 1fr); }
  .leaf { padding: 32px 36px 24px 0; border-bottom: 1px solid var(--rule); }
  .leaf-now { padding: 32px 0 24px 36px; }
  .gutter { border-inline: 1px solid var(--rule); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 32px 0; display: flex; align-items: center; }
  .gutter p { border: 0; padding: 0 20px; font-size: 16px; text-align: center; }
}

/* Rabbit hole: the catalogue card, plate beside it. */
.card-lay { display: grid; gap: 32px; padding-block: 16px 24px; }
.card { position: relative; background: var(--sw); padding: 24px 20px 72px; }
.c-call { display: flex; justify-content: space-between; font: 500 12.5px/1.4 var(--sans); color: var(--ink2); margin-bottom: 24px; font-variant-numeric: tabular-nums; }
.c-head { font: 500 clamp(40px, 6vw, 62px)/1 var(--display); letter-spacing: -0.015em; }
.hw-the { font-weight: 400; font-style: italic; }
.c-dates { font-size: 18px; font-style: italic; margin: 8px 0 22px; padding-bottom: 14px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 14%, transparent); color: var(--ink2); }
.c-ed { font-size: 19px; line-height: 1.6; max-width: 34rem; }
.c-m { margin-top: 18px; max-width: 32rem; }
.c-see { margin-top: 22px; font-size: 17px; max-width: 34rem; }
.c-src { margin-top: 18px; font: 400 14px/1.5 var(--sans); color: var(--ink2); }
.plate img { width: 100%; }
.plate figcaption { margin-top: 10px; display: grid; gap: 4px; font-size: 16px; font-style: italic; }
.plate .cr { font: 400 13px/1.45 var(--sans); color: var(--ink2); font-style: normal; }
.punch { position: absolute; left: 50%; bottom: 22px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: var(--bg); }
@media (min-width: 700px) { .card { padding: 32px 48px 88px; } }
@media (min-width: 1050px) { .card-lay { grid-template-columns: minmax(0, 720px) minmax(0, 400px); column-gap: 56px; } .plate { padding-top: 150px; } }
`;

emit(out, {
  index: overview({ name: 'Salvage', letter: 'D', lines: [
    'The best of the three, with one loud thing per screen. The front door keeps the struck masthead; the Haul cover gets the ghost number and the fanned stack of sheets.',
    'Every page has the working margin for dates, speakers and machine notes, a running head, an ember folio and colour tabs on the edge.',
    'Forms: magazine opening, offprint and transcript from Margin; the coral broadside and the catalogue card from Sheets; facing pages and the see-also index from Index.',
  ] }),
  cover: cover(), waiting: waiting(), essay: essay(), paper: paper(), talk: talk(), poem: poem(), rhymes: rhymes(), 'rabbit-hole': rabbit(),
}, css);
console.log('salvage: built');
