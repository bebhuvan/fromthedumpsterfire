// The research desk: notes from the model's own knowledge, each checked against a whole Wikipedia
// article the Desk fetched (word for word, then the judge), and the texts a session hands the Desk.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditResearch, researchItem } from '../src/research';
import { MAX_EVIDENCE_PER_ITEM, passagesFor, printedSource, siteLabel, wikiPage } from '../src/evidence';
import { draftItem, judgeNotes, runChecks } from '../src/steps';
import type { EvidenceRow, MarginalBody } from '../src/db';
import { isNoteUrl } from '@fdf/shared/validate';
import { answer, makeEnv } from './fake-env';
import { seedHaul } from './seed';

afterEach(() => vi.unstubAllGlobals());

const ARTICLE = [
  'William Stanley Jevons (1 September 1835 – 13 August 1882) was an English economist and logician.',
  'In 1865 he published The Coal Question, which argued that Britain would exhaust its coal and lose its lead in industry.',
  'Jevons drowned while bathing near Hastings in 1882, at the age of 46.',
  'His theory of marginal utility was taken up by later economists across Europe.',
].join('\n');

const ev = (text = ARTICLE): EvidenceRow => ({
  id: 'ev_1',
  item_id: 'it_jevons',
  kind: 'wiki',
  title: 'William Stanley Jevons',
  publisher: 'Wikipedia',
  url: 'https://en.wikipedia.org/wiki/William_Stanley_Jevons',
  text,
  word_count: 60,
  revision: '1',
  via: 'pipeline',
  fetched_at: '2026-11-14T00:00:00.000Z',
});

