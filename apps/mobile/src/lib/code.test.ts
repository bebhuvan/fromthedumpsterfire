import { describe, expect, it } from 'vitest';
import type { Block } from '@fdf/shared/haul';
import { clock, codeLines } from './code';
import { seedData } from './seedData';

const join = (lines: ReturnType<typeof codeLines>) => lines.map((l) => l.map(([, t]) => t).join('')).join('\n');

describe('code set line by line', () => {
  it('cuts runs at newlines and keeps every character', () => {
    const lines = codeLines('', [['k', 'import'], ['', ' x\n\n# c'], ['c', 'omment\nnext'], ['', '\n']]);
    expect(lines).toEqual([[['k', 'import'], ['', ' x']], [], [['', '# c'], ['c', 'omment']], [['c', 'next']]]);
    expect(join(lines)).toBe('import x\n\n# comment\nnext');
  });

  it('falls back to the plain code when a block has no tokens', () => {
    expect(codeLines('a\nb\n')).toEqual([[['', 'a']], [['', 'b']]]);
  });

  it('round-trips every code block in the sample Hauls', () => {
    const blocks = Object.values(seedData.hauls).flatMap((h) => h.items.flatMap((i) => i.blocks ?? []));
    const code = blocks.filter((b): b is Extract<Block, { kind: 'code' }> => b.kind === 'code');
    expect(code.length).toBeGreaterThan(0);
    for (const b of code) expect(join(codeLines(b.code, b.tokens))).toBe(b.code.replace(/\n$/, ''));
  });

  it('writes times as a clock', () => {
    expect(clock(0)).toBe('');
    expect(clock(65)).toBe('1:05');
    expect(clock(3723)).toBe('1:02:03');
  });
});
