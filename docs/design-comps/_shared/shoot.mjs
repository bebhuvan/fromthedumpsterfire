// Screenshot comps with headless Chrome over CDP: full page, light and dark, at given widths.
// node docs/design-comps/_shared/shoot.mjs <dir-with-html> <outdir> [widths=390,1280] [pages=all]
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [dir, out, w = '390,1280', only] = process.argv.slice(2);
const widths = w.split(',').map(Number);
const pages = only ? only.split(',') : readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.slice(0, -5));
mkdirSync(out, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', '--user-data-dir=' + resolve(out, '.chrome'), 'about:blank'], { stdio: 'ignore' });
let list;
for (let i = 0; i < 60 && !list; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
}
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
for (const p of pages) for (const width of widths) for (const scheme of ['light', 'dark']) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: 'file://' + resolve(dir, p + '.html') });
  await new Promise((r) => setTimeout(r, 800));
  const m = await send('Runtime.evaluate', { expression: 'JSON.stringify([document.documentElement.scrollHeight, document.documentElement.scrollWidth])', returnByValue: true });
  const [h, sw] = JSON.parse(m.result.result.value);
  if (sw > width) console.log(`OVERFLOW ${p} @${width}: scrollWidth ${sw}`);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(h, 8000), scale: 1 } });
  writeFileSync(join(out, `${p}-${width}-${scheme}.png`), Buffer.from(shot.result.data, 'base64'));
}
ws.close();
chrome.kill();
console.log('done', pages.length * widths.length * 2, 'shots in', out);
