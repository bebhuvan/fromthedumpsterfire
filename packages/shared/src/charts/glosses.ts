// The words around a chart that code writes from its spec and rows: the units line over it, the
// machine's glosses under it (window, scale, gaps, uncertainty, method), the credit line, and the text
// alternative. Glosses and the description are machine prose: they pass checkStyle, and every figure
// in them comes from the rows (tests check both).

import type { Chart, Cell, ChartColumn } from './types';
import { FORMS } from './types';
import { formatNumber, formatTime, type Grouping } from './scales';
import { isRupees } from './frame';

const col = (chart: Chart, role: keyof Chart['encode']): ChartColumn | undefined => {
  const key = chart.encode?.[role];
  return key ? chart.data.columns.find((c) => c.key === key) : undefined;
};
const idx = (chart: Chart, role: keyof Chart['encode']) => {
  const key = chart.encode?.[role];
  return key ? chart.data.columns.findIndex((c) => c.key === key) : -1;
};
const grouping = (chart: Chart): Grouping => (isRupees(chart) ? 'indian' : 'international');

/** "°C, difference from the 1861–1890 average" — what the numbers are, from the editor's fields. */
export function unitsLine(chart: Chart): string {
  const m = chart.measure;
  const parts: string[] = [chart.units.trim()];
  if (m?.basis === 'per-capita' && !/per (person|capita|head)/i.test(chart.units)) parts.push('per person');
  if ((m?.basis === 'share' || m?.basis === 'rate') && m.denominator && !chart.units.includes(m.denominator)) parts.push(m.denominator);
  if (m?.basis === 'index' && m.base) parts.push(`index, ${m.base}`);
  if (m?.basis === 'anomaly' && m.base) parts.push(`difference from ${m.base}`);
  if (m?.basis === 'change' && m.base) parts.push(`change from ${m.base}`);
  if (m?.money) parts.push(m.money.prices === 'real' ? `at ${m.money.baseYear} prices` : 'nominal, not adjusted for inflation');
  return parts.filter(Boolean).join(', ');
}

/** Numbers from a numeric role, with nulls kept. */
function values(chart: Chart, role: keyof Chart['encode']): Cell[] {
  const i = idx(chart, role);
  return i < 0 ? [] : chart.data.rows.map((r) => r[i] ?? null);
}

function hasMissing(chart: Chart): boolean {
  const spec = FORMS[chart.form];
  if (!spec) return false;
  const numeric = [...spec.required, ...spec.optional].filter((r) => spec.types[r]?.includes('number') && !['lo', 'hi', 'n', 'size'].includes(r));
  if (numeric.some((r) => values(chart, r).some((v) => v === null))) return true;
  // Years that are absent from a yearly series are missing too.
  const x = col(chart, 'x');
  if (x?.type === 'year' && spec.time) {
    const si = idx(chart, 'series') >= 0 ? idx(chart, 'series') : idx(chart, 'facet');
    const by = new Map<string, number[]>();
    const xi = idx(chart, 'x');
    for (const r of chart.data.rows) {
      const k = si >= 0 ? String(r[si]) : '';
      if (typeof r[xi] === 'number') (by.get(k) ?? by.set(k, []).get(k)!).push(r[xi] as number);
    }
    for (const ys of by.values()) {
      ys.sort((a, b) => a - b);
      const steps = ys.slice(1).map((y, i) => y - ys[i]!);
      const usual = steps.length ? [...steps].sort((a, b) => a - b)[Math.floor((steps.length - 1) / 2)]! : 0;
      if (steps.some((s) => s > usual * 1.5)) return true;
    }
  }
  return false;
}

/** The machine's notes under a chart. Each is one plain sentence, built only from the spec and rows. */
export function chartGlosses(chart: Chart): string[] {
  const out: string[] = [];
  const spec = FORMS[chart.form];
  if (chart.span && chart.sourceSpan && (chart.span.from !== chart.sourceSpan.from || chart.span.to !== chart.sourceSpan.to)) {
    out.push(`Shown from ${chart.span.from} to ${chart.span.to}; the source runs from ${chart.sourceSpan.from} to ${chart.sourceSpan.to}.`);
  }
  if (chart.scale?.y?.log || chart.scale?.x?.log) out.push(`${chart.scale?.x?.log && chart.scale?.y?.log ? 'Both scales are' : chart.scale?.x?.log ? 'The horizontal scale is' : 'The vertical scale is'} logarithmic: each step is ten times the one before.`);
  if (spec && !spec.zero && !chart.scale?.y?.log && ['line', 'multiples', 'scatter', 'dot', 'dumbbell', 'slope'].includes(chart.form) && chart.scale?.y?.zero !== true) {
    const vals = [...values(chart, 'y'), ...values(chart, 'from'), ...values(chart, 'to'), ...values(chart, 'lo')].filter((v): v is number => typeof v === 'number');
    if (vals.length && Math.min(...vals) > 0) out.push(['dot', 'dumbbell'].includes(chart.form) ? 'The scale does not start at zero.' : 'The vertical scale does not start at zero.');
  }
  if (hasMissing(chart)) out.push('Gaps are missing values in the source; nothing is filled in.');
  const lo = col(chart, 'lo');
  const hi = col(chart, 'hi');
  if (lo && hi && chart.form !== 'band') out.push(`${['line', 'multiples'].includes(chart.form) ? 'The shaded band' : 'Each whisker'} runs from the ${lo.label.toLowerCase()} to the ${hi.label.toLowerCase()}.`);
  const n = values(chart, 'n').filter((v): v is number => typeof v === 'number');
  if (n.some((v) => v < 30)) out.push('Hollow marks rest on fewer than 30 observations.');
  const focus = chart.options?.focus ?? [];
  if (focus.length && ['line', 'bump'].includes(chart.form)) {
    const si = idx(chart, 'series');
    const all = new Set(chart.data.rows.map((r) => String(r[si] ?? '')));
    const rest = all.size - focus.filter((f) => all.has(f)).length;
    if (rest > 0) out.push(rest === 1 ? 'The grey line is the other series.' : `The grey lines are the other ${rest} series.`);
  }
  if (chart.form === 'waffle') out.push(chart.options?.per ? `Each square stands for ${formatNumber(chart.options.per, 0, grouping(chart))} ${chart.units}, rounded to whole squares.` : 'Each square is one per cent of the total, rounded so the squares add up to a hundred.');
  if (chart.form === 'bump') out.push(`Ranks are worked out from the values in each period; first is the ${chart.options?.rank === 'asc' ? 'lowest' : 'highest'}.`);
  if (chart.form === 'ridgeline') out.push('Each ridge is a smoothed outline of the values in its group (a kernel density; bandwidth by Silverman’s rule).');
  if (chart.method?.trim()) out.push(chart.method.trim());
  return out;
}

