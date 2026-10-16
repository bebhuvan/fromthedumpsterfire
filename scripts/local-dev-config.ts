// Writes .wrangler/dev/{api,pipeline}.jsonc: the preview configs under local-only Worker names.
//
// `wrangler dev` opens a remote session for remote bindings (Workers AI, Vectorize, Browser
// Rendering) under the Worker's own name; once Cloudflare Access protects fdf-desk-preview's
// workers.dev hostname, that session is refused. The local copies use fdf-desk-local and
// fdf-pipeline-local so the session never touches the protected hostname. Nothing is deployed.
//
// Usage: node --experimental-strip-types scripts/local-dev-config.ts
// then:  npx wrangler dev -c .wrangler/dev/api.jsonc -c .wrangler/dev/pipeline.jsonc --env preview --persist-to .wrangler/state

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.wrangler/dev');
mkdirSync(out, { recursive: true });

/** Strip // and /* *\/ comments and trailing commas from JSONC (strings are respected). */
function parseJsonc(s: string): Record<string, unknown> {
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      o += s.slice(i, j + 1);
      i = j;
    } else if (c === '/' && s[i + 1] === '/') while (i < s.length && s[i] !== '\n') i++;
    else if (c === '/' && s[i + 1] === '*') {
      i = s.indexOf('*/', i) + 1;
    } else o += c;
  }
  return JSON.parse(o.replace(/,(\s*[}\]])/g, '$1'));
}

for (const [name, local] of [
  ['api', 'fdf-desk-local'],
  ['pipeline', 'fdf-pipeline-local'],
] as const) {
  const dir = join(root, 'workers', name);
  const cfg = parseJsonc(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')) as Record<string, any>;
  const rel = (p: string) => relative(out, resolve(dir, p));
  cfg.main = rel(cfg.main);
  delete cfg.$schema;
  if (cfg.assets?.directory) cfg.assets.directory = rel(cfg.assets.directory);
  const env = cfg.env.preview;
  env.name = local;
  for (const d of env.d1_databases ?? []) if (d.migrations_dir) d.migrations_dir = rel(d.migrations_dir);
  cfg.env = { preview: env };
  writeFileSync(join(out, `${name}.jsonc`), JSON.stringify(cfg, null, 2));
  console.log(`wrote .wrangler/dev/${name}.jsonc (${local})`);
}

// Both configs sit in one folder, so they share one .dev.vars: the two Workers' files, merged
// (the Desk's last, so ENVIRONMENT=local and DEV_AUTH_BYPASS=1 hold). It stays under .wrangler/.
const vars = ['pipeline', 'api']
  .map((n) => {
    try {
      return readFileSync(join(root, 'workers', n, '.dev.vars'), 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');
writeFileSync(join(out, '.dev.vars'), vars);
