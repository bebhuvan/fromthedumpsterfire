#!/usr/bin/env node
// Agent and terminal entry point. See docs/EDITORIAL.md for payloads and remote setup.
import { parseArgs, parseEnv } from 'node:util';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, extname, resolve, basename, join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createClient, TARGETS, DeskError, redact, waitForItem, deskOrigin } from './editorial/client.mjs';
import { checkChart, csvData, drawFiles, drawPictures } from './editorial/charts.mjs';

export const HELP = `From the Dumpster Fire — editorial client (Node >=22.21)

npm run editorial -- <command> [arguments] [options]

  status                          identity, environment and spend
  items                           list the Tray (--view archived for the archive)
  item ID                         item, source, drafts, notes, blocks and checks
  capture [URL ...]                capture links, or use --data entries.json / --data -
  upload FILE                     capture a PDF or page photo (fields via --data)
  note FILE                       upload/transcribe audio (target/references via --data)
  edit ID                         PATCH item with --data item.json
  source ID                       PUT source with --data source.json
  library ID                      read a paywalled item from the editor's Readwise/Instapaper copy
  wait ID                         wait until ready (--seconds 180, maximum 900)
  check ID                        run item checks
  hauls                           list draft and published Hauls
  haul ID                         inspect a Haul
  new-haul                        create an empty draft Haul
  edit-haul ID                    PATCH Haul with --data haul.json
  order ID                        set Haul items with --data order.json
  preview ID                      assemble/check a Haul without publishing
  publish ID                      publish with --confirm-publish (fields via --data); draws each
                                  chart's app pictures here first (resvg, the app's fonts)
  chart ITEM                      add a chart block from --data chart.json (checked by the Desk)
  chart-edit BLOCK                replace a chart block's spec with --data chart.json
  chart-fetch                     data behind a chart from Our World in Data or the World Bank
                                  (--data {"provider":"owid","chart":URL,"entities":[...]} or
                                  {"provider":"worldbank","indicator":ID,"countries":["IND"]})
  chart-csv FILE                  a CSV/TSV file as chart data (local; prints data and problems)
  chart-check                     the honesty validator on --data chart.json (local)
  chart-draw DIR                  draw --data chart.json to PNGs in DIR for a look (local)
  request METHOD /api/PATH         any Desk JSON API route, or --upload file=PATH
  login                           owner login using cloudflared; saves token privately

Options:
  --profile production|preview|local   default: production
  --config FILE                       default: ~/.config/fdf/editorial/<profile>.env
  --data FILE|-                       JSON payload from file or stdin; never shell-evaluate prose
  --upload FIELD=FILE                 multipart file; repeat for multiple files
  --out FILE                          save JSON instead of printing it
  --view tray|archived                 for items
  --seconds N                         bounded wait
  --confirm-publish                   required for every publishing command/route
  --confirm-delete                    required for DELETE; service clients cannot DELETE

Credentials come only from the config file or FDF_* environment variables.
No API keys, tokens or secrets belong in command arguments. See docs/EDITORIAL.md.
`;

const TYPES = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const idPath = (id) => {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Supply a valid item or Haul ID');
  return id;
};

