// Every figure in machine-written chart text must be in the data. Fail-closed: a number that cannot
// be found among the rows (rounded no finer than it is written), the span, or the editor's own stated
// metadata (units, base, denominator) is reported, and the text cannot ship.

import type { Chart } from './types';

export interface Figure {
  /** As written, e.g. "1.5 million", "–0.3", "45%". */
  text: string;
  value: number;
  decimals: number;
}

const SCALE_WORDS: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  lakh: 1e5,
  lakhs: 1e5,
  million: 1e6,
  m: 1e6,
  mn: 1e6,
  crore: 1e7,
  crores: 1e7,
  cr: 1e7,
  billion: 1e9,
  bn: 1e9,
  trillion: 1e12,
  tn: 1e12,
};

/**
 * The numbers in a piece of text. A dash straight after a digit is a range ("1997–98"), not a minus;
 * the second half of a two-digit year range is read as its full year (98 after 1997 is 1998).
 */
export function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  const re = /(^|[^\d.,])([-–−]?)(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?(\s*(?:thousand|lakhs?|million|mn|crores?|cr|billion|bn|trillion|tn|k|m)\b)?/gi;
  let m: RegExpExecArray | null;
  let prev: Figure | null = null;
  while ((m = re.exec(text))) {
    const lead = m[1] ?? '';
    const digitsAt = m.index + m[0].indexOf(m[3]!, lead.length);
    const before = text[digitsAt - 1] ?? '';
    const dash = /[-–−]/.test(before);
    // A dash between two numbers is a range; a dash before a number with no number before it is a minus.
    const isRange = dash && /\d/.test(text[digitsAt - 2] ?? '');
    const neg = dash && !isRange;
    const intPart = m[3]!.replace(/,/g, '');
    const frac = m[4] ?? '';
    let value = Number(intPart + frac) * (neg ? -1 : 1);
    const decimals = frac ? frac.length - 1 : 0;
    const word = (m[5] ?? '').trim().toLowerCase();
    if (word) value *= SCALE_WORDS[word] ?? 1;
    // "1997–98": the 98 is 1998.
    if (isRange && prev && !word && intPart.length === 2 && Number.isInteger(prev.value) && prev.value >= 1000) {
      value = Math.floor(prev.value / 100) * 100 + Number(intPart);
      if (value < prev.value) value += 100;
    }
    const f: Figure = { text: m[0].slice(lead.length).trim(), value, decimals: word ? decimals - Math.round(Math.log10(SCALE_WORDS[word] ?? 1)) : decimals };
    out.push(f);
    prev = f;
  }
  return out;
}

/** The numbers a chart may cite: every number cell, every year, every date's year, and numbers in its stated metadata. */
export function citableNumbers(chart: Chart): number[] {
  const nums = new Set<number>();
  const add = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) nums.add(v);
  };
  for (const row of chart.data?.rows ?? []) {
    for (const cell of row) {
      if (typeof cell === 'number') add(cell);
      else if (typeof cell === 'string') {
        const d = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(cell);
        if (d) for (const part of d.slice(1)) if (part) add(Number(part));
      }
    }
  }
  const meta = [...(chart.data?.columns ?? []).map((c) => c.label), chart.units, chart.measure?.base, chart.measure?.denominator, chart.span?.from, chart.span?.to, chart.sourceSpan?.from, chart.sourceSpan?.to, chart.options?.midpoint?.label, chart.geography];
  for (const t of meta) if (typeof t === 'string') for (const f of figuresIn(t)) add(f.value);
  if (chart.measure?.money?.baseYear) add(chart.measure.money.baseYear);
  if (chart.options?.midpoint) add(chart.options.midpoint.value);
  return [...nums];
}

/** True when a written figure is some citable number rounded to the decimals it is written with. */
function matches(f: Figure, nums: number[]): boolean {
  const tol = 0.5 * 10 ** -f.decimals + 1e-9;
  return nums.some((v) => Math.abs(v - f.value) <= tol || Math.abs(Math.abs(v) - Math.abs(f.value)) <= tol);
}

/** Check a machine-written line: every figure in it must trace to the chart. Returns the ones that do not. */
export function checkFigures(text: string, chart: Chart): { ok: boolean; unmatched: string[] } {
  const nums = citableNumbers(chart);
  const unmatched = figuresIn(text)
    .filter((f) => !matches(f, nums))
    .map((f) => f.text);
  return { ok: unmatched.length === 0, unmatched };
}
