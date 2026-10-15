// Verbatim matching of quotations against fetched source text. "No match, no ship."
//
// An excerpt is stored as offsets into the source plus its text, and is valid only if
// source.slice(start, end) === text. Model-proposed quotes are located with a tolerant search
// (whitespace, curly quotes and dashes normalised) and then re-anchored to the exact source span,
// so what ships is always the source's own characters.

export interface Span {
  start: number;
  end: number;
}

/** Exact check: the stored text is the source at those offsets. */
export function isVerbatimAt(source: string, span: Span, text: string): boolean {
  return span.start >= 0 && span.end <= source.length && span.start < span.end && source.slice(span.start, span.end) === text;
}

const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
  '–': '-',
  '—': '-',
  '‐': '-',
  '‑': '-',
  '…': '...',
  ' ': ' ',
};

/**
 * Normalise for matching and keep a map from each normalised character back to its source index.
 * Runs of whitespace collapse to one space; typographic quotes and dashes fold to ASCII; case folds.
 */
function normaliseWithMap(s: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      if (!lastSpace && out.length > 0) {
        out += ' ';
        map.push(i);
      }
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    const folded = (FOLD[ch] ?? ch).toLowerCase();
    for (const f of folded) {
      out += f;
      map.push(i);
    }
  }
  if (out.endsWith(' ')) {
    out = out.slice(0, -1);
    map.pop();
  }
  return { text: out, map };
}

/**
 * Find a quotation in the source. Returns the exact source span and the source's own text for it,
 * or null if the quote is not there. Quotation marks or ellipses wrapping the quote are ignored.
 */
export function findVerbatim(source: string, quote: string): (Span & { text: string }) | null {
  const trimmed = quote.trim().replace(/^["“'‘]+|["”'’]+$/g, '').trim();
  if (trimmed.length < 2) return null;
  const exact = source.indexOf(trimmed);
  if (exact >= 0) return { start: exact, end: exact + trimmed.length, text: trimmed };
  const src = normaliseWithMap(source);
  const q = normaliseWithMap(trimmed).text;
  if (!q) return null;
  const at = src.text.indexOf(q);
  if (at < 0) return null;
  const start = src.map[at]!;
  const lastSrcIndex = src.map[at + q.length - 1]!;
  const end = lastSrcIndex + 1;
  return { start, end, text: source.slice(start, end) };
}

/** The highlight must be a substring of the excerpt; returns its span inside the excerpt. */
export function locateHighlight(excerpt: string, highlight: string): Span | null {
  const i = excerpt.indexOf(highlight);
  return i < 0 || !highlight ? null : { start: i, end: i + highlight.length };
}
