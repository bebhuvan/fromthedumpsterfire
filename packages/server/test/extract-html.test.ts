import { describe, expect, it } from 'vitest';
import { extractArticle, parsePage } from '../src/extract/html';

// Made-up text in the shapes of real pages seen on 2026-10-18 (the reader side-by-side in
// docs/DECISIONS.md): each case is a way the old Readability-only reader went wrong.

const para = (s: string, n = 6) => Array.from({ length: n }, (_, i) => `<p>${s} This is sentence ${i + 1} of a paragraph that runs long enough to read as prose in an article.</p>`).join('');

describe('extractArticle', () => {
  it('reads a page that leaves out <body> (valid HTML; linkedom used to see an empty page)', () => {
    const html = `<!DOCTYPE html><html lang=en><meta charset=utf-8><title>Willing to look slow</title><style>p{margin:0}</style><header><strong>Willing to look slow</strong> | <a href=/support>Support</a><hr></header><main>${para('People often think I am slow.', 8)}</main><footer>Footer</footer>`;
    expect(parsePage(html).body.textContent).toContain('People often think I am slow.');
    const ex = extractArticle(html, 'https://plain.example.org/look-slow/');
    expect(ex.text).toContain('People often think I am slow. This is sentence 1');
    expect(ex.text.split(/\s+/).length).toBeGreaterThan(150);
    expect(ex.meta.lang).toBe('en');
  });

  it('keeps paragraphs whole where footnote markers sit at their ends', () => {
    const body = Array.from({ length: 6 }, (_, i) => `<p>Paragraph ${i + 1} makes a point about doing good work, and it goes on for a while so that it reads as an essay.<a href="#f${i + 1}n"><font color=#dddddd>[<font color=#999999>${i + 1}</font>]</font></a></p>`).join('');
    const html = `<html><head><title>How to work</title></head><body><table><tr><td><font size=2 face="verdana">${body}<br><b>Notes</b><br><br>[1] A note on the first point.</font></td></tr></table></body></html>`;
    const ex = extractArticle(html, 'https://essays.example.org/work.html');
    expect(ex.text).not.toMatch(/^\[\d\]$/m);
    expect(ex.text).toContain('Paragraph 1 makes a point');
  });

  it('leaves out pop-ups, scripts-only boxes and "also read" boxes set inside the article', () => {
    const html = `<html><head><title>Metrics to minds</title><meta name="author" content="A. Writer"></head><body><article>${para('Universities count what can be counted.', 3)}<div class="also-read print-hide"><div class="title"><a href="/other">How can colleges be cheaper?</a></div></div>${para('Selection committees lean on scores.', 3)}</article><div class="popup-background" v-cloak><div class="popup"><div class="title">Looks like you are already logged in from more than 5 devices!</div><button>Log out</button></div></div></body></html>`;
    const ex = extractArticle(html, 'https://news.example.in/opinion/metrics-to-minds/article1.ece');
    expect(ex.text).toContain('Selection committees lean on scores.');
    expect(ex.text).not.toContain('How can colleges be cheaper?');
    expect(ex.text).not.toContain('logged in from more than');
    expect(ex.meta.creator).toBe('A. Writer');
  });

  it('drops share bars and furniture lines, never a sentence that only mentions them', () => {
    const html = `<html><head><title>On sharing</title></head><body><article><h1>On sharing</h1>${para('We share what we can.', 6)}<p>Share</p><p>Subscribe</p><p>No posts</p><p>Share this post</p></article></body></html>`;
    const ex = extractArticle(html, 'https://blog.example.org/on-sharing');
    const paras = ex.text.split('\n\n');
    expect(paras).not.toContain('Share');
    expect(paras).not.toContain('Subscribe');
    expect(paras).not.toContain('No posts');
    expect(ex.text).toContain('We share what we can.');
    expect(ex.text.startsWith('## ')).toBe(false); // the title heading is not repeated
  });

  it('never takes a profile URL as the author', () => {
    const html = `<html><head><title>A long read</title><meta property="article:author" content="https://www.example.com/profile/a-writer"><script type="application/ld+json">{"@type":"NewsArticle","author":{"@type":"Person","name":"A Writer"},"datePublished":"2026-10-17T08:00:25.000Z"}</script></head><body><article>${para('The novelist talks about her childhood.', 6)}</article></body></html>`;
    const ex = extractArticle(html, 'https://www.example.com/books/2026/oct/17/a-long-read');
    expect(ex.meta.creator).toBe('A Writer');
    expect(ex.meta.date).toBe('2026-10-17T08:00:25.000Z');
  });

  it('keeps a footnote list item with its text, without the back-link', () => {
    const notes = Array.from({ length: 3 }, (_, i) => `<li id="fn${i + 1}"><p>Source number ${i + 1}, a book (Boston, 1864), ${90 + i}. <a href="#ref${i + 1}" class="footnote-backref">↩︎</a></p></li>`).join('');
    const html = `<html><head><title>Jumping men</title></head><body><article>${para('Moosehead Lake is lumberjack country.', 6)}<section class="footnotes"><ol>${notes}</ol></section></article></body></html>`;
    const ex = extractArticle(html, 'https://review.example.org/essay/jumping-men');
    expect(ex.text).toContain('Moosehead Lake is lumberjack country.');
    expect(ex.text).toContain('Source number 2, a book (Boston, 1864), 91.');
    expect(ex.text).not.toMatch(/^•$/m);
    expect(ex.text).not.toContain('↩');
  });
});
