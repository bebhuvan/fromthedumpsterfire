// Design tokens shared by the app, the website and the Desk. See docs/DESIGN.md.

export type Scheme = 'light' | 'dark';

export type Swatch = 'lilac' | 'sky' | 'butter' | 'mint' | 'pink' | 'peach';

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
      lilac: '#E9E5FF',
      sky: '#DDEEFF',
      butter: '#FFF2AE',
      mint: '#D4F5E5',
      pink: '#FFE1EA',
      peach: '#FFE4CF',
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
      lilac: '#2C2752',
      sky: '#16324D',
      butter: '#433B12',
      mint: '#173F2F',
      pink: '#4C2333',
      peach: '#4B2F19',
    },
  },
};

/** Every content type has one colour, everywhere. */
export const typeSwatch = {
  essay: 'lilac',
  post: 'lilac',
  talk: 'butter',
  video: 'butter',
  podcast: 'butter',
  paper: 'mint',
  poem: 'pink',
  passage: 'pink',
  rhymes: 'sky',
  'rabbit-hole': 'peach',
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
