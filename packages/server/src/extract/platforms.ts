// Platform routes: when a link is on a publishing platform with a public API or feed, read the
// article from there instead of scraping the page. Substack (post API, then the RSS feed; custom
// domains too), WordPress (the REST API, self-hosted or wordpress.com) and Medium (the RSS feed).
// These answer when the page itself refuses Cloudflare's servers, and they give the platform's own
// title, authors and date.
//
// Free content only. A paid post, or a feed that carries only a preview, is reported as such
// (PaywalledError) and never stored as if it were the whole piece. No login, no cookies, our own
// user agent.

import { DOMParser } from 'linkedom';
import { FatalError } from '../util';
import { fetchBytes, decode, type Fetched } from './http';
import { parseHTML } from 'linkedom';
import { fragmentText, plainText } from './html';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;

/** API and feed bodies are small; a cap well above any real article. */
const MAX_API_BYTES = 8 * 1024 * 1024;

export type PlatformRoute = 'substack-api' | 'substack-feed' | 'wordpress-api' | 'medium-feed';

export interface PlatformArticle {
  route: PlatformRoute;
  /** Where the text was read from (an API or feed URL). */
  from: string;
  text: string;
  headings: Array<{ offset: number; text: string }>;
  html: string;
  title?: string;
  creator?: string;
  siteName?: string;
  date?: string;
  description?: string;
  image?: string;
  canonical?: string;
  audio?: string;
}

/** The post is paid or members-only and only a preview is public. Not worth retrying. */
export class PaywalledError extends FatalError {}

/** A platform route that could not be used this time (refused, not found, wrong shape). */
export class RouteMissError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

async function getJson<T>(url: string): Promise<{ data: T; res: Fetched }> {
  const res = await fetchBytes(url, { maxBytes: MAX_API_BYTES, headers: { accept: 'application/json' } });
  if (res.status >= 400) throw new RouteMissError(`${new URL(url).hostname} returned ${res.status}`, res.status);
  if (!/json/i.test(res.contentType)) throw new RouteMissError(`${new URL(url).hostname} did not answer with JSON`, res.status);
  try {
    return { data: JSON.parse(decode(res.bytes, res.contentType)) as T, res };
  } catch {
    throw new RouteMissError(`${new URL(url).hostname} sent malformed JSON`, res.status);
  }
}

async function getFeed(url: string): Promise<El> {
  const res = await fetchBytes(url, { maxBytes: MAX_API_BYTES, headers: { accept: 'application/rss+xml, application/xml, text/xml;q=0.9' } });
  if (res.status >= 400) throw new RouteMissError(`${new URL(url).hostname} feed returned ${res.status}`, res.status);
  const xml = decode(res.bytes, res.contentType);
  if (!/<rss[\s>]|<feed[\s>]/i.test(xml.slice(0, 2000))) throw new RouteMissError(`${new URL(url).hostname} has no feed at ${new URL(url).pathname}`, res.status);
  return new DOMParser().parseFromString(xml, 'text/xml');
}

const tag = (el: El, name: string): string => el?.getElementsByTagName(name)?.[0]?.textContent?.trim() ?? '';

const samePost = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, '') && x.pathname.replace(/\/+$/, '') === y.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- Substack

export interface SubstackTarget {
  origin: string;
  slug?: string;
  id?: string;
  /** A /p/<slug> link on a host that is not substack.com: probably a custom domain, not certainly. */
  guess: boolean;
}

/** Recognise a Substack post link. Custom domains are guessed from the /p/<slug> shape. */
export function substackTarget(raw: string): SubstackTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  // App share links: substack.com/home/post/p-123, substack.com/@handle/p-123
  if (host === 'substack.com' || host === 'www.substack.com') {
    const id = /^p-(\d+)$/.exec(parts[parts.length - 1] ?? '')?.[1];
    return id ? { origin: 'https://substack.com', id, guess: false } : null;
  }
  if (host === 'open.substack.com' && parts[0] === 'pub' && parts[2] === 'p' && parts[3]) {
    return { origin: `https://${parts[1]!.toLowerCase()}.substack.com`, slug: parts[3], guess: false };
  }
  if (parts.length === 2 && parts[0] === 'p' && /^[\w-]+$/.test(parts[1]!)) {
    return { origin: u.origin, slug: parts[1], guess: !host.endsWith('.substack.com') };
  }
  return null;
}

