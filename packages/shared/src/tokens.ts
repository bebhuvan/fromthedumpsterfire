// Design tokens shared by the app, the website and the Desk. See docs/DESIGN.md.

export type Scheme = 'light' | 'dark';

// Warm swatches lead (the name is a fire); cool ones are relief.
export type Swatch = 'apricot' | 'coral' | 'butter' | 'sky' | 'mint' | 'pistachio';

export interface Palette {
  bg: string;
  ink: string;
  ink2: string;
  rule: string;
  plate: string;
  machine: string;
  /** Brand only: the icon, splash and the masthead flame. Never body text. */
  ember: string;
  invBg: string;
  invInk: string;
  swatch: Record<Swatch, string>;
}

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
    },
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
    },
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
} as const satisfies Record<string, Swatch>;

export type ContentType = keyof typeof typeSwatch;

export const typeLabel: Record<ContentType, string> = {
  essay: 'Essay',
  post: 'Post',
  talk: 'Talk',
  video: 'Video',
  podcast: 'Podcast',
  paper: 'Paper',
  poem: 'Poem',
  passage: 'Passage',
  rhymes: 'Rhymes',
  'rabbit-hole': 'Rabbit hole',
};
