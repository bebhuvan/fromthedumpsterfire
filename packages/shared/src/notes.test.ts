import { describe, expect, it } from 'vitest';
import { noteLinks, noteParagraphs, notePlain, sourceDate } from './haul';

describe('the editor’s note', () => {
  const raw =
    'I came across this "tweet by Shantanu Goel" (https://x.com/s/status/1) about a utility.\n\nIt reminded me of [my post](https://bhuvan.substack.com/p/x).';

  it('lifts links out by deleting only the marks around the words', () => {
    const { text, links } = noteLinks(raw);
    expect(text).toBe('I came across this tweet by Shantanu Goel about a utility.\n\nIt reminded me of my post.');
    expect(links).toEqual([
      { text: 'tweet by Shantanu Goel', url: 'https://x.com/s/status/1' },
      { text: 'my post', url: 'https://bhuvan.substack.com/p/x' },
    ]);
    expect(notePlain({ text: raw })).toBe(text);
  });

  it('keeps paragraphs and marks each link once', () => {
    expect(noteParagraphs({ text: raw })).toEqual([
      [{ text: 'I came across this ' }, { text: 'tweet by Shantanu Goel', url: 'https://x.com/s/status/1' }, { text: ' about a utility.' }],
      [{ text: 'It reminded me of ' }, { text: 'my post', url: 'https://bhuvan.substack.com/p/x' }, { text: '.' }],
    ]);
  });

  it('uses stored links and refuses addresses that are not http', () => {
    const paras = noteParagraphs({ text: 'See the map and the map.', links: [{ text: 'the map', url: 'https://e.org/m' }, { text: 'See', url: 'javascript:alert(1)' }] });
    expect(paras).toEqual([[{ text: 'See ' }, { text: 'the map', url: 'https://e.org/m' }, { text: ' and the map.' }]]);
  });

  it('joins single line breaks inside a paragraph', () => {
    expect(noteParagraphs({ text: 'One\nline.\n\n\nTwo.' })).toEqual([[{ text: 'One line.' }], [{ text: 'Two.' }]]);
  });
});

import { curlQuotes } from './haul';
describe('curly quotes for display', () => {
  it('curls doubles and apostrophes, leaving the words alone', () => {
    expect(curlQuotes('He said "their wealth was such". It\'s Jones\' law ("Hindu law").')).toBe('He said “their wealth was such”. It’s Jones’ law (“Hindu law”).');
  });
});

import { quoteLead } from './haul';
describe('a long quotation’s lead', () => {
  const dickens = 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness';
  it('takes the opening clauses up to a break once there are eight words', () => {
    const q = quoteLead(dickens)!;
    expect(q.lead).toBe('It was the best of times, it was the worst of times,');
    expect(q.lead + q.rest).toBe(dickens);
  });
  it('prefers the editor’s highlight when it opens the quotation', () => {
    expect(quoteLead(dickens, 'It was the best of times')?.lead).toBe('It was the best of times');
  });
  it('has no lead without a clean break', () => {
    expect(quoteLead('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one, end')).toBeNull();
  });
});

describe('sourceDate', () => {
  it('says a machine timestamp as a reader would, in the source’s own day', () => {
    expect(sourceDate('2026-10-24T19:40:00 JST+0900')).toBe('24 October 2026');
    expect(sourceDate('2026-10-24')).toBe('24 October 2026');
    expect(sourceDate('2026-01-05T23:59:00Z')).toBe('5 January 2026');
    expect(sourceDate('2026-03-01T00:10:00+05:30')).toBe('1 March 2026');
  });
  it('leaves dates written for people alone', () => {
    for (const d of ['1859', 'Autumn 1892', '22 October 2026', '', 'c. 1600']) expect(sourceDate(d)).toBe(d);
  });
});

describe('curlQuotes, single marks', () => {
  it('opens a single quotation and closes it, and keeps apostrophes as apostrophes', () => {
    expect(curlQuotes("Japanese firm GMO seeks 'Active Cyber Defense' by govt.")).toBe('Japanese firm GMO seeks ‘Active Cyber Defense’ by govt.');
    expect(curlQuotes("the '90s, rock 'n' roll")).toBe('the ’90s, rock ‘n’ roll');
  });
});
