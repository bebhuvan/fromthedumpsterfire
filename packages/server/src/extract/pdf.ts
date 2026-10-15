// PDF extraction: unpdf (PDF.js built for workers) page by page, reflowed into paragraphs, with the
// offset where each page starts so excerpts can carry "p. 12" locators. Workers AI toMarkdown is
// the fallback for PDFs unpdf cannot read.

import { extractText, getDocumentProxy } from 'unpdf';
import type { Env } from '../env';

export interface ExtractedPdf {
  text: string;
  pages: number[]; // offset in text where each page begins
  meta: { title?: string; creator?: string; date?: string };
  extractor: 'unpdf' | 'tomarkdown';
}

/** Rejoin hard-wrapped lines into paragraphs and undo end-of-line hyphenation. */
export function reflow(page: string): string {
  const lines = page.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const lengths = lines.filter(Boolean).map((l) => l.length).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.75)] ?? 60;
  const paras: string[] = [];
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) {
      if (cur) paras.push(cur);
      cur = '';
      continue;
    }
    if (!cur) cur = line;
    else if (/[A-Za-z]-$/.test(cur) && /^[a-z]/.test(line)) cur = cur.slice(0, -1) + line;
    else cur += ' ' + line;
    const short = line.length < typical * 0.7;
    const next = lines[i + 1];
    if (short && /[.!?:"”’)]$/.test(line) && (!next || /^[A-Z“"‘(\d•]/.test(next))) {
      paras.push(cur);
      cur = '';
    }
  }
  if (cur) paras.push(cur);
  return paras.join('\n\n');
}

function pdfDate(s?: string): string | undefined {
  const m = s ? /D?:?(\d{4})(\d{2})?(\d{2})?/.exec(s) : null;
  if (!m) return undefined;
  return [m[1], m[2], m[3]].filter(Boolean).join('-');
}

export async function extractPdf(env: Env, bytes: Uint8Array, name = 'source.pdf'): Promise<ExtractedPdf> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const pagesText = (Array.isArray(text) ? text : [text]).map((t) => reflow(t));
    let meta: ExtractedPdf['meta'] = {};
    try {
      const md = await pdf.getMetadata();
      const info = (md.info ?? {}) as Record<string, string>;
      meta = { title: info.Title?.trim() || undefined, creator: info.Author?.trim() || undefined, date: pdfDate(info.CreationDate) };
    } catch {
      /* metadata is optional */
    }
    const pages: number[] = [];
    let out = '';
    for (const p of pagesText) {
      if (out) out += '\n\n';
      pages.push(out.length);
      out += p;
    }
    if (out.replace(/\s/g, '').length > 200) return { text: out, pages, meta, extractor: 'unpdf' };
  } catch {
    /* fall back to toMarkdown */
  }
  const results = await env.AI.toMarkdown([{ name, blob: new Blob([bytes], { type: 'application/pdf' }) }]);
  const first = (Array.isArray(results) ? results[0] : results) as { data?: string; format?: string } | undefined;
  const md = first && first.format !== 'error' ? (first.data ?? '') : '';
  if (!md.trim()) throw new Error('Could not extract text from this PDF (it may be scanned images; upload pages as images for OCR)');
  return { text: md.trim(), pages: [0], meta: {}, extractor: 'tomarkdown' };
}

export function pageAt(pages: number[], offset: number): number {
  let p = 0;
  for (let i = 0; i < pages.length; i++) if (pages[i]! <= offset) p = i;
  return p + 1;
}
