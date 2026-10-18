// The reader: the extracted source, verbatim. Select text to make an excerpt; select inside the
// chosen excerpt to mark the highlight. Every span carries its absolute offset into the source, so
// a DOM selection maps exactly to characters of the stored text.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Excerpt, Source } from '../api';
import { safeHref } from '../lib/core';

interface Block {
  start: number;
  text: string;
  heading: boolean;
}

function blocks(text: string): Block[] {
  const out: Block[] = [];
  const re = /\n{2,}/g;
  let last = 0;
  for (let m = re.exec(text); ; m = re.exec(text)) {
    const end = m ? m.index : text.length;
    const raw = text.slice(last, end);
    if (raw.trim()) {
      const heading = raw.startsWith('## ');
      out.push({ start: heading ? last + 3 : last, text: heading ? raw.slice(3) : raw, heading });
    }
    if (!m) break;
    last = m.index + m[0].length;
  }
  return out;
}

interface Range {
  start: number;
  end: number;
  cls: string;
}

/** Split [start, start+len) by the marked ranges into spans with absolute offsets. */
function segments(start: number, text: string, ranges: Range[]) {
  const end = start + text.length;
  const cuts = new Set([start, end]);
  for (const r of ranges) {
    if (r.end <= start || r.start >= end) continue;
    cuts.add(Math.max(start, r.start));
    cuts.add(Math.min(end, r.end));
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const segs: Array<{ start: number; text: string; cls: string }> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const cls = ranges.filter((r) => r.start <= a && r.end >= b).map((r) => r.cls).join(' ');
    segs.push({ start: a, text: text.slice(a - start, b - start), cls });
  }
  return segs;
}

/** Absolute source offset for a DOM selection boundary. */
function offsetOf(node: Node, offset: number, root: HTMLElement): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const span = node.parentElement?.closest('[data-o]') as HTMLElement | null;
    if (!span || !root.contains(span)) return null;
    return Number(span.dataset.o) + offset;
  }
  const el = node as HTMLElement;
  const child = el.childNodes[offset] as HTMLElement | undefined;
  if (child) {
    const first = (child.nodeType === Node.ELEMENT_NODE ? (child.matches('[data-o]') ? child : child.querySelector('[data-o]')) : child.parentElement?.closest('[data-o]')) as HTMLElement | null;
    if (first?.dataset.o) return Number(first.dataset.o);
  }
  const spans = el.querySelectorAll<HTMLElement>('[data-o]');
  const lastSpan = spans[spans.length - 1];
  if (lastSpan) return Number(lastSpan.dataset.o) + (lastSpan.textContent?.length ?? 0);
  const prev = el.closest('[data-o]') as HTMLElement | null;
  return prev ? Number(prev.dataset.o) : null;
}

export interface Selection {
  start: number;
  end: number;
  text: string;
}

