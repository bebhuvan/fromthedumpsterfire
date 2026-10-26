// The chart editor's draft and how it becomes a stored chart: pure functions, no DOM, so they are
// tested on their own (lib/chartDraft.test.ts) against the comps fixtures.

import {
  FORMS,
  formsFor,
  type Annotation,
  type Basis,
  type Chart,
  type ChartColour,
  type ChartData,
  type ChartEncode,
  type ChartForm,
  type ChartMeasure,
  type ChartOptions,
  type ChartRole,
  type ChartSource,
} from '@fdf/shared/charts';
import type { FetchedChartData } from '../api';

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** What the editor is building. Strings stay strings until the chart is assembled. */
export interface Draft {
  form: ChartForm;
  title: string;
  note: string;
  units: string;
  geography: string;
  noPlace: boolean;
  /** When the data is for, typed by the editor (a chart without a time axis); a time axis computes it. */
  span: { from: string; to: string };
  sourceSpan: { from: string; to: string };
  sources: ChartSource[];
  basis: Basis;
  denominator: string;
  base: string;
  money: boolean;
  currency: string;
  prices: 'nominal' | 'real';
  baseYear: string;
  method: string;
  data: ChartData;
  encode: ChartEncode;
  colour: ChartColour | '';
  focus: string[];
  midValue: string;
  midLabel: string;
  sort: 'value' | 'given';
  per: string;
  rank: 'desc' | 'asc';
  /** histogram: what each bar counts. */
  of: string;
  /** heatmap: print each value in its cell. */
  values: boolean;
  logY: boolean;
  logX: boolean;
  zero: boolean;
  annotations: Annotation[];
}

export const emptySource = (): ChartSource => ({ maker: '', dataset: '', url: '', licence: '', retrieved: today() });

/** Give every required role a column of an allowed type, keeping the editor's choices that still fit. */
export function autoEncode(form: ChartForm, data: ChartData, prev: ChartEncode = {}): ChartEncode {
  const spec = FORMS[form];
  const out: ChartEncode = {};
  const used = new Set<string>();
  const fits = (role: ChartRole, key?: string) => {
    const c = data.columns.find((k) => k.key === key);
    return Boolean(c && (spec.types[role] ?? []).includes(c.type));
  };
  for (const role of [...spec.required, ...spec.optional]) {
    if (prev[role] && fits(role, prev[role])) {
      out[role] = prev[role];
      used.add(prev[role]!);
    }
  }
  // Bars take categories or years, not both: prefer what the editor had.
  const barSide: ChartRole | null = form === 'bar' ? (out.x ? 'x' : out.label ? 'label' : data.columns.some((c) => c.type === 'text') ? 'label' : 'x') : null;
  const want = [...spec.required, ...(barSide ? [barSide] : []), ...(['series', 'facet'] as ChartRole[]).filter((r) => spec.optional.includes(r))];
  for (const role of want) {
    if (out[role]) continue;
    const c = data.columns.find((k) => !used.has(k.key) && (spec.types[role] ?? []).includes(k.type));
    if (!c) continue;
    // An optional series only when the column actually has more than one value.
    if (!spec.required.includes(role) && role !== barSide) {
      const i = data.columns.indexOf(c);
      if (new Set(data.rows.map((r) => r[i])).size < 2) continue;
    }
    out[role] = c.key;
    used.add(c.key);
  }
  if (form === 'bar') delete out[barSide === 'x' ? 'label' : 'x'];
  return out;
}

