// Ask each open-access provider for one query and print what comes back (no model, no cost).
// Usage: npx tsx scripts/probe-plates.ts "Thames sewer engraving"

import { probeImage, searchAic, searchCommons, searchMet } from '../packages/server/src/plates';

const q = process.argv[2] ?? 'steam engine';
for (const [name, fn] of [
  ['commons', searchCommons],
  ['aic', searchAic],
  ['met', searchMet],
] as const) {
  try {
    const r = await fn(q);
    console.log(`${name}: ${r.length}`);
    for (const c of r) {
      const p = await probeImage(c.imageUrl);
      console.log(`  ${c.licence} | ${c.title.slice(0, 60)} | ${c.creator ?? ''} | ${c.date ?? ''} | ${p.ok ? `${p.width}x${p.height} ${p.mime}` : `FAIL ${p.status}`} | ${c.sourceUrl}`);
    }
  } catch (e) {
    console.log(`${name}: error ${e instanceof Error ? e.message : e}`);
  }
}
