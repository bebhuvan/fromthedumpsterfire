// Shared helpers for the static design comps. Content comes only from the sample Haul.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const haul = JSON.parse(readFileSync(resolve(here, '../../../packages/shared/fixtures/haul-001.json'), 'utf8'));
export const item = (id) => haul.items.find((i) => i.id === id);
export const byType = (t) => haul.items.find((i) => i.type === t);

export const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A title with its italic tail. */
export const title = (t) => esc(t.text) + (t.italic ? ` <em>${esc(t.italic)}</em>` : '');
/** Text with the editor's highlighted span wrapped in <mark>. */
export const hl = (text, h, cls = '') => {
  if (!h || !text.includes(h)) return esc(text);
  const i = text.indexOf(h);
  return esc(text.slice(0, i)) + `<mark${cls ? ` class="${cls}"` : ''}>${esc(h)}</mark>` + esc(text.slice(i + h.length));
};
export const pad = (n, w = 3) => String(n).padStart(w, '0');
export const year = (d) => /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(d)?.[1] ?? '';
export const swatchOf = { essay: 'apricot', post: 'apricot', talk: 'butter', video: 'butter', podcast: 'butter', paper: 'mint', poem: 'coral', passage: 'coral', rhymes: 'sky', 'rabbit-hole': 'pistachio' };
export const label = { essay: 'Essay', talk: 'Talk', paper: 'Paper', poem: 'Poem', rhymes: 'Rhymes', 'rabbit-hole': 'Rabbit hole' };
/** Comp page file for each item (one per form). */
export const pageFor = (it) => it.type;

const L = { bg: '#FFFFFF', ink: '#141416', ink2: '#55555C', rule: '#E6E6EA', plate: '#F4F4F6', machine: '#4651D2', ember: '#FF4F1F', apricot: '#FFE0C2', coral: '#FFD8D0', butter: '#FFF0A6', sky: '#DCEBFF', mint: '#D2F3E2', pistachio: '#E6F2C8' };
const D = { bg: '#0F0F12', ink: '#F3F3F1', ink2: '#A2A2AA', rule: '#2A2A31', plate: '#1B1B20', machine: '#A3ACFF', ember: '#FF6A3D', apricot: '#4D2E14', coral: '#4E2320', butter: '#433B12', sky: '#15304B', mint: '#163D2D', pistachio: '#2E3915' };

/** Token CSS (values from packages/shared/src/tokens.ts): light on :root, dark via media and data-theme. */
export const tokensCss = (extraLight = {}, extraDark = {}) => {
  const v = (o) => Object.entries(o).map(([k, x]) => `--${k}: ${x};`).join(' ');
  return `:root { ${v({ ...L, ...extraLight })} color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${v({ ...D, ...extraDark })} color-scheme: dark; } }
:root[data-theme="dark"] { ${v({ ...D, ...extraDark })} color-scheme: dark; }
`;
};

export const fontsCss = `@font-face { font-family: 'Newsreader Text'; src: url('fonts/NewsreaderText-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Newsreader Text'; src: url('fonts/NewsreaderText-Italic.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: swap; }
@font-face { font-family: 'Newsreader Display'; src: url('fonts/NewsreaderDisplay-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Newsreader Display'; src: url('fonts/NewsreaderDisplay-Medium.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: 'Newsreader Display'; src: url('fonts/NewsreaderDisplay-Italic.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: swap; }
@font-face { font-family: 'Schibsted Grotesk'; src: url('fonts/Schibsted-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Schibsted Grotesk'; src: url('fonts/Schibsted-Medium.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: 'Schibsted Grotesk'; src: url('fonts/Schibsted-SemiBold.woff2') format('woff2'); font-weight: 600; font-style: normal; font-display: swap; }
`;

export const themeJs = `// Theme toggle for the comps: flips light and dark, remembered per browser.
(function () {
  var r = document.documentElement;
  try { var s = localStorage.getItem('fdf-theme'); if (s) r.setAttribute('data-theme', s); } catch (e) {}
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!b) return;
    var t = r.getAttribute('data-theme');
    var dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    r.setAttribute('data-theme', next);
    try { localStorage.setItem('fdf-theme', next); } catch (e) {}
  });
})();
`;

