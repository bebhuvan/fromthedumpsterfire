// A quick look at scenes while designing a form: writes an HTML page with each scene, light and
// dark, in the website's own token CSS and fonts. Used by a form's preview script:
//   import { peek } from '.../docs/design-comps/data-stories/peek';
//   peek('/tmp/x/slope.html', [{ label: 'wide', scene }, { label: 'phone', scene: phoneScene }]);
// then: chromium --headless --screenshot=/tmp/x/slope.png --window-size=1500,3000 file:///tmp/x/slope.html

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupTransform, nodeAttrs, type Scene, type SceneNode } from '../../../packages/shared/src/charts/scene';
import { tokensCss } from '../../../apps/web/src/lib/tokens-css';
import { EDITIONS, editionInk, palettes } from '../../../packages/shared/src/tokens';
import { chartVars } from '../../../packages/shared/src/charts/scene';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function svgOf(s: Scene): string {
  const walk = (ns: SceneNode[]): string => ns.map((n) => {
    if (n.t === 'g') { const tr = groupTransform(n); return `<g${tr ? ` transform="${tr}"` : ''}>${walk(n.children)}</g>`; }
    const a = Object.entries(nodeAttrs(n)).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ');
    return n.t === 'text' ? `<text ${a}>${esc(n.text)}</text>` : `<${n.t} ${a}/>`;
  }).join('');
  return `<svg class="ch" viewBox="0 0 ${s.width} ${Math.ceil(s.height)}" width="${s.width}" height="${Math.ceil(s.height)}">${walk(s.nodes)}</svg>`;
}

const fontDir = resolve(import.meta.dirname ?? '.', '../../../apps/web/public/fonts');
export function peek(file: string, scenes: { label: string; scene: Scene }[], edition = 'teal'): void {
  const th = (sch: 'light' | 'dark') => [`--bg:${palettes[sch].bg}`, `--ink:${palettes[sch].ink}`, `--ink2:${palettes[sch].ink2}`, `--rule:${palettes[sch].rule}`, `--machine:${palettes[sch].machine}`, ...EDITIONS.map((e) => `--ed-${e}:${editionInk[sch][e]}`), chartVars(sch)].join(';');
  const fonts = [['Schibsted-Regular', 'Schibsted Grotesk', 400], ['Schibsted-Medium', 'Schibsted Grotesk', 500], ['NewsreaderDisplay-Regular', 'Newsreader Display', 400]].map(([f, n, w]) => `@font-face{font-family:'${n}';src:url('file://${fontDir}/${f}.woff2');font-weight:${w}}`).join('');
  const cells = (['light', 'dark'] as const).map((sch) => `<div class="th-${sch} e-${edition}" style="background:var(--bg);padding:24px">${scenes.map((s) => `<p style="font:12px sans-serif;color:var(--ink2)">${esc(s.label)} · ${sch}</p>${svgOf(s.scene)}`).join('')}</div>`).join('');
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${fonts}${tokensCss()}.th-light{${th('light')}}.th-dark{${th('dark')}}body{margin:0;display:flex;flex-wrap:wrap;gap:0}</style>${cells}`);
}
