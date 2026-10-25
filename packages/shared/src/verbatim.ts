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
function normaliseWithMap(s: string, keepCase = false): { text: string; map: number[] } {
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
    const folded = keepCase ? (FOLD[ch] ?? ch) : (FOLD[ch] ?? ch).toLowerCase();
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
  if (exact >= 0) return balanceQuotes(source, exact, exact + trimmed.length);
  const src = normaliseWithMap(source);
  const q = normaliseWithMap(trimmed).text;
  if (!q) return null;
  const at = src.text.indexOf(q);
  if (at < 0) return null;
  const start = src.map[at]!;
  const lastSrcIndex = src.map[at + q.length - 1]!;
  const end = lastSrcIndex + 1;
  return balanceQuotes(source, start, end);
}

/** Curly quotation marks opened or closed inside s and not matched there. A ’ between letters is an apostrophe. */
function unmatched(s: string, open: string, close: string): { opens: number; closes: number } {
  let opens = 0;
  let closes = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === open) opens++;
    else if (s[i] === close && !(/\p{L}/u.test(s[i - 1] ?? '') && /\p{L}/u.test(s[i + 1] ?? ''))) {
      if (opens) opens--;
      else closes++;
    }
  }
  return { opens, closes };
}

/**
 * Stripping the marks around a pasted quote can also strip the close of a quotation nested at its
 * end ("God said, ‘Let there be light.’"). Take back from the source the marks the span needs to balance.
 */
function balanceQuotes(source: string, start: number, end: number): Span & { text: string } {
  for (const [open, close] of [['‘', '’'], ['“', '”']] as const) {
    const u = unmatched(source.slice(start, end), open, close);
    for (let n = u.opens; n > 0 && source[end] === close; n--) end++;
    for (let n = u.closes; n > 0 && source[start - 1] === open; n--) start--;
  }
  return { start, end, text: source.slice(start, end) };
}

/**
 * Find a piece of code in the source. Extraction mangles indentation and line breaks, so runs of
 * whitespace count as one space (and typographic quotes and dashes fold to ASCII, as a blog engine
 * may have curled them); everything else, case included, must match. Nothing is stripped from the
 * ends: code may begin or end with a quotation mark. Returns the source span, or null.
 */
export function findCode(source: string, code: string): (Span & { text: string }) | null {
  const trimmed = code.trim();
  if (trimmed.length < 2) return null;
  const exact = source.indexOf(trimmed);
  if (exact >= 0) return { start: exact, end: exact + trimmed.length, text: trimmed };
  const src = normaliseWithMap(source, true);
  const q = normaliseWithMap(trimmed, true).text;
  if (!q) return null;
  const at = src.text.indexOf(q);
  if (at < 0) return null;
  const start = src.map[at]!;
  const end = src.map[at + q.length - 1]! + 1;
  return { start, end, text: source.slice(start, end) };
}

/** The highlight must be a substring of the excerpt; returns its span inside the excerpt. */
export function locateHighlight(excerpt: string, highlight: string): Span | null {
  const i = excerpt.indexOf(highlight);
  return i < 0 || !highlight ? null : { start: i, end: i + highlight.length };
}
