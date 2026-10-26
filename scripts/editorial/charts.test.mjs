// Charts from the terminal, end to end against the real Desk Worker (fake bindings): keep a chart,
// publish (the Worker draws the app's pictures and the share card with resvg), and find them next to
// the bundle.
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../editorial.mjs';
import app from '../../workers/api/src/index';
import { makeEnv } from '../../packages/server/test/fake-env';
import { seedHaul } from '../../packages/server/test/seed';

const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'fdf-charts-')); dirs.push(d); return d; };

async function cli(args, fetcher) {
  const d = temp();
  let stdout = '', stderr = '';
  const code = await run(['--config', join(d, 'missing.env'), ...args], { env: { FDF_DESK_URL: 'http://127.0.0.1:8787' }, fetcher, stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; } });
  return { code, stdout, stderr };
}

const chart = {
  form: 'line', title: 'The world has warmed', units: '°C', geography: 'World',
  span: { from: '2020', to: '2023' }, sourceSpan: { from: '1850', to: '2023' },
  sources: [{ maker: 'Met Office Hadley Centre', dataset: 'HadCRUT5', url: 'https://www.metoffice.gov.uk/hadobs/hadcrut5/', licence: 'Open Government Licence v3', retrieved: '2026-10-25' }],
  measure: { basis: 'anomaly', base: 'the 1861–1890 average' },
  data: { columns: [{ key: 'year', label: 'Year', type: 'year' }, { key: 't', label: 'Anomaly', type: 'number' }], rows: [[2020, 1.36], [2021, 1.15], [2022, 1.18], [2023, 1.47]] },
  encode: { x: 'year', y: 't' },
};

it('checks, keeps and publishes a chart with its app pictures and share card from the terminal', async () => {
  const env = await seedHaul(makeEnv(undefined, { DEV_AUTH_BYPASS: '1' }));
  env.INGEST_QUEUE.sendBatch = async (messages) => { env.queue.push(...messages); };
  const fetcher = (url, init) => app.request(url, init, env);
  const d = temp();
  const file = (name, v) => { const p = join(d, name); writeFileSync(p, JSON.stringify(v)); return p; };

  // Local: the validator refuses a bar that does not start at zero, and passes the honest line.
  const bad = await cli(['chart-check', '--data', file('bad.json', { ...chart, form: 'bar', scale: { y: { zero: false } } })], fetcher);
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stdout).errors.map((e) => e.rule)).toContain('zero-baseline');
  const good = await cli(['chart-check', '--data', file('good.json', chart)], fetcher);
  expect(good.code).toBe(0);
  expect(JSON.parse(good.stdout).glosses[0]).toBe('Shown from 2020 to 2023; the source runs from 1850 to 2023.');

  // Local: CSV in, data out.
  const csv = join(d, 'rain.csv');
  writeFileSync(csv, 'Year,Rainfall (mm)\n2001,2100\n2002,NA\n');
  const parsed = JSON.parse((await cli(['chart-csv', csv], fetcher)).stdout);
  expect(parsed.data.rows).toEqual([[2001, 2100], [2002, null]]);

  // Local: draw it for a look.
  const drawn = await cli(['chart-draw', join(d, 'look'), '--data', file('look.json', chart)], fetcher);
  expect(drawn.code).toBe(0);
  expect(readdirSync(join(d, 'look')).sort()).toEqual(['chart-narrow-dark.png', 'chart-narrow-light.png', 'chart-share.png', 'chart-wide-dark.png', 'chart-wide-light.png']);

  // Through the Desk: keep the chart on an item, then publish.
  const kept = await cli(['chart', 'it_jevons', '--data', file('chart.json', chart)], fetcher);
  expect(kept.code, kept.stderr).toBe(0);
  const refused = await cli(['chart', 'it_jevons', '--data', file('nosource.json', { ...chart, sources: [] })], fetcher);
  expect(refused.code).toBe(1);
  expect(JSON.parse(refused.stderr).status).toBe(422);
  expect((await cli(['order', 'hl_1', '--data', file('order.json', { itemIds: ['it_jevons'] })], fetcher)).code).toBe(0);
  const published = await cli(['publish', 'hl_1', '--confirm-publish'], fetcher);
  expect(published.code, published.stderr).toBe(0);
  const bundle = await (await env.FILES.get('hauls/001/v1/haul.json')).json();
  const block = bundle.items[0].blocks.find((b) => b.kind === 'chart');
  expect(block.chart.title).toBe('The world has warmed');
  expect(block.images.light.width).toBe(1125);
  const key = new URL(block.images.dark.url).pathname.slice(1);
  const png = new Uint8Array(await (await env.FILES.get(key)).arrayBuffer());
  expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  expect(block.images.share.width).toBe(1080);
  expect(await env.FILES.head(new URL(block.images.share.url).pathname.slice(1))).toBeTruthy();
}, 60_000);
