// Fetch a published Haul bundle and the index and run the shared validator on them.
// Usage: node --experimental-strip-types scripts/verify-bundle.ts <filesBase> <path>
//   e.g. scripts/verify-bundle.ts http://127.0.0.1:8787/files hauls/001/v1/haul.json
// Against a Desk behind Access, pass the base of a public files host instead.

import { validateHaul } from '../packages/shared/src/validate.ts';
import type { Haul, HaulIndex } from '../packages/shared/src/haul.ts';

const [base, path] = process.argv.slice(2);
if (!base || !path) throw new Error('usage: verify-bundle.ts <filesBase> <path>');
const get = async <T>(p: string) => {
  const r = await fetch(`${base.replace(/\/$/, '')}/${p}`);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return (await r.json()) as T;
};
const haul = await get<Haul>(path);
const index = await get<HaulIndex>('hauls/index.json');
const report = validateHaul(haul, index);
console.log(`Haul ${haul.number} v${haul.version}: ${haul.items.length} items, ${haul.items.reduce((n, i) => n + i.marginalia.length, 0)} notes, ${haul.items.reduce((n, i) => n + i.wiki.length, 0)} wiki cards`);
console.log(`index: ${index.hauls.map((h) => `${h.number} -> ${h.path}`).join(', ')}`);
for (const e of report.errors) console.log(`ERROR ${e.path}: ${e.message}`);
for (const w of report.warnings) console.log(`warn  ${w.path}: ${w.message}`);
console.log(report.ok ? 'VALID' : 'INVALID');
process.exit(report.ok ? 0 : 1);
