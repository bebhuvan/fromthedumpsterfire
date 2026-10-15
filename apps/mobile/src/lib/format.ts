const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-15" → "15 October 2026". Parsed by hand to stay independent of device locale. */
export function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function minutes(n?: number) {
  return n ? `${n} min` : '';
}

export const joinMeta = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
