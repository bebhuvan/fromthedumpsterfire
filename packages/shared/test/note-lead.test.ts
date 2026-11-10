import { describe, expect, it } from 'vitest';
import type { NoteBlock } from '../src/haul';
import { LEAD_WORDS, noteLead } from '../src/fieldnote';

const para = (n: number): NoteBlock => ({ kind: 'paragraph', runs: [{ text: Array.from({ length: n }, () => 'word').join(' ') }] });

describe("the field note's opening on the cover", () => {
  it('sets a short note whole', () => {
    const body = [para(200), para(300)];
    expect(noteLead(body)).toMatchObject({ cut: false, blocks: body, words: 500 });
  });

  it('stops a long note at the end of a paragraph once the opening is long enough', () => {
    const body = [para(200), para(200), para(100), para(1500)];
    const lead = noteLead(body);
    expect(lead.cut).toBe(true);
    expect(lead.blocks).toEqual(body.slice(0, 3));
    expect(lead.blocks.reduce((n, b) => n + (b.kind === 'paragraph' ? 1 : 0), 0)).toBe(3);
    expect(lead.minutes).toBe(9);
  });

  it('never stops after a heading or inside a quotation', () => {
    const body: NoteBlock[] = [para(300), { kind: 'quotation', paragraphs: [[{ text: Array.from({ length: 200 }, () => 'q').join(' ') }]] }, { kind: 'heading', text: 'Next part' }, para(100), para(1200)];
    const lead = noteLead(body);
    expect(lead.cut).toBe(true);
    expect(lead.blocks.at(-1)!.kind).toBe('paragraph');
    expect(lead.blocks).toHaveLength(4);
  });

  it('sets the note whole rather than leave a short rest', () => {
    const body = [para(LEAD_WORDS + 150), para(150)];
    expect(noteLead(body).cut).toBe(false);
  });
});
