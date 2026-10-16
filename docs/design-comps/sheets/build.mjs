// Direction B, "Sheets": coloured papers laid on a white desk. Each item is a square-edged sheet of
// its type colour; the apparatus (machine notes, references, links) sits in the wide margin beside it.
// node docs/design-comps/sheets/build.mjs
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haul, item, byType, esc, title, hl, pad, year, swatchOf, label, hrefFor, doc, overview, emit, tokensCss } from '../_shared/shared.mjs';

const out = dirname(fileURLToPath(import.meta.url));
const n = pad(haul.number);
const order = haul.items.map((i) => i.id);
const typeOf = (id) => item(id)?.type;
const firstSentence = (s) => (/^.*?[.!?](\s|$)/.exec(s)?.[0] ?? s).trim();
const date = new Date(haul.publishedAt + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const header = (current = '') => `<header class="top wrap">
  <a class="mast" href="cover.html"><span class="flame" aria-hidden="true"></span>From the Dumpster Fire</a>
  <nav class="nav" aria-label="Sections">
    <a href="cover.html"${current === 'haul' ? ' aria-current="page"' : ''}>Latest</a>
    <a href="cover.html">Threads</a>
    <a href="cover.html">Archive</a>
    <a href="waiting.html">About</a>
    <button class="toggle" type="button" data-theme-toggle aria-label="Switch light or dark"><span aria-hidden="true"></span></button>
  </nav>
</header>`;

const footer = `<footer class="foot wrap">
  <p>Things worth salvaging from the internet and the archive. The serif is the editor; <span class="machine">the blue sans is the machine.</span></p>
  <nav aria-label="More"><a href="cover.html">Every Haul</a><a href="cover.html">Threads</a><a href="waiting.html">How it's made</a><a href="waiting.html">RSS</a></nav>
</footer>`;

const page = (t, body, cls = '') => doc({ title: t, body, bodyClass: cls });

// Small shared pieces of the apparatus (the margin beside each sheet).
const sourceLine = (it) => `<p class="src"><span class="src-k">${it.type === 'talk' ? 'The transcript' : 'The source'}</span><a href="${esc(it.source.url)}">${esc(it.source.name)}</a><span>${esc(it.source.date)}${it.minutes ? ` · ${it.minutes} minutes` : ''}</span></p>`;
// Index-style headwords: "The price of plenty" -> "Price of plenty, The"; "Joseph Bazalgette" -> "Bazalgette, Joseph".
const invert = (t) => {
  if (/^The /.test(t)) { const r = t.slice(4); return r[0].toUpperCase() + r.slice(1) + ', The'; }
  const w = t.split(' ');
  return w.length === 2 && w.every((x) => /^[A-Z][a-z]+$/.test(x)) ? `${w[1]}, ${w[0]}` : t;
};
const notes = (it) => it.marginalia.length ? `<section class="ap-block" aria-label="Notes">
  ${it.marginalia.map((m) => `<p class="mnote machine">${esc(m.text)} <cite>${esc(m.cite)}</cite></p>`).join('\n  ')}
</section>` : '';
const refs = (it) => it.wiki.length ? `<section class="ap-block" aria-labelledby="refs-${it.id}">
  <h2 class="ap-h" id="refs-${it.id}">From Wikipedia</h2>
  <ul class="refs">${it.wiki.map((w) => `<li><a href="${esc(w.url)}">${esc(w.title)}</a>. ${esc(w.summary)}</li>`).join('')}</ul>
</section>` : '';
const links = (it) => it.connections.length ? `<section class="ap-block" aria-labelledby="links-${it.id}">
  <h2 class="ap-h" id="links-${it.id}">Cross-references</h2>
  <ul class="links">${it.connections.map((c) => `<li><em class="ltype">${esc(c.type)}:</em> <a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a>. <span class="lnote">${esc(c.note)}</span></li>`).join('')}</ul>
</section>` : '';
const nextLink = (it) => {
  const i = order.indexOf(it.id);
  const nx = item(order[(i + 1) % order.length]);
  return `<p class="next"><span>Next in Haul ${n}</span><a href="${hrefFor(nx.id)}">${title(nx.title)}</a></p>`;
};
const crumb = (it) => `<p class="crumb wrap"><a href="cover.html">Haul ${n}</a><span>${pad(order.indexOf(it.id) + 1, 2)} of ${pad(order.length, 2)}</span><span>${label[it.type]}</span></p>`;
const why = (it, cls = 'why') => `<div class="${cls}"><p>${esc(it.why.text)}</p><p class="sign">B.</p></div>`;

// ---------- Cover ----------
const cover = () => {
  const fn = haul.fieldNote;
  const stack = haul.items.map((it, i) => `<li class="band s-${swatchOf[it.type]} step-${i + 1}">
      <a href="${hrefFor(it.id)}">
        <span class="b-num">${pad(i + 1, 2)}</span>
        <span class="b-form">${label[it.type]}</span>
        <span class="b-main">
          <span class="b-title">${title(it.title)}</span>
          <span class="b-by">${esc(it.creator)}, ${esc(year(it.source.date))}</span>
          <span class="b-why">${esc(firstSentence(it.why.text))}</span>
        </span>
      </a>
    </li>`).join('\n    ');
  const route = fn.route.map((s) => {
    const body = s.itemId ? `<a href="${hrefFor(s.itemId)}">${esc(s.text)}</a>` : esc(s.text);
    return s.by === 'machine'
      ? `<li class="r-m"><span class="r-day">${esc(s.day)}</span><span class="machine"><span class="sr">The machine noticed: </span>${body}</span></li>`
      : `<li><span class="r-day">${esc(s.day)}</span><span>${body}</span></li>`;
  }).join('\n      ');
  return page(`Haul ${n}: ${haul.title.text} ${haul.title.italic ?? ''}`, `${header('haul')}
<main>
  <section class="ghost s-${haul.swatch}" aria-labelledby="haul-title">
    <div class="wrap ghost-in">
      <span class="numeral" aria-hidden="true">${n}</span>
      <p class="meta">Haul ${n} · <time datetime="${haul.publishedAt}">${date}</time> · six objects</p>
      <h1 id="haul-title" class="cover-title"><span class="sr">Haul ${haul.number}: </span>${title(haul.title)}</h1>
      <p class="deck">${esc(haul.deck)}</p>
    </div>
  </section>

  <section class="wrap fn" aria-labelledby="fn-title">
    <div class="fn-text">
      <h2 id="fn-title" class="fn-title">${title(fn.title)}</h2>
      ${fn.paragraphs.map((p) => `<p>${hl(p, fn.highlight)}</p>`).join('\n      ')}
      <p class="sign">B.</p>
    </div>
    <aside class="route" aria-labelledby="route-title">
      <h2 id="route-title" class="ap-h">How this Haul was found</h2>
      <ol>
      ${route}
      </ol>
    </aside>
  </section>

  <section class="wrap contents" aria-labelledby="contents-title">
    <h2 id="contents-title" class="contents-h">Six objects, in the order they were found</h2>
    <ol class="stack">
    ${stack}
    </ol>
  </section>

  <section class="wrap colophon" aria-labelledby="colo-title">
    <h2 id="colo-title" class="ap-h">Colophon</h2>
    <p>${esc(haul.colophon).replace('the blue sans is the machine', '<span class="machine">the blue sans is the machine</span>')}</p>
  </section>
</main>
${footer}`, 'p-cover');
};

// ---------- Waiting page ----------
const waiting = () => {
  const forms = [
    ['apricot', 'Essays and posts', 'set as a magazine opening'],
    ['butter', 'Talks, videos and podcasts', 'set as a transcript'],
    ['mint', 'Papers', 'set as a journal offprint'],
    ['coral', 'Poems and passages', 'set alone on a broadside'],
    ['sky', 'Rhymes', 'then and now on facing pages'],
    ['pistachio', 'Rabbit holes', 'filed on a catalogue card'],
  ];
  return page('From the Dumpster Fire', `${header()}
<main>
  <section class="ghost s-apricot" aria-labelledby="wait-title">
    <div class="wrap ghost-in">
      <span class="numeral" aria-hidden="true">001</span>
      <p class="meta">Before the first Haul</p>
      <h1 id="wait-title" class="cover-title wait-title">Haul 001 is <em>being gathered</em></h1>
      <p class="deck">From the Dumpster Fire is a magazine of things worth pulling out of the internet and the archive before they burn. It arrives in Hauls, when there is enough worth sending.</p>
    </div>
  </section>
  <section class="wrap wait" aria-labelledby="forms-title">
    <div class="wait-text">
      <h2 id="forms-title" class="fn-title">What a Haul holds</h2>
      <p>Six to twenty objects, each with a note on why it is here. Every kind of thing gets the printed form it has always had, so you know what you are holding before you read a word.</p>
      <ul class="legend">
        ${forms.map(([s, a, b]) => `<li class="s-${s}"><span class="lg-sheet" aria-hidden="true"></span><span class="lg-a">${a}</span><span class="lg-b">${b}</span></li>`).join('\n        ')}
      </ul>
      <p class="wait-links"><a href="waiting.html">Read how it's made</a>, or follow the <a href="waiting.html">RSS feed</a> to hear when it lands.</p>
    </div>
    <aside class="wait-side">
      <p class="machine">The editor chooses and annotates every piece, mostly by voice. Language models read, cross-link and fact-check. Their notes are always set in this blue sans, so you can tell them apart.</p>
    </aside>
  </section>
</main>
${footer}`, 'p-wait');
};

// ---------- Item shell ----------
const itemPage = (it, sheet, aside, cls) => page(`${it.title.text}${it.title.italic ? ' ' + it.title.italic : ''}: Haul ${n}`, `${header()}
<main>
  ${crumb(it)}
  <div class="wrap lay ${cls}">
    <article class="sheet s-${swatchOf[it.type]}" aria-labelledby="t-${it.id}">
${sheet}
    </article>
    <aside class="ap" aria-label="About this piece">
${aside}
      ${nextLink(it)}
    </aside>
  </div>
</main>
${footer}`, `p-item p-${it.type}`);

// Essay: magazine opening. One huge title, measured column, the excerpt pulled in.
const essay = () => {
  const it = byType('essay');
  return itemPage(it, `      <p class="kicker">${esc(it.source.name)}, ${esc(it.source.date)}</p>
      <h1 id="t-${it.id}" class="e-title">${title(it.title)}</h1>
      <p class="e-by">${esc(it.creator)}</p>
      ${why(it, 'why e-why')}
      <blockquote class="pullin">
        <p>${hl(it.excerpt.text, it.excerpt.highlight)}</p>
        <footer>${esc(it.creator)}, ${esc(it.title.text)}, ${esc(it.excerpt.locator)}</footer>
      </blockquote>`,
  `      ${sourceLine(it)}
      ${notes(it)}
      ${refs(it)}
      ${links(it)}`, 'l-essay');
};

// Paper: journal offprint. Running citation, abstract, numbered sections.
const paper = () => {
  const it = byType('paper');
  const sections = [
    ['Why it is here', `<p class="ed">${esc(it.why.text)} <span class="sign-in">B.</span></p>`],
    ...(it.marginalia.length ? [['Notes', it.marginalia.map((m) => `<p class="mnote machine">${esc(m.text)} <cite>${esc(m.cite)}</cite></p>`).join('')]] : []),
    ['References', `<ol class="o-refs">${it.wiki.map((w) => `<li><a href="${esc(w.url)}">${esc(w.title)}</a>. ${esc(w.summary)} <span class="o-cite">Wikipedia.</span></li>`).join('')}</ol>`],
    ['Related', `<ul class="o-rel">${it.connections.map((c) => `<li><a href="${c.itemId ? hrefFor(c.itemId) : 'cover.html'}">${esc(c.title)}</a> <span class="o-type">${esc(c.type)}.</span> ${esc(c.note)}</li>`).join('')}</ul>`],
  ];
  return itemPage(it, `      <p class="runhead"><span>${esc(it.creator)} · ${esc(it.source.name)} ${esc(it.source.date)}</span><span>Offprint, Haul ${n}</span></p>
      <h1 id="t-${it.id}" class="o-title">${title(it.title)}</h1>
      <p class="o-by">${esc(it.creator)}</p>
      <section class="abstract" aria-labelledby="abs-${it.id}">
        <h2 id="abs-${it.id}">Abstract</h2>
        <p>${hl(it.excerpt.text, it.excerpt.highlight)} <span class="o-more">The abstract continues in the paper.</span></p>
      </section>
      ${sections.map(([h, body], i) => `<section class="o-sec"><h2><span>${i + 1}</span>${h}</h2>${body}</section>`).join('\n      ')}`,
  `      ${sourceLine(it)}
      <p class="ap-quiet">Figure 1, the Transformer diagram, is on page 3 of the paper.</p>`, 'l-paper');
};

// Talk: transcript. Speaker attribution, the excerpt as a moment, dateline where a timestamp would be.
const talk = () => {
  const it = byType('talk');
  const speaker = it.creator.split(' ').pop().toUpperCase();
  return itemPage(it, `      <p class="t-head">Transcript</p>
      <h1 id="t-${it.id}" class="t-title">${title(it.title)}</h1>
      <p class="t-by">${esc(it.creator)}, a talk to researchers at ${esc(it.source.name)}</p>
      <div class="ts">
        <p class="ts-row"><span class="ts-who"><time datetime="1986-03-07">${esc(it.source.name)}<br>${esc(it.source.date)}</time></span><span class="ts-what stage">The Hamming lecture, about an hour long. The line below is what the editor kept.</span></p>
        <p class="ts-row ts-quote"><span class="ts-who">${esc(speaker)}</span><span class="ts-what">${hl(it.excerpt.text, it.excerpt.highlight)}</span></p>
        <div class="ts-row ts-ed"><span class="ts-who">B.</span><span class="ts-what"><span>${esc(it.why.text)}</span></span></div>
        ${it.marginalia.map((m) => `<p class="ts-row ts-m"><span class="ts-who machine">Note</span><span class="ts-what machine">${esc(m.text)} <cite>${esc(m.cite)}</cite></span></p>`).join('\n        ')}
      </div>`,
  `      ${sourceLine(it)}
      ${refs(it)}
      ${links(it)}`, 'l-talk');
};

// Poem: broadside. The poem alone on a single sheet.
const poem = () => {
  const it = byType('poem');
  return page(`${it.title.text}: Haul ${n}`, `${header()}
<main>
  ${crumb(it)}
  <div class="wrap broad">
    <article class="sheet s-coral bs" aria-labelledby="t-${it.id}">
      <h1 id="t-${it.id}" class="sr">${esc(it.title.text)}, by ${esc(it.creator)}</h1>
      <p class="bs-poem">${esc(it.excerpt.text)}</p>
      <p class="bs-foot"><span>${esc(it.creator)}</span><span><em>${esc(it.title.text)}</em>, ${esc(it.source.date)}</span></p>
    </article>
    <div class="bs-under">
      ${why(it, 'why bs-why')}
      <div class="bs-ap">
        ${sourceLine(it)}
        ${refs(it)}
        ${nextLink(it)}
      </div>
    </div>
  </div>
</main>
${footer}`, 'p-item p-poem');
};

// Rhymes: facing pages. Then on the left, now on the right, the bridge in the gutter.
const rhymes = () => {
  const it = byType('rhymes');
  const r = it.rhyme;
  const side = (k, s) => `<section class="sheet s-sky leaf leaf-${k}" aria-label="${k === 'then' ? 'Then' : 'Now'}, ${esc(s.year)}">
        <p class="lf-year">${esc(s.year)}</p>
        <blockquote><p>${esc(s.quote)}</p></blockquote>
        <p class="lf-cite">${esc(s.cite)}</p>
      </section>`;
  return page(`${it.title.text} ${it.title.italic}: Haul ${n}`, `${header()}
<main>
  ${crumb(it)}
  <article class="wrap rh" aria-labelledby="t-${it.id}">
    <header class="rh-head">
      <h1 id="t-${it.id}" class="rh-title">${title(it.title)}</h1>
      <p class="rh-by">${esc(it.creator)} and the argument that came back, ${esc(r.then.year)} and ${esc(r.now.year)}</p>
    </header>
    <div class="spread">
      ${side('then', r.then)}
      <p class="gutter">${esc(r.bridge)}</p>
      ${side('now', r.now)}
    </div>
    <div class="rh-under">
      ${why(it, 'why rh-why')}
      <div class="rh-ap">
        ${refs(it)}
        ${links(it)}
        ${nextLink(it)}
      </div>
    </div>
  </article>
</main>
${footer}`, 'p-item p-rhymes');
};

// Rabbit hole: catalogue card, with the plate beside it.
const rabbit = () => {
  const it = byType('rabbit-hole');
  const p = it.plate;
  const [place, yr] = it.source.date.split(', ');
  const idx = order.indexOf(it.id) + 1;
  return page(`${it.title.text}: Haul ${n}`, `${header()}
<main>
  ${crumb(it)}
  <div class="wrap lay l-card">
    <article class="sheet s-pistachio card" aria-labelledby="t-${it.id}">
      <p class="c-call"><span>FDF ${n}.${idx}</span><span>${esc(place)}</span></p>
      <h1 id="t-${it.id}" class="c-head">${esc(invert(it.title.text))}</h1>
      <p class="c-dates">${esc(place)}, summer ${esc(yr)}</p>
      <div class="c-body">
      <p class="c-ed">${esc(it.why.text)} <span class="sign-in">B.</span></p>
      ${it.marginalia.map((m) => `<p class="c-m machine">${esc(m.text)} <cite>${esc(m.cite)}</cite></p>`).join('')}
      <div class="c-see">
        <p><span class="c-k">See also</span></p>
        <ul>
          ${it.wiki.map((w) => `<li><a href="${esc(w.url)}">${esc(invert(w.title))}</a>. <span>${esc(w.summary)}</span></li>`).join('')}
          ${it.connections.map((c) => `<li><a href="cover.html">${esc(invert(c.title))}</a>, a thread. <span>${esc(c.type)}.</span></li>`).join('')}
        </ul>
      </div>
      <p class="c-src">Source: <a href="${esc(it.source.url)}">${esc(it.source.name)}, ${esc(it.title.text)}</a></p>
      </div>
      <span class="punch" aria-hidden="true"></span>
    </article>
    <aside class="ap" aria-label="Plate">
      <figure class="plate">
        <img src="silent-highwayman.jpg" width="${p.width}" height="${p.height}" alt="A Punch cartoon: Death, as a skeleton, rows a boat along the filthy Thames.">
        <figcaption><span class="pl-cap">${esc(p.caption)}</span><span class="pl-cr">${esc(p.credit)}. ${esc(p.licence[0].toUpperCase() + p.licence.slice(1))}.</span></figcaption>
      </figure>
      ${nextLink(it)}
    </aside>
  </div>
</main>
${footer}`, 'p-item p-rabbit');
};

const css = String.raw`
/* Direction B, Sheets. Coloured papers laid on a white desk. */
:root {
  --serif: 'Newsreader Text', Georgia, serif;
  --display: 'Newsreader Display', 'Newsreader Text', Georgia, serif;
  --sans: 'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif;
  --g: 16px;
  --line: color-mix(in srgb, var(--ink) 12%, transparent);
}
@media (min-width: 700px) { :root { --g: 28px; } }
@media (min-width: 1100px) { :root { --g: 48px; } }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--serif); font-size: 18px; line-height: 1.55; overflow-x: hidden; font-synthesis: none; -webkit-font-smoothing: antialiased; overflow-wrap: break-word; }
h1, h2, h3, p, figure, blockquote, ol, ul { margin: 0; }
ol, ul { padding: 0; list-style: none; }
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.18em; text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); }
a:hover { text-decoration-color: currentColor; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
em { font-style: italic; font-weight: 400; }
mark { background: var(--butter); color: inherit; padding: 0 0.08em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.sheet mark { background: var(--tape); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.machine { font-family: var(--sans); color: var(--machine); }
cite { font-style: normal; }

.s-apricot { --sw: var(--apricot); } .s-coral { --sw: var(--coral); } .s-butter { --sw: var(--butter); }
.s-sky { --sw: var(--sky); } .s-mint { --sw: var(--mint); } .s-pistachio { --sw: var(--pistachio); }

.wrap { max-width: 1280px; margin: 0 auto; padding-left: max(var(--g), env(safe-area-inset-left, 0px)); padding-right: max(var(--g), env(safe-area-inset-right, 0px)); }

/* Header: receding chrome. */
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-block: 18px; position: relative; z-index: 2; }
.mast { font-family: var(--display); font-style: italic; font-size: 21px; text-decoration: none; display: inline-flex; align-items: center; gap: 9px; white-space: nowrap; }
.flame { width: 8px; height: 8px; background: var(--ember); border-radius: 0 50% 50% 50%; transform: rotate(45deg); margin-top: 3px; }
.nav { display: flex; align-items: center; gap: 22px; font: 500 13px/1 var(--sans); color: var(--ink2); }
.nav a { text-decoration: none; }
.nav a[aria-current] { color: var(--ink); }
.nav a:not(:first-child) { display: none; }
@media (min-width: 700px) { .nav a:not(:first-child) { display: inline; } }
.toggle { width: 22px; height: 22px; padding: 0; border: 0; background: none; cursor: pointer; display: grid; place-items: center; }
.toggle span { width: 15px; height: 15px; border: 1.5px solid var(--ink2); border-radius: 50%; position: relative; overflow: hidden; }
.toggle span::after { content: ''; position: absolute; inset: 0 0 0 50%; background: var(--ink2); }

/* The editor's initial is the one small ember mark on a page: a hand, not a logo. */
.sign { font-family: var(--display); font-style: italic; font-size: 22px; color: var(--ember); }
.sign-in { font-family: var(--display); font-style: italic; color: var(--ember); }
.ap-h { font: 600 12px/1.3 var(--sans); color: var(--ink2); letter-spacing: 0.04em; margin-bottom: 14px; }

/* ---------- The cover: the ghost number ---------- */
.ghost { position: relative; overflow: hidden; }
.ghost-in { position: relative; padding-block: 0 48px; }
.numeral { display: block; margin-right: calc(-0.22em - var(--g)); text-align: right; font: 500 clamp(200px, 60vw, 760px)/0.74 var(--display); letter-spacing: -0.04em; color: var(--sw); pointer-events: none; user-select: none; white-space: nowrap; padding-top: 0.14em; margin-bottom: -0.12em; }
.ghost .meta, .ghost .cover-title, .ghost .deck { position: relative; z-index: 1; }
.meta { font: 500 13px/1.4 var(--sans); color: var(--ink2); margin-bottom: 18px; }
.cover-title { font: 500 clamp(52px, 12vw, 132px)/0.95 var(--display); letter-spacing: -0.02em; max-width: 7.5em; text-wrap: balance; }
.cover-title em { font-weight: 400; }
.deck { font-size: 20px; line-height: 1.45; max-width: 25em; margin-top: 22px; }
@media (min-width: 700px) {
  .ghost-in { padding-block: 210px 88px; }
  .numeral { position: absolute; top: 8px; right: -0.16em; margin: 0; padding: 0; font-size: clamp(300px, 50vw, 720px); line-height: 0.78; z-index: 0; }
  .wait-title { font-size: clamp(56px, 7vw, 96px); }
  .deck { font-size: 22px; }
}

/* Field note and the route in the margin. */
.fn { display: grid; gap: 40px; padding-block: 24px 64px; }
.fn-title { font: 500 clamp(34px, 5vw, 46px)/1.05 var(--display); letter-spacing: -0.01em; margin-bottom: 22px; text-wrap: balance; }
.fn-title em { font-weight: 400; }
.fn-text { max-width: 36rem; }
.fn-text p + p { margin-top: 14px; }
.fn-text p { font-size: 19px; }
.fn-text .sign { margin-top: 10px; }
.route ol { display: grid; gap: 12px; border-top: 1px solid var(--rule); padding-top: 16px; }
.route li { display: grid; grid-template-columns: 40px 1fr; gap: 10px; font-size: 16px; line-height: 1.45; }
.route .r-day { font: 500 12px/1.9 var(--sans); color: var(--ink2); }
.route .r-m .machine { font-size: 14px; line-height: 1.5; }
.route .r-m .r-day { color: var(--machine); }
.route a { text-decoration: none; }
.route a:hover { text-decoration: underline; }
@media (min-width: 1000px) {
  .fn { grid-template-columns: minmax(0, 36rem) minmax(0, 1fr); column-gap: 96px; padding-block: 32px 96px; }
  .route { max-width: 24rem; padding-top: 74px; }
}

/* Contents: a fanned stack of sheet edges. */
.contents { padding-block: 0 72px; }
.contents-h { font: 400 22px/1.3 var(--display); font-style: italic; margin-bottom: 18px; }
.stack { display: grid; gap: 0; }
.band { background: var(--sw); }
.band a { display: grid; grid-template-columns: 30px 1fr; gap: 4px 12px; padding: 18px 16px 20px; text-decoration: none; }
.b-num { font: 500 14px/1.6 var(--sans); color: var(--ink2); grid-row: 1; }
.b-form { font: 500 13px/1.6 var(--sans); color: var(--ink2); grid-row: 1; }
.b-main { grid-column: 1 / -1; display: grid; gap: 2px; }
.b-title { font: 500 27px/1.1 var(--display); letter-spacing: -0.01em; margin-top: 2px; }
.b-title em { font-weight: 400; }
.b-by { font-size: 16px; color: var(--ink2); }
.b-why { font-style: italic; font-size: 17px; line-height: 1.45; margin-top: 6px; max-width: 34em; }
.band a:hover .b-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.12em; }
.step-1 { margin-left: 0; } .step-2 { margin-left: 6px; } .step-3 { margin-left: 12px; }
.step-4 { margin-left: 18px; } .step-5 { margin-left: 24px; } .step-6 { margin-left: 30px; }
@media (min-width: 800px) {
  .band { width: min(820px, calc(100% - 200px)); }
  .band a { grid-template-columns: 44px 120px minmax(0, 1fr); padding: 24px 32px 26px 24px; gap: 0 16px; }
  .b-num, .b-form { grid-row: 1; padding-top: 8px; }
  .b-main { grid-column: 3; grid-row: 1; }
  .b-title { font-size: 34px; }
  .step-2 { margin-left: 40px; } .step-3 { margin-left: 80px; } .step-4 { margin-left: 120px; }
  .step-5 { margin-left: 160px; } .step-6 { margin-left: 200px; }
}
.colophon { padding-block: 0 56px; }
.colophon p { max-width: 40rem; font-size: 16px; color: var(--ink2); }

.foot { display: grid; gap: 14px; padding-block: 28px 40px; border-top: 1px solid var(--rule); margin-top: 24px; font-size: 15px; color: var(--ink2); }
.foot p { font-style: italic; max-width: 32em; }
.foot .machine { font-style: normal; }
.foot nav { display: flex; flex-wrap: wrap; gap: 8px 20px; font: 500 13px var(--sans); }
.foot nav a { text-decoration: none; }
@media (min-width: 900px) { .foot { grid-template-columns: 1fr auto; align-items: end; } }

/* ---------- Waiting page ---------- */
.wait { display: grid; gap: 40px; padding-block: 16px 72px; }
.wait-text { max-width: 38rem; }
.wait-text > p { font-size: 19px; }
.legend { margin: 28px 0; border-top: 1px solid var(--rule); }
.legend li { display: grid; grid-template-columns: 28px 1fr; gap: 0 14px; padding: 12px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
.lg-sheet { width: 28px; height: 18px; background: var(--sw); grid-row: span 2; align-self: center; }
.lg-a { font-size: 18px; }
.lg-b { font-size: 16px; color: var(--ink2); font-style: italic; }
.wait-links { font-size: 18px; }
.wait-side p { font-size: 15px; line-height: 1.55; max-width: 22rem; }
@media (min-width: 640px) { .legend li { grid-template-columns: 28px 15rem 1fr; } .lg-sheet { grid-row: auto; } }
@media (min-width: 1000px) { .wait { grid-template-columns: minmax(0, 38rem) minmax(0, 1fr); column-gap: 96px; } .wait-side { padding-top: 84px; } }

/* ---------- Item pages ---------- */
.crumb { display: flex; gap: 16px; font: 500 13px/1 var(--sans); color: var(--ink2); padding-block: 8px 18px; }
.crumb a { color: var(--ink); text-decoration: none; }
.crumb a:hover { text-decoration: underline; }
.lay { display: grid; gap: 40px; padding-block: 0 72px; }
.sheet { background: var(--sw); padding: 32px 20px 40px; min-width: 0; }
@media (min-width: 700px) { .sheet { padding: 56px 56px 64px; } }
@media (min-width: 1050px) {
  .lay { grid-template-columns: minmax(0, 1fr) 300px; column-gap: 72px; align-items: start; }
  .lay .ap { padding-top: 8px; }
}
@media (min-width: 1200px) { .lay { grid-template-columns: minmax(0, 800px) 320px; column-gap: 96px; } }

/* The apparatus beside each sheet. */
.ap { display: grid; gap: 32px; align-content: start; min-width: 0; }
.ap-block { display: grid; gap: 0; }
.src { display: grid; gap: 2px; font-size: 18px; }
.src a { font-family: var(--display); font-size: 22px; }
.src span { font: 400 14px/1.5 var(--sans); color: var(--ink2); }
.mnote { font-size: 15px; line-height: 1.5; }
.ap-block:has(.mnote) { gap: 16px; }
.mnote cite, .c-m cite, .ts-m cite { display: block; font-size: 12.5px; opacity: 0.8; margin-top: 4px; }
.refs, .links { display: grid; gap: 10px; }
.refs li, .links li { font-size: 16px; line-height: 1.45; color: var(--ink2); padding-left: 1.2em; text-indent: -1.2em; }
.refs a, .links a { color: var(--ink); text-decoration-color: var(--rule); }
.refs a:hover, .links a:hover { text-decoration-color: currentColor; }
.ltype { color: var(--ink2); }
.src-k { font: 500 12px/1.3 var(--sans); color: var(--ink2); margin-bottom: 4px; }
.ap-quiet { font-size: 15px; font-style: italic; color: var(--ink2); }
.next { display: grid; gap: 4px; padding-top: 18px; border-top: 1px solid var(--ink); }
.next span { font: 500 12px/1.4 var(--sans); color: var(--ink2); }
.next a { font: 500 22px/1.15 var(--display); text-decoration: none; }
.next a em { font-weight: 400; }
.next a:hover { text-decoration: underline; }
.why p { font-style: italic; }
.why .sign { font-style: italic; margin-top: 6px; }

/* Essay: magazine opening. */
.kicker { font: 500 13px/1.4 var(--sans); color: var(--ink2); margin-bottom: 28px; }
.e-title { font: 500 clamp(56px, 13vw, 128px)/0.9 var(--display); letter-spacing: -0.03em; max-width: 6em; text-wrap: balance; }
.e-by { font: 400 24px/1.3 var(--display); font-style: italic; margin-top: 20px; }
.e-why { max-width: 31rem; margin-top: 40px; }
.e-why p:first-child { font-size: 21px; line-height: 1.5; }
.pullin { margin-top: 44px; padding-top: 22px; border-top: 2px solid var(--ink); max-width: 36rem; }
.pullin p { font: 400 clamp(24px, 3.2vw, 32px)/1.3 var(--display); }
.pullin footer { font: 400 14px/1.5 var(--sans); color: var(--ink2); margin-top: 14px; }
@media (min-width: 900px) { .pullin { margin-left: 18%; } }

/* Paper: journal offprint. */
.runhead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font: 400 12.5px/1.4 var(--sans); color: var(--ink2); border-bottom: 1px solid var(--ink); padding-bottom: 10px; margin-bottom: 40px; }
.o-title { font: 500 clamp(36px, 6vw, 56px)/1.05 var(--display); text-align: center; letter-spacing: -0.01em; text-wrap: balance; }
.o-by { text-align: center; font-style: italic; font-size: 19px; margin-top: 12px; }
.abstract { margin: 40px auto 8px; max-width: 34rem; }
.abstract h2 { font: 600 12px/1 var(--sans); letter-spacing: 0.14em; text-transform: uppercase; text-align: center; margin-bottom: 14px; }
.abstract p { font-size: 18px; line-height: 1.6; }
.o-more { color: var(--ink2); font-style: italic; }
.o-sec { max-width: 36rem; margin: 36px auto 0; }
.o-sec h2 { font: 500 21px/1.3 var(--display); display: flex; gap: 14px; margin-bottom: 10px; }
.o-sec h2 span { font-family: var(--serif); min-width: 1.2em; }
.o-sec p, .o-sec li { font-size: 17px; line-height: 1.55; }
.o-refs { list-style: decimal; padding-left: 1.4em; display: grid; gap: 8px; }
.o-cite { font-style: italic; }
.o-rel { display: grid; gap: 8px; }
.o-type { font-style: italic; }
.ed { font-style: italic; }

/* Talk: transcript. */
.t-head { font: 600 12px/1 var(--sans); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink2); margin-bottom: 20px; }
.t-title { font: 500 clamp(40px, 7vw, 64px)/1 var(--display); letter-spacing: -0.02em; text-wrap: balance; }
.t-by { font-style: italic; font-size: 19px; margin-top: 12px; }
.ts { margin-top: 36px; border-top: 1px solid var(--ink); }
.ts-row { display: grid; grid-template-columns: 1fr; gap: 4px; padding: 18px 0; border-bottom: 1px solid var(--line); }
.ts-who { font: 400 13px/1.5 var(--serif); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink2); }
.ts-who.machine { font: 600 11.5px/1.7 var(--sans); letter-spacing: 0.08em; color: var(--machine); }
.ts-who time { letter-spacing: 0.02em; text-transform: none; font-style: italic; font-size: 15px; }
.stage { font-style: italic; color: var(--ink2); font-size: 17px; }
.ts-quote .ts-what { font: 400 clamp(26px, 3.6vw, 36px)/1.25 var(--display); }
.ts-quote .ts-who { color: var(--ink); }
.ts-ed .ts-what { font-style: italic; font-size: 18px; }
.ts-ed .ts-who { color: var(--ember); font-family: var(--display); font-style: italic; text-transform: none; font-size: 18px; letter-spacing: 0; }
.ts-m .ts-what { font-size: 15px; line-height: 1.5; }
@media (min-width: 700px) { .ts-row { grid-template-columns: 120px minmax(0, 1fr); gap: 24px; } .ts-who { padding-top: 0.2em; } }

/* Poem: broadside. */
.broad { padding-block: 0 72px; }
.bs { padding: 72px 28px 32px; min-height: 66vh; display: flex; flex-direction: column; justify-content: space-between; gap: 72px; }
.bs-poem { font: 400 clamp(38px, 6.4vw, 76px)/1.12 var(--display); font-style: italic; letter-spacing: -0.01em; max-width: 11em; text-wrap: balance; }
.bs-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 24px; font-size: 17px; border-top: 1px solid var(--line); padding-top: 14px; }
.bs-under { display: grid; gap: 40px; margin-top: 36px; }
.bs-why { max-width: 30rem; font-size: 18px; }
.bs-ap { display: grid; gap: 32px; }
@media (min-width: 900px) {
  .bs { width: min(880px, 78%); padding: 120px 96px 40px; min-height: 0; }
  .bs-under { grid-template-columns: minmax(0, 30rem) 320px; column-gap: 96px; width: min(1200px, 100%); }
  .bs-why { padding-top: 6px; }
}

/* Rhymes: facing pages. */
.rh { padding-block: 0 72px; }
.rh-head { max-width: 46rem; margin-bottom: 32px; }
.rh-title { font: 500 clamp(42px, 7vw, 76px)/0.98 var(--display); letter-spacing: -0.02em; text-wrap: balance; }
.rh-title em { font-weight: 400; }
.rh-by { font-style: italic; font-size: 19px; margin-top: 14px; color: var(--ink2); }
.spread { display: grid; gap: 0; }
.leaf { padding: 32px 22px 36px; display: flex; flex-direction: column; gap: 18px; }
.lf-year { font: 500 clamp(64px, 10vw, 112px)/0.85 var(--display); letter-spacing: -0.03em; }
.leaf blockquote p { font: 400 24px/1.35 var(--display); }
.lf-cite { font-size: 15px; font-style: italic; color: var(--ink2); margin-top: auto; }
.gutter { padding: 22px 8px; font-size: 17px; line-height: 1.55; max-width: 32rem; }
.rh-under { display: grid; gap: 40px; margin-top: 48px; }
.rh-why { max-width: 30rem; font-size: 19px; }
.rh-ap { display: grid; gap: 32px; }
@media (min-width: 900px) {
  .spread { grid-template-columns: minmax(0, 1fr) 240px minmax(0, 1fr); }
  .leaf { padding: 48px 44px 44px; min-height: 30rem; }
  .leaf-now { margin-top: 64px; }
  .gutter { align-self: center; padding: 0 28px; font-size: 16px; text-align: left; }
  .rh-under { grid-template-columns: minmax(0, 30rem) 320px; column-gap: 96px; }
}

/* Rabbit hole: catalogue card. */
.card { position: relative; padding: 24px 20px 72px; }
.c-body { }
.c-call { display: flex; justify-content: space-between; font: 500 12.5px/1.4 var(--sans); color: var(--ink2); margin-bottom: 24px; }
.c-head { font: 500 clamp(40px, 6vw, 60px)/1 var(--display); letter-spacing: -0.015em; }
.c-dates { font-size: 18px; font-style: italic; margin: 8px 0 24px; padding-bottom: 14px; border-bottom: 1px solid var(--line); color: var(--ink2); }
.c-ed { font-size: 19px; line-height: 1.6; max-width: 34rem; }
.c-m { font-size: 15px; line-height: 1.55; margin-top: 18px; max-width: 32rem; }
.c-see { margin-top: 28px; display: grid; gap: 8px; max-width: 34rem; }
.c-k { font-style: italic; font-size: 17px; }
.c-see ul { display: grid; gap: 6px; padding-left: 0; }
.c-see li { font-size: 17px; text-indent: -1.4em; padding-left: 1.4em; }
.c-see li span { color: var(--ink2); }
.c-src { margin-top: 24px; font: 400 14px/1.5 var(--sans); color: var(--ink2); }
.punch { position: absolute; left: 50%; bottom: 20px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: var(--bg); }
.plate img { width: 100%; }
.plate figcaption { display: grid; gap: 4px; margin-top: 10px; }
.pl-cap { font-size: 16px; font-style: italic; }
.pl-cr { font: 400 13px/1.45 var(--sans); color: var(--ink2); }
@media (min-width: 700px) { .card { padding: 32px 48px 88px; } .c-body { padding-left: 28px; } }
@media (min-width: 1050px) { .l-card { grid-template-columns: minmax(0, 1fr) 380px; } .l-card .ap { padding-top: 168px; } }
@media (min-width: 1200px) { .l-card { grid-template-columns: minmax(0, 720px) 400px; } }
`;

const pages = {
  index: overview({
    name: 'Sheets',
    letter: 'B',
    lines: [
      'Colour forward. Each piece is a square sheet of its own colour laid on a white desk, with the notes, links and references in the wide margin beside it.',
      'The one bold moment is the Haul number, huge in the Haul’s colour and running off the right edge. The contents are a fanned stack of sheet edges.',
    ],
  }),
  cover: cover(),
  waiting: waiting(),
  essay: essay(),
  paper: paper(),
  talk: talk(),
  poem: poem(),
  rhymes: rhymes(),
  'rabbit-hole': rabbit(),
};
emit(out, pages, css, tokensCss({ tape: '#FFFFFF' }, { tape: 'rgba(255,255,255,0.16)' }));
console.log('sheets: wrote', Object.keys(pages).length, 'pages');
