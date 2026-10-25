// A chart, as stored on the Desk and published in a Haul bundle (Block kind "chart"). The bundle
// carries the data rows themselves: the website and the app draw only from them, so every number on
// a chart traces to a row a reader can open. See docs/CHARTS.md.

/** The forms the kit draws. Each has its encoding rules in FORMS below. */
export const CHART_FORMS = [
  'line',
  'multiples',
  'area',
  'bar',
  'dot',
  'dumbbell',
  'slope',
  'scatter',
  'bump',
  'stripes',
  'band',
  'calendar',
  'heatmap',
  'ridgeline',
  'beeswarm',
  'waffle',
] as const;
export type ChartForm = (typeof CHART_FORMS)[number];

export type Cell = number | string | null;

/** number: a measurement; text: a name or category; year: a whole year; date: YYYY-MM-DD or YYYY-MM. */
export type ColumnType = 'number' | 'text' | 'year' | 'date';

export interface ChartColumn {
  /** A short key the encoding refers to (lowercase, digits, dashes, underscores). */
  key: string;
  /** What the source calls it. */
  label: string;
  type: ColumnType;
  /** The column's own unit, when it differs from the chart's. */
  unit?: string;
}

export interface ChartData {
  columns: ChartColumn[];
  /** One array per row, in column order. null is a missing value and is drawn as missing. */
  rows: Cell[][];
}

/** Where the numbers come from. Every chart names at least one. */
export interface ChartSource {
  /** Who made the data: "Met Office Hadley Centre", "Reserve Bank of India". */
  maker: string;
  /** The dataset's own name: "HadCRUT5", "Handbook of Statistics on the Indian Economy". */
  dataset: string;
  /** The dataset's page (https). */
  url: string;
  /** The licence as the institution states it: "CC BY 4.0", "Open Government Licence v3". */
  licence: string;
  licenceUrl?: string;
  /** The day the data was fetched (YYYY-MM-DD). */
  retrieved: string;
  /** A publisher that processed or redistributed the data, credited too ("Our World in Data"). */
  via?: { name: string; url: string; licence: string };
}

/**
 * What the numbers are, stated so a reader never has to guess: absolute amounts or per person, a
 * share or a rate of something, an index, a difference from a baseline, a change.
 */
export type Basis = 'absolute' | 'per-capita' | 'share' | 'rate' | 'index' | 'anomaly' | 'change';
export const BASES: readonly Basis[] = ['absolute', 'per-capita', 'share', 'rate', 'index', 'anomaly', 'change'];

export interface ChartMeasure {
  basis: Basis;
  /** For a share or a rate: of what, or per how many ("of GDP", "per 100,000 people"). */
  denominator?: string;
  /** For an index ("2010 = 100"), an anomaly ("the 1961–1990 average") or a change ("the year before"). */
  base?: string;
  /** For money: the currency, and whether prices are nominal or real (with their base year). */
  money?: { currency: string; prices: 'nominal' | 'real'; baseYear?: number };
}

export interface ChartScale {
  /** A log scale (positive values only; always labelled as log on the chart). */
  log?: boolean;
  /** Start at zero. Bars, areas and waffles always do; a line may not, and the chart then says so. */
  zero?: boolean;
}

/** The roles a column can play. Which a form needs is in FORMS. */
export const CHART_ROLES = ['x', 'y', 'series', 'label', 'facet', 'lo', 'hi', 'n', 'size', 'from', 'to', 'normalLo', 'normalHi', 'recordLo', 'recordHi'] as const;
export type ChartRole = (typeof CHART_ROLES)[number];
export type ChartEncode = Partial<Record<ChartRole, string>>;

/**
 * How colour is used. focus: one loud series (the Haul's edition ink), the rest quiet grey.
 * categorical: up to six named series in the fixed order. sequential and diverging: values on a
 * ramp (diverging only around a stated midpoint). There is no rainbow.
 */
export type ChartColour = 'focus' | 'categorical' | 'sequential' | 'diverging';
export const CHART_COLOURS: readonly ChartColour[] = ['focus', 'categorical', 'sequential', 'diverging'];

