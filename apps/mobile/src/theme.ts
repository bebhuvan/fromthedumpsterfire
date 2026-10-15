import { useColorScheme } from 'react-native';
import { palettes, typeSwatch, type ContentType, type Palette } from '@fdf/shared/tokens';

export function usePalette(): Palette {
  return palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
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