/** Wikipedia's summary and article endpoints for one article, as fetch sees them. */
function stubWikipedia(title = 'William Stanley Jevons', text = ARTICLE) {
  const url = `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`;
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const u = String(input instanceof Request ? input.url : input);
      calls.push(u);
      if (u.includes('/page/summary/')) {
        const asked = decodeURIComponent(u.split('/page/summary/')[1]!.split('?')[0]!).replace(/_/g, ' ');
        if (asked !== title) return new Response('{}', { status: 404 });
        return Response.json({ type: 'standard', title, extract: text.split('\n')[0], content_urls: { desktop: { page: url } }, revision: '7', titles: { canonical: title.replace(/ /g, '_') } });
      }
      if (u.includes('/w/api.php')) return Response.json({ query: { pages: [{ title, extract: text, fullurl: url, revisions: [{ revid: 7 }] }] } });
      if (u.includes('/w/rest.php/v1/search/page')) return Response.json({ pages: [] });
      return new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

type Msg = { role: string; content: string };
const system = (input: Record<string, any>) => ((input.messages as Msg[]) ?? []).filter((m) => m.role === 'system').map((m) => m.content).join('\n');

describe('passagesFor', () => {
  it('keeps the opening and the paragraphs that bear on the claim, verbatim and in order', () => {
    const p = passagesFor(ARTICLE, 'Jevons drowned near Hastings', 200);
    expect(p.split('\n\n')).toEqual([ARTICLE.split('\n')[0], ARTICLE.split('\n')[2]]);
  });
});

describe('wikiPage', () => {
  it('reads a whole article and refuses a missing page or a foreign link', () => {
    expect(wikiPage({ title: 'X', extract: 'Text of X.', fullurl: 'https://en.wikipedia.org/wiki/X', revisions: [{ revid: 3 }] })).toMatchObject({ kind: 'wiki', publisher: 'Wikipedia', revision: '3' });
    expect(wikiPage({ title: 'X', missing: true })).toBeNull();
    expect(wikiPage({ title: 'X', extract: 'Text.', fullurl: 'https://evil.example/wiki/X' })).toBeNull();
  });
});

describe('auditResearch', () => {
  const byLead = new Map([[0, ev()]]);
  it('passes a note whose quotation is in the article word for word', () => {
    const r = auditResearch([{ lead: 0, text: 'Jevons drowned while bathing near Hastings in 1882, aged 46.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' }], byLead);
    expect(r.failures).toEqual([]);
    expect(r.ok[0]!.span.start).toBe(ARTICLE.indexOf('Jevons drowned'));
  });
  it('refuses an invented quotation, the house style, an unknown lead and a long note; drops a repeat', () => {
    const r = auditResearch(
      [
        { lead: 0, text: 'Jevons died young.', quote: 'Jevons died at sea in 1890.' },
        { lead: 0, text: 'It is not just a death — it is a tapestry.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' },
        { lead: 3, text: 'A note.', quote: 'Anything.' },
        { lead: 0, text: Array(90).fill('word').join(' ') + '.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' },
      ],
      byLead,
    );
    expect(r.ok).toEqual([]);
    expect(r.failures).toHaveLength(4);
    const twice = auditResearch(
      [
        { lead: 0, text: 'Jevons drowned in 1882.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' },
        { lead: 1, text: 'Jevons died at Hastings.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' },
      ],
      new Map([[0, ev()], [1, ev()]]),
    );
    expect(twice.ok).toHaveLength(1);
    const again = auditResearch([{ lead: 0, text: 'Jevons drowned in 1882.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' }], byLead, new Set(['Jevons drowned while bathing near Hastings in 1882, at the age of 46.']));
    expect([again.ok, again.failures]).toEqual([[], []]);
  });
});

describe('researchItem', () => {
  it('fetches the whole article for each lead, offers only checked notes, and the judge reads the quoted stretch', async () => {
    const calls = stubWikipedia();
    const judgeSaw: string[] = [];
    const env = await seedHaul(
      makeEnv((_m, input) => {
        const s = system(input);
        if (s.includes('Read the piece and the editor')) {
          return answer({ leads: [{ angle: 'anecdote', claim: 'Jevons drowned near Hastings in 1882, aged 46.', wikipedia: 'William Stanley Jevons' }, { angle: 'echo', claim: 'Something with no article.', wikipedia: 'No Such Article' }] });
        }
        if (s.includes('numbered leads')) {
          return answer({
            notes: [
              { lead: 0, text: 'Jevons drowned while bathing near Hastings in 1882, aged 46, seventeen years after The Coal Question.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' },
              { lead: 1, text: 'A note for a lead with no article.', quote: 'Nothing.' },
            ],
          });
        }
        if (s.includes('fact-checker')) {
          judgeSaw.push(((input.messages as Msg[]).at(-1)?.content ?? '') as string);
          return answer({ verdicts: [{ index: 0, verdict: 'supported', reason: 'The article says so.' }] });
        }
        return answer({});
      }),
    );
    const r = await researchItem(env, 'it_jevons');
    expect(r).toMatchObject({ leads: 2, sources: 1, notes: 1 });
    expect(calls.some((u) => u.includes('/w/api.php'))).toBe(true);
    const row = await env.DB.prepare(`SELECT * FROM drafts WHERE item_id = 'it_jevons' AND kind = 'marginal'`).first<{ body: string; status: string }>();
    const body = JSON.parse(row!.body) as MarginalBody;
    expect(row!.status).toBe('proposed');
    expect(body).toMatchObject({ angle: 'anecdote', cite: { kind: 'evidence', publisher: 'Wikipedia', title: 'William Stanley Jevons', url: 'https://en.wikipedia.org/wiki/William_Stanley_Jevons' } });
    const stored = await env.DB.prepare(`SELECT text, via FROM evidence WHERE item_id = 'it_jevons'`).first<{ text: string; via: string }>();
    expect(stored).toEqual({ text: ARTICLE, via: 'pipeline' });

    const j = await judgeNotes(env, 'it_jevons');
    expect(j).toEqual({ checked: 1, rejected: 0 });
    expect(judgeSaw.join('')).toContain('From Wikipedia, "William Stanley Jevons"');
    expect(judgeSaw.join('')).toContain('bathing near Hastings');

    // Kept, the note passes the citation check; a research run again replaces only unkept offers.
    await env.DB.prepare(`UPDATE drafts SET status = 'kept' WHERE item_id = 'it_jevons' AND kind = 'marginal'`).run();
    const checks = await runChecks(env, 'it_jevons', { links: false });
    expect(checks.citations).toMatchObject({ status: 'pass' });
    expect(checks.citations!.rows[0]!.detail).toBe('Checked against Wikipedia: William Stanley Jevons');
    await researchItem(env, 'it_jevons');
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM drafts WHERE item_id = 'it_jevons' AND kind = 'marginal'`).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it('skips a Life and a Rhyme', async () => {
    const env = await seedHaul(makeEnv(() => { throw new Error('no model call expected'); }));
    await env.DB.prepare(`UPDATE items SET type = 'life' WHERE id = 'it_jevons'`).run();
    expect(await researchItem(env, 'it_jevons')).toEqual({ leads: 0, sources: 0, notes: 0, dropped: 0 });
    await env.DB.prepare(`UPDATE items SET kind = 'rhyme' WHERE id = 'it_nadella'`).run();
    expect(await researchItem(env, 'it_nadella')).toEqual({ leads: 0, sources: 0, notes: 0, dropped: 0 });
  });

  it('keeps at most so many fetched sources an item', async () => {
    stubWikipedia();
    const env = await seedHaul(makeEnv());
    for (let i = 0; i < MAX_EVIDENCE_PER_ITEM; i++) {
      await env.DB.prepare(`INSERT INTO evidence (id, item_id, kind, title, publisher, url, text, via, fetched_at) VALUES (?, 'it_jevons', 'web', 't', 'p', ?, 'x', 'pipeline', 'now')`).bind(`ev_${i}`, `https://example.org/${i}`).run();
    }
    const { addWikiEvidence } = await import('../src/evidence');
    await expect(addWikiEvidence(env, 'it_jevons', 'William Stanley Jevons')).rejects.toThrow(/already has 40 fetched sources/);
  });
});

