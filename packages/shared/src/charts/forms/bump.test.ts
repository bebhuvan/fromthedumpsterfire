import { describe, expect, it } from 'vitest';
import { renderChart } from '../render';
import { Ctx } from '../frame';
import { rankOf } from './bump';
import { fixtureC, overlap, sceneProblems, shapes, textBox } from './testkit-c';

describe('bump', () => {
  const chart = fixtureC('bump');

  it('draws in both layouts with nothing off the canvas and no labels touching', () => {
    for (const layout of ['wide', 'narrow'] as const) {
      const scene = renderChart(chart, layout);
      expect(sceneProblems(scene)).toEqual([]);
      const boxes = shapes(scene).flatMap((n) => (n.t === 'text' ? [textBox(n)] : []));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${boxes[i]!.text} / ${boxes[j]!.text}`).toBe(false);
    }
  });

  it('ranks are a permutation at every year, highest value first', () => {
    const { xs, names, ranks } = rankOf(new Ctx(chart, 'wide'));
    xs.forEach((x, k) => {
      const at = names.map((n) => ranks.get(n)![k]).filter((r): r is number => r !== null);
      expect([...at].sort((a, b) => a - b)).toEqual(at.map((_, i) => i + 1));
      const first = names.find((n) => ranks.get(n)![k] === 1)!;
      const max = Math.max(...chart.data.rows.filter((r) => r[1] === x).map((r) => r[2] as number));
      expect(chart.data.rows.find((r) => r[0] === first && r[1] === x)![2]).toBe(max);
    });
  });

  it('India passes China in the last period', () => {
    const { ranks } = rankOf(new Ctx(chart, 'wide'));
    expect(ranks.get('India')!.at(-1)).toBe(1);
    expect(ranks.get('China')!.at(0)).toBe(1);
  });

  it('ranks lowest first when asked, and breaks ties by name', () => {
    const c = fixtureC('bump');
    c.options = { ...c.options, rank: 'asc' };
    c.data.rows = [
      ['B', 2000, 5],
      ['A', 2000, 5],
      ['C', 2000, 1],
    ];
    const { ranks } = rankOf(new Ctx(c, 'wide'));
    expect(ranks.get('C')![0]).toBe(1);
    expect(ranks.get('A')![0]).toBe(2);
    expect(ranks.get('B')![0]).toBe(3);
  });
});
