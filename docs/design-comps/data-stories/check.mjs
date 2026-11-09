// Checks every figure on the comp pages in a real browser, at phone and desktop widths: no two
// labels overlap, no label runs off its figure. Text is measured as drawn, with the real fonts.
// node docs/design-comps/data-stories/check.mjs [pages=atlas] [widths=390,1440]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pages = (process.argv[2] ?? 'atlas').split(',');
const widths = (process.argv[3] ?? '390,1440').split(',').map(Number);
const port = 9800 + Math.floor(Math.random() * 150);
const profile = mkdtempSync(join(tmpdir(), 'fdf-check-'));
const chrome = spawn(process.env.CHROME ?? '/usr/bin/chromium', ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--allow-file-access-from-files', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
let list;
for (let i = 0; i < 60 && !list; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
}
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

// Runs in the page: every visible figure's text, as drawn.
const probe = `(() => {
  const out = [];
  document.querySelectorAll('svg.ds, svg.ch').forEach((svg, k) => {
    const sr = svg.getBoundingClientRect();
    if (!sr.width) return;
    const label = svg.getAttribute('aria-label').slice(0, 50);
    const boxes = [...svg.querySelectorAll('text')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() })).filter((b) => b.r.width > 0);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i].r;
      if (a.left < sr.left - 1 || a.right > sr.right + 1 || a.top < sr.top - 1 || a.bottom > sr.bottom + 1) out.push({ fig: label, kind: 'off the figure', a: boxes[i].t });
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j].r;
        // Glyph boxes include the font's ascent and descent; allow 2 px of that to touch.
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oy > 2) out.push({ fig: label, kind: 'overlap', a: boxes[i].t, b: boxes[j].t });
      }
    }
  });
  return JSON.stringify(out);
})()`;

let failures = 0;
await send('Page.enable');
for (const p of pages) for (const width of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: 'file://' + resolve(here, p + '.html') });
  await new Promise((r) => setTimeout(r, 1200));
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  const m = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const found = JSON.parse(m.result.result.value);
  const figures = (await send('Runtime.evaluate', { expression: "document.querySelectorAll('svg.ds, svg.ch').length", returnByValue: true })).result.result.value;
  if (!figures) found.push({ fig: p, kind: 'no figures on the page', a: '' });
  failures += found.length;
  console.log(`${p} @${width}: ${found.length ? found.length + ' problems' : 'clean'}`);
  for (const f of found) console.log(`  ${f.kind}: "${f.a}"${f.b ? ` and "${f.b}"` : ''}  [${f.fig}]`);
}
ws.close();
chrome.kill();
rmSync(profile, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
