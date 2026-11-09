// Pure pieces of the pipeline: draft auditing, title normalisation, Wikipedia relevance, caption
// paragraphs, PDF reflow, HTML flattening, JSON extraction from model answers, FCM JWT signing.

import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { auditDraft, normaliseTitle } from '../src/steps';
import { relevant, firstSentence, bestSentence, pickHit, exactOutcome } from '../src/wiki';
import { captionsToText, youtubeId } from '../src/extract/youtube';
import { reflow, pageAt } from '../src/extract/pdf';
import { extractArticle } from '../src/extract/html';
import { extractJson } from '../src/models/router';
import { signAssertion } from '../src/fcm';
import { arxivId } from '../src/extract/sources';
import { isPunctuated } from '@fdf/shared/quoting';
import { parseTranscript } from '../src/extract/transcript';

const SOURCE = 'Hamming gave this talk on 7 March 1986. If you do not work on an important problem, it is unlikely you will do important work.';

describe('auditDraft', () => {
  it('passes a clean, verbatim, properly cited draft', () => {
    const f = auditDraft(
      {
        titles: [{ text: 'Problems worth a life' }],
        excerpts: [{ quote: 'If you do not work on an important problem, it is unlikely you will do important work.', why: '' }],
        marginalia: [
          { text: 'Hamming gave the talk on 7 March 1986.', cite: { kind: 'source', quote: 'Hamming gave this talk on 7 March 1986.' } },
          { text: 'He worked at Bell Labs for thirty years.', cite: { kind: 'wiki', title: 'Richard Hamming' } },
        ],
        ideas: [],
      },
      SOURCE,
      [{ title: 'Richard Hamming' }],
    );
    expect(f).toEqual([]);
  });
  it('flags paraphrased quotes, invented citations and house-style breaks', () => {
    const f = auditDraft(
      {
        titles: [{ text: 'A testament to grit' }],
        excerpts: [{ quote: 'Work on important problems or you will not do important work.', why: '' }],
        marginalia: [
          { text: 'He delves into research.', cite: { kind: 'source', quote: 'Hamming said research is hard.' } },
          { text: 'Shannon shared his office.', cite: { kind: 'wiki', title: 'Claude Shannon' } },
        ],
        ideas: [],
      },
      SOURCE,
      [{ title: 'Richard Hamming' }],
    );
    expect(f.map((x) => x.what)).toEqual(['title 1', 'excerpt 1', 'note 1', 'note 1', 'note 2']);
  });
  it('holds excerpts to the item\'s length and checks every idea against the source', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says a little more about the work.`).join(' ');
    const src = `${SOURCE}\n\n${long}`;
    const f = auditDraft(
      {
        titles: [{ text: 'Problems worth a life' }],
        excerpts: [
          { quote: long, why: '' },
          { quote: 'If you do not work on an important problem, it is unlikely you will do important work.', why: '' },
        ],
        marginalia: [],
        ideas: [
          { idea: 'Hamming argues that unimportant problems lead to unimportant work.', quote: 'If you do not work on an important problem, it is unlikely you will do important work.' },
          { idea: 'Hamming says luck decides everything.', quote: 'Luck favours the prepared mind.' },
          { idea: 'Hamming delves into the vibrant tapestry of research.', quote: 'Hamming gave this talk on 7 March 1986.' },
        ],
      },
      src,
      [],
      { excerptWords: 120, ideas: 3 },
    );
    expect(f.map((x) => x.what)).toEqual(['excerpt 1', 'idea 2', 'idea 3']);
    expect(f[0]!.why).toMatch(/at most 120/);
  });
});

describe('normaliseTitle', () => {
  it('splits a repeated italic phrase off the end', () => {
    expect(normaliseTitle({ text: 'What cheap things cost', italic: 'cost' })).toEqual({ text: 'What cheap things', italic: 'cost' });
    expect(normaliseTitle({ text: 'The Value Is in the Struggle', italic: 'The Value Is in the Struggle' })).toEqual({ text: 'The Value Is in the Struggle' });
    expect(normaliseTitle({ text: 'What cheap things', italic: 'cost' })).toEqual({ text: 'What cheap things', italic: 'cost' });
  });
});

describe('Wikipedia relevance', () => {
  it('rejects search hits that share nothing with the query', () => {
    expect(relevant('Alan G. Chynoweth', 'Dylan Guenther')).toBe(false);
    expect(relevant('Richard Hamming', 'Richard Hamming')).toBe(true);
    expect(relevant('transformer neural network', 'Transformer (deep learning)')).toBe(true);
    expect(relevant('Jevons paradox', 'Jevons paradox')).toBe(true);
  });
  it('takes a full first sentence, not an initial', () => {
    expect(firstSentence('J. R. R. Tolkien was an English writer and philologist. He wrote The Hobbit.')).toBe('J. R. R. Tolkien was an English writer and philologist.');
    // Haul 002's cards were cut at a middle initial: "… Robert Moses and Lyndon B."
    expect(firstSentence('Robert Allan Caro is an American journalist and author known for his biographies of United States public figures Robert Moses and Lyndon B. Johnson. He won two Pulitzers.')).toBe(
      'Robert Allan Caro is an American journalist and author known for his biographies of United States public figures Robert Moses and Lyndon B. Johnson.',
    );
    expect(firstSentence('Martin Luther King Jr. was an American minister and activist. He led the movement.')).toBe('Martin Luther King Jr. was an American minister and activist.');
    expect(bestSentence('Johnson was elected in an open race to succeed retiring Democratic incumbent W. Lee O\'Daniel in 1948. He beat Coke Stevenson by 87 votes in the primary election.', 'Coke Stevenson primary election votes')).toBe(
      'He beat Coke Stevenson by 87 votes in the primary election.',
    );
    expect(bestSentence('Johnson was elected in an open race to succeed retiring Democratic incumbent W. Lee O\'Daniel in 1948. The race was close and bitterly fought.', 'open race incumbent')).toBe(
      'Johnson was elected in an open race to succeed retiring Democratic incumbent W. Lee O\'Daniel in 1948.',
    );
  });
});

describe('captions', () => {
  it('joins caption events into paragraphs and keeps their start times', () => {
    const events = Array.from({ length: 60 }, (_, i) => ({ tStartMs: i * 2000, segs: [{ utf8: i % 10 === 9 ? 'and that is the end of the thought.' : 'words words words words' }] }));
    const { text, times } = captionsToText({ events });
    const paras = text.split('\n\n');
    expect(paras.length).toBeGreaterThan(1);
    expect(paras.length).toBeLessThan(10);
    expect(times[0]).toEqual({ offset: 0, ms: 0 });
    expect(paras.every((p) => !p.includes('\n'))).toBe(true);
  });
  it('reads video ids from every URL shape', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=a1zDuOPkMSw&t=3')).toBe('a1zDuOPkMSw');
    expect(youtubeId('https://youtu.be/a1zDuOPkMSw')).toBe('a1zDuOPkMSw');
    expect(youtubeId('https://www.youtube.com/shorts/a1zDuOPkMSw')).toBe('a1zDuOPkMSw');
  });
});

describe('PDF text', () => {
  it('rejoins wrapped lines and hyphenation into paragraphs', () => {
    const page = 'The summation of human experience is being ex-\npanded at a prodigious rate, and the means we use\nfor threading through the maze is old.\n\nA second paragraph starts here and\ncontinues on this line.';
    expect(reflow(page)).toBe('The summation of human experience is being expanded at a prodigious rate, and the means we use for threading through the maze is old.\n\nA second paragraph starts here and continues on this line.');
  });
  it('maps offsets to page numbers', () => {
    expect(pageAt([0, 100, 250], 0)).toBe(1);
    expect(pageAt([0, 100, 250], 180)).toBe(2);
    expect(pageAt([0, 100, 250], 900)).toBe(3);
  });
  it('reads arXiv ids', () => {
    expect(arxivId('https://arxiv.org/abs/1706.03762v5')).toBe('1706.03762');
    expect(arxivId('https://arxiv.org/pdf/1409.0473.pdf')).toBe('1409.0473');
  });
});

describe('article extraction', () => {
  it('keeps headings, paragraphs and verse line breaks, drops scripts and nav', () => {
    const html = `<html><head><title>Stray Birds</title><meta property="og:site_name" content="Gutenberg"></head><body><nav>Menu</nav><article>
      <h1>Stray Birds</h1><h2>The poems</h2><p>Stray birds of summer come to my window<br>to sing and fly away.</p>
      <p>${'And yellow leaves of autumn, which have no songs, flutter and fall there with a sigh. '.repeat(8)}</p><script>alert(1)</script></article></body></html>`;
    const ex = extractArticle(html, 'https://example.org/stray');
    expect(ex.meta.siteName).toBe('Gutenberg');
    expect(ex.text).toContain('## The poems');
    expect(ex.text).toContain('Stray birds of summer come to my window\nto sing and fly away.');
    expect(ex.text).not.toContain('alert(1)');
    expect(ex.headings[0]!.text).toBe('The poems');
    expect(ex.text.slice(ex.headings[0]!.offset, ex.headings[0]!.offset + 12)).toBe('## The poems');
    void parseHTML;
  });
  it('drops footnote markers so quotes copied without them still match', () => {
    const body = `<p>The very contrary is the truth.<sup class="reference"><a href="#n6">[6]</a></sup> New modes of economy lead to more use.<sup>[citation needed]</sup> In 10<sup>3</sup> cases.</p>`;
    const ex = extractArticle(`<html><body><article>${body.repeat(6)}</article></body></html>`, 'https://en.wikipedia.org/wiki/X');
    expect(ex.text).toContain('The very contrary is the truth. New modes of economy lead to more use. In 103 cases.');
    expect(ex.text).not.toMatch(/\[6\]|citation needed/);
  });
});

describe('model answers', () => {
  it('pulls JSON out of fences, prose and objects', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":2} hope it helps')).toEqual({ a: 2 });
    expect(extractJson({ a: 3 })).toEqual({ a: 3 });
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('FCM OAuth assertion', () => {
  it('signs an RS256 JWT with WebCrypto that verifies with the service account key', async () => {
    const kp = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
    const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
    const jwt = await signAssertion({ project_id: 'fdf', client_email: 'push@fdf.iam.gserviceaccount.com', private_key: pem }, 1_800_000_000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString());
    expect(claims).toMatchObject({ iss: 'push@fdf.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600 });
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, Buffer.from(s!, 'base64url'), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});

describe('Wikipedia card sentence', () => {
  const lead = 'A Pfeilstorch is a white stork that was injured by an arrow while wintering in Africa. About 25 such storks have been documented in Germany. The first and most famous was found in 1822 near the village of Klütz, and it helped prove that birds migrate rather than hibernate.';
  it('takes the lead sentence that matches why the article was chosen, verbatim', () => {
    expect(bestSentence(lead, 'The 1822 stork that proved birds migrate')).toBe('The first and most famous was found in 1822 near the village of Klütz, and it helped prove that birds migrate rather than hibernate.');
    expect(lead).toContain(bestSentence(lead, 'The 1822 stork that proved birds migrate'));
  });
  it('falls back to the first sentence', () => {
    expect(bestSentence(lead, '')).toBe('A Pfeilstorch is a white stork that was injured by an arrow while wintering in Africa.');
    expect(bestSentence(lead, 'something unrelated entirely')).toBe('A Pfeilstorch is a white stork that was injured by an arrow while wintering in Africa.');
  });
});

describe('YouTube captions: punctuated or not', () => {
  // Older auto-captions (a 2023 talk) against the punctuated ones YouTube makes for recent uploads.
  const old = 'hi everyone so recently I gave a 30-minute talk on large language models just kind of like an intro talk um unfortunately that talk was not recorded but a lot of people came to me after the talk and they told me that uh they really liked the talk so I would just I thought I would just re-record it and basically put it up on YouTube so here we go the busy person\'s intro to large language models director Scott okay so let\'s begin first of all what is a large language model really well a large language model is just two files right there be two files in this hypothetical directory so for example working with a specific example of the Llama 2 70b model';
  const recent = "Hi everyone, I'm Lavinia, and welcome to the fourth edition of Weekly Tidbits. We spend a lot of time reading interesting stories that never make it into a full daily brief piece. So, once a week, we pick some of the best ones and add a little context. We sort them into four groups. Global economy, industry, and company. Let's get started. If you prefer reading the newsletter, here's the link. Number one. Saudi Arabia's oil backup route is hit. The pipeline was shut after drone attacks damaged pumping stations.";
  it('uses captions that read as prose and sends the rest to Whisper', () => {
    expect(isPunctuated(old)).toBe(false);
    expect(isPunctuated(recent)).toBe(true);
  });
});

describe('your own transcript', () => {
  it('reads rolling auto-caption WebVTT once, without timing lines or tags, and keeps times', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.500 align:start position:0%
Hi everyone, I'm Lavinia,<00:00:01.000><c> and</c>

00:00:02.500 --> 00:00:02.510
Hi everyone, I'm Lavinia, and

00:00:02.510 --> 00:00:05.000
Hi everyone, I'm Lavinia, and
welcome to the fourth edition.

00:01:10.000 --> 00:01:12.000
Number one. Saudi Arabia's oil route is hit.
`;
    const t = parseTranscript(vtt, 'k.en-orig.vtt');
    expect(t.format).toBe('vtt');
    expect(t.text).toBe("Hi everyone, I'm Lavinia, and welcome to the fourth edition. Number one. Saudi Arabia's oil route is hit.");
    expect(t.times[0]).toEqual({ offset: 0, ms: 0 });
  });
  it('reads SRT with its times, and splits long talk into paragraphs', () => {
    const cues = Array.from({ length: 40 }, (_, i) => `${i + 1}\n00:${String(Math.floor(i / 2)).padStart(2, '0')}:${String((i % 2) * 30).padStart(2, '0')},000 --> 00:00:59,000\nSentence number ${i} of a long talk about the economy and its many parts.`).join('\n\n');
    const t = parseTranscript(cues, 'talk.srt');
    expect(t.format).toBe('srt');
    expect(t.text.split('\n\n').length).toBeGreaterThan(1);
    expect(t.times.length).toBe(t.text.split('\n\n').length);
    expect(t.text.slice(t.times[1]!.offset, t.times[1]!.offset + 15)).toBe('Sentence number');
    expect(t.text).not.toMatch(/-->|^\d+$/m);
  });
  it('takes Markdown as written, without front matter', () => {
    const md = "---\ntitle: 'Weekly Tidbits'\nvideo_id: DEUMys5aSMA\n---\n\nHi everyone, welcome.\nThis is the second line.\n\nNumber one.";
    const t = parseTranscript(md, 'x.md');
    expect(t).toEqual({ text: 'Hi everyone, welcome. This is the second line.\n\nNumber one.', times: [], format: 'text' });
  });
});

