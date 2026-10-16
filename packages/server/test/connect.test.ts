// Machine-suggested connections: chunking, candidates from vectors and shared entities, the judge's
// verdicts verified verbatim at both ends (failures dropped after one retry), the spend ledger, and
// the clustering that proposes Threads.

import { describe, expect, it } from 'vitest';
import { chunkText, components, embedAndFindCandidates, judgeCandidates, splitComponent, threadClusters, verifyVerdict, yearOf, suggestThreads } from '../src/connect';
import { answer, makeEnv, type TestEnv } from './fake-env';
import { BUSH, JEVONS, NADELLA, seedItem } from './seed';

/** A deterministic bag-of-words embedding: related texts share words, so they score high. */
function embed(text: string): number[] {
  const v = new Array(1024).fill(0);
  for (const w of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 1024;
    v[h] += 1;
  }
  v[0] += 0.01;
  return v;
}

function ai(chat: (prompt: string, n: number) => unknown) {
  let n = 0;
  return (model: string, input: Record<string, any>) => {
    if (model.includes('bge')) return { data: (input.text as string[]).map(embed), shape: [input.text.length, 1024] };
    const user = (input.messages as Array<{ role: string; content: string }>).filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    return chat(user, n++);
  };
}

async function seedCards(env: TestEnv) {
  await seedItem(env, 'it_jevons', { title: 'The Coal Question', text: JEVONS, date: '1865' });
  await seedItem(env, 'it_nadella', { title: 'Jevons paradox strikes again', text: NADELLA, date: '27 January 2025' });
  await seedItem(env, 'it_bush', { title: 'As We May Think', text: BUSH, date: 'July 1945' });
  const card = (summary: string, mechanisms: string[]) => JSON.stringify({ summary, mechanisms, claims: [], entities: [], events: [], quotables: [] });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, created_at, updated_at) VALUES ('c1', 'it_jevons', 'card', ?, 'kept', '', '')`).bind(card('Efficiency in coal use raises consumption.', ['Jevons paradox'])),
    env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, created_at, updated_at) VALUES ('c2', 'it_nadella', 'card', ?, 'kept', '', '')`).bind(card('Cheaper AI will raise its use, says Nadella, citing Jevons.', ['Jevons paradox'])),
    env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, created_at, updated_at) VALUES ('c3', 'it_bush', 'card', ?, 'kept', '', '')`).bind(card('Too much to read; build machines to link records.', ['information overload'])),
    env.DB.prepare(`INSERT INTO wiki_cards (id, item_id, query, title, summary, extract, url, status, created_at) VALUES ('w1', 'it_jevons', 'q', 'Jevons paradox', 's', 'e', 'https://en.wikipedia.org/wiki/Jevons_paradox', 'kept', '')`),
    env.DB.prepare(`INSERT INTO wiki_cards (id, item_id, query, title, summary, extract, url, status, created_at) VALUES ('w2', 'it_nadella', 'q', 'Jevons paradox', 's', 'e', 'https://en.wikipedia.org/wiki/Jevons_paradox', 'proposed', '')`),
  ]);
}

describe('chunkText', () => {
  it('covers the text with overlapping chunks whose offsets point at the text', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about coal and engines and the price of fuel.`).join(' ');
    const spans = chunkText(text, 400, 60);
    expect(spans.length).toBeGreaterThan(5);
    for (const s of spans) {
      expect(text.slice(s.start, s.end).trim()).toBe(text.slice(s.start, s.end));
      expect(s.end - s.start).toBeLessThanOrEqual(400);
    }
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.start).toBeLessThan(spans[i - 1]!.end);
    expect(spans.at(-1)!.end).toBe(text.length);
    expect(chunkText('x'.repeat(500_000), 1200, 150, 120)).toHaveLength(120);
  });
});

describe('verifyVerdict', () => {
  const a = { id: 'a', text: JEVONS };
  const b = { id: 'b', text: NADELLA };
  const good = { pair: 0, type: 'Rhymes with' as const, direction: 'b_to_a' as const, note: 'Nadella in 2025 repeats the argument Jevons made about coal in 1865.', quoteA: 'The very contrary is the truth.', quoteB: '“Jevons paradox strikes again!”', confidence: 0.86 };
  it('keeps an edge only when both quotes are verbatim, re-anchored to the sources, with direction applied', () => {
    const { edge, problems } = verifyVerdict(good, a, b);
    expect(problems).toEqual([]);
    expect(edge).toMatchObject({ fromId: 'b', toId: 'a', type: 'Rhymes with', from: { quote: 'Jevons paradox strikes again!' }, to: { quote: 'The very contrary is the truth.' } });
    expect(NADELLA.slice(edge!.from.start, edge!.from.end)).toBe(edge!.from.quote);
  });
  it('drops paraphrase at either end, house-style breaks and low confidence', () => {
    expect(verifyVerdict({ ...good, quoteA: 'Efficiency means more use.' }, a, b).problems[0]).toMatch(/piece A/);
    expect(verifyVerdict({ ...good, quoteB: 'AI use will skyrocket.' }, a, b).problems[0]).toMatch(/piece B/);
    expect(verifyVerdict({ ...good, note: "It's not about coal, it's about compute." }, a, b).problems.join()).toMatch(/house style/);
    expect(verifyVerdict({ ...good, confidence: 0.3 }, a, b).problems).toEqual(['confidence below threshold']);
    expect(verifyVerdict({ ...good, type: 'none' }, a, b).edge).toBeNull();
  });
});

