// Data stories (the Atlas) in the app, the parts that need no device: which copy of a story may be
// shown, which stories belong to a Haul or an item, where a plate's picture is kept on the phone, and
// the small words the screens share. The reading and writing is in data.ts; the plates themselves are
// pictures drawn at publish (packages/shared/src/stories/published.ts, `pictures`), never drawn here.
// Imports only the light entry: '@fdf/shared/stories' would pull the renderer into the app.

import { storyPath, validateDataIndex, validatePublishedStory, type DataIndex, type DataIndexEntry, type PublishedStory, type StoryPicture } from '@fdf/shared/stories/published';

export type Plate = PublishedStory['story']['plates'][number];
export type Source = Plate['sources'][number];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
/** The series' name for a story: "Atlas No. 1". */
export const atlasNo = (n: number) => `Atlas No. ${n}`;

export const storyUrl = (slug?: string, plate?: string) => `https://fromthedumpsterfire.com/data${slug ? `/${slug}` : ''}${plate ? `#${plate}` : ''}`;

/** A data index a reader may use: one that fails is never kept or shown. */
export const goodIndex = (v: unknown): v is DataIndex => Boolean(v) && validateDataIndex(v).length === 0;

/** A story file a reader may use: it validates, its pictures are on our files host, and it is the story asked for. */
export function goodStory(v: unknown, slug: string, filesBase: string): v is PublishedStory {
  return Boolean(v) && (v as PublishedStory).slug === slug && validatePublishedStory(v, { filesBase }).length === 0;
}

/** The files a story may be read from, its current version first, then each earlier one (the fallback). */
export const storyPaths = (e: Pick<DataIndexEntry, 'slug' | 'version'>) => Array.from({ length: Math.max(0, e.version) }, (_, i) => storyPath(e.slug, e.version - i));

/** The newest copy on hand that may be shown: `kept` returns a path's checked copy or null. */
export function newestKept(e: Pick<DataIndexEntry, 'slug' | 'version'>, kept: (path: string) => PublishedStory | null): PublishedStory | null {
  for (const path of storyPaths(e)) {
    const s = kept(path);
    if (s) return s;
  }
  return null;
}

/** The Atlas, newest story first. */
export const newestFirst = (index: DataIndex | null | undefined) => [...(index?.stories ?? [])].sort((a, b) => b.number - a.number);

/** The stories a Haul carries ("In the Atlas" after its contents), in series order. */
export const storiesForHaul = (index: DataIndex | null | undefined, haul: number) => (index?.stories ?? []).filter((e) => e.haul?.number === haul).sort((a, b) => a.number - b.number);

/** The stories that answer one item ("The data story" on its page): the item's id is the slug in its link. */
export const storiesForItem = (index: DataIndex | null | undefined, haul: number, itemId: string) => storiesForHaul(index, haul).filter((e) => e.haul?.itemSlug === itemId);

/** The plates in reading order: by movement when the story has them. */
export function plateOrder(story: PublishedStory['story']): Plate[] {
  const byKey = new Map(story.plates.map((p) => [p.key, p]));
  if (!story.movements.length) return story.plates;
  return story.movements.flatMap((m) => m.plates.map((k) => byKey.get(k)).filter((p): p is Plate => Boolean(p)));
}

/** The picture of the first plate in reading order, for a story's card (null before pictures were drawn). */
export function thumbOf(s: PublishedStory | null | undefined, scheme: 'light' | 'dark'): StoryPicture | null {
  if (!s) return null;
  const first = plateOrder(s.story)[0];
  return (first && s.pictures?.[first.key]?.[scheme]) ?? null;
}

/**
 * The file name a plate's picture is kept under in the document directory: its immutable published
 * path with slashes as "__", as the bundles are kept. Anything else (a foreign path, one that climbs)
 * is not kept.
 */
export function storyPictureFileName(url: string): string | null {
  const m = /^https:\/\/[^/]+\/(data\/[a-z0-9-]+\/v[0-9]+\/plates\/[a-z0-9-]+-(?:light|dark)\.png)$/.exec(url);
  return m ? m[1]!.replaceAll('/', '__') : null;
}

/** Every plate picture a story points to (both themes). */
export const storyPictureUrls = (s: PublishedStory) => Object.values(s.pictures ?? {}).flatMap((p) => [p.light.url, p.dark.url]);

/** Who made a plate's data, and who carried it: "United Nations, Population Division, via Our World in Data". */
export function plateSourceLine(p: Plate): string {
  const makers = [...new Set(p.sources.map((s) => s.maker))];
  const vias = [...new Set(p.sources.flatMap((s) => (s.via ? [s.via.name] : [])))];
  return makers.join('; ') + (vias.length ? `, ${p.sources.every((s) => s.via) ? '' : 'partly '}via ${vias.join(' and ')}` : '');
}

/** The story's sources once each, for the colophon. */
export const storySources = (story: PublishedStory['story']): Source[] => [...new Map(story.plates.flatMap((p) => p.sources).map((x) => [`${x.maker}|${x.dataset}|${x.via?.name ?? ''}`, x])).values()];

/** A fact's value as the colophon prints it (the website's rule). */
export const factValue = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : String(+v.toFixed(3)));
