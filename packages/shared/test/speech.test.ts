import { describe, expect, it } from 'vitest';
import { speechSetting } from '../src/haul';

describe('a transcript sets the speaker by length', () => {
  it('keeps a line or two large', () => {
    expect(speechSetting('If you do everything, you’ll win.')).toBe('line');
  });
  it('sets a passage as an extract, never a wall of display type', () => {
    // Haul 002's Caro excerpt: five paragraphs, about 160 words, was drawn at 46px.
    const caro = Array.from({ length: 5 }, () => 'Because certainly the first parts of the book, hundreds of pages, are about a young idealist who sees this great need for recreation.').join('\n\n');
    expect(speechSetting(caro)).toBe('extract');
  });
});
