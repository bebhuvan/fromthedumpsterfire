// PDF extraction: unpdf (PDF.js built for workers) page by page, reflowed into paragraphs, with the
// offset where each page starts so excerpts can carry "p. 12" locators. Workers AI toMarkdown is
// the fallback for PDFs unpdf cannot read. A scanned PDF with no text layer is transcribed page by
// page by a model that reads PDFs natively (the `ocr` task), when one is available.

import { getDocumentProxy } from 'unpdf';
import type { Env } from '../env';
import { generateJson } from '../models/router';
import { MAX_INLINE_PDF_BYTES } from '../models/types';
import { OCR_PDF_SYSTEM, ocrPagesSchema } from '../prompts';
import { toBase64 } from '../util';

export interface ExtractedPdf {
  text: string;
  pages: number[]; // offset in text where each page begins
  meta: { title?: string; creator?: string; date?: string };
  extractor: 'unpdf' | 'tomarkdown' | 'ocr';
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

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
}

/** A page's text with its line breaks, and a blank line where the vertical gap says a paragraph ends. */
async function pageText(pdf: Awaited<ReturnType<typeof getDocumentProxy>>, n: number): Promise<string> {
  const page = await pdf.getPage(n);
  const content = await page.getTextContent();
  let out = '';
  let lastY: number | null = null;
  let lastH = 10;
  for (const raw of content.items as unknown as TextItemLike[]) {
    if (typeof raw.str !== 'string') continue;
    const y = raw.transform?.[5] ?? null;
    const h = raw.height || Math.abs(raw.transform?.[3] ?? 0) || lastH;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > h * 0.5 && !out.endsWith('\n')) {
      out += Math.abs(y - lastY) > Math.max(h, lastH) * 1.8 ? '\n\n' : '\n';
    } else if (lastY !== null && y !== null && Math.abs(y - lastY) > Math.max(h, lastH) * 1.8 && out.endsWith('\n') && !out.endsWith('\n\n')) {
      out += '\n';
    }
    out += raw.str;
    if (raw.hasEOL) out += '\n';
    if (y !== null) lastY = y;
    lastH = h;
  }
  return out;
}

function pdfDate(s?: string): string | undefined {
  const m = s ? /D?:?(\d{4})(\d{2})?(\d{2})?/.exec(s) : null;
  if (!m) return undefined;
  return [m[1], m[2], m[3]].filter(Boolean).join('-');
}

/** Most pages of a scanned PDF a model will transcribe; a longer scan fails with a clear message. */
export const MAX_OCR_PAGES = 60;
/** Pages per call: keeps each answer well inside every PDF model's output limit. */
const OCR_PAGES_PER_CALL = 10;
const OCR_TOKENS_PER_PAGE = 1200;

/** Join page texts with a blank line and record where each page starts. */
function joinPages(pagesText: string[]): { text: string; pages: number[] } {
  const pages: number[] = [];
  let out = '';
  for (const p of pagesText) {
    if (out) out += '\n\n';
    pages.push(out.length);
    out += p;
  }
  return { text: out, pages };
}

/**
 * Transcribe a scanned PDF with a model that reads PDFs, a few pages per call. The same file is
 * sent each time, so the providers' prompt caches make the later calls cheap. Returns null when
 * the scan is too long or no PDF-reading model is available.
 */
export async function ocrPdf(env: Env, bytes: Uint8Array, numPages: number, itemId?: string | null): Promise<ExtractedPdf | null> {
  if (!numPages || numPages > MAX_OCR_PAGES || bytes.length > MAX_INLINE_PDF_BYTES) return null;
  const doc = { mime: 'application/pdf' as const, base64: toBase64(bytes), pages: numPages };
  const pagesText: string[] = [];
  let title = '';
  let creator = '';
  for (let from = 1; from <= numPages; from += OCR_PAGES_PER_CALL) {
    const to = Math.min(numPages, from + OCR_PAGES_PER_CALL - 1);
    const { data } = await generateJson(env, {
      task: 'ocr',
      system: OCR_PDF_SYSTEM,
      prompt: `Transcribe pages ${from} to ${to} of this ${numPages}-page PDF. Number pages by their position in the file (the first page is 1), not by any printed page number.`,
      schema: ocrPagesSchema,
      documents: [doc],
      requireDocuments: true,
      maxTokens: (to - from + 1) * OCR_TOKENS_PER_PAGE,
      itemId,
    });
    for (let n = from; n <= to; n++) pagesText.push(reflow(data.pages.find((p) => p.page === n)?.text ?? ''));
    title ||= data.title;
    creator ||= data.creator;
  }
  const { text, pages } = joinPages(pagesText);
  if (text.replace(/\s/g, '').length < 50) return null;
  return { text, pages, meta: { title: title || undefined, creator: creator || undefined }, extractor: 'ocr' };
}

export async function extractPdf(env: Env, bytes: Uint8Array, name = 'source.pdf', itemId?: string | null): Promise<ExtractedPdf> {
  let numPages = 0;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    numPages = pdf.numPages;
    const pagesText: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) pagesText.push(reflow(await pageText(pdf, n)));
    let meta: ExtractedPdf['meta'] = {};
    try {
      const md = await pdf.getMetadata();
      const info = (md.info ?? {}) as Record<string, string>;
      meta = { title: info.Title?.trim() || undefined, creator: info.Author?.trim() || undefined, date: pdfDate(info.CreationDate) };
    } catch {
      /* metadata is optional */
    }
    const { text: out, pages } = joinPages(pagesText);
    if (out.replace(/\s/g, '').length > 200) return { text: out, pages, meta, extractor: 'unpdf' };
  } catch {
    /* fall back to toMarkdown */
  }
  const results = await env.AI.toMarkdown([{ name, blob: new Blob([bytes], { type: 'application/pdf' }) }]);
  const first = (Array.isArray(results) ? results[0] : results) as { data?: string; format?: string } | undefined;
  const md = first && first.format !== 'error' ? (first.data ?? '') : '';
  if (md.replace(/\s/g, '').length > 200) return { text: md.trim(), pages: [0], meta: {}, extractor: 'tomarkdown' };
  // No text layer: a scan. Transcribe it with a PDF-reading model if one is available.
  const ocr = await ocrPdf(env, bytes, numPages, itemId);
  if (ocr) return ocr;
  if (md.trim()) return { text: md.trim(), pages: [0], meta: {}, extractor: 'tomarkdown' };
  throw new Error(
    numPages > MAX_OCR_PAGES
      ? `This PDF has no text layer and ${numPages} pages; scans of up to ${MAX_OCR_PAGES} pages are transcribed. Upload a shorter extract or page photos.`
      : 'Could not extract text from this PDF (it may be scanned images, and no model that reads PDFs is set up; upload pages as images for OCR)',
  );
}

export function pageAt(pages: number[], offset: number): number {
  let p = 0;
  for (let i = 0; i < pages.length; i++) if (pages[i]! <= offset) p = i;
  return p + 1;
}