export function draftFrom(data: ChartData, f?: Partial<FetchedChartData>): Draft {
  const forms = formsFor({ data });
  const form: ChartForm = forms.includes('line') ? 'line' : (forms[0] ?? 'bar');
  const m = f?.measure ?? {};
  return {
    form,
    title: '',
    note: '',
    units: f?.units ?? '',
    geography: '',
    noPlace: false,
    span: { from: '', to: '' },
    sourceSpan: f?.sourceSpan ?? { from: '', to: '' },
    sources: f?.sources?.length ? f.sources : [emptySource()],
    basis: m.basis ?? 'absolute',
    denominator: m.denominator ?? '',
    base: m.base ?? '',
    money: Boolean(m.money),
    currency: m.money?.currency ?? '',
    prices: m.money?.prices ?? 'nominal',
    baseYear: m.money?.baseYear ? String(m.money.baseYear) : '',
    method: '',
    data,
    encode: autoEncode(form, data),
    colour: '',
    focus: [],
    midValue: '',
    midLabel: '',
    sort: 'value',
    per: '',
    rank: 'desc',
    of: '',
    values: false,
    logY: false,
    logX: false,
    zero: false,
    annotations: [],
  };
}

export function draftOf(chart: Chart): Draft {
  const m = chart.measure;
  return {
    form: chart.form,
    title: chart.title,
    note: chart.note ?? '',
    units: chart.units,
    geography: chart.geography ?? '',
    noPlace: chart.geography === null,
    span: chart.span ?? { from: '', to: '' },
    sourceSpan: chart.sourceSpan ?? { from: '', to: '' },
    sources: chart.sources.length ? chart.sources : [emptySource()],
    basis: m.basis,
    denominator: m.denominator ?? '',
    base: m.base ?? '',
    money: Boolean(m.money),
    currency: m.money?.currency ?? '',
    prices: m.money?.prices ?? 'nominal',
    baseYear: m.money?.baseYear ? String(m.money.baseYear) : '',
    method: chart.method ?? '',
    data: chart.data,
    encode: chart.encode,
    colour: chart.options?.colour ?? '',
    focus: chart.options?.focus ?? [],
    midValue: chart.options?.midpoint ? String(chart.options.midpoint.value) : '',
    midLabel: chart.options?.midpoint?.label ?? '',
    sort: chart.options?.sort ?? 'value',
    per: chart.options?.per ? String(chart.options.per) : '',
    rank: chart.options?.rank ?? 'desc',
    of: chart.options?.of ?? '',
    values: Boolean(chart.options?.values),
    logY: Boolean(chart.scale?.y?.log),
    logX: Boolean(chart.scale?.x?.log),
    zero: Boolean(chart.scale?.y?.zero),
    annotations: chart.annotations ?? [],
  };
}

export const colIndex = (d: Draft, role: ChartRole) => d.data.columns.findIndex((c) => c.key === d.encode[role]);

/** The span the rows actually cover on the x axis, as the validator expects it written. */
export function spanOf(d: Draft): { from: string; to: string } | undefined {
  const i = colIndex(d, 'x');
  const col = d.data.columns[i];
  if (i < 0 || !col || (col.type !== 'year' && col.type !== 'date')) return undefined;
  const xs = d.data.rows.map((r) => r[i]).filter((v): v is string | number => v !== null && v !== undefined);
  if (!xs.length) return undefined;
  const key = (v: string | number) => (typeof v === 'number' ? v : Number(String(v).replace(/-/g, '')));
  const sorted = [...xs].sort((a, b) => key(a) - key(b));
  return { from: String(sorted[0]), to: String(sorted[sorted.length - 1]) };
}

/** Names the focus can pick from: the series, the categories or the panels. */
export function namesOf(d: Draft): string[] {
  for (const role of ['series', 'facet', 'label'] as ChartRole[]) {
    const i = colIndex(d, role);
    if (i >= 0) return [...new Set(d.data.rows.map((r) => r[i]).filter((v) => v !== null).map(String))].slice(0, 80);
  }
  return [];
}

