/**
 * Content Collections Configuration
 * Defines schemas for articles content collection
 */

import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    source: z.string(),
    originalUrl: z.string().url(),
    author: z.string().optional(),
    publishedDate: z.coerce.date(),
    readingTime: z.number(),
    articleType: z.enum(['essay', 'video', 'podcast', 'note', 'tweet', 'thread', 'paper', 'book']),
    topics: z.array(z.string()),
    featured: z.boolean().default(false),
    curatorNotes: z.string().optional(),
    excerpt: z.string(),
    pullQuote: z.string().optional(),
  }),
});

const art = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    artist: z.string(),
    year: z.string().optional(),
    medium: z.string().optional(),
    location: z.string().optional(),
    imageUrl: z.string().optional(),
    imageAlt: z.string(),
    publishedDate: z.coerce.date(),
    context: z.string(),
    curatorNotes: z.string(),
    wikiUrl: z.string().url().optional(),
    museumUrl: z.string().url().optional(),
    relatedLinks: z.array(z.object({
      title: z.string(),
      url: z.string().url()
    })).optional(),
    topics: z.array(z.string()),
  }),
});

const poems = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: z.string(),
    year: z.string().optional(),
    publishedDate: z.coerce.date(),
    excerpt: z.string(),
    curatorNotes: z.string(),
    source: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    relatedLinks: z.array(z.object({
      title: z.string(),
      url: z.string().url()
    })).optional(),
    topics: z.array(z.string()),
  }),
});

const letters = defineCollection({
  type: 'content',
  schema: z.object({
    writer: z.string(),
    recipient: z.string().optional(),
    date: z.string(),
    location: z.string().optional(),
    excerpt: z.string(),
    context: z.string(),
    publishedDate: z.coerce.date(),
    paperlanternsUrl: z.string().url().optional(),
    topics: z.array(z.string()),
  }),
});

const books = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: z.string(),
    coverImage: z.string().optional(),
    publishedDate: z.coerce.date(),
    featured: z.boolean().default(false),
    status: z.enum(['reading', 'finished', 'to-read']).default('reading'),
    curatorNote: z.string(),
    excerpt: z.string().optional(),
    purchaseUrl: z.string().url().optional(),
    topics: z.array(z.string()),
  }),
});

export const collections = {
  articles,
  art,
  poems,
  letters,
  books,
};