describe('candidates and judging', () => {
  it('embeds, finds the related item by vectors, entities and mechanisms, judges with verified quotes, and never pays twice', async () => {
    let prompts: string[] = [];
    const env = makeEnv(
      ai((prompt, n) => {
        prompts.push(prompt);
        // First answer paraphrases piece B; the retry quotes it exactly.
        return answer({
          verdicts: [
            {
              pair: 0,
              type: 'Rhymes with',
              direction: 'a_to_b',
              note: 'Nadella in 2025 repeats the argument Jevons made about coal in 1865.',
              quoteA: n === 0 ? 'Jevons said AI use will rise.' : 'Jevons paradox strikes again!',
              quoteB: 'The very contrary is the truth.',
              confidence: 0.8,
            },
          ],
        });
      }),
    );
    await seedCards(env);
    // Embed the older pieces first (their vectors are what the new item finds).
    await embedAndFindCandidates(env, 'it_jevons');
    await embedAndFindCandidates(env, 'it_bush');
    prompts = [];
    const found = await embedAndFindCandidates(env, 'it_nadella');
    expect(found.vectorRoute).toBe(true);
    const top = found.candidates[0]!;
    expect(top.otherId).toBe('it_jevons');
    expect(top.entities).toEqual(['Jevons paradox']);
    expect(top.mechanisms).toEqual(['Jevons paradox']);
    expect(top.theirs.length).toBeGreaterThan(0);

    const r = await judgeCandidates(env, 'it_nadella', found.candidates.filter((c) => c.otherId === 'it_jevons'));
    expect(r).toMatchObject({ judged: 1, kept: 1 });
    expect(prompts.at(-1)).toMatch(/failed our checks/);
    const s = await env.DB.prepare('SELECT * FROM suggestions').first<any>();
    expect(s).toMatchObject({ from_item_id: 'it_nadella', to_item_id: 'it_jevons', type: 'Rhymes with', status: 'proposed', confidence: 0.8 });
    expect(NADELLA.slice(s.from_start, s.from_end)).toBe(s.from_quote);
    expect(JEVONS.slice(s.to_start, s.to_end)).toBe(s.to_quote);
    // The ledger has the embedding and judge calls, with costs.
    const calls = (await env.DB.prepare('SELECT task, ok, cost_usd FROM model_calls').all<any>()).results;
    expect(calls.filter((c: any) => c.task === 'embed').length).toBe(3);
    expect(calls.filter((c: any) => c.task === 'connect').length).toBe(2);
    expect(calls.every((c: any) => c.cost_usd >= 0)).toBe(true);
    // The pair is recorded: looking again finds no candidate to pay for.
    const again = await embedAndFindCandidates(env, 'it_nadella');
    expect(again.candidates.find((c) => c.otherId === 'it_jevons')).toBeUndefined();
  });

  it('works without Vectorize (entities and mechanisms only)', async () => {
    const env = makeEnv(ai(() => answer({ verdicts: [] })), { VECTORS: undefined } as never);
    await seedCards(env);
    const r = await embedAndFindCandidates(env, 'it_nadella');
    expect(r.vectorRoute).toBe(false);
    expect(r.candidates.map((c) => c.otherId)).toEqual(['it_jevons']);
  });
});

describe('threads', () => {
  const E = (a: string, b: string) => ({ a, b });
  it('finds connected components and splits big ones at their weakest edge, never a hairball', () => {
    expect(components([E('a', 'b'), E('b', 'c'), E('x', 'y')])).toEqual([['a', 'b', 'c'], ['x', 'y']]);
    // Two dense groups joined by one bridge edge.
    const g1 = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
    const g2 = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'];
    const dense = (g: string[]) => g.flatMap((x, i) => g.slice(i + 1).map((y) => E(x, y)));
    const edges = [...dense(g1), ...dense(g2), E('a7', 'b1')];
    const groups = splitComponent([...g1, ...g2], edges, 12);
    expect(groups.map((g) => g.sort())).toEqual([g1, g2]);
    expect(threadClusters(edges).map((c) => c.length).sort()).toEqual([7, 7]);
    expect(threadClusters([E('a', 'b')])).toEqual([]);
  });
  it('reads years from dates', () => {
    expect([yearOf('7 March 1986'), yearOf('ca. 1890'), yearOf('1643/44'), yearOf('n.d.')]).toEqual(['1986', '1890', '1643', '']);
  });
  it('drafts a thread for a cluster of kept links, style-checked, ordered by year, once', async () => {
    const env = makeEnv(
      ai((_p, n) =>
        answer({
          title: { text: 'The price', italic: 'of plenty' },
          summary: n === 0 ? 'A testament to plenty.' : 'Each piece finds that making a thing cheaper makes people use more of it.',
          points: [
            { itemId: 'it_jevons', gist: 'Better engines burn more coal.' },
            { itemId: 'it_bush', gist: 'Cheap print makes too much to read.' },
            { itemId: 'it_nadella', gist: 'The same argument returns for AI.' },
          ],
        }),
      ),
    );
    await seedCards(env);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO connections (id, item_id, to_item_id, type, note, created_at) VALUES ('c1', 'it_nadella', 'it_jevons', 'Rhymes with', 'n', '')`),
      env.DB.prepare(`INSERT INTO connections (id, item_id, to_item_id, type, note, created_at) VALUES ('c2', 'it_bush', 'it_jevons', 'Same mechanism', 'n', '')`),
    ]);
    const r = await suggestThreads(env);
    expect(r.drafted).toHaveLength(1);
    const t = await env.DB.prepare('SELECT * FROM threads').first<any>();
    expect(t.summary).toMatch(/^Each piece/); // the first draft broke the style ("testament") and was redone
    expect(JSON.parse(t.points).map((p: any) => p.year)).toEqual(['1865', '1945', '2025']);
    expect(JSON.parse(t.points)[2].edge).toBe('Rhymes with');
    expect((await suggestThreads(env)).drafted).toHaveLength(0);
  });
});