/** The chart as it will be stored: empty fields left out, numbers parsed. */
export function assemble(d: Draft): Chart {
  const spec = FORMS[d.form];
  // A time axis (or columns by year) states the span its rows cover; otherwise the editor may say when
  // the data is for. The source's full span goes with either.
  const computed = spanOf(d);
  const typed = d.span.from.trim() && d.span.to.trim() ? { from: d.span.from.trim(), to: d.span.to.trim() } : undefined;
  const span = spec.time || (computed && d.encode.x) ? computed : typed;
  const sourceSpan = d.sourceSpan.from.trim() || d.sourceSpan.to.trim() || spec.time ? { from: d.sourceSpan.from.trim(), to: d.sourceSpan.to.trim() } : undefined;
  const measure: ChartMeasure = { basis: d.basis };
  if ((d.basis === 'share' || d.basis === 'rate') && d.denominator.trim()) measure.denominator = d.denominator.trim();
  if ((d.basis === 'index' || d.basis === 'anomaly' || d.basis === 'change') && d.base.trim()) measure.base = d.base.trim();
  if (d.money) measure.money = { currency: d.currency.trim(), prices: d.prices, ...(d.prices === 'real' && d.baseYear.trim() ? { baseYear: Number(d.baseYear) } : {}) };
  const colour = d.colour && spec.colours.includes(d.colour) ? d.colour : undefined;
  const effective = colour ?? spec.colours[0];
  const options: ChartOptions = {
    ...(colour ? { colour } : {}),
    ...(d.focus.length ? { focus: d.focus } : {}),
    ...(effective === 'diverging' && (d.midValue.trim() || d.midLabel.trim()) ? { midpoint: { value: Number(d.midValue), label: d.midLabel.trim() } } : {}),
    ...(['bar', 'dot', 'dumbbell', 'slope', 'waffle', 'heatmap', 'table'].includes(d.form) && d.sort !== 'value' ? { sort: d.sort } : {}),
    ...(d.form === 'waffle' && d.per.trim() ? { per: Number(d.per) } : {}),
    ...(d.form === 'bump' && d.rank !== 'desc' ? { rank: d.rank } : {}),
    ...(d.form === 'histogram' && d.of.trim() ? { of: d.of.trim() } : {}),
    ...(d.form === 'heatmap' && d.values ? { values: true } : {}),
  };
  const y = { ...(d.logY ? { log: true } : {}), ...(d.zero && !spec.zero ? { zero: true } : {}) };
  const x = d.logX && d.form === 'scatter' ? { log: true } : {};
  const encode: ChartEncode = {};
  for (const [k, v] of Object.entries(d.encode)) if (v) encode[k as ChartRole] = v;
  return {
    form: d.form,
    title: d.title.trim(),
    ...(d.note.trim() ? { note: d.note.trim() } : {}),
    units: d.units.trim(),
    geography: d.noPlace ? null : d.geography.trim(),
    ...(span ? { span } : {}),
    ...(span && sourceSpan ? { sourceSpan } : {}),
    sources: d.sources.map((s) => ({
      ...s,
      maker: s.maker.trim(),
      dataset: s.dataset.trim(),
      url: s.url.trim(),
      licence: s.licence.trim(),
      ...(s.licenceUrl?.trim() ? { licenceUrl: s.licenceUrl.trim() } : { licenceUrl: undefined }),
    })),
    measure,
    ...(d.method.trim() ? { method: d.method.trim() } : {}),
    data: d.data,
    encode,
    ...(Object.keys(y).length || Object.keys(x).length ? { scale: { ...(Object.keys(y).length ? { y } : {}), ...(Object.keys(x).length ? { x } : {}) } } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...(d.annotations.length ? { annotations: d.annotations.map((a) => annotationValue(a, d)) } : {}),
  };
}

/** A line's value is typed as text; it is a number on the value axis, and a year or date along the bottom. */
export function annotationValue(a: Annotation, d: Draft): Annotation {
  if (a.kind !== 'rule' || typeof a.value !== 'string') return a;
  const raw = a.value.trim();
  if (a.axis === 'y') return { ...a, value: raw === '' ? Number.NaN : Number(raw) };
  const xCol = d.data.columns[colIndex(d, 'x')];
  return { ...a, value: xCol && (xCol.type === 'year' || xCol.type === 'number') && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw };
}

/** JSON drops undefined; so does the server. Strip it here too, so the preview checks what is sent. */
export const clean = (c: Chart): Chart => JSON.parse(JSON.stringify(c)) as Chart;