export interface ChartOptions {
  colour?: ChartColour;
  /** The series, labels or facets to set loud; the rest recede. */
  focus?: string[];
  /** For a diverging ramp: the meaningful middle and what it is ("the 1961–1990 average"). */
  midpoint?: { value: number; label: string };
  /** Order of categories in bar, dot, dumbbell, slope, waffle, heatmap rows: by value (default) or as given. */
  sort?: 'value' | 'given';
  /** waffle: what one square stands for, in the chart's units (default: 1% of the total). */
  per?: number;
  /** bump: rank highest first (default) or lowest first. */
  rank?: 'desc' | 'asc';
}

export type Author = 'editor' | 'machine';

/** Annotations are a layer of the chart: a callout tied to a data point, a named period, a reference line. */
export type Annotation =
  | { kind: 'point'; x: Cell; series?: string; text: string; by: Author }
  | { kind: 'period'; from: Cell; to: Cell; text: string; by: Author }
  | { kind: 'rule'; axis: 'x' | 'y'; value: number | string; text: string; by: Author };

export interface Chart {
  form: ChartForm;
  /** The editor's title, in their words. */
  title: string;
  /** The editor's note, in their words. */
  note?: string;
  /** What the numbers are measured in: "°C", "₹ crore", "people", "% of GDP". */
  units: string;
  /** Where the data is about ("India", "World", "Delhi (Safdarjung)"); null when it is about no place. */
  geography: string | null;
  /** The span of time shown, when the chart has a time axis. Code checks the rows fill it. */
  span?: { from: string; to: string };
  /** The full span of the source. A shorter span shown is labelled on the chart. */
  sourceSpan?: { from: string; to: string };
  sources: ChartSource[];
  measure: ChartMeasure;
  data: ChartData;
  encode: ChartEncode;
  scale?: { y?: ChartScale; x?: ChartScale };
  options?: ChartOptions;
  annotations?: Annotation[];
}

/** What each form needs: the roles it requires, the ones it can take, and the column types allowed. */
export interface FormSpec {
  name: string;
  /** One line on when to use it, for the Desk. */
  use: string;
  required: ChartRole[];
  optional: ChartRole[];
  types: Partial<Record<ChartRole, ColumnType[]>>;
  /** Draws from a zero baseline (bars, areas, units). */
  zero: boolean;
  /** Has a time axis (needs span and sourceSpan). */
  time: boolean;
  colours: ChartColour[];
}

const NUM: ColumnType[] = ['number'];
const TIME: ColumnType[] = ['year', 'date'];
const TIMEISH: ColumnType[] = ['year', 'date', 'number'];
const CAT: ColumnType[] = ['text'];
const CATISH: ColumnType[] = ['text', 'year'];

