import { describe, expect, it } from 'vitest';
import type { Draft, MarginalBody, WikiCard } from '../api';
import { haulMark, moveTo, nextOffer, offersFor } from './offers';

const draft = (id: string, kind: 'idea' | 'marginal', status: Draft['status'], body: Partial<MarginalBody>): Draft<MarginalBody> =>
  ({ id, item_id: 'it', kind, status, model: null, position: 0, body: { text: `${id} text`, ...body } as MarginalBody }) as Draft<MarginalBody>;
const card = (id: string, status: WikiCard['status']): WikiCard => ({ id, query: id, title: `Card ${id}`, summary: `Lead of ${id}.`, extract: '', url: `https://en.wikipedia.org/wiki/${id}`, status, http_status: 200 });

describe('the offers queue', () => {
  it('holds only what waits on the editor: ideas in the piece’s order, then notes, then cards', () => {
    const offers = offersFor(
      { id: 'it', title: 'Fighting for Growth' },
      [
        draft('n1', 'marginal', 'proposed', { cite: { kind: 'wiki', title: 'Swing Riots', cardId: 'w1' } }),
        draft('i2', 'idea', 'proposed', { cite: { kind: 'source', quote: 'later\nwords', start: 900, end: 910 }, locator: 'p. 9' }),
        draft('i1', 'idea', 'proposed', { cite: { kind: 'source', quote: 'early words', start: 10, end: 21 } }),
        draft('n2', 'marginal', 'kept', { cite: { kind: 'wiki', title: 'x', cardId: 'w1' } }),
        draft('n3', 'marginal', 'rejected', { cite: { kind: 'wiki', title: 'x', cardId: 'w1' } }),
      ],
      [card('w1', 'proposed'), card('w2', 'kept'), card('w3', 'cut')],
    );
    expect(offers.map((o) => o.id)).toEqual(['i1', 'i2', 'n1', 'w1']);
    expect(offers[1]!.from).toEqual({ label: 'From the piece', words: 'later words', locator: 'p. 9' });
    // A note citing Wikipedia shows the card's lead as its source.
    expect(offers[2]!.from).toEqual({ label: 'From Wikipedia: Swing Riots', words: 'Lead of w1.' });
    expect(offers[3]).toMatchObject({ what: 'wiki', kind: 'card', text: 'Card w1', from: { url: 'https://en.wikipedia.org/wiki/w1' } });
  });

  it('survives a draft whose stored body did not parse', () => {
    const broken = { ...draft('b', 'marginal', 'proposed', {}), body: {} as MarginalBody };
    expect(offersFor({ id: 'it', title: 't' }, [broken], [])).toEqual([]);
  });
});

describe('going through the offers', () => {
  it('shows the first unanswered offer, so a refused answer comes back without repeating later ones', () => {
    const offers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(nextOffer(offers, new Set())).toBe(0);
    expect(nextOffer(offers, new Set(['a', 'b']))).toBe(2);
    // A's save failed after B was answered: A is next, then C; B is not shown again.
    expect(nextOffer(offers, new Set(['b']))).toBe(0);
    expect(nextOffer(offers, new Set(['a', 'b']))).toBe(2);
    expect(nextOffer(offers, new Set(['a', 'b', 'c']))).toBe(3);
  });
});

describe('the Haul page', () => {
  it('marks an item ready, to look at, or to fix', () => {
    expect(haulMark([])).toBe('ok');
    expect(haulMark([{ severity: 'doubt' }])).toBe('look');
    expect(haulMark([{ severity: 'doubt' }, { severity: 'wrong' }])).toBe('fix');
  });
  it('moves an item to a new place', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(moveTo(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});
