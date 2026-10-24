// Adds highlighted tokens to the code blocks of the development sample Hauls, as publish does.
// node --experimental-strip-types packages/shared/fixtures/dev/tokens.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { highlightCode } from '../../src/highlight.ts';
for (const f of ['haul-002.json', 'haul-003.json']) {
  const path = new URL(f, import.meta.url);
  const h = JSON.parse(readFileSync(path, 'utf8'));
  for (const it of h.items) for (const b of it.blocks ?? []) if (b.kind === 'code') b.tokens = highlightCode(b.code, b.lang);
  writeFileSync(path, JSON.stringify(h, null, 1) + '\n');
}
