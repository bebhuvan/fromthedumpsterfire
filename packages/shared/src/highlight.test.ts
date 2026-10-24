import { describe, expect, it } from 'vitest';
import { highlightCode } from './highlight';

describe('highlightCode', () => {
  it('tokens join back to the code, with roles', () => {
    const code = 'def price(x):\n    # cheaper means more\n    return x * 0.5  # "half"\n';
    const t = highlightCode(code, 'py');
    expect(t.map((x) => x[1]).join('')).toBe(code);
    expect(t.find((x) => x[1] === 'def')?.[0]).toBe('k');
    expect(t.some((x) => x[0] === 'c' && x[1].includes('cheaper'))).toBe(true);
    expect(t.some((x) => x[0] === 'n' && x[1] === '0.5')).toBe(true);
  });
  it('unescapes entities exactly', () => {
    const code = 'if (a < b && c > "d") { x = \'&amp;\'; }';
    expect(highlightCode(code, 'js').map((x) => x[1]).join('')).toBe(code);
  });
  it('unknown language prints plain', () => {
    expect(highlightCode('10 PRINT "HI"', 'basic')).toEqual([['', '10 PRINT "HI"']]);
  });
});
