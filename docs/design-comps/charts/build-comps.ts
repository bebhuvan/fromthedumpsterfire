// The chart kit's comps: every form, drawn by the real renderer from the real data in data/, set as
// the website sets a chart (Chart.astro), with the website's own CSS and fonts. One page per group so
// each screenshot stays under shoot.mjs's height limit.
//
// Build:  node_modules/.bin/esbuild docs/design-comps/charts/build-comps.ts --bundle --platform=node \
//           --format=esm --outfile=/tmp/build-comps.mjs && node /tmp/build-comps.mjs
// Shoot:  node docs/design-comps/_shared/shoot.mjs docs/design-comps/charts docs/design-comps/charts/shots 390,1280

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderChart, groupTransform, nodeAttrs, chartGlosses, describeChart, headLine, creditParts, formatCell, chartGrouping, FORMS, type Chart, type SceneNode } from '../../../packages/shared/src/charts/index.ts';
import { tokensCss } from '../../../apps/web/src/lib/tokens-css.ts';

const root = process.cwd();
const dir = join(root, 'docs/design-comps/charts');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GROUPS: Array<{ page: string; title: string; deck: string; edition: string; charts: string[] }> = [
  {
    page: 'time',
    title: 'Over time',
    deck: 'Lines labelled where they end, uncertainty as a wash, small multiples on one scale, parts of a whole that change, and rankings that move.',
    edition: 'teal',
    charts: ['temperature-line', 'hemispheres-line', 'multiples-life-expectancy', 'area-india-electricity', 'bump-population'],
  },
  {
    page: 'compare',
    title: 'Comparing',
    deck: 'Bars from zero, dots where zero means nothing, two values joined, two moments sloped, and two measures against each other.',
    edition: 'oxblood',
    charts: ['south-asia-gdp-bar', 'india-growth-columns', 'south-asia-life-dot', 'hemispheres-dot', 'south-asia-life-dumbbell', 'south-asia-life-slope', 'scatter-wealth-health'],
  },
  {
    page: 'spread',
    title: 'Spread and parts',
    deck: 'Every value as a dot, distributions as ridges, and a whole as a hundred squares instead of a pie.',
    edition: 'plum',
    charts: ['beeswarm-life-expectancy', 'delhi-ridgeline-may', 'india-electricity-waffle'],
  },
  {
    page: 'weather',
    title: 'Weather and climate',
    deck: 'A year of days against the normal and the records, the warming stripes, every day as a square, and every month of every year.',
    edition: 'ochre',
    charts: ['delhi-band-2024', 'temperature-stripes', 'delhi-calendar-2024', 'delhi-heatmap-months'],
  },
];

function svgNodes(nodes: SceneNode[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'g') return groupTransform(n) ? `<g transform="${groupTransform(n)}">${svgNodes(n.children)}</g>` : `<g>${svgNodes(n.children)}</g>`;
      const a = Object.entries(nodeAttrs(n))
        .map(([k, v]) => `${k}="${esc(String(v))}"`)
        .join(' ');
      if (n.t === 'text') return `<text ${a}>${esc(n.text)}</text>`;
      return n.tip ? `<${n.t} ${a}><title>${esc(n.tip)}</title></${n.t}>` : `<${n.t} ${a}/>`;
    })
    .join('');
}