interface SubstackByline {
  name?: string;
  publicationUsers?: Array<{ publication_id?: number; publication?: { id?: number; name?: string } }>;
}

interface SubstackPost {
  slug?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  body_html?: string | null;
  audience?: string;
  wordcount?: number;
  post_date?: string;
  canonical_url?: string;
  cover_image?: string;
  publication_id?: number;
  publishedBylines?: SubstackByline[];
  podcast_url?: string | null;
  type?: string;
}

/** Substack furniture inside a post body: subscribe and share boxes, footnote numbers, image buttons. */
const SUBSTACK_STRIP = [
  '.subscription-widget-wrap',
  '.subscription-widget-wrap-editor',
  '.subscribe-widget',
  '.button-wrapper',
  '.captioned-button-wrap',
  '.share-dialog',
  '.paywall',
  '.paywall-jump',
  'a.footnote-anchor',
  '.image-link-expand',
  '[data-component-name="SubscribeWidgetToDOM"]',
  '[data-component-name="ButtonCreateButton"]',
];

function substackArticle(post: SubstackPost, from: string, publication?: string): PlatformArticle {
  if (typeof post.body_html !== 'string' || !post.slug) throw new RouteMissError('Not a Substack post');
  const { text, headings } = fragmentText(post.body_html, SUBSTACK_STRIP);
  const got = words(text);
  const paid = post.audience && post.audience !== 'everyone';
  // Substack sends paid posts with the preview only; wordcount is the whole piece.
  if (paid && (!post.wordcount || got < post.wordcount * 0.8)) {
    throw new PaywalledError(`This post is for paid subscribers. Substack shows ${got} of its ${post.wordcount ?? 'many'} words to everyone else; paste the text or upload a PDF if you have it`);
  }
  if (post.wordcount && post.wordcount > 200 && got < post.wordcount * 0.6) {
    throw new PaywalledError(`Substack sent only part of this post (${got} of ${post.wordcount} words); paste the text if you have it`);
  }
  const byline = post.publishedBylines ?? [];
  const pubName =
    publication ??
    byline.flatMap((b) => b.publicationUsers ?? []).find((pu) => pu.publication_id === post.publication_id || pu.publication?.id === post.publication_id)?.publication?.name;
  return {
    route: 'substack-api',
    from,
    text,
    headings,
    html: post.body_html,
    title: post.title?.trim() || undefined,
    creator: byline.map((b) => b.name?.trim()).filter(Boolean).join(', ') || undefined,
    siteName: pubName?.trim() || undefined,
    date: post.post_date,
    description: post.subtitle?.trim() || post.description?.trim() || undefined,
    image: post.cover_image ?? undefined,
    canonical: post.canonical_url ?? undefined,
    audio: post.type === 'podcast' && post.podcast_url ? post.podcast_url : undefined,
  };
}

/** The post API. Throws RouteMissError when Substack refuses or the host is not Substack. */
export async function substackFromApi(t: SubstackTarget): Promise<PlatformArticle> {
  if (t.id) {
    const url = `https://substack.com/api/v1/posts/by-id/${t.id}`;
    const { data } = await getJson<{ post?: SubstackPost; publication?: { name?: string } }>(url);
    if (!data.post) throw new RouteMissError('Substack has no such post');
    return substackArticle(data.post, url, data.publication?.name);
  }
  const url = `${t.origin}/api/v1/posts/${encodeURIComponent(t.slug!)}`;
  const { data } = await getJson<SubstackPost>(url);
  return substackArticle(data, url);
}

/**
 * The publication's RSS feed, which carries the full text of free posts and a preview of paid ones
 * (ending in a "Read more" link). Only recent posts are in it.
 */
