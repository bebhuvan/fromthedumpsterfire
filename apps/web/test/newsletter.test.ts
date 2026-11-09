import { describe, expect, it } from 'vitest';
import { newsletterFor } from '../src/lib/newsletter';
import { CSP } from '../src/worker/lib';

describe('newsletterFor', () => {
  it('builds the form and subscribe addresses from a bare https origin', () => {
    expect(newsletterFor('https://fdf.substack.com')).toEqual({
      home: 'https://fdf.substack.com',
      subscribe: 'https://fdf.substack.com/subscribe',
      embed: 'https://fdf.substack.com/embed',
      origin: 'https://fdf.substack.com',
    });
    expect(newsletterFor('https://fdf.substack.com/')?.origin).toBe('https://fdf.substack.com');
  });

  it('refuses anything but a bare https origin, so the CSP can never be widened by a typo', () => {
    for (const bad of [null, '', 'fdf.substack.com', 'http://fdf.substack.com', 'https://fdf.substack.com/embed', 'https://fdf.substack.com?x=1', 'https://a:b@fdf.substack.com', 'https://fdf.substack.com:8443', 'javascript:alert(1)']) {
      expect(newsletterFor(bad)).toBeNull();
    }
  });
});

describe('CSP frame-src', () => {
  it('names only the players, plus the newsletter origin when one is set', () => {
    const frame = CSP.split('; ').find((d) => d.startsWith('frame-src '))!.split(' ').slice(1);
    const players = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://open.spotify.com', 'https://embed.podcasts.apple.com'];
    expect(frame.slice(0, 4)).toEqual(players);
    expect(frame.length).toBeLessThanOrEqual(5);
    for (const src of frame.slice(4)) expect(newsletterFor(src)?.origin).toBe(src);
    // The list is open (2026-11-09): the subscribe page's form comes from the publication's own origin.
    expect(frame).toContain('https://fromthedumpsterfire.substack.com');
  });
});