describe('isNoteUrl', () => {
  it('takes an https page with a host and nothing else', () => {
    expect(isNoteUrl('https://en.wikipedia.org/wiki/X')).toBe(true);
    expect(isNoteUrl('https://www.theguardian.com/a/b')).toBe(true);
    for (const bad of ['http://example.org/', 'javascript:alert(1)', 'https://user:pw@example.org/', 'https://localhost/x', 'not a url']) expect(isNoteUrl(bad)).toBe(false);
  });
});

describe('printedSource', () => {
  it("keeps the fetched address unless the page's canonical is on the same site, and trusts a site name only when the host matches it", () => {
    expect(printedSource('https://www.theguardian.com/a?utm=x', 'https://www.theguardian.com/a', 'The Guardian')).toEqual({ url: 'https://www.theguardian.com/a', publisher: 'The Guardian' });
    expect(printedSource('https://evil.example/a', 'https://phish.example/a', 'The Guardian')).toEqual({ url: 'https://evil.example/a', publisher: 'evil.example' });
    expect(printedSource('https://news.example.org/a', 'not a url', undefined)).toEqual({ url: 'https://news.example.org/a', publisher: 'news.example.org' });
    expect(printedSource('https://blog.example.org/a', 'http://blog.example.org/a', '')).toEqual({ url: 'https://blog.example.org/a', publisher: 'blog.example.org' });
    expect(printedSource('https://guardian-archive.net/a', undefined, 'The Guardian').publisher).toBe('guardian-archive.net');
    expect(printedSource('https://theguardian.com.evil.example/a', undefined, 'The Guardian').publisher).toBe('theguardian.com.evil.example');
    expect(printedSource('https://www.thehindu.com/a', undefined, 'The Hindu').publisher).toBe('The Hindu');
    expect(printedSource('https://news.bbc.co.uk/a', undefined, 'BBC').publisher).toBe('BBC');
  });
  it('names the label a site registered', () => {
    expect([siteLabel('www.theguardian.com'), siteLabel('news.bbc.co.uk'), siteLabel('iitb.ac.in'), siteLabel('example.org')]).toEqual(['theguardian', 'bbc', 'iitb', 'example']);
  });
});