export async function substackFromFeed(t: SubstackTarget, postUrl: string): Promise<PlatformArticle> {
  if (!t.slug) throw new RouteMissError('No feed route for a Substack app link');
  const from = `${t.origin}/feed`;
  const doc = await getFeed(from);
  const channelTitle = plainText(tag(doc.getElementsByTagName('channel')[0], 'title'));
  const item = (Array.from(doc.getElementsByTagName('item')) as El[]).find((i) => {
    const link = tag(i, 'link');
    return samePost(link, postUrl) || link.replace(/\/+$/, '').endsWith(`/p/${t.slug}`);
  });
  if (!item) throw new RouteMissError('The post is not in the newsletter feed (only recent posts are)');
  const html = tag(item, 'content:encoded');
  if (!html) throw new RouteMissError('The feed has no text for this post');
  if (/Read more\s*<\/a>\s*<\/p>\s*$/i.test(html)) {
    throw new PaywalledError('This post is for paid subscribers: its feed carries only the opening. Paste the text or upload a PDF if you have it');
  }
  const { text, headings } = fragmentText(html, SUBSTACK_STRIP);
  const enclosure = item.getElementsByTagName('enclosure')?.[0];
  const encType = enclosure?.getAttribute('type') ?? '';
  return {
    route: 'substack-feed',
    from,
    text,
    headings,
    html,
    title: plainText(tag(item, 'title')) || undefined,
    creator: plainText(tag(item, 'dc:creator')) || undefined,
    siteName: channelTitle || undefined,
    date: tag(item, 'pubDate') || undefined,
    description: plainText(tag(item, 'description')) || undefined,
    image: encType.startsWith('image/') ? enclosure.getAttribute('url') : undefined,
    canonical: tag(item, 'link') || undefined,
    audio: encType.startsWith('audio/') ? enclosure.getAttribute('url') : undefined,
  };
}

/**
 * The post body of a Substack page (fetched or archived): the same element the API's body_html
 * fills, so the text matches the API route's and leaves out the share bar, "No posts" and the
 * subscribe boxes that Readability keeps.
 */
export function substackPageBody(html: string): { text: string; headings: Array<{ offset: number; text: string }> } | null {
  if (!/substackcdn\.com/.test(html) || !/class="available-content"/.test(html)) return null;
  const { document } = parseHTML(html);
  const body = (document as El).querySelector('.available-content .body') ?? (document as El).querySelector('.available-content');
  if (!body) return null;
  const out = fragmentText(body.innerHTML, SUBSTACK_STRIP);
  return out.text.length >= 200 ? out : null;
}

// ---------------------------------------------------------------- WordPress

export interface WordPressTarget {
  /** The REST collection to query, e.g. https://site/wp-json/wp/v2/posts */
  collection: string;
  slug?: string;
  /** A direct post resource, when the page advertised it. */
  resource?: string;
  /** Where the site's name can be read. */
  siteInfo?: string;
  guess: boolean;
}

/** The last path segment of a permalink, which WordPress uses as the post slug. */
function slugOf(u: URL): string | undefined {
  const last = u.pathname.split('/').filter(Boolean).pop();
  if (!last) return undefined;
  const s = decodeURIComponent(last).replace(/\.html?$/i, '');
  return /^[\p{L}\p{N}_-]{2,200}$/u.test(s) && !/^\d+$/.test(s) ? s.toLowerCase() : undefined;
}

/**
 * A WordPress REST target for a link. wordpress.com blogs answer through public-api.wordpress.com;
 * other hosts are a guess (most sites are not WordPress) unless the page advertised its API.
 */
export function wordpressTarget(raw: string, page?: { apiRoot?: string; resource?: string }): WordPressTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const slug = slugOf(u);
  if (host.endsWith('.wordpress.com') && host !== 'public-api.wordpress.com') {
    if (!slug) return null;
    return { collection: `https://public-api.wordpress.com/wp/v2/sites/${host}/posts`, slug, siteInfo: `https://public-api.wordpress.com/rest/v1.1/sites/${host}?fields=name`, guess: false };
  }
  if (page?.apiRoot) {
    const root = page.apiRoot.replace(/\/+$/, '');
    // A site without pretty permalinks advertises ?rest_route=/ as its root.
    const route = (p: string) => (/[?&]rest_route=/.test(root) ? root.replace(/rest_route=[^&]*/, `rest_route=${encodeURIComponent(p)}`) : `${root}${p}`);
    return { collection: route('/wp/v2/posts'), slug, resource: page.resource, siteInfo: route('/'), guess: false };
  }
  if (!slug) return null;
  return { collection: `${u.origin}/wp-json/wp/v2/posts`, slug, siteInfo: `${u.origin}/wp-json/`, guess: true };
}

