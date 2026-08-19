import { features, solutions, integrations } from '../lib/content';
import { getAllBlogPosts, getAllCategories, getAllTags, getEffectiveCategory, slugifyTerm } from '../lib/blog';

export const dynamic = 'force-static';

const URL = 'https://www.coneshare.com';

function getMostRecentDate(dates) {
  if (dates.length === 0) {
    return new Date();
  }

  return new Date(Math.max(...dates.map((date) => new Date(date).getTime())));
}

export default async function sitemap() {
  const featureRoutes = features.map((feature) => ({
    url: `${URL}/features/${feature.slug}`,
    lastModified: new Date(),
  }));

  const solutionRoutes = solutions.map((solution) => ({
    url: `${URL}/solutions/${solution.slug}`,
    lastModified: new Date(),
  }));
  const integrationRoutes = integrations.map((integration) => ({
    url: `${URL}/integrations/${integration.slug}`,
    lastModified: new Date(),
  }));

  const [blogPosts, categories, tags] = await Promise.all([
    getAllBlogPosts(),
    getAllCategories(),
    getAllTags(),
  ]);

  const blogRoutes = blogPosts.map((post) => ({
    url: `${URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
  }));

  const categoryRoutes = categories.map((category) => ({
    url: `${URL}/blog/category/${category.slug}`,
    lastModified: getMostRecentDate(
      blogPosts
        .filter((post) => slugifyTerm(getEffectiveCategory(post)) === category.slug)
        .map((post) => post.date)
    ),
  }));

  const tagRoutes = tags.map((tag) => ({
    url: `${URL}/blog/tag/${tag.slug}`,
    lastModified: getMostRecentDate(
      blogPosts
        .filter((post) => (post.tags || []).some((postTag) => slugifyTerm(postTag) === tag.slug))
        .map((post) => post.date)
    ),
  }));

  const routes = [
    '',
    '/features',
    '/features/file-request-embed',
    '/solutions',
    '/blog',
    '/about',
    '/privacy-policy',
    '/terms',
    '/demo',
    '/virtual-dataroom',
    '/agents',
    '/alternatives/docsend',
  ].map((route) => ({
    url: `${URL}${route}`,
    lastModified: new Date(),
  }));

  return [...routes, ...featureRoutes, ...solutionRoutes, ...integrationRoutes, ...blogRoutes, ...categoryRoutes, ...tagRoutes];
}
