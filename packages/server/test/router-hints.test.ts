import { describe, expect, it } from 'vitest';
import { dictionaryHints } from '@fdf/shared/voice';
import { hintPrompt } from '../src/models/router';

describe('Whisper hints', () => {
  it('keeps the editor\'s proper nouns within the prompt window, most useful first', () => {
    const p = hintPrompt(dictionaryHints);
    expect(p.length).toBeLessThanOrEqual(601);
    expect(p.startsWith(dictionaryHints[0]!)).toBe(true);
  });
  it('is empty with no hints', () => expect(hintPrompt([])).toBe(''));
});
