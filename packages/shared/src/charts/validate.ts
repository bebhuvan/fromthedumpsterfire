// Statistical honesty as code. The Desk runs validateChart before a chart can be kept, publish runs
// it again, and validateHaul runs it before a bundle renders. Each rule has a name (the `rule` of an
// issue) and a test in validate.test.ts; docs/CHARTS.md lists them all.

import { checkStyle } from '../style';
import type { Annotation, Chart, ChartForm, ChartRole, Cell } from './types';
import { BASES, CHART_COLOURS, CHART_FORMS, CHART_ROLES, FORMS } from './types';
import { checkFigures, figuresIn, citableNumbers } from './figures';
import { chartGlosses, describeChart } from './glosses';

export interface ChartIssue {
  path: string;
  rule: string;
  message: string;
}

export interface ChartReport {
  ok: boolean;
  errors: ChartIssue[];
  warnings: ChartIssue[];
}

/** Limits that keep a bundle small enough to read offline. */
export const CHART_LIMITS = { rows: 20_000, cells: 80_000, columns: 24, annotations: 12, series: 6 };

const TOP_KEYS = new Set(['form', 'title', 'note', 'units', 'geography', 'span', 'sourceSpan', 'sources', 'measure', 'method', 'data', 'encode', 'scale', 'options', 'annotations']);
const OPTION_KEYS = new Set(['colour', 'focus', 'midpoint', 'sort', 'per', 'rank']);
const SCALE_KEYS = new Set(['log', 'zero']);
const DUAL = /^(y2|yRight|rightAxis|secondary(Axis|Y)?|dualAxis|twinAxis|axis2)$/i;
const THREE_D = /^(3d|threeD|depth|perspective|extrude|bevel|isometric)$/i;
const COLOURISH = /^(palette|colou?rs|colou?rScheme|scheme|rainbow|hues?|gradient)$/i;
const PIE = /^(pie|donut|doughnut|ring|sunburst)$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DATE = /^\d{4}-\d{2}(-\d{2})?$/;
const UNCERTAINTY = /(\blower\b|\bupper\b|\blow(er)? bound|\bhigh(er)? bound|confidence|\bci\b|\bci_|_ci\b|std\.? ?err|standard error|margin of error|\bmoe\b|\bse\b|_lo$|_hi$|\blo\b|\bhi\b|uncertainty|interval|percentile|\bp\d{1,2}\b)/i;
const SAMPLE = /(sample size|\bn\b|^n_|_n$|respondents|observations|\bobs\b|count of responses)/i;
const MONEY = /(₹|\$|€|£|¥|\bINR\b|\bUSD\b|\bEUR\b|\bGBP\b|\brupees?\b|\bdollars?\b|\beuros?\b|\bpounds sterling\b|\byen\b|\blakh\b|\bcrores?\b)/i;
const INDEX_BASE = /^\s*(\d{4})(?:[-–]\d{2,4})?\s*=\s*(\d+(?:\.\d+)?)\s*$/;