export function Reader({ source, chosen, candidates, onExcerpt, onHighlight, busy, actionLabel = 'Make excerpt', allowHighlight = true, sticky = true }: { source: Source; chosen: Excerpt | null; candidates: Excerpt[]; onExcerpt: (s: Selection) => void; onHighlight: (s: Selection) => void; busy?: boolean; actionLabel?: string; allowHighlight?: boolean; sticky?: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<(Selection & { x: number; y: number; inside: boolean }) | null>(null);
  const bl = useMemo(() => blocks(source.text), [source.text]);
  const ranges = useMemo(() => {
    const r: Range[] = candidates.filter((c) => !c.chosen).map((c) => ({ start: c.start, end: c.end, cls: 'cand' }));
    if (chosen) {
      r.push({ start: chosen.start, end: chosen.end, cls: 'ex' });
      if (chosen.highlight_start != null && chosen.highlight_end != null) r.push({ start: chosen.start + chosen.highlight_start, end: chosen.start + chosen.highlight_end, cls: 'hl' });
    }
    return r;
  }, [chosen, candidates]);

  const read = useCallback(() => {
    const s = window.getSelection();
    const root = body.current;
    if (!s || s.isCollapsed || !root || !s.rangeCount) return setSel(null);
    const range = s.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return setSel(null);
    const a = offsetOf(range.startContainer, range.startOffset, root);
    const b = offsetOf(range.endContainer, range.endOffset, root);
    if (a == null || b == null || b <= a) return setSel(null);
    const text = source.text.slice(a, b);
    if (!text.trim()) return setSel(null);
    const rect = range.getBoundingClientRect();
    const host = root.parentElement!.getBoundingClientRect();
    const inside = Boolean(chosen && a >= chosen.start && b <= chosen.end);
    setSel({ start: a, end: b, text, inside, x: Math.max(8, rect.left - host.left), y: rect.bottom - host.top + 8 });
  }, [source.text, chosen]);

  useEffect(() => {
    const h = () => setTimeout(read, 0);
    document.addEventListener('selectionchange', h);
    return () => document.removeEventListener('selectionchange', h);
  }, [read]);

  // Scroll the chosen excerpt into view when it changes.
  useEffect(() => {
    if (!chosen || !body.current) return;
    const m = body.current.querySelector('mark.ex');
    // Scroll the reader's own box, never the page (two readers sit side by side on a Rhyme).
    const box = body.current;
    if (m instanceof HTMLElement) box.scrollTo({ top: Math.max(0, m.offsetTop - box.offsetTop - box.clientHeight / 3), behavior: 'smooth' });
  }, [chosen?.id]);

  const meta = source.meta ?? {};
  const words = source.word_count.toLocaleString('en-IN');
  return (
    <section className="reader" aria-label="Source text" style={sticky ? { position: 'sticky' } : { position: 'relative', top: 'auto' }}>
      <div className="reader-head">
        <span className="label ink">The source</span>
        <span className="small muted">
          {words} words · {extractorLabel(source.extractor)}
          {meta.captionsAuto ? ' (auto-generated captions)' : ''}
        </span>
        {meta.note && <span className="small warn">{meta.note}</span>}
        {meta.via && (
          <span className="small muted via">
            {meta.via.label}
            {meta.via.route.startsWith('wayback') && safeHref(meta.via.url) && (
              <>
                {' · '}
                <a href={safeHref(meta.via.url)} target="_blank" rel="noopener noreferrer">
                  open the copy
                </a>
              </>
            )}
          </span>
        )}
      </div>
      <div className="reader-body" ref={body} onMouseUp={read} onKeyUp={read}>
        {bl.map((b) => {
          const Tag = b.heading ? 'h3' : 'p';
          return (
            <Tag key={b.start}>
              {segments(b.start, b.text, ranges).map((s) =>
                s.cls ? (
                  <mark key={s.start} className={s.cls} data-o={s.start}>
                    {s.text}
                  </mark>
                ) : (
                  <span key={s.start} data-o={s.start}>
                    {s.text}
                  </span>
                ),
              )}
            </Tag>
          );
        })}
      </div>
      {sel && (
        <div className="sel-bar" style={{ left: sel.x, top: sel.y }} role="toolbar" aria-label="Selection">
          <button type="button" className="btn small" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => (onExcerpt(sel), setSel(null), window.getSelection()?.removeAllRanges())}>
            {actionLabel}
          </button>
          {sel.inside && allowHighlight && (
            <button type="button" className="btn small" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => (onHighlight(sel), setSel(null), window.getSelection()?.removeAllRanges())}>
              Mark highlight
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function extractorLabel(x: string): string {
  const m: Record<string, string> = {
    readability: 'extracted from the page',
    unpdf: 'extracted from the PDF',
    tomarkdown: 'converted from the PDF',
    'arxiv+unpdf': 'from the arXiv PDF',
    arxiv: 'arXiv abstract',
    crossref: 'abstract via Crossref',
    captions: 'from the captions',
    'captions-auto': 'from the captions',
    whisper: 'machine transcript of the audio',
    ocr: 'transcribed from your photo',
    pasted: 'as you pasted it',
    oembed: 'the post',
    description: 'video description',
    browser: 'rendered in a browser, then extracted',
    transcript: 'your transcript',
    'substack-api': 'from Substack',
    'substack-feed': "from the newsletter's feed",
    'wordpress-api': 'from the WordPress site',
    'medium-feed': "from Medium's feed",
    wayback: 'from the Wayback Machine',
  };
  return m[x] ?? x;
}
