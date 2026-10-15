import { useColorScheme } from 'react-native';
import { palettes, typeSwatch, type ContentType, type Palette, type Scheme } from '@fdf/shared/tokens';
import { useReader, type TextSize } from './lib/store';

export function useScheme(): Scheme {
  const system = useColorScheme();
  const pref = useReader((s) => s.theme);
  if (pref !== 'system') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

export function usePalette(): Palette {
  return palettes[useScheme()];
}

const TEXT_SCALE: Record<TextSize, number> = { small: 0.92, regular: 1, large: 1.1, larger: 1.22 };

/** The reader's chosen size for reading text (on top of the system font scale). */
export function useTextScale() {
  return TEXT_SCALE[useReader((s) => s.textSize)];
}

export const typeColor = (p: Palette, type: ContentType) => p.swatch[typeSwatch[type]];

// Static cuts embedded at build time (see app.json). The family name is the file name on both
// platforms, so never combine these with fontWeight or fontStyle.
export const fonts = {
  text: 'NewsreaderText-Regular',
  textItalic: 'NewsreaderText-Italic',
  display: 'NewsreaderDisplay-Medium',
  displayRegular: 'NewsreaderDisplay-Regular',
  displayItalic: 'NewsreaderDisplay-Italic',
  sans: 'Schibsted-Regular',
  sansMedium: 'Schibsted-Medium',
  sansBold: 'Schibsted-SemiBold',
} as const;

export const GUTTER = 24;
