// The theme toggle. Without JavaScript the button stays hidden and the page follows the system.

const KEY = 'fdf-theme';
const root = document.documentElement;
const dark = window.matchMedia('(prefers-color-scheme: dark)');

const current = (): 'light' | 'dark' => {
  const t = root.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return dark.matches ? 'dark' : 'light';
};

function label(button: HTMLButtonElement) {
  button.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  button.hidden = false;
  label(button);
  button.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Blocked storage: the choice lasts for this page only.
    }
    label(button);
  });
  dark.addEventListener('change', () => label(button));
}
