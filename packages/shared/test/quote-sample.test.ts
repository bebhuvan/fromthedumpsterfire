import { describe, expect, it } from 'vitest';
import { quoteSample } from '../src/haul';

const caro = `When people say to me everything was bad that he did, what I say is, "You didn’t read the book."\n\nBecause certainly the first parts of the book, hundreds of pages, are about a young idealist.`;

describe("a preview's sample of a passage", () => {
  it('takes the first sentence whole, closing quote and all, and says the passage goes on', () => {
    expect(quoteSample(caro)).toEqual({ text: 'When people say to me everything was bad that he did, what I say is, "You didn’t read the book."', cut: true, ellipsis: false });
  });

  it('returns a short passage whole', () => {
    expect(quoteSample('If you do everything, you’ll win.')).toEqual({ text: 'If you do everything, you’ll win.', cut: false, ellipsis: false });
  });

  it('falls back to the opening clauses when the first sentence runs long', () => {
    const long = 'The dilettante possesses a unique capacity to dive deep into an interest, then surface and plunge into the depths of the next, each one an exploration, an adventure, but not a lifelong, life-defining project, which is precisely why the dilettante rejects any dogmatic principle of stick-to-itiveness. More follows.';
    const s = quoteSample(long);
    expect(s.cut).toBe(true);
    expect(s.ellipsis).toBe(true);
    expect(long.startsWith(s.text)).toBe(true);
    expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(30);
  });
});
