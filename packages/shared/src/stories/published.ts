// A data story as published (docs/DATA-STORIES.md, "Publishing"): the story with its place in the
// series and the Haul item it answers, at data/<slug>/v<N>/story.json in the public bucket, and the
// index of every published story at data/index.json. Versions are never overwritten: a correction is
// a new version. The website and the app read only these files, each validated before it is used.

import { EDITIONS } from '../tokens';
import { validateStory, type Story } from './spec';

export const DATA_INDEX_PATH = 'data/index.json';
export const STORY_BUNDLE_VERSION = 1;
export const STORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const storyPath = (slug: string, version: number) => `data/${slug}/v${version}/story.json`;
export const picturePath = (slug: string, version: number, plate: string, scheme: 'light' | 'dark') => `data/${slug}/v${version}/plates/${plate}-${scheme}.png`;

/** The Haul item a story answers, as the reader reaches it: /haul/<number>/<itemSlug>. */
export interface StoryHaul { number: number; itemId: string; itemSlug: string; itemTitle: string }

/** A plate's picture for the app, drawn at publish: in data/<slug>/v<N>/plates/. */
export interface StoryPicture { url: string; width: number; height: number }

export interface PublishedStory {
  bundleVersion: typeof STORY_BUNDLE_VERSION;
  slug: string;
  /** Its number in the series ("Atlas No. 1"), never reused. */
  number: number;
  version: number;
  /** First published, then this version (ISO). */
  publishedAt: string;
  updatedAt: string;
  haul?: StoryHaul;
  story: Story;
  /** Each plate's phone figure with its key, light and dark, by plate key (the app's pictures). */
  pictures?: Record<string, { light: StoryPicture; dark: StoryPicture }>;
}

export interface DataIndexEntry {
  slug: string;
  number: number;
  version: number;
  path: string;
  title: string;
  standfirst: string;
  edition: Story['edition'];
  plates: number;
  publishedAt: string;
  updatedAt: string;
  haul?: StoryHaul;
  /** The story's key figure for its card: the ledger's loud line. */
  figure?: { value: string; text: string };
}

export interface DataIndex { bundleVersion: typeof STORY_BUNDLE_VERSION; updatedAt: string; stories: DataIndexEntry[] }

const iso = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const posInt = (n: unknown) => Number.isInteger(n) && (n as number) > 0;

function checkHaul(h: unknown, at: string, errs: string[]): void {
  if (h === undefined) return;
  const o = h as Partial<StoryHaul>;
  if (!o || typeof o !== 'object' || !posInt(o.number) || typeof o.itemId !== 'string' || !o.itemId || typeof o.itemSlug !== 'string' || !STORY_SLUG.test(o.itemSlug) || typeof o.itemTitle !== 'string' || !o.itemTitle.trim()) errs.push(`${at}.haul: a Haul number, the item's id, slug and title`);
}

/** The published file, checked as a reader receives it: its frame and the whole story (all but the editor's words, checked at publish). */
export function validatePublishedStory(p: unknown, opts: { filesBase?: string } = {}): string[] {
  const errs: string[] = [];
  const o = p as Partial<PublishedStory>;
  if (!o || typeof o !== 'object') return ['not a story'];
  if (o.bundleVersion !== STORY_BUNDLE_VERSION) errs.push(`bundleVersion must be ${STORY_BUNDLE_VERSION}`);
  if (typeof o.slug !== 'string' || !STORY_SLUG.test(o.slug)) errs.push('slug: lowercase words joined by hyphens');
  if (!posInt(o.number)) errs.push('number: a whole number from 1');
  if (!posInt(o.version)) errs.push('version: a whole number from 1');
  if (!iso(o.publishedAt) || !iso(o.updatedAt)) errs.push('publishedAt and updatedAt: dates');
  checkHaul(o.haul, 'story', errs);
  if (!o.story || typeof o.story !== 'object' || !Array.isArray(o.story.plates)) return [...errs, 'story: missing'];
  errs.push(...validateStory(o.story, null));
  if (o.pictures !== undefined) {
    const keys = new Set(o.story.plates.map((p) => p.key));
    const base = opts.filesBase?.replace(/\/$/, '');
    for (const [k, v] of Object.entries(o.pictures ?? {})) {
      if (!keys.has(k)) errs.push(`pictures.${k}: no such plate`);
      for (const sch of ['light', 'dark'] as const) {
        const pic = v?.[sch];
        if (!pic || typeof pic.url !== 'string' || !/^https:\/\//.test(pic.url) || !posInt(pic.width) || !posInt(pic.height)) errs.push(`pictures.${k}.${sch}: an https url, a width and a height`);
        else if (base && !pic.url.startsWith(`${base}/data/`)) errs.push(`pictures.${k}.${sch}: must be published under ${base}/data/`);
      }
    }
  }
  return errs;
}

export function validateDataIndex(i: unknown): string[] {
  const errs: string[] = [];
  const o = i as Partial<DataIndex>;
  if (!o || typeof o !== 'object' || !Array.isArray(o.stories)) return ['not a data index'];
  if (o.bundleVersion !== STORY_BUNDLE_VERSION) errs.push(`bundleVersion must be ${STORY_BUNDLE_VERSION}`);
  if (!iso(o.updatedAt)) errs.push('updatedAt: a date');
  const slugs = new Set<string>(), numbers = new Set<number>();
  o.stories.forEach((s, k) => {
    const at = `stories[${k}]`;
    if (!s || typeof s !== 'object') { errs.push(`${at}: not an entry`); return; }
    if (!STORY_SLUG.test(s.slug ?? '')) errs.push(`${at}.slug`);
    if (slugs.has(s.slug)) errs.push(`${at}.slug: "${s.slug}" twice`);
    slugs.add(s.slug);
    if (!posInt(s.number) || numbers.has(s.number)) errs.push(`${at}.number: unique, from 1`);
    numbers.add(s.number);
    if (!posInt(s.version) || s.path !== storyPath(s.slug, s.version)) errs.push(`${at}.path: ${storyPath(s.slug, s.version ?? 0)}`);
    if (typeof s.title !== 'string' || !s.title.trim() || typeof s.standfirst !== 'string') errs.push(`${at}: title and standfirst`);
    if (!EDITIONS.includes(s.edition)) errs.push(`${at}.edition`);
    if (!posInt(s.plates)) errs.push(`${at}.plates`);
    if (!iso(s.publishedAt) || !iso(s.updatedAt)) errs.push(`${at}: dates`);
    checkHaul(s.haul, at, errs);
    if (s.figure !== undefined && (typeof s.figure.value !== 'string' || typeof s.figure.text !== 'string')) errs.push(`${at}.figure`);
  });
  return errs;
}

/** The index entry for a published story. */
export function indexEntry(p: PublishedStory): DataIndexEntry {
  const loud = p.story.ledger.find((l) => l.loud);
  return {
    slug: p.slug, number: p.number, version: p.version, path: storyPath(p.slug, p.version), title: p.story.title, standfirst: p.story.standfirst,
    edition: p.story.edition, plates: p.story.plates.length, publishedAt: p.publishedAt, updatedAt: p.updatedAt,
    ...(p.haul ? { haul: p.haul } : {}), ...(loud ? { figure: { value: loud.value, text: loud.text } } : {}),
  };
}