describe('research run again, redrafts and the citation check', () => {
  const leadsThenNotes = (judge = 'supported') =>
    makeEnv((_m, input) => {
      const s = system(input);
      if (s.includes('Read the piece and the editor')) return answer({ leads: [{ angle: 'anecdote', claim: 'Jevons drowned near Hastings.', wikipedia: 'William Stanley Jevons' }] });
      if (s.includes('numbered leads')) return answer({ notes: [{ lead: 0, text: 'Jevons drowned while bathing near Hastings in 1882, aged 46.', quote: 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.' }] });
      if (s.includes('fact-checker')) return answer({ verdicts: [0, 1, 2].map((index) => ({ index, verdict: judge, reason: 'ok' })) });
      return answer({ titles: [{ text: 'A title' }], excerpts: [], marginalia: [], ideas: [] });
    });

  it('offers the same note again when research runs twice, without a duplicate', async () => {
    stubWikipedia();
    const env = await seedHaul(leadsThenNotes());
    expect((await researchItem(env, 'it_jevons')).notes).toBe(1);
    expect((await researchItem(env, 'it_jevons')).notes).toBe(1);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM drafts WHERE item_id = 'it_jevons' AND kind = 'marginal'`).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("leaves a session's unkept notes through a redraft", async () => {
    const env = await seedHaul(leadsThenNotes());
    const body = JSON.stringify({ text: 'A session note.', cite: { kind: 'source', quote: 'The very contrary is the truth.', start: 0, end: 1 }, verdict: 'supported' });
    await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES ('dr_s', 'it_jevons', 'marginal', ?, 'proposed', 'claude-opus-5-5 (session)', 0, 'now', 'now')`).bind(body).run();
    await env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, model, position, created_at, updated_at) VALUES ('dr_p', 'it_jevons', 'marginal', ?, 'proposed', 'claude-sonnet-5-5', 1, 'now', 'now')`).bind(body).run();
    await draftItem(env, 'it_jevons');
    const left = (await env.DB.prepare(`SELECT id FROM drafts WHERE item_id = 'it_jevons' AND kind = 'marginal'`).all<{ id: string }>()).results.map((r) => r.id);
    expect(left).toEqual(['dr_s']);
  });

  it('checks each kept note on a fetched text by its own quote', async () => {
    const env = await seedHaul(makeEnv());
    await env.DB.prepare(`INSERT INTO evidence (id, item_id, kind, title, publisher, url, text, word_count, via, fetched_at) VALUES ('ev_1', 'it_jevons', 'wiki', 'William Stanley Jevons', 'Wikipedia', 'https://en.wikipedia.org/wiki/William_Stanley_Jevons', ?, 60, 'pipeline', 'now')`).bind(ARTICLE).run();
    const note = (id: string, quote: string, start: number) =>
      env.DB.prepare(`INSERT INTO drafts (id, item_id, kind, body, status, position, created_at, updated_at) VALUES (?, 'it_jevons', 'marginal', ?, 'kept', 0, 'now', 'now')`)
        .bind(id, JSON.stringify({ text: 'A note.', cite: { kind: 'evidence', evidenceId: 'ev_1', title: 'William Stanley Jevons', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/William_Stanley_Jevons', quote, start, end: start + quote.length }, verdict: 'supported' }))
        .run();
    const good = 'Jevons drowned while bathing near Hastings in 1882, at the age of 46.';
    await note('dr_good', good, ARTICLE.indexOf(good));
    await note('dr_bad', 'Jevons lived to ninety.', 0);
    const c = await runChecks(env, 'it_jevons', { links: false });
    expect(c.citations!.rows.map((r) => r.status).sort()).toEqual(['fail', 'pass']);
  });
});
