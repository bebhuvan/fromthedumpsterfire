// Fetch a published Haul bundle and the index and run the shared validator on them.
// Usage: npx tsx scripts/verify-bundle.ts <filesBase> <path> [publishedFilesBase]
//   e.g. scripts/verify-bundle.ts http://127.0.0.1:8787/files hauls/001/v1/haul.json
// With publishedFilesBase (the FILES_BASE the bundle was published with), every plate and audio URL
// must sit under it, and each one is fetched from <filesBase> to prove it was copied.
// Against a Desk behind Access, pass the base of a public files host instead.

import { validateHaul } from '../packages/shared/src/validate.ts';
import type { Haul, HaulIndex } from '../packages/shared/src/haul.ts';

const [base, path, published] = process.argv.slice(2);
if (!base || !path) throw new Error('usage: verify-bundle.ts <filesBase> <path>');
const get = async <T>(p: string) => {
  const r = await fetch(`${base.replace(/\/$/, '')}/${p}`);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return (await r.json()) as T;
};
const haul = await get<Haul>(path);
const index = await get<HaulIndex>('hauls/index.json');
const report = validateHaul(haul, index, published ? { filesBase: published } : {});
const media = [
  ...(haul.cover ? [haul.cover.url] : []),
  ...(haul.fieldNote.audio ? [haul.fieldNote.audio.url] : []),
  ...haul.items.flatMap((i) => [i.plate?.url, i.why.audio?.url].filter((u): u is string => Boolean(u))),
];
if (published) {
  for (const u of media) {
    if (!u.startsWith(published.replace(/\/$/, '') + '/')) continue;
    const r = await fetch(`${base.replace(/\/$/, '')}/${u.slice(published.replace(/\/$/, '').length + 1)}`);
    await r.body?.cancel();
    console.log(`media ${r.ok ? 'ok ' : 'MISSING'} ${r.status} ${u}`);
    if (!r.ok) report.errors.push({ path: u, rule: 'media', message: 'not found next to the bundle' });
  }
}
report.ok = report.errors.length === 0;
console.log(`plates: ${haul.items.filter((i) => i.plate).length}${haul.cover ? ' + cover' : ''}, rhymes: ${haul.items.filter((i) => i.rhyme).length}, threads: ${haul.threads.length}, connections: ${haul.items.reduce((n, i) => n + i.connections.length, 0)}`);
console.log(`Haul ${haul.number} v${haul.version}: ${haul.items.length} items, ${haul.items.reduce((n, i) => n + i.marginalia.length, 0)} notes, ${haul.items.reduce((n, i) => n + i.wiki.length, 0)} wiki cards`);
console.log(`index: ${index.hauls.map((h) => `${h.number} -> ${h.path}`).join(', ')}`);
for (const e of report.errors) console.log(`ERROR ${e.path}: ${e.message}`);
for (const w of report.warnings) console.log(`warn  ${w.path}: ${w.message}`);
console.log(report.ok ? 'VALID' : 'INVALID');
process.exit(report.ok ? 0 : 1);
