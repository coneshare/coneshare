import { features, solutions } from '../lib/content';
import { getAllBlogPosts } from '../lib/blog';

export const dynamic = 'force-static';

const URL = 'https://www.coneshare.com';

export default async function sitemap() {
  const featureRoutes = features.map((feature) => ({
    url: `${URL}/features/${feature.slug}`,
    lastModified: new Date(),
  }));

  const solutionRoutes = solutions.map((solution) => ({
    url: `${URL}/solutions/${solution.slug}`,
    lastModified: new Date(),
  }));

  const blogPosts = await getAllBlogPosts();
  const blogRoutes = blogPosts.map((post) => ({
    url: `${URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
  }));

  const routes = ['', '/features', '/solutions', '/blog', '/privacy-policy', '/terms', '/demo'].map((route) => ({
    url: `${URL}${route}`,
    lastModified: new Date(),
  }));

  return [...routes, ...featureRoutes, ...solutionRoutes, ...blogRoutes];
}