/** What a fetched page says about its WordPress API (the api.w.org link and the post's JSON link). */
export function wordpressHints(html: string): { apiRoot?: string; resource?: string } | null {
  const head = html.slice(0, 200_000);
  const api = /<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]*>/i.exec(head)?.[0];
  if (!api) return null;
  const href = (s?: string) => (s ? /href=["']([^"']+)["']/i.exec(s)?.[1]?.replace(/&#0?38;|&amp;/g, '&') : undefined);
  const res = /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/json["'][^>]*>/i.exec(head)?.[0];
  const resource = href(res);
  return { apiRoot: href(api), resource: resource && /\/wp\/v2\/(posts|pages)\/\d+/.test(decodeURIComponent(resource)) ? resource : undefined };
}

interface WpPost {
  slug?: string;
  link?: string;
  date_gmt?: string;
  date?: string;
  title?: { rendered?: string };
  content?: { rendered?: string; protected?: boolean };
  excerpt?: { rendered?: string };
  jetpack_featured_media_url?: string;
  _embedded?: { author?: Array<{ name?: string }> };
}

/** Sharing bars, related posts and subscribe boxes that plugins append to the content. */
const WP_STRIP = ['.sharedaddy', '.jp-relatedposts', '#jp-relatedposts', '.wpcnt', '.wp-block-jetpack-subscriptions', '.jetpack-likes-widget-wrapper', '.addtoany_share_save_container', '.wp-block-buttons'];

export async function wordpressFromApi(t: WordPressTarget, postUrl: string): Promise<PlatformArticle> {
  let post: WpPost | undefined;
  let from: string;
  const embed = (u: string) => `${u}${u.includes('?') ? '&' : '?'}_embed=author`;
  if (t.resource) {
    from = embed(t.resource);
    post = (await getJson<WpPost>(from)).data;
  } else {
    if (!t.slug) throw new RouteMissError('No slug to look up');
    from = embed(`${t.collection}${t.collection.includes('?') ? '&' : '?'}slug=${encodeURIComponent(t.slug)}`);
    let list = (await getJson<WpPost[]>(from)).data;
    // The same slug can name a page instead of a post.
    if (Array.isArray(list) && !list.length) {
      const pages = from.replace('/wp/v2/posts', '/wp/v2/pages').replace(encodeURIComponent('/wp/v2/posts'), encodeURIComponent('/wp/v2/pages'));
      list = (await getJson<WpPost[]>(pages)).data;
      from = pages;
    }
    if (!Array.isArray(list)) throw new RouteMissError('Not a WordPress posts API');
    // Prefer the post whose permalink is this link (slugs are unique per type, not per site).
    post = list.find((p) => p.link && samePost(p.link, postUrl)) ?? (list.length === 1 ? list[0] : undefined);
  }
  if (!post || typeof post.content?.rendered !== 'string') throw new RouteMissError('WordPress has no such post');
  if (post.content.protected) throw new PaywalledError('This post is password-protected; paste the text if you have it');
  const { text, headings } = fragmentText(post.content.rendered, WP_STRIP);
  let siteName: string | undefined;
  if (t.siteInfo) {
    siteName = await getJson<{ name?: string }>(t.siteInfo)
      .then((r) => plainText(r.data?.name) || undefined)
      .catch(() => undefined);
  }
  return {
    route: 'wordpress-api',
    from,
    text,
    headings,
    html: post.content.rendered,
    title: plainText(post.title?.rendered) || undefined,
    creator: (post._embedded?.author ?? []).map((a) => a?.name?.trim()).filter(Boolean).join(', ') || undefined,
    siteName,
    date: post.date_gmt ? `${post.date_gmt}Z` : post.date,
    description: plainText(post.excerpt?.rendered).replace(/\s*(\[…\]|\[&hellip;\]|Continue reading.*)$/i, '') || undefined,
    image: post.jetpack_featured_media_url || undefined,
    canonical: post.link,
  };
}

// ---------------------------------------------------------------- Medium

export interface MediumTarget {
  feed: string;
  id: string;
  guess: boolean;
}

/**
 * Medium's pages refuse servers outright (a bot check, even for a plain request), but each author
 * and publication has an RSS feed with the full text of its recent free stories.
 */
export function mediumTarget(raw: string): MediumTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const id = /(?:^|-)([0-9a-f]{10,12})$/.exec(last)?.[1];
  if (!id) return null;
  if (host === 'medium.com' || host === 'www.medium.com') {
    if (parts.length < 2) return null; // medium.com/p/<id> names no feed
    return { feed: `https://medium.com/feed/${parts[0]}`, id, guess: false };
  }
  if (host.endsWith('.medium.com')) return { feed: `https://medium.com/feed/@${host.slice(0, -'.medium.com'.length)}`, id, guess: false };
  // A custom-domain publication (blog.example.com/title-0123456789ab) serves /feed.
  return { feed: `${u.origin}/feed`, id, guess: true };
}

export async function mediumFromFeed(t: MediumTarget): Promise<PlatformArticle> {
  const doc = await getFeed(t.feed);
  const channelTitle = plainText(tag(doc.getElementsByTagName('channel')[0], 'title')).replace(/^Stories by (.+) on Medium$/, '$1');
  const item = (Array.from(doc.getElementsByTagName('item')) as El[]).find((i) => tag(i, 'guid').endsWith(`/p/${t.id}`) || tag(i, 'link').includes(t.id));
  if (!item) throw new RouteMissError('The story is not in its Medium feed (only the latest stories are)');
  const html = tag(item, 'content:encoded');
  // Members-only stories come with a short description and a "Continue reading" link, no text.
  if (!html) {
    if (/medium-feed-link|Continue reading/i.test(tag(item, 'description'))) {
      throw new PaywalledError('This is a members-only Medium story: only its opening lines are public. Paste the text or upload a PDF if you have it');
    }
    throw new RouteMissError('The feed has no text for this story');
  }
  // Medium appends "<title> was originally published in <publication> on Medium…" after a rule.
  const body = html.replace(/<hr\s*\/?>\s*<p>(?:(?!<p>)[\s\S])*?was originally published in[\s\S]*$/i, '').replace(/<img[^>]+medium\.com\/_\/stat[^>]*>/gi, '');
  const { text, headings } = fragmentText(body);
  const link = tag(item, 'link');
  let canonical: string | undefined;
  try {
    const c = new URL(link);
    c.search = '';
    canonical = c.toString();
  } catch {
    canonical = undefined;
  }
  const author = new URL(t.feed).pathname.includes('/@');
  return {
    route: 'medium-feed',
    from: t.feed,
    text,
    headings,
    html: body,
    title: plainText(tag(item, 'title')) || undefined,
    creator: plainText(tag(item, 'dc:creator')) || undefined,
    siteName: !author && channelTitle ? channelTitle : 'Medium',
    date: tag(item, 'pubDate') || undefined,
    canonical,
  };
}

/**
 * Substack and Medium pages that say outright that the rest is for subscribers. Checked on pages
 * and archived copies, and only on those platforms' pages (other sites use the same words loosely).
 */
export function paywallMarker(html: string): string | null {
  const h = html.slice(0, 3_000_000);
  if (/substackcdn\.com/.test(h) && (/class=["'][^"']*\bpaywall-cta\b/.test(h) || (/"audience":"(only_paid|founding)"/.test(h.slice(0, 600_000)) && /class=["'][^"']*\bpaywall\b/.test(h))))
    return 'This post is for paid subscribers';
  if (/cdn-client\.medium\.com|miro\.medium\.com/.test(h) && /Member-only story/.test(h)) return 'This is a members-only Medium story';
  return null;
}
