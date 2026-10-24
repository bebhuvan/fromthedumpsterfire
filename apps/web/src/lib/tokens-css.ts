// CSS custom properties generated from packages/shared/src/tokens.ts, the one source of colour for
// the app, the site and the Desk. Light by default; dark follows the system unless the reader has
// picked a theme with the toggle (stored as data-theme on <html>).

import { EDITIONS, editionInk, palettes, typeSwatch, type Palette, type Scheme } from '@fdf/shared/tokens';

const vars = (p: Palette, scheme: Scheme) =>
  [
    ...Object.entries(p.code).map(([k, v]) => `--code-${k}:${v}`),
    ...EDITIONS.map((e) => `--ed-${e}:${editionInk[scheme][e]}`),
    `--bg:${p.bg}`,
    `--ink:${p.ink}`,
    `--ink2:${p.ink2}`,
    `--rule:${p.rule}`,
    `--plate:${p.plate}`,
    `--machine:${p.machine}`,
    `--ember:${p.ember}`,
    `--inv-bg:${p.invBg}`,
    `--inv-ink:${p.invInk}`,
    ...Object.entries(p.swatch).map(([k, v]) => `--${k}:${v}`),
  ].join(';');

export function tokensCss(): string {
  const types = Object.entries(typeSwatch)
    .map(([type, swatch]) => `--t-${type}:var(--${swatch})`)
    .join(';');
  return [
    `:root{${vars(palettes.light, 'light')};${types};color-scheme:light}`,
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${vars(palettes.dark, 'dark')};color-scheme:dark}}`,
    `:root[data-theme="dark"]{${vars(palettes.dark, 'dark')};color-scheme:dark}`,
    // Each content type's colour as a class, so markup never needs inline styles.
    ...Object.keys(typeSwatch).map((type) => `.t-${type}{--tint:var(--t-${type})}`),
    ...Object.keys(palettes.light.swatch).map((s) => `.s-${s}{--tint:var(--${s})}`),
    // Each Haul's edition ink, set on <body> (and on archive rows) as .e-<edition>.
    ...EDITIONS.map((e) => `.e-${e}{--ed:var(--ed-${e})}`),
  ].join('\n');
}