/** Full HTML document for one comp page (served as its own page, so it carries its own doctype). */
export const doc = ({ title: t, body, bodyClass = '' }) => `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t)}</title>
<link rel="stylesheet" href="style.css">
<script src="theme.js"></script>
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;

/** href of an item's comp page by item id (each form has one page). */
export const hrefFor = (id) => { const it = item(id); return it ? `${it.type}.html` : 'cover.html'; };

/**
 * The Artifact landing page for one direction (published as the artifact's main file, so no doctype:
 * the publisher wraps it). Links to every comp page.
 */
export const overview = ({ name, letter, lines }) => {
  const pages = [['cover', 'Haul cover'], ['waiting', 'Waiting page, before Haul 001'], ['essay', 'Essay: magazine opening'], ['paper', 'Paper: journal offprint'], ['talk', 'Talk: transcript'], ['poem', 'Poem: broadside'], ['rhymes', 'Rhymes: facing pages'], ['rabbit-hole', 'Rabbit hole: catalogue card']];
  return `<title>FDF comps ${letter}: ${esc(name)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="style.css">
<script src="theme.js"></script>
<style>
.ov { max-width: 40rem; padding-block: 40px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); margin: 0 auto; font-family: 'Newsreader Text', Georgia, serif; color: var(--ink); }
body { background: var(--bg); }
.ov-k { font: 500 13px/1.4 'Schibsted Grotesk', system-ui, sans-serif; color: var(--ink2); margin: 0 0 8px; }
.ov h1 { font: 500 44px/1.05 'Newsreader Display', Georgia, serif; margin: 0 0 20px; letter-spacing: -0.01em; }
.ov p.l { font-size: 19px; line-height: 1.5; margin: 0 0 10px; }
.ov ol { list-style: none; padding: 0; margin: 32px 0 0; border-top: 1px solid var(--rule); }
.ov li a { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--rule); color: var(--ink); text-decoration: none; font-size: 19px; }
.ov li a span:last-child { font: 400 14px/1.6 'Schibsted Grotesk', system-ui, sans-serif; color: var(--ink2); }
.ov .note { font: 400 14px/1.5 'Schibsted Grotesk', system-ui, sans-serif; color: var(--ink2); margin-top: 24px; }
.ov button { font: 500 14px 'Schibsted Grotesk', system-ui, sans-serif; background: none; border: 1px solid var(--rule); color: var(--ink); padding: 6px 12px; border-radius: 4px; cursor: pointer; }
</style>
<main class="ov">
<p class="ov-k">From the Dumpster Fire · design direction ${esc(letter)}</p>
<h1>${esc(name)}</h1>
${lines.map((l) => `<p class="l">${esc(l)}</p>`).join('\n')}
<ol>
${pages.map(([f, t]) => `<li><a href="${f}.html"><span>${esc(t)}</span><span>open</span></a></li>`).join('\n')}
</ol>
<p class="note">Static comps with the sample Haul. Pages follow your phone's light or dark setting. <button type="button" data-theme-toggle>Switch light or dark</button></p>
</main>
`;
};

/** Write a direction: pages {name: html} and its css; copies fonts, the plate and the theme script. */
export const emit = (outDir, pages, css, tokens = tokensCss()) => {
  mkdirSync(outDir, { recursive: true });
  cpSync(resolve(here, '../../../apps/web/public/fonts'), join(outDir, 'fonts'), { recursive: true, filter: (f) => !f.endsWith('.txt') });
  cpSync(join(here, 'silent-highwayman.jpg'), join(outDir, 'silent-highwayman.jpg'));
  writeFileSync(join(outDir, 'style.css'), fontsCss + tokens + css);
  writeFileSync(join(outDir, 'theme.js'), themeJs);
  for (const [name, html] of Object.entries(pages)) writeFileSync(join(outDir, name + '.html'), html);
};
