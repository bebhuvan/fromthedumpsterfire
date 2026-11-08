import { describe, expect, it } from 'vitest';
import { countWords, excerptAdvice, excerptCap, ideaCount, START_AT, startSeconds, wantsIdeas } from './quoting';

describe('excerpt guide', () => {
  it('allows a fifth of the piece, between 50 and 400 words', () => {
    expect(excerptCap(1587)).toBe(317); // a 7-minute article: a few paragraphs
    expect(excerptCap(300)).toBe(60); // a short post: a fifth of it
    expect(excerptCap(200)).toBe(50); // a very short one still gets a passage
    expect(excerptCap(20000)).toBe(400); // a long talk is capped
  });
  it('advises without blocking, and lets posts be quoted whole', () => {
    const para = Array.from({ length: 60 }, () => 'word').join(' ');
    expect(excerptAdvice(para, 1000).over).toBe(false);
    expect(excerptAdvice(`${para} ${para} ${para}`, 1000).over).toBe(false);
    expect(excerptAdvice(`${para} ${para} ${para} ${para}`, 1000).over).toBe(true);
    expect(excerptAdvice(`${para} ${para} ${para} ${para}`, 1000).message).toMatch(/240 words, 24% of the piece/);
    expect(excerptAdvice(`${para} ${para}`, 150, 'post').over).toBe(false);
    expect(excerptAdvice(`${para} ${para}`, 150, 'social').over).toBe(false);
    expect(excerptAdvice(`${para} ${para}`, 150, 'quote').over).toBe(false);
  });
  it('counts words the way a reader would', () => {
    expect(countWords("It's 3.3 per cent — of 79 million birds.")).toBe(8);
  });
});

describe('big ideas', () => {
  it('are drawn out for long talks, podcasts, videos and papers, and very long texts', () => {
    expect(wantsIdeas('podcast', 22000, 130)).toBe(true);
    expect(wantsIdeas('video', 4000, 25)).toBe(true);
    expect(wantsIdeas('talk', 2500, 12)).toBe(false);
    expect(wantsIdeas('paper', 9000)).toBe(true);
    expect(wantsIdeas('essay', 1587)).toBe(false);
    // A speech reads like a talk; a quotation, a post, a picture or a tool never gets big ideas.
    expect(wantsIdeas('speech', 4000, 25)).toBe(true);
    for (const t of ['quote', 'social', 'image', 'tool'] as const) expect(wantsIdeas(t, 9000, 60)).toBe(false);
    expect(wantsIdeas('essay', 8000)).toBe(true);
  });
  it('are about one per fifteen minutes, from three to twelve', () => {
    expect(ideaCount(3000)).toBe(3);
    expect(ideaCount(12151)).toBe(5); // a one-hour talk
    expect(ideaCount(22000)).toBe(10); // two hours
    expect(ideaCount(33000)).toBe(12); // three hours
    expect(ideaCount(60000)).toBe(12);
  });
  it('read a start time or page', () => {
    expect(START_AT.test('42:06') && START_AT.test('1:02:14') && START_AT.test('p. 12')).toBe(true);
    expect(START_AT.test('forty two') || START_AT.test('42:6')).toBe(false);
    expect(startSeconds('1:02:14')).toBe(3734);
    expect(startSeconds('42:06')).toBe(2526);
    expect(startSeconds('p. 12')).toBeNull();
  });
});

import { sourceAction } from './haul';

describe('the link to the original names the person', () => {
  const base = { title: { text: 'Where do birds go?' }, source: { name: 'The Conversation', date: '', url: '' } };
  it('by kind of work', () => {
    expect(sourceAction({ ...base, type: 'essay', creator: 'Amy L. Scarpignato' })).toBe('Read Amy L. Scarpignato in The Conversation');
    expect(sourceAction({ ...base, type: 'video', creator: 'Andrej Karpathy', source: { ...base.source, name: 'YouTube' }, media: { kind: 'video', url: 'https://youtu.be/x', label: 'Watch · 59:48' } })).toBe('Watch Andrej Karpathy on YouTube · 59:48');
    expect(sourceAction({ ...base, type: 'podcast', creator: 'Russ Roberts', source: { ...base.source, name: 'EconTalk' }, media: { kind: 'audio', url: 'https://x.org', label: 'Listen' } })).toBe('Listen to Russ Roberts on EconTalk');
    expect(sourceAction({ ...base, type: 'essay', creator: '' })).toBe('Read the original in The Conversation');
    expect(sourceAction({ ...base, type: 'rabbit-hole', creator: '' })).toBe('Go down the hole');
  });
});
