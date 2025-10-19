import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const articles = await getCollection('articles');
  const sortedArticles = articles.sort(
    (a, b) => b.data.publishedDate.valueOf() - a.data.publishedDate.valueOf()
  );

  return rss({
    title: 'From The Dumpster Fire',
    description: 'Rescuing signal from the algorithmic inferno. A curated magazine for the curious, thoughtful, and intellectually hungry.',
    site: context.site || 'https://fromthedumpsterfire.com',
    items: sortedArticles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.publishedDate,
      description: article.data.excerpt,
      link: `/articles/${article.slug}/`,
      author: article.data.author,
      categories: article.data.topics,
    })),
    customData: `<language>en-us</language>`,
  });
}