class Issues {
  errors: ChartIssue[] = [];
  warnings: ChartIssue[] = [];
  readonly base: string;
  constructor(base: string) {
    this.base = base;
  }
  err(path: string, rule: string, message: string) {
    this.errors.push({ path: this.base + path, rule, message });
  }
  warn(path: string, rule: string, message: string) {
    this.warnings.push({ path: this.base + path, rule, message });
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Check a chart. `base` prefixes issue paths (e.g. "items[2].blocks[0].chart"). */
export function validateChart(chart: Chart, base = 'chart'): ChartReport {
  const c = new Issues(base);
  if (!isObj(chart)) {
    c.err('', 'shape', 'a chart is an object');
    return done(c);
  }
  const raw = chart as unknown as Record<string, unknown>;

  // ---- what is not drawn here at all
  for (const k of Object.keys(raw)) {
    if (TOP_KEYS.has(k)) continue;
    if (DUAL.test(k)) c.err(`.${k}`, 'dual-axis', 'Two y-axes are not drawn: their alignment is arbitrary and invents a correlation. Use two charts, small multiples, or index both series to a common base.');
    else if (THREE_D.test(k)) c.err(`.${k}`, '3d', 'No 3D: depth distorts every length and area it touches.');
    else if (COLOURISH.test(k)) c.err(`.${k}`, 'colour', 'Colours come from the house ramps only (options.colour: focus, categorical, sequential or diverging). There is no rainbow.');
    else c.err(`.${k}`, 'unknown-field', `"${k}" is not part of a chart.`);
  }
  if (typeof chart.form === 'string' && PIE.test(chart.form)) c.err('.form', 'pie', 'Pies are not drawn: angles are hard to compare. Use a waffle for parts of a whole, or bars.');
  else if (!CHART_FORMS.includes(chart.form)) return (c.err('.form', 'shape', `one of ${CHART_FORMS.join(', ')}`), done(c));
  const spec = FORMS[chart.form] ?? FORMS.line;

  // ---- the words: title, units, place, time
  if (!nonEmpty(chart.title)) c.err('.title', 'title', 'Every chart has a title.');
  if (chart.note !== undefined && typeof chart.note !== 'string') c.err('.note', 'shape', 'must be a string');
  if (!nonEmpty(chart.units)) c.err('.units', 'units', 'Say what the numbers are measured in ("°C", "₹ crore", "people", "% of GDP").');
  if (!('geography' in raw) || (chart.geography !== null && !nonEmpty(chart.geography))) c.err('.geography', 'geography', 'Say where the data is about ("India", "World", "Delhi"), or set it to null when it is about no place.');

  // ---- sources and licences
  if (!Array.isArray(chart.sources) || chart.sources.length === 0) c.err('.sources', 'source', 'Every chart names its source.');
  else
    chart.sources.forEach((s, i) => {
      const p = `.sources[${i}]`;
      if (!isObj(s)) return c.err(p, 'shape', 'a source is an object');
      if (!nonEmpty(s.maker)) c.err(`${p}.maker`, 'source', 'Name who made the data.');
      if (!nonEmpty(s.dataset)) c.err(`${p}.dataset`, 'source', 'Name the dataset.');
      if (!nonEmpty(s.url) || !/^https:\/\/\S+$/.test(s.url)) c.err(`${p}.url`, 'source', 'Link to the dataset (https).');
      if (!nonEmpty(s.licence) || /^(unknown|none|n\/?a|unstated|not stated|\?)$/i.test(s.licence.trim())) c.err(`${p}.licence`, 'licence', 'State the licence as the institution states it. A source without a stated licence cannot be used.');
      if (s.licenceUrl !== undefined && !/^https:\/\/\S+$/.test(String(s.licenceUrl))) c.err(`${p}.licenceUrl`, 'source', 'https link');
      if (!nonEmpty(s.retrieved) || !ISO_DAY.test(s.retrieved)) c.err(`${p}.retrieved`, 'source', 'The date the data was fetched (YYYY-MM-DD).');
      if (s.via !== undefined) {
        if (!isObj(s.via) || !nonEmpty(s.via.name) || !nonEmpty(s.via.url) || !/^https:\/\//.test(s.via.url)) c.err(`${p}.via`, 'source', 'A redistributor needs its name and an https link.');
        else if (!nonEmpty(s.via.licence)) c.err(`${p}.via.licence`, 'licence', 'State the redistributor’s licence too.');
      }
    });

  // ---- data
  const cols = Array.isArray(chart.data?.columns) ? chart.data.columns : [];
  const rows = Array.isArray(chart.data?.rows) ? chart.data.rows : [];
  if (!isObj(chart.data) || !Array.isArray(chart.data.columns) || !Array.isArray(chart.data.rows)) c.err('.data', 'shape', 'data has columns and rows');
  if (cols.length === 0) c.err('.data.columns', 'data', 'The chart has no columns.');
  if (cols.length > CHART_LIMITS.columns) c.err('.data.columns', 'size', `At most ${CHART_LIMITS.columns} columns.`);
  if (rows.length === 0) c.err('.data.rows', 'data', 'The chart has no rows.');
  if (rows.length > CHART_LIMITS.rows || rows.length * cols.length > CHART_LIMITS.cells) c.err('.data.rows', 'size', `Too much data for a bundle: at most ${CHART_LIMITS.rows} rows and ${CHART_LIMITS.cells} cells. Summarise first (and say how, in the method).`);
  const keys = new Set<string>();
  cols.forEach((col, j) => {
    const p = `.data.columns[${j}]`;
    if (!isObj(col)) return c.err(p, 'shape', 'a column is an object');
    if (!nonEmpty(col.key) || !/^[a-z][a-z0-9_-]{0,40}$/.test(col.key)) c.err(`${p}.key`, 'data', 'Keys are short lowercase names.');
    else if (keys.has(col.key)) c.err(`${p}.key`, 'data', `Two columns are called "${col.key}".`);
    keys.add(col.key);
    if (!nonEmpty(col.label)) c.err(`${p}.label`, 'data', 'Each column says what it is.');
    if (!['number', 'text', 'year', 'date'].includes(col.type)) c.err(`${p}.type`, 'data', 'number, text, year or date');
  });
  let badCells = 0;
  rows.forEach((r, i) => {
    if (!Array.isArray(r) || r.length !== cols.length) {
      if (badCells++ < 5) c.err(`.data.rows[${i}]`, 'data', `Each row has ${cols.length} cells, one per column.`);
      return;
    }
    r.forEach((v, j) => {
      const col = cols[j];
      if (!col || v === null) return;
      const ok =
        col.type === 'number'
          ? typeof v === 'number' && Number.isFinite(v)
          : col.type === 'year'
            ? typeof v === 'number' && Number.isInteger(v) && v > -10000 && v < 3000
            : col.type === 'date'
              ? typeof v === 'string' && DATE.test(v)
              : typeof v === 'string';
      if (!ok && badCells++ < 5) c.err(`.data.rows[${i}][${j}]`, 'data', `"${String(v)}" is not a ${col.type}${col.type === 'number' ? ' (a missing value is null, never text or NaN)' : ''}.`);
    });
  });

  // ---- encoding
  const enc = isObj(chart.encode) ? chart.encode : {};
  if (!isObj(chart.encode)) c.err('.encode', 'shape', 'encode maps roles to columns');
  const colOf = (role: ChartRole) => cols.find((k) => k.key === enc[role]);
  for (const [role, key] of Object.entries(enc)) {
    if (DUAL.test(role)) {
      c.err(`.encode.${role}`, 'dual-axis', 'Two y-axes are not drawn. Use two charts, small multiples, or index both series to a common base.');
      continue;
    }
    if (!(CHART_ROLES as readonly string[]).includes(role)) {
      c.err(`.encode.${role}`, 'encode', `"${role}" is not a role.`);
      continue;
    }
    if (!spec.required.includes(role as ChartRole) && !spec.optional.includes(role as ChartRole)) c.err(`.encode.${role}`, 'encode', `A ${spec.name.toLowerCase()} chart does not use "${role}".`);
    const col = cols.find((k) => k.key === key);
    if (!col) c.err(`.encode.${role}`, 'encode', `No column "${String(key)}".`);
    else {
      const allowed = spec.types[role as ChartRole];
      if (allowed && !allowed.includes(col.type)) c.err(`.encode.${role}`, 'encode', `${role} must be a ${allowed.join(' or ')} column; "${col.label}" is ${col.type}.`);
    }
  }
  for (const role of spec.required) if (!enc[role]) c.err(`.encode.${role}`, 'encode', `A ${spec.name.toLowerCase()} chart needs a "${role}" column.`);
  if (chart.form === 'bar' && !enc.label === !enc.x) c.err('.encode', 'encode', 'Bars need either categories (label) or years (x), not both.');
  if (Boolean(enc.lo) !== Boolean(enc.hi)) c.err('.encode', 'uncertainty', 'An interval needs both its lower (lo) and upper (hi) column.');

  // The data carries uncertainty or sample sizes the chart would not show.
  const used = new Set(Object.values(enc));
  for (const col of cols) {
    if (used.has(col.key) || col.type !== 'number') continue;
    if (UNCERTAINTY.test(col.key) || UNCERTAINTY.test(col.label)) c.err('.encode', 'uncertainty', `The data carries uncertainty ("${col.label}"). Show it (encode lo and hi) or remove the column and say why in the note.`);
    else if (SAMPLE.test(col.key) || SAMPLE.test(col.label)) c.err('.encode', 'sample-size', `The data carries sample sizes ("${col.label}"). Show them (encode n) so small samples are marked, or remove the column.`);
  }

  const idx = (role: ChartRole) => cols.findIndex((k) => k.key === enc[role]);
  const nums = (role: ChartRole): Array<number | null> => {
    const i = idx(role);
    return i < 0 ? [] : rows.map((r) => (Array.isArray(r) && typeof r[i] === 'number' ? (r[i] as number) : null));
  };
  const valueRoles: ChartRole[] = (['y', 'from', 'to', 'lo', 'hi', 'normalLo', 'normalHi', 'recordLo', 'recordHi'] as ChartRole[]).filter((r) => enc[r]);
  const allValues = valueRoles.flatMap((r) => nums(r)).filter((v): v is number => v !== null);

  // Intervals and samples.
  if (enc.lo && enc.hi) {
    const lo = nums('lo');
    const hi = nums('hi');
    const y = nums('y');
    let bad = 0;
    lo.forEach((l, i) => {
      const h = hi[i];
      if (l !== null && h != null && l > h && bad++ < 3) c.err(`.data.rows[${i}]`, 'uncertainty', 'The lower bound is above the upper bound.');
      const v = y[i];
      if (v != null && l !== null && h != null && (v < l - 1e-9 || v > h + 1e-9) && chart.form !== 'band' && bad++ < 3) c.err(`.data.rows[${i}]`, 'uncertainty', 'The value lies outside its own interval.');
    });
  }
  if (enc.n) {
    const n = nums('n');
    if (n.some((v) => v !== null && (!Number.isInteger(v) || v <= 0))) c.err('.encode.n', 'sample-size', 'Sample sizes are whole numbers above zero.');
  }

  // ---- colour
  const opts: NonNullable<Chart['options']> = isObj(chart.options) ? chart.options : {};
  if (chart.options !== undefined && !isObj(chart.options)) c.err('.options', 'shape', 'options is an object');
  for (const k of Object.keys(opts)) {
    if (OPTION_KEYS.has(k)) continue;
    if (DUAL.test(k)) c.err(`.options.${k}`, 'dual-axis', 'Two y-axes are not drawn.');
    else if (THREE_D.test(k)) c.err(`.options.${k}`, '3d', 'No 3D.');
    else if (COLOURISH.test(k)) c.err(`.options.${k}`, 'colour', 'Colours come from the house ramps only (options.colour). There is no rainbow.');
    else c.err(`.options.${k}`, 'unknown-field', `"${k}" is not an option.`);
  }
  const colour = opts.colour ?? spec.colours[0];
  if (opts.colour !== undefined && !CHART_COLOURS.includes(opts.colour)) c.err('.options.colour', 'colour', 'focus, categorical, sequential or diverging (there is no rainbow).');
  else if (colour && !spec.colours.includes(colour)) c.err('.options.colour', 'colour', `A ${spec.name.toLowerCase()} chart is coloured ${spec.colours.join(' or ')}.`);
  if (colour === 'categorical') {
    const role: ChartRole | null = enc.series ? 'series' : enc.label ? 'label' : null;
    const col = role ? colOf(role) : undefined;
    if (col && col.type !== 'text') c.err('.options.colour', 'colour', 'Ordered values (numbers, years, dates) take a sequential or diverging ramp, never separate hues.');
    if (role) {
      const i = idx(role);
      const n = new Set(rows.map((r) => (Array.isArray(r) ? r[i] : null))).size;
      // A waffle folds its smallest parts into a quiet "Other" block, each still listed with its value.
      if (chart.form === 'waffle' ? n > 12 : n > CHART_LIMITS.series) c.err('.options.colour', 'too-many-series', `${n} series is more than six colours can tell apart. Fold the rest into "Other", make one series loud (focus), or use small multiples.`);
    }
  }
  if (colour === 'diverging') {
    const mid = opts.midpoint;
    if (!isObj(mid) || typeof mid.value !== 'number' || !Number.isFinite(mid.value) || !nonEmpty(mid.label)) c.err('.options.midpoint', 'midpoint', 'A diverging scale needs a meaningful midpoint: its value and what it is ("0, the 1961–1990 average").');
    else if (allValues.length && (mid.value < Math.min(...allValues) || mid.value > Math.max(...allValues))) c.warn('.options.midpoint', 'midpoint', 'The midpoint lies outside the data, so one side of the scale is unused; a sequential ramp may be honester.');
  } else if (opts.midpoint !== undefined) c.err('.options.midpoint', 'midpoint', 'A midpoint belongs to a diverging scale only.');
  if (opts.sort !== undefined && opts.sort !== 'value' && opts.sort !== 'given') c.err('.options.sort', 'shape', 'value or given');
  if (opts.rank !== undefined && opts.rank !== 'desc' && opts.rank !== 'asc') c.err('.options.rank', 'shape', 'desc or asc');
  if (opts.per !== undefined && (typeof opts.per !== 'number' || !(opts.per > 0))) c.err('.options.per', 'shape', 'a number above zero');
  if (opts.focus !== undefined) {
    if (!Array.isArray(opts.focus) || !opts.focus.every(nonEmpty)) c.err('.options.focus', 'shape', 'a list of names');
    else {
      const names = new Set<string>();
      for (const role of ['series', 'label', 'facet'] as ChartRole[]) {
        const i = idx(role);
        if (i >= 0) for (const r of rows) if (Array.isArray(r) && r[i] !== null) names.add(String(r[i]));
      }
      for (const f of opts.focus) if (!names.has(f)) c.err('.options.focus', 'focus', `"${f}" is not a series or category in the data.`);
    }
  }

  // ---- scales: zero baselines, logs
  const ys = isObj(chart.scale?.y) ? chart.scale!.y! : {};
  const xs = isObj(chart.scale?.x) ? chart.scale!.x! : {};
  if (chart.scale !== undefined) {
    if (!isObj(chart.scale)) c.err('.scale', 'shape', 'scale is an object');
    else
      for (const k of Object.keys(chart.scale)) {
        if (k === 'x' || k === 'y') continue;
        c.err(`.scale.${k}`, DUAL.test(k) ? 'dual-axis' : 'unknown-field', DUAL.test(k) ? 'Two y-axes are not drawn.' : `"${k}" is not a scale.`);
      }
    for (const [axis, s] of [['y', ys], ['x', xs]] as const) for (const k of Object.keys(s)) if (!SCALE_KEYS.has(k)) c.err(`.scale.${axis}.${k}`, 'unknown-field', `"${k}" is not a scale setting.`);
  }
  if (spec.zero && ys.zero === false) c.err('.scale.y.zero', 'zero-baseline', 'Bars, areas and waffles start at zero: their length is the value.');
  if (spec.zero && ys.log) c.err('.scale.y.log', 'log', 'Bars and areas cannot be drawn on a log scale: their length would lie.');
  if (ys.log) {
    if (!['line', 'multiples', 'scatter', 'dot'].includes(chart.form)) c.err('.scale.y.log', 'log', 'A log scale is for lines, dots and scatters.');
    if (allValues.some((v) => v <= 0)) c.err('.scale.y.log', 'log', 'A log scale needs every value above zero.');
  }
  if (xs.log) {
    if (chart.form !== 'scatter') c.err('.scale.x.log', 'log', 'A log x scale is for scatters only.');
    const xv = nums('x').filter((v): v is number => v !== null);
    if (xv.some((v) => v <= 0)) c.err('.scale.x.log', 'log', 'A log scale needs every value above zero.');
  }
  if (xs.zero !== undefined && chart.form !== 'scatter') c.err('.scale.x.zero', 'unknown-field', 'Only a scatter has a numeric x scale to start at zero.');
  if (spec.zero && allValues.some((v) => v < 0) && chart.form === 'waffle') c.err('.data', 'waffle', 'A waffle shows parts of a whole; parts cannot be negative.');
  if (chart.form === 'area' && nums('y').some((v) => v === null)) c.err('.data', 'missing', 'A stacked area cannot show a missing value honestly (every layer above would shift). Use lines, or fill the gap from the source and say how.');
  if (chart.form === 'area' && nums('y').some((v) => v !== null && v < 0)) c.err('.data', 'area', 'Stacked areas cannot hold negative values.');

  // ---- what the numbers are
  const m = isObj(chart.measure) ? chart.measure : undefined;
  if (!m) c.err('.measure', 'basis', 'Say what the numbers are: absolute, per-capita, share, rate, index, anomaly or change.');
  else {
    if (!BASES.includes(m.basis)) c.err('.measure.basis', 'basis', `one of ${BASES.join(', ')}`);
    if ((m.basis === 'share' || m.basis === 'rate') && !nonEmpty(m.denominator)) c.err('.measure.denominator', 'denominator', m.basis === 'share' ? 'A share says of what ("of GDP", "of all deaths").' : 'A rate shows its denominator ("per 100,000 people", "per 1,000 live births").');
    if ((m.basis === 'index' || m.basis === 'anomaly' || m.basis === 'change') && !nonEmpty(m.base)) c.err('.measure.base', 'base', m.basis === 'index' ? 'An index says its base ("2010 = 100").' : m.basis === 'anomaly' ? 'An anomaly says what it differs from ("the 1961–1990 average").' : 'A change says from what ("the year before").');
    if (m.basis === 'index' && nonEmpty(m.base)) {
      // "2010 = 100": the series must actually read 100 in 2010.
      const b = INDEX_BASE.exec(m.base);
      const xi = idx('x');
      if (b && xi >= 0 && idx('y') >= 0 && !b[0].includes('–') && !/\d-\d/.test(b[0])) {
        const year = Number(b[1]);
        const level = Number(b[2]);
        const yi = idx('y');
        const at = rows.filter((r) => Array.isArray(r) && (r[xi] === year || (typeof r[xi] === 'string' && String(r[xi]).startsWith(`${year}`))));
        if (at.length && at.some((r) => typeof r[yi] === 'number' && Math.abs((r[yi] as number) - level) > Math.max(0.6, level * 0.006)))
          c.err('.measure.base', 'index-base', `The base says ${year} = ${level}, but the series does not read ${level} in ${year}.`);
      }
    }
    const moneyish = MONEY.test(chart.units ?? '') || Boolean(m.money);
    if (moneyish) {
      if (!isObj(m.money) || !nonEmpty(m.money.currency) || (m.money.prices !== 'nominal' && m.money.prices !== 'real')) c.err('.measure.money', 'money', 'Money says its currency and whether prices are nominal or real (inflation-adjusted).');
      else if (m.money.prices === 'real' && !(typeof m.money.baseYear === 'number' && Number.isInteger(m.money.baseYear))) c.err('.measure.money.baseYear', 'money', 'Inflation-adjusted money says its base year ("at 2015 prices").');
      else if (m.money.prices === 'nominal' && chart.span && spec.time) {
        const a = Number(String(chart.span.from).slice(0, 4));
        const b = Number(String(chart.span.to).slice(0, 4));
        if (b - a >= 10) c.warn('.measure.money', 'money', `Nominal money over ${b - a} years mostly shows inflation; real prices would be honester.`);
      }
    }
    for (const k of Object.keys(m)) if (!['basis', 'denominator', 'base', 'money'].includes(k)) c.err(`.measure.${k}`, 'unknown-field', `"${k}" is not part of the measure.`);
  }
  if (chart.method !== undefined && !nonEmpty(chart.method)) c.err('.method', 'shape', 'a sentence or nothing');

  // ---- time: the full span is recorded and the window shown is the rows' own
  const xcol = colOf('x');
  const timeAxis = spec.time && xcol && (xcol.type === 'year' || xcol.type === 'date');
  if (timeAxis) {
    if (!isObj(chart.span) || !nonEmpty(String(chart.span.from ?? '')) || !nonEmpty(String(chart.span.to ?? ''))) c.err('.span', 'span', 'A chart over time states the span it shows.');
    if (!isObj(chart.sourceSpan) || !nonEmpty(String(chart.sourceSpan.from ?? '')) || !nonEmpty(String(chart.sourceSpan.to ?? ''))) c.err('.sourceSpan', 'span', 'Record the full span of the source, so a shorter window is labelled as one.');
    const xi = idx('x');
    const xvals = rows.map((r) => (Array.isArray(r) ? r[xi] : null)).filter((v): v is string | number => v !== null && v !== undefined);
    if (xvals.length && isObj(chart.span)) {
      const key = (v: string | number) => (typeof v === 'number' ? v : Number(String(v).replace(/-/g, '')));
      const sorted = [...xvals].sort((a, b) => key(a) - key(b));
      const first = String(sorted[0]);
      const last = String(sorted[sorted.length - 1]);
      if (String(chart.span.from) !== first || String(chart.span.to) !== last) c.err('.span', 'span', `The span says ${chart.span.from} to ${chart.span.to}, but the rows run from ${first} to ${last}.`);
      if (isObj(chart.sourceSpan) && (key(String(chart.sourceSpan.from)) > key(first) || key(String(chart.sourceSpan.to)) < key(last)))
        c.err('.sourceSpan', 'span', 'The rows reach outside the source’s recorded span.');
    }
  } else if (chart.span !== undefined && !isObj(chart.span)) c.err('.span', 'shape', 'from and to');

  // Duplicate points would be drawn on top of each other.
  if (['line', 'multiples', 'area', 'bump', 'stripes', 'calendar', 'band'].includes(chart.form)) {
    const xi = idx('x');
    const gi = enc.series ? idx('series') : enc.facet ? idx('facet') : -1;
    const seen = new Set<string>();
    let dup = 0;
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      const k = `${gi >= 0 ? r[gi] : ''}\u0000${r[xi]}`;
      if (seen.has(k) && dup++ < 3) c.err('.data.rows', 'duplicate', `Two rows for ${gi >= 0 ? `${r[gi]} in ` : ''}${r[xi]}.`);
      seen.add(k);
    }
  }

  // ---- annotations
  const anns = Array.isArray(chart.annotations) ? chart.annotations : [];
  if (chart.annotations !== undefined && !Array.isArray(chart.annotations)) c.err('.annotations', 'shape', 'a list');
  if (anns.length > CHART_LIMITS.annotations) c.err('.annotations', 'annotation', `At most ${CHART_LIMITS.annotations} annotations; a chart with more is a table.`);
  anns.forEach((a, i) => checkAnnotation(c, chart, a, `.annotations[${i}]`, idx));

  // ---- the lines code writes about this chart (glosses, the description, the method) pass the style
  // check. Their figures are computed from the rows by code, not drafted, so they are not figure-checked.
  if (c.errors.length === 0) {
    for (const g of [...chartGlosses(chart), describeChart(chart)]) {
      for (const s of checkStyle(g).issues) if (s.severity === 'error') c.err('.glosses', `style:${s.rule}`, `${s.message} ("${g}")`);
    }
  }
  return done(c);
}

function checkAnnotation(c: Issues, chart: Chart, a: Annotation, p: string, idx: (r: ChartRole) => number) {
  if (!isObj(a)) return c.err(p, 'shape', 'an annotation is an object');
  if (!['point', 'period', 'rule'].includes(a.kind)) return c.err(`${p}.kind`, 'annotation', 'point, period or rule');
  if (a.by !== 'editor' && a.by !== 'machine') c.err(`${p}.by`, 'annotation', 'Say who wrote it: editor or machine.');
  if (!nonEmpty(a.text)) c.err(`${p}.text`, 'annotation', 'An annotation says something.');
  else if (a.text.length > 160) c.err(`${p}.text`, 'annotation', 'Keep an annotation under 160 characters; the note is for more.');
  if (a.by === 'machine' && nonEmpty(a.text)) {
    for (const s of checkStyle(a.text).issues) {
      if (s.severity === 'error') c.err(`${p}.text`, `style:${s.rule}`, s.message);
      else c.warn(`${p}.text`, `style:${s.rule}`, s.message);
    }
    const f = checkFigures(a.text, chart);
    if (!f.ok) c.err(`${p}.text`, 'figures', `Every figure in a machine annotation must be in the data; not found: ${f.unmatched.join(', ')}.`);
  } else if (a.by === 'editor' && nonEmpty(a.text)) {
    const f = checkFigures(a.text, chart);
    if (!f.ok) c.warn(`${p}.text`, 'figures', `These figures are not in the chart’s data: ${f.unmatched.join(', ')}. Fine if they are yours; check them.`);
  }
  const rows = chart.data?.rows ?? [];
  const xi = idx('x');
  const hasX = (v: Cell) => xi >= 0 && rows.some((r) => Array.isArray(r) && (r[xi] === v || String(r[xi]) === String(v)));
  if (a.kind === 'point') {
    // A callout names its row by x (a year, a date) or by its label (a country on a scatter).
    const targets = [xi, idx('label')].filter((i) => i >= 0);
    const si = idx('series') >= 0 ? idx('series') : idx('facet');
    const hit = rows.some((r) => Array.isArray(r) && targets.some((t) => r[t] === a.x || String(r[t]) === String(a.x)) && (a.series === undefined || (si >= 0 && String(r[si]) === a.series)));
    if (!hit) c.err(`${p}.x`, 'annotation', `A callout points at a row in the data; there is no row for ${String(a.x)}${a.series ? ` in ${a.series}` : ''}.`);
  } else if (a.kind === 'period') {
    if (a.from === null || a.to === null || a.from === undefined || a.to === undefined) c.err(p, 'annotation', 'A period has a start and an end.');
    else if (xi < 0) c.err(p, 'annotation', 'Periods belong on a chart over time.');
  } else if (a.kind === 'rule') {
    if (a.axis !== 'x' && a.axis !== 'y') c.err(`${p}.axis`, 'annotation', 'x or y');
    if (a.axis === 'y' && (typeof a.value !== 'number' || !Number.isFinite(a.value))) c.err(`${p}.value`, 'annotation', 'A rule across the chart sits at a number.');
    if (a.axis === 'x' && !hasX(a.value) && typeof a.value !== 'number') c.err(`${p}.value`, 'annotation', 'A rule down the chart sits at a value on its x axis.');
    if (a.by === 'machine' && typeof a.value === 'number' && !citableNumbers(chart).some((v) => Math.abs(v - (a.value as number)) < 1e-9))
      c.err(`${p}.value`, 'figures', 'A machine rule must sit at a value in the data.');
  }
}

function done(c: Issues): ChartReport {
  return { ok: c.errors.length === 0, errors: c.errors, warnings: c.warnings };
}

/** The forms a column set can feed, for the Desk's form picker. */
export function formsFor(chart: Pick<Chart, 'data'>): ChartForm[] {
  const types = new Set(chart.data.columns.map((c) => c.type));
  return CHART_FORMS.filter((f) => FORMS[f].required.every((r) => (FORMS[f].types[r] ?? []).some((t) => types.has(t))));
}

export { figuresIn };