export const FORMS: Record<ChartForm, FormSpec> = {
  line: {
    name: 'Line',
    use: 'Change over time; up to six lines labelled at their ends, or one loud line among quiet ones.',
    required: ['x', 'y'],
    optional: ['series', 'lo', 'hi'],
    types: { x: TIMEISH, y: NUM, series: CAT, lo: NUM, hi: NUM },
    zero: false,
    time: true,
    colours: ['focus', 'categorical'],
  },
  multiples: {
    name: 'Small multiples',
    use: 'The same line for many places or groups, each in its own small panel on a shared scale.',
    required: ['x', 'y', 'facet'],
    optional: ['lo', 'hi'],
    types: { x: TIMEISH, y: NUM, facet: CAT, lo: NUM, hi: NUM },
    zero: false,
    time: true,
    colours: ['focus'],
  },
  area: {
    name: 'Stacked area',
    use: 'How a whole over time splits into parts; at most six parts.',
    required: ['x', 'y', 'series'],
    optional: [],
    types: { x: TIMEISH, y: NUM, series: CAT },
    zero: true,
    time: true,
    colours: ['categorical'],
  },
  bar: {
    name: 'Bars',
    use: 'Amounts compared across categories (horizontal) or across years (columns).',
    required: ['y'],
    optional: ['label', 'x', 'lo', 'hi', 'n'],
    types: { label: CAT, x: TIME, y: NUM, lo: NUM, hi: NUM, n: NUM },
    zero: true,
    time: false,
    colours: ['focus', 'diverging'],
  },
  dot: {
    name: 'Dot plot',
    use: 'Values across categories when zero is not meaningful, with their uncertainty when the data has it.',
    required: ['label', 'y'],
    optional: ['series', 'lo', 'hi', 'n'],
    types: { label: CAT, y: NUM, series: CAT, lo: NUM, hi: NUM, n: NUM },
    zero: false,
    time: false,
    colours: ['focus', 'categorical'],
  },
  dumbbell: {
    name: 'Dumbbell',
    use: 'Two values for each category (before and after, men and women), joined.',
    required: ['label', 'from', 'to'],
    optional: [],
    types: { label: CAT, from: NUM, to: NUM },
    zero: false,
    time: false,
    colours: ['focus'],
  },
  slope: {
    name: 'Slope',
    use: 'How each category moved between two moments.',
    required: ['label', 'from', 'to'],
    optional: [],
    types: { label: CAT, from: NUM, to: NUM },
    zero: false,
    time: false,
    colours: ['focus'],
  },
  scatter: {
    name: 'Scatter',
    use: 'How two measures go together, with the points that matter named.',
    required: ['x', 'y'],
    optional: ['label', 'series', 'size'],
    types: { x: NUM, y: NUM, label: CAT, series: CAT, size: NUM },
    zero: false,
    time: false,
    colours: ['focus', 'categorical'],
  },
  bump: {
    name: 'Bump',
    use: 'How a ranking changed over time; code ranks the values in each period.',
    required: ['x', 'y', 'series'],
    optional: [],
    types: { x: TIME, y: NUM, series: CAT },
    zero: false,
    time: true,
    colours: ['focus'],
  },
  stripes: {
    name: 'Warming stripes',
    use: 'One value a year as a coloured stripe, around a stated midpoint (Ed Hawkins’s stripes).',
    required: ['x', 'y'],
    optional: [],
    types: { x: ['year'], y: NUM },
    zero: false,
    time: true,
    colours: ['diverging'],
  },
  band: {
    name: 'Temperature band',
    use: 'A year of daily highs and lows against the normal range and the records (after the New York Times weather chart).',
    required: ['x', 'lo', 'hi', 'normalLo', 'normalHi', 'recordLo', 'recordHi'],
    optional: [],
    types: { x: ['date'], lo: NUM, hi: NUM, normalLo: NUM, normalHi: NUM, recordLo: NUM, recordHi: NUM },
    zero: false,
    time: true,
    colours: ['focus'],
  },
  calendar: {
    name: 'Calendar',
    use: 'A value for every day, laid out as weeks.',
    required: ['x', 'y'],
    optional: [],
    types: { x: ['date'], y: NUM },
    zero: false,
    time: true,
    colours: ['sequential', 'diverging'],
  },
  heatmap: {
    name: 'Heatmap',
    use: 'A value for every pair of two categories, such as month by year.',
    required: ['x', 'label', 'y'],
    optional: [],
    types: { x: CATISH, label: CATISH, y: NUM },
    zero: false,
    time: false,
    colours: ['sequential', 'diverging'],
  },
  ridgeline: {
    name: 'Ridgeline',
    use: 'How a distribution shifts across groups; each ridge is drawn from the raw values.',
    required: ['series', 'y'],
    optional: [],
    types: { series: CATISH, y: NUM },
    zero: false,
    time: false,
    colours: ['focus', 'sequential'],
  },
  beeswarm: {
    name: 'Beeswarm',
    use: 'Every value as a dot on one scale, so a reader sees each one and the spread.',
    required: ['y'],
    optional: ['series', 'label'],
    types: { y: NUM, series: CAT, label: CAT },
    zero: false,
    time: false,
    colours: ['focus'],
  },
  waffle: {
    name: 'Waffle',
    use: 'Parts of a whole as a grid of squares; use it instead of a pie.',
    required: ['label', 'y'],
    optional: [],
    types: { label: CAT, y: NUM },
    zero: true,
    time: false,
    colours: ['categorical'],
  },
};