function figure(chart: Chart, n: number, file: string): string {
  const g = chartGrouping(chart);
  const svgs = (['wide', 'narrow'] as const)
    .map((layout) => {
      const s = renderChart(chart, layout);
      return `<svg class="ch-svg ch-${layout}" viewBox="0 0 ${s.width} ${s.height}" width="${s.width}" height="${s.height}" role="img" aria-label="${esc(describeChart(chart))}" preserveAspectRatio="xMinYMin meet">${svgNodes(s.nodes)}</svg>`;
    })
    .join('');
  const src = creditParts(chart).map((p) => (p.url ? `<a href="${esc(p.url)}">${esc(p.text)}</a>` : esc(p.text))).join('');
  const cols = chart.data.columns;
  const rows = chart.data.rows.slice(0, 60);
  const glosses = chartGlosses(chart);
  return `
<figure class="blk-chart ch comp" id="${file}">
  <figcaption class="ch-head">
    <p class="ch-n">Figure <span>${n}</span> <i>${esc(FORMS[chart.form].name)}</i></p>
    <h3 class="ch-t">${esc(chart.title)}</h3>
    ${chart.note ? `<p class="ch-note">${esc(chart.note)}</p>` : ''}
    <p class="ch-units">${esc(headLine(chart))}</p>
  </figcaption>
  <div class="ch-plot">${svgs}</div>
  <div class="ch-foot">
    ${glosses.length ? `<p class="machine ch-gloss">${esc(glosses.join(' '))}</p>` : ''}
    <p class="ch-src">${src}</p>
    <details class="ch-data"><summary>The numbers <span>${chart.data.rows.length.toLocaleString('en-IN')} rows</span></summary>
      <div class="ch-tbl"><table><thead><tr>${cols.map((c) => `<th${c.type === 'number' ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((v, j) => `<td class="${cols[j]!.type === 'number' ? 'num' : ''}${v === null ? ' na' : ''}">${esc(formatCell(v, cols[j]!, g))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </details>
  </div>
</figure>`;
}

// The website's own CSS: its base, the machine voice and the chart section, fonts made relative.
const css = readFileSync(join(root, 'apps/web/src/styles/global.css'), 'utf8').replace(/url\('\/fonts\//g, "url('../../../apps/web/public/fonts/");
const base = css.slice(0, css.indexOf('/* The machine: blue sans'));
const machine = css.slice(css.indexOf('/* The machine: blue sans'), css.indexOf('\n', css.indexOf('.machine cite::before')) + 1);
const charts = css.slice(css.indexOf('/* ---------- Charts: the figure'));
const page = `
.comps { max-width: 760px; margin: 0 0 0 max(var(--gut), calc(50vw - 600px)); padding: 48px var(--gut) 96px 0; display: grid; gap: 88px; }
.comps-head { display: grid; gap: 12px; padding-bottom: 8px; }
.comps-head p:first-child { font: 500 13px/1.4 var(--sans); color: var(--ink2); }
.comps-head h1 { font: 500 clamp(40px, 6vw, 64px)/1 var(--display); letter-spacing: -0.03em; }
.comps-head p.deck { font: italic 400 19px/1.45 var(--serif); max-width: 34rem; }
.comps-nav { display: flex; flex-wrap: wrap; gap: 4px 18px; font: 400 14px/1.4 var(--sans); }
.comps-nav a[aria-current] { text-decoration: underline; text-decoration-color: var(--ember); text-decoration-thickness: 2px; }
.ch-n i { font-style: normal; color: var(--ink2); margin-left: 8px; }
@media (max-width: 640px) { .comps { margin-left: var(--gut); padding-right: var(--gut); gap: 64px; } }
`;

for (const grp of GROUPS) {
  let n = 0;
  const figs = grp.charts.map((f) => figure(JSON.parse(readFileSync(join(dir, 'data', `${f}.json`), 'utf8')) as Chart, ++n, f)).join('\n');
  const nav = GROUPS.map((g) => `<a href="${g.page}.html"${g.page === grp.page ? ' aria-current="page"' : ''}>${g.title}</a>`).join('');
  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Charts: ${esc(grp.title)}. From the Dumpster Fire comps</title>
<style>${tokensCss()}\n${base}\n${machine}\n${charts}\n${page}</style></head>
<body class="e-${grp.edition}"><main class="comps">
<header class="comps-head"><p>The chart kit · comps with real data</p><h1>${esc(grp.title)}</h1><p class="deck">${esc(grp.deck)}</p><nav class="comps-nav">${nav}</nav></header>
${figs}
</main></body></html>`;
  writeFileSync(join(dir, `${grp.page}.html`), html);
}
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>The chart kit: comps</title><ul>${GROUPS.map((g) => `<li><a href="${g.page}.html">${g.title}</a></li>`).join('')}</ul>`,
);
console.log('wrote', GROUPS.map((g) => `${g.page}.html`).join(', '));
