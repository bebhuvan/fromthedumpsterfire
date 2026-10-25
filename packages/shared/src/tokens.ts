// Design tokens shared by the app, the website and the Desk. See docs/DESIGN.md.

export type Scheme = 'light' | 'dark';

// Warm swatches lead (the name is a fire); cool ones are relief.
export type Swatch = 'apricot' | 'coral' | 'butter' | 'sky' | 'mint' | 'pistachio' | 'lilac' | 'aqua';
export const SWATCHES: readonly Swatch[] = ['apricot', 'coral', 'butter', 'sky', 'mint', 'pistachio', 'lilac', 'aqua'];

export interface Palette {
  bg: string;
  ink: string;
  ink2: string;
  rule: string;
  plate: string;
  machine: string;
  /** The brand's fire, small and on purpose: the flame, the masthead strike, the editor's "B.", the folio. Never body or machine text, never a fill. */
  ember: string;
  invBg: string;
  invInk: string;
  swatch: Record<Swatch, string>;
  /** Syntax colours for code blocks, by role (CodeRole in haul.ts). Never machine blue, never ember. */
  code: Record<CodeRole, string>;
}

/**
 * Roles a code token can take: keyword, string, comment, number or literal, function or title, type
 * or class, attribute or property, meta (tags, decorators, preprocessor), deletion, insertion.
 */
export type CodeRole = 'k' | 's' | 'c' | 'n' | 'f' | 't' | 'a' | 'm' | 'd' | 'i';
export const CODE_ROLES: readonly CodeRole[] = ['k', 's', 'c', 'n', 'f', 't', 'a', 'm', 'd', 'i'];

export const palettes: Record<Scheme, Palette> = {
  light: {
    bg: '#FFFFFF',
    ink: '#141416',
    ink2: '#55555C',
    rule: '#E6E6EA',
    plate: '#F4F4F6',
    machine: '#4651D2',
    ember: '#FF4F1F',
    invBg: '#141416',
    invInk: '#FFFFFF',
    swatch: {
      apricot: '#FFE0C2',
      coral: '#FFD8D0',
      butter: '#FFF0A6',
      sky: '#DCEBFF',
      mint: '#D2F3E2',
      pistachio: '#E6F2C8',
      lilac: '#ECE4FA',
      aqua: '#D3EFF0',
    },
    code: { k: '#8A2A55', s: '#2F6B3A', c: '#6E6E76', n: '#9A5B00', f: '#141416', t: '#0F5F63', a: '#7A4A12', m: '#6B3FA0', d: '#A3232E', i: '#2F6B3A' },
  },
  dark: {
    bg: '#0F0F12',
    ink: '#F3F3F1',
    ink2: '#A2A2AA',
    rule: '#2A2A31',
    plate: '#1B1B20',
    machine: '#A3ACFF',
    ember: '#FF6A3D',
    invBg: '#F3F3F1',
    invInk: '#0F0F12',
    swatch: {
      apricot: '#4D2E14',
      coral: '#4E2320',
      butter: '#433B12',
      sky: '#15304B',
      mint: '#163D2D',
      pistachio: '#2E3915',
      lilac: '#33284A',
      aqua: '#123B3D',
    },
    code: { k: '#F09CC0', s: '#9ED39A', c: '#8E8E98', n: '#F2BE6E', f: '#F3F3F1', t: '#7FD3D0', a: '#E8B98A', m: '#C9A8F2', d: '#F08A92', i: '#9ED39A' },
  },
};

/** Every content type has one colour, everywhere. */
export const typeSwatch = {
  essay: 'apricot',
  post: 'apricot',
  talk: 'butter',
  video: 'butter',
  podcast: 'butter',
  paper: 'mint',
  poem: 'coral',
  passage: 'coral',
  rhymes: 'sky',
  'rabbit-hole': 'pistachio',
  quote: 'coral',
  letter: 'lilac',
  speech: 'butter',
  social: 'aqua',
  image: 'aqua',
  book: 'lilac',
  tool: 'mint',
} as const satisfies Record<string, Swatch>;

export type ContentType = keyof typeof typeSwatch;

