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
  /**
   * Machine prose read at length (a Life's profile): the machine's blue, deepened so a page of it
   * reads as easily as body text (about 10:1 on the ground, against 6:1 for the margin blue).
   */
  machineText: string;
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
    machineText: '#2B3593',
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
    machineText: '#C3C8FA',
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
  chart: 'sky',
  life: 'lilac',
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
  chart: 'Chart',
  life: 'Lives',
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
 * Chart colours (docs/CHARTS.md). Neutral first: greys and ink carry the context, the Haul's edition
 * ink marks the story, and a second colour comes in only when a comparison needs it. The ramps are
 * generated in OKLCH by scripts/chart-ramps.mjs (even lightness steps) and every one was run through
 * the dataviz palette validator on this theme's ground, 2026-10-26; the results are in
 * docs/CHARTS.md. None is machine blue or ember: blue sans is the machine's voice and ember is
 * never a fill.
 */
export interface ChartInk {
  /** Six series in a fixed order: teal, crimson, ochre, plum, green, steel. Never cycled. */
  cat: readonly string[];
  /**
   * Magnitude, the default ramp: seven steps of one cool hue, low to high (pale to deep in light
   * mode, deep to pale in dark). The lowest step clears 2:1 against the ground, so no value reads as
   * a gap.
   */
  seq: readonly string[];
  /** Magnitude where heat is the meaning (temperatures only; the validator enforces it): orange to deep red. */
  heat: readonly string[];
  /**
   * Polarity: five cool steps, a grey middle, five warm steps, equal in lightness step for step so a
   * departure looks as strong either side. The first tint on each arm clears 2:1 against the ground.
   */
  div: readonly string[];
  /** Series that recede when one is loud, and the greys that tell quiet parts apart (light, mid, dark). */
  quiet: string;
  quiet2: string;
  quiet3: string;
  /** Record range and normal range on the temperature band: quiet greys, so the year reads over them. */
  record: string;
  normal: string;
  /** Record highs and lows marked on the temperature band: the diverging ramp's strong steps. */
  hot: string;
  cold: string;
}

export const chartInk: Record<Scheme, ChartInk> = {
  light: {
    cat: ['#008A7A', '#A4313F', '#C38323', '#914A8C', '#518B44', '#227CB1'],
    seq: ['#8EBED4', '#72A5C0', '#588CAC', '#3F7498', '#265C84', '#0D4571', '#002E59'],
    heat: ['#EAAA6B', '#D78F55', '#C47441', '#AF5A2E', '#9B401E', '#85250F', '#6E0104'],
    div: ['#024077', '#055CA5', '#3D7BBD', '#659AD5', '#8DBAED', '#ECEBE9', '#EB9F96', '#D27B71', '#B7564E', '#9C302A', '#7D0008'],
    quiet: '#C2C4C8',
    quiet2: '#DDDEE1',
    quiet3: '#96989D',
    record: '#ECEDEF',
    normal: '#D1D2D6',
    hot: '#9C302A',
    cold: '#055CA5',
  },
  dark: {
    cat: ['#00A89F', '#C54F59', '#BA8B25', '#B167AB', '#639E56', '#388EC4'],
    seq: ['#305275', '#436A8D', '#5683A5', '#6B9CBD', '#80B6D6', '#96D1EF', '#BCE9FE'],
    heat: ['#972620', '#AD442D', '#C1613E', '#D57C51', '#E89866', '#FBB47E', '#FFD5B0'],
    div: ['#B0D5FE', '#76B6FD', '#5D97D8', '#447AB4', '#2C5D91', '#333331', '#8C4039', '#AF5A52', '#D4756B', '#F99085', '#FEBFB7'],
    quiet: '#4C4D50',
    quiet2: '#343539',
    quiet3: '#707175',
    record: '#222325',
    normal: '#38393C',
    hot: '#F99085',
    cold: '#76B6FD',
  },
};