describe('Wikipedia search picks the article that names the phrase', () => {
  const hit = (title: string, extract: string) => ({ title, extract, url: `https://en.wikipedia.org/wiki/${title}`, key: title });
  it('prefers a lower-ranked hit whose lead uses the words', () => {
    const white = hit('White stork', 'The white stork is a large bird in the stork family, Ciconiidae.');
    const pfeil = hit('Pfeilstorch', "A Pfeilstorch (German for 'arrow stork') is a white stork that is injured by an arrow.");
    expect(pickHit('Arrow stork', [white, pfeil])?.title).toBe('Pfeilstorch');
    expect(pickHit('Stork family', [white, pfeil])?.title).toBe('White stork');
    expect(pickHit('Something else', [white, pfeil])?.title).toBe('White stork');
    expect(pickHit('x', [])).toBeNull();
  });
});

describe('Wikipedia exact titles', () => {
  const art = (title: string) => ({ title, extract: `${title} is an article.`, url: `https://en.wikipedia.org/wiki/${title}`, key: title });
  it('never guesses past a title Wikipedia lists as ambiguous', () => {
    // "Dilettante" is a disambiguation page; search then offered the record label "Dilettante Music".
    expect(exactOutcome('Dilettante', 'ambiguous')).toBe('ambiguous');
  });
  it('takes an exact article whose title matches, and leaves the rest to search', () => {
    expect(exactOutcome('Linux', art('Linux'))).toEqual(art('Linux'));
    expect(exactOutcome('Either/Or (Kierkegaard book)', art('Either/Or (Kierkegaard book)'))).toEqual(art('Either/Or (Kierkegaard book)'));
    expect(exactOutcome('Arrow stork', art('Unrelated page'))).toBeNull();
    expect(exactOutcome('Linux', null)).toBeNull();
  });
});
