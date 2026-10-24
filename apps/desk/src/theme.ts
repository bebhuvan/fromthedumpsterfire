// CSS custom properties generated from the shared tokens, so the Desk can never drift from the app.
// Light by default, dark when the system asks or the editor chooses it.

import { editionInk, palettes, typeSwatch, type ContentType, type Edition, type Palette } from '@fdf/shared/tokens';

function vars(p: Palette, ink: Record<Edition, string>): string {
  const status = p.bg === '#FFFFFF' ? { ok: '#1E7A4C', warn: '#9A5B00', bad: '#B42318' } : { ok: '#6FD3A0', warn: '#F2B866', bad: '#FF8A80' };
  return [
    `--bg:${p.bg}`,
    `--ink:${p.ink}`,
    `--ink2:${p.ink2}`,
    `--rule:${p.rule}`,
    `--plate:${p.plate}`,
    `--machine:${p.machine}`,
    `--ember:${p.ember}`,
    `--inv-bg:${p.invBg}`,
    `--inv-ink:${p.invInk}`,
    `--ok:${status.ok}`,
    `--warn:${status.warn}`,
    `--bad:${status.bad}`,
    ...Object.entries(p.swatch).map(([k, v]) => `--${k}:${v}`),
    // Edition inks (the Haul's colour) and code roles (the highlight preview).
    ...Object.entries(ink).map(([k, v]) => `--ed-${k}:${v}`),
    ...Object.entries(p.code).map(([k, v]) => `--code-${k}:${v}`),
  ].join(';');
}

export function installTheme(): void {
  const css = `
:root{${vars(palettes.light, editionInk.light)};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(palettes.dark, editionInk.dark)};color-scheme:dark}}
:root[data-theme="dark"]{${vars(palettes.dark, editionInk.dark)};color-scheme:dark}
${Object.entries(typeSwatch)
  .map(([type, sw]) => `[data-type="${type}"]{--type:var(--${sw})}`)
  .join('\n')}`;
  const el = document.createElement('style');
  el.id = 'tokens';
  el.textContent = css;
  document.head.prepend(el);
  const saved = safeGet('desk:theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}

export function cycleTheme(): 'light' | 'dark' | 'system' {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
  if (next === 'system') {
    delete document.documentElement.dataset.theme;
    safeSet('desk:theme', '');
  } else {
    document.documentElement.dataset.theme = next;
    safeSet('desk:theme', next);
  }
  return next;
}

export function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function safeSet(k: string, v: string): void {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
}

export const swatchVar = (t: ContentType) => `var(--${typeSwatch[t] ?? 'apricot'})`;