/** "Source: Met Office Hadley Centre, HadCRUT5, via Our World in Data." */
export function sourceLine(chart: Chart): string {
  return chart.sources
    .map((s) => `${s.maker}, ${s.dataset}${s.via ? `, via ${s.via.name}` : ''}`)
    .join('; ');
}

/** The licences as each holder states them, once each. */
export function licenceLine(chart: Chart): string {
  const l = new Set<string>();
  for (const s of chart.sources) {
    l.add(s.licence);
    if (s.via) l.add(`${s.via.licence} (${s.via.name})`);
  }
  return [...l].join('; ');
}

/** The latest retrieval date, as "25 October 2026". */
export function retrievedLine(chart: Chart): string {
  const d = chart.sources.map((s) => s.retrieved).sort().pop();
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return m ? `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}` : d;
}

/**
 * A text alternative for the chart, built from its rows: the form, what is measured, where and when,
 * and for each series (up to six) where it starts, where it ends and its highest point.
 */
export function describeChart(chart: Chart): string {
  const spec = FORMS[chart.form];
  const g = grouping(chart);
  const parts: string[] = [];
  const what = col(chart, 'y')?.label ?? [col(chart, 'from')?.label, col(chart, 'to')?.label].filter(Boolean).join(' and ');
  parts.push(`${spec?.name ?? 'Chart'} of ${what || chart.title} (${unitsLine(chart)})${chart.geography ? `, ${chart.geography}` : ''}${chart.span ? `, ${chart.span.from} to ${chart.span.to}` : ''}.`);
  const yi = idx(chart, 'y');
  const xi = idx(chart, 'x');
  const xcol = col(chart, 'x');
  const si = idx(chart, 'series') >= 0 ? idx(chart, 'series') : idx(chart, 'facet') >= 0 ? idx(chart, 'facet') : -1;
  const li = idx(chart, 'label');
  const dec = (v: number) => {
    const s = String(v);
    return Math.min(2, s.includes('.') ? s.split('.')[1]!.length : 0);
  };
  const fmt = (v: number) => formatNumber(v, dec(v), g);
  if (yi >= 0 && xi >= 0 && spec?.time) {
    const groups = new Map<string, Cell[][]>();
    for (const r of chart.data.rows) {
      const k = si >= 0 ? String(r[si]) : '';
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    let shown = 0;
    for (const [k, rows] of groups) {
      if (shown++ >= 6) break;
      const ok = rows.filter((r) => typeof r[yi] === 'number');
      if (!ok.length) continue;
      const first = ok[0]!;
      const last = ok[ok.length - 1]!;
      const max = ok.reduce((a, b) => ((b[yi] as number) > (a[yi] as number) ? b : a));
      const t = (r: Cell[]) => formatTime(r[xi] as string | number, (xcol?.type ?? 'number') as 'year');
      parts.push(`${k ? `${k}: ` : ''}${fmt(first[yi] as number)} in ${t(first)}, ${fmt(last[yi] as number)} in ${t(last)}; highest ${fmt(max[yi] as number)} in ${t(max)}.`);
    }
    if (groups.size > 6) parts.push(`And ${groups.size - 6} more series in the table.`);
  } else if (yi >= 0 && li >= 0) {
    const ok = chart.data.rows.filter((r) => typeof r[yi] === 'number');
    const sorted = [...ok].sort((a, b) => (b[yi] as number) - (a[yi] as number));
    const top = sorted.slice(0, 3).map((r) => `${r[li]} ${fmt(r[yi] as number)}`);
    if (top.length) parts.push(`Highest: ${top.join(', ')}.`);
    if (sorted.length > 3) parts.push(`Lowest: ${sorted[sorted.length - 1]![li]} ${fmt(sorted[sorted.length - 1]![yi] as number)}.`);
  }
  parts.push('The full data is in the table under the chart.');
  return parts.join(' ');
}

/** A cell as the data table prints it. */
export function formatCell(v: Cell, c: ChartColumn, g: Grouping): string {
  if (v === null) return '–';
  if (typeof v === 'number') {
    if (c.type === 'year') return String(v);
    const s = String(v);
    const d = s.includes('e') ? 3 : Math.min(4, s.split('.')[1]?.length ?? 0);
    return formatNumber(v, d, g);
  }
  return c.type === 'date' ? formatTime(v, 'date') : v;
}

export { grouping as chartGrouping };
