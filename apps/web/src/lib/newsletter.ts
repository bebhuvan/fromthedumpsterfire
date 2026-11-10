// The email list. Substack keeps the addresses and sends one email per Haul (DECISIONS 2026-11-09).
// Set NEWSLETTER to the publication's address, e.g. https://fromthedumpsterfire.substack.com, and the
// subscribe page shows Substack's own form in a frame, the CSP lets that one origin in as a frame,
// and nothing else from Substack runs on our pages. While it is null the page says the list opens soon.

export const NEWSLETTER: string | null = 'https://fromthedumpsterfire.substack.com';

export type Newsletter = { home: string; subscribe: string; embed: string; origin: string };

/** The addresses we use, from the publication's address; null unless it is a bare https origin. */
export function newsletterFor(address: string | null): Newsletter | null {
  if (!address) return null;
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null;
  const origin = u.origin;
  return { home: origin, subscribe: `${origin}/subscribe`, embed: `${origin}/embed`, origin };
}

export const newsletter = newsletterFor(NEWSLETTER);
