// Pure pieces of the pipeline: draft auditing, title normalisation, Wikipedia relevance, caption
// paragraphs, PDF reflow, HTML flattening, JSON extraction from model answers, FCM JWT signing.

import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { auditDraft, normaliseTitle } from '../src/steps';
import { relevant, firstSentence } from '../src/wiki';
import { captionsToText, youtubeId } from '../src/extract/youtube';
import { reflow, pageAt } from '../src/extract/pdf';
import { extractArticle } from '../src/extract/html';
import { extractJson } from '../src/models/router';
import { signAssertion } from '../src/fcm';
import { arxivId } from '../src/extract/sources';

const SOURCE = 'Hamming gave this talk on 7 March 1986. If you do not work on an important problem, it is unlikely you will do important work.';

describe('auditDraft', () => {
  it('passes a clean, verbatim, properly cited draft', () => {
    const f = auditDraft(
      {
        titles: [{ text: 'Problems worth a life' }],
        excerpts: [{ quote: 'If you do not work on an important problem, it is unlikely you will do important work.' }],
        marginalia: [
          { text: 'Hamming gave the talk on 7 March 1986.', cite: { kind: 'source', quote: 'Hamming gave this talk on 7 March 1986.' } },
          { text: 'He worked at Bell Labs for thirty years.', cite: { kind: 'wiki', title: 'Richard Hamming' } },
        ],
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
        excerpts: [{ quote: 'Work on important problems or you will not do important work.' }],
        marginalia: [
          { text: 'He delves into research.', cite: { kind: 'source', quote: 'Hamming said research is hard.' } },
          { text: 'Shannon shared his office.', cite: { kind: 'wiki', title: 'Claude Shannon' } },
        ],
      },
      SOURCE,
      [{ title: 'Richard Hamming' }],
    );
    expect(f.map((x) => x.what)).toEqual(['title 1', 'excerpt 1', 'note 1', 'note 1', 'note 2']);
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