export const typeLabel: Record<ContentType, string> = {
  essay: 'Essay',
  post: 'Blog post',
  talk: 'Talk',
  video: 'Video',
  podcast: 'Podcast',
  paper: 'Paper',
  poem: 'Poem',
  passage: 'Passage',
  rhymes: 'Rhymes',
  'rabbit-hole': 'Rabbit hole',
  quote: 'Quotation',
  letter: 'Letter',
  speech: 'Speech',
  social: 'Post',
  image: 'Picture',
  book: 'Book',
  tool: 'Tool',
};

/**
 * Each Haul's edition colour: a deep ink that marks every page of that Haul (the band on the top edge,
 * its number, its fingerprint's rule), so a reader knows which Haul they are in at a glance. Kept
 * clear of the type swatches (pale), machine blue and ember. Hauls without one take
 * editionOf(number), so neighbouring Hauls always differ.
 */
export type Edition = 'oxblood' | 'teal' | 'ochre' | 'plum' | 'pine' | 'umber' | 'slate' | 'olive';
export const EDITIONS: readonly Edition[] = ['oxblood', 'teal', 'ochre', 'plum', 'pine', 'umber', 'slate', 'olive'];
export const editionInk: Record<Scheme, Record<Edition, string>> = {
  light: { oxblood: '#8C2333', teal: '#0E6461', ochre: '#94650C', plum: '#6A2C61', pine: '#24573F', umber: '#7A4A2A', slate: '#465661', olive: '#5E6214' },
  dark: { oxblood: '#EE8E99', teal: '#6FD0CB', ochre: '#E6B65E', plum: '#D99CD0', pine: '#86C9A6', umber: '#D9A783', slate: '#A9BAC6', olive: '#C7C96E' },
};
export const editionOf = (n: number, chosen?: string): Edition =>
  chosen && (EDITIONS as readonly string[]).includes(chosen) ? (chosen as Edition) : EDITIONS[(Math.max(1, n) - 1) % EDITIONS.length]!;

/**
 * Chart colours (docs/CHARTS.md). Every hex here was run through the dataviz palette validator
 * (OKLCH lightness band, chroma floor, protan/deutan separation, normal-vision floor, contrast) on
 * this theme's ground; the results are in docs/CHARTS.md. A chart's one loud colour is the Haul's
 * edition ink; these carry everything else. None is machine blue or ember: blue sans is the
 * machine's voice and ember is never a fill.
 */
export interface ChartInk {
  /** Six series in a fixed order: teal, crimson, ochre, plum, green, steel. Never cycled. */
  cat: readonly string[];
  /** Magnitude, light to dark (a heat ramp: butter through ochre to oxblood); flipped in dark mode. */
  seq: readonly string[];
  /** Polarity: five cool steps, a neutral middle, five warm steps. */
  div: readonly string[];
  /** Series that recede when one is loud. */
  quiet: string;
  /** Record range and normal range on the temperature band. */
  record: string;
  normal: string;
  /** Record highs and lows marked on the temperature band. */
  hot: string;
  cold: string;
}

export const chartInk: Record<Scheme, ChartInk> = {
  light: {
    cat: ['#008A7A', '#A4313F', '#C38323', '#914A8C', '#518B44', '#227CB1'],
    seq: ['#FFF4C6', '#F9D68B', '#EFB764', '#E19949', '#CE7C3A', '#B66336', '#9A4E37', '#773F39', '#582F31'],
    div: ['#00488A', '#336AA0', '#638CB6', '#92AECB', '#C2D0DF', '#F3F3F3', '#E4C8C5', '#D39E99', '#BF746E', '#A94944', '#90101A'],
    quiet: '#C4C4CB',
    record: '#EFEBE3',
    normal: '#D3CABB',
    hot: '#A4313F',
    cold: '#227CB1',
  },
  dark: {
    cat: ['#00A89F', '#C54F59', '#BA8B25', '#B167AB', '#639E56', '#388EC4'],
    seq: ['#421519', '#681D19', '#853219', '#A04B19', '#B86721', '#CC8534', '#DCA550', '#EAC576', '#F3E5B0'],
    div: ['#5AA3EC', '#5188C0', '#476E97', '#3D556F', '#323D49', '#262626', '#4A3533', '#6E4440', '#95524D', '#BD605A', '#E66E68'],
    quiet: '#4B4B54',
    record: '#211F1C',
    normal: '#3B362F',
    hot: '#E66E68',
    cold: '#5AA3EC',
  },
};