export async function run(argv, { env = process.env, fetcher = fetch, stdout = (s) => process.stdout.write(s), stderr = (s) => process.stderr.write(s) } = {}) {
  let credentials = {};
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, options: {
      help: { type: 'boolean', short: 'h' }, profile: { type: 'string', default: 'production' }, config: { type: 'string' }, data: { type: 'string' }, out: { type: 'string' }, view: { type: 'string', default: 'tray' }, seconds: { type: 'string', default: '180' }, upload: { type: 'string', multiple: true }, 'confirm-publish': { type: 'boolean' }, 'confirm-delete': { type: 'boolean' },
    } });
    if (v.help || !p.length) { stdout(HELP); return 0; }
    if (!(v.profile in TARGETS)) throw new Error('Unknown profile; use production, preview or local');
    const config = resolve(v.config ?? join(homedir(), '.config/fdf/editorial', `${v.profile}.env`));
    let saved = {};
    if (existsSync(config)) {
      if ((statSync(config).mode & 0o077) !== 0) throw new Error('Editorial config must be private: chmod 600 the config file');
      saved = parseEnv(readFileSync(config, 'utf8'));
    }
    const settings = { ...saved, ...Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('FDF_'))) };
    const origin = deskOrigin(settings.FDF_DESK_URL ?? TARGETS[v.profile]);
    credentials = { clientId: settings.FDF_ACCESS_CLIENT_ID, clientSecret: settings.FDF_ACCESS_CLIENT_SECRET, token: settings.FDF_ACCESS_TOKEN };
    const command = p[0];
    if (command === 'login') {
      if (p.length !== 1 || v.data || v.upload) throw new Error('login accepts no payload');
      if (v.profile === 'local') throw new Error('Local development uses its existing localhost-only bypass');
      // cloudflared owns the browser login; capture token output privately, never print it.
      execFileSync('cloudflared', ['access', 'login', '--quiet', origin], { stdio: ['inherit', 'ignore', 'ignore'], timeout: 300_000 });
      const token = execFileSync('cloudflared', ['access', 'token', '--app', origin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 }).trim();
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('cloudflared did not return an application token');
      mkdirSync(dirname(config), { recursive: true, mode: 0o700 });
      writeFileSync(config, `FDF_DESK_URL=${origin}\nFDF_ACCESS_TOKEN=${token}\n`, { mode: 0o600 });
      chmodSync(config, 0o600);
      stdout('Owner login saved privately. Run status to verify it.\n');
      return 0;
    }
    let data;
    if (v.data !== undefined) {
      const raw = readFileSync(v.data === '-' ? 0 : v.data, 'utf8');
      if (Buffer.byteLength(raw) > 4 * 1024 * 1024) throw new Error('JSON input exceeds 4 MB');
      try { data = JSON.parse(raw); } catch { throw new Error('The data file/stdin must contain valid JSON'); }
    }
    // Local chart commands: no Desk, no credentials.
    if (command === 'chart-csv') {
      if (p.length !== 2) throw new Error('chart-csv takes one file');
      output(await csvData(readFileSync(p[1], 'utf8'))); return 0;
    }
    if (command === 'chart-check') {
      if (p.length !== 1 || !data) throw new Error('chart-check takes --data chart.json');
      const report = await checkChart(data);
      output(report); return report.ok ? 0 : 1;
    }
    if (command === 'chart-draw') {
      if (p.length !== 2 || !data) throw new Error('chart-draw takes a directory and --data chart.json');
      const report = await checkChart(data);
      if (!report.ok) { output(report); return 1; }
      mkdirSync(p[1], { recursive: true });
      output({ files: await drawFiles(data, p[1]) }); return 0;
    }
    const client = createClient({ origin, credentials, fetcher });
    let method = 'GET', path;
    let uploads = v.upload ?? [];
    const id = () => idPath(p[1]);
    switch (command) {
      case 'status': path = '/api/me'; break;
      case 'items':
        if (!['tray', 'archived'].includes(v.view)) throw new Error('view must be tray or archived');
        path = `/api/items?view=${v.view}`; break;
      case 'item': path = `/api/items/${id()}`; break;
      case 'capture':
        path = '/api/capture'; method = 'POST';
        if (p.length > 1 && data !== undefined) throw new Error('Supply URLs or --data, not both');
        if (data === undefined) {
          if (p.length < 2) throw new Error('Supply at least one URL or --data');
          data = { entries: p.slice(1).map((url) => ({ url })) };
        }
        break;
      case 'upload': path = '/api/capture/file'; method = 'POST'; uploads = [`file=${p[1] ?? ''}`]; break;
      case 'note': path = '/api/notes'; method = 'POST'; uploads = [`audio=${p[1] ?? ''}`]; break;
      case 'edit': path = `/api/items/${id()}`; method = 'PATCH'; break;
      case 'source': path = `/api/items/${id()}/source`; method = 'PUT'; break;
      case 'library': path = `/api/items/${id()}/library`; method = 'POST'; break;
      case 'wait': {
        const seconds = Number(v.seconds);
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 900) throw new Error('seconds must be from 1 to 900');
        const result = await waitForItem(client, id(), { seconds });
        output(result); return 0;
      }
      case 'check': path = `/api/items/${id()}/check`; method = 'POST'; break;
      case 'hauls': path = '/api/hauls'; break;
      case 'haul': path = `/api/hauls/${id()}`; break;
      case 'new-haul': path = '/api/hauls'; method = 'POST'; break;
      case 'edit-haul': path = `/api/hauls/${id()}`; method = 'PATCH'; break;
      case 'order': path = `/api/hauls/${id()}/items`; method = 'PUT'; break;
      case 'preview': path = `/api/hauls/${id()}/preview`; break;
      case 'publish':
        path = `/api/hauls/${id()}/publish`; method = 'POST';
        if (data !== undefined && (!data || typeof data !== 'object' || Array.isArray(data))) throw new Error('publish data must be an object');
        data = { ...data, confirm: true };
        // The app has no SVG: draw each chart's light and dark pictures from the previewed bundle,
        // as the Desk does. Publish refuses pictures drawn from any other chart or edition ink.
        if (v['confirm-publish'] && p.length === 2) {
          const q = data.correction ? `?correction=${encodeURIComponent(data.correction)}` : '';
          const pv = await client.request('GET', `/api/hauls/${id()}/preview${q}`, {});
          const charts = pv?.haul ? await drawPictures(pv.haul) : {};
          if (Object.keys(charts).length) data = { ...data, charts };
        }
        break;
      case 'chart': path = `/api/items/${id()}/blocks`; method = 'POST'; data = { kind: 'chart', chart: data }; break;
      case 'chart-edit': path = `/api/blocks/${id()}/chart`; method = 'PUT'; data = { chart: data }; break;
      case 'chart-fetch': path = '/api/charts/fetch'; method = 'POST'; break;
      case 'request': method = p[1] ?? ''; path = p[2] ?? ''; break;
      default: throw new Error(`Unknown command. Use --help`);
    }
    // Catch accidental positional arguments rather than silently ignoring supplied content.
    const expected = ['capture', 'request'].includes(command) ? null : ['status', 'items', 'hauls', 'new-haul', 'chart-fetch'].includes(command) ? 1 : 2;
    if (expected !== null && p.length !== expected) throw new Error('Unexpected or missing arguments; use --help');
    if (command === 'request' && p.length !== 3) throw new Error('request requires METHOD and /api/PATH');
    if (['edit', 'source', 'edit-haul', 'order', 'chart-fetch'].includes(command) && data === undefined) throw new Error('Supply --data FILE or --data -');
    if (['chart', 'chart-edit'].includes(command) && !data?.chart) throw new Error('Supply the chart with --data chart.json');
    let form;
    if (uploads.length) {
      if (data !== undefined && (!data || typeof data !== 'object' || Array.isArray(data))) throw new Error('Multipart fields must be a JSON object');
      form = new FormData();
      for (const [key, value] of Object.entries(data ?? {})) {
        if (typeof value === 'object') throw new Error('Multipart fields must be strings, numbers or booleans');
        form.append(key, String(value));
      }
      for (const entry of uploads) {
        const at = entry.indexOf('=');
        const field = entry.slice(0, at), file = entry.slice(at + 1);
        if (at < 1 || !file || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) throw new Error('upload must be FIELD=FILE');
        if (statSync(file).size > 60 * 1024 * 1024) throw new Error('Upload exceeds 60 MB');
        form.append(field, new File([readFileSync(file)], basename(file), { type: TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }));
      }
      data = undefined;
    }
    const result = await client.request(method, path, { data, form, confirmPublish: v['confirm-publish'], confirmDelete: v['confirm-delete'] });
    output(result);
    return 0;
    function output(value) {
      const text = redact(value, credentials) + '\n';
      if (v.out) {
        if (resolve(v.out) === config) throw new Error('Output cannot overwrite the credential file');
        writeFileSync(v.out, text, { mode: 0o600 });
        chmodSync(v.out, 0o600);
      } else stdout(text);
    }
  } catch (e) {
    // Never expose subprocess diagnostics: login failures may contain a token or auth URL.
    const value = e instanceof DeskError ? { error: e.message, status: e.status, ...(e.body === undefined ? {} : { detail: e.body }) } : { error: e?.cmd || e?.spawnargs ? 'Owner login failed. Check cloudflared installation and complete Access login, or configure a service token.' : e.message ?? 'Editorial command failed' };
    stderr(redact(value, credentials) + '\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await run(process.argv.slice(2));
