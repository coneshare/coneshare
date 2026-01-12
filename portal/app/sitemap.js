import { features, solutions } from '../lib/content';

const URL = 'https://www.coneshare.com';

export default function sitemap() {
  const featureRoutes = features.map((feature) => ({
    url: `${URL}/features/${feature.slug}`,
    lastModified: new Date(),
  }));

  const solutionRoutes = solutions.map((solution) => ({
    url: `${URL}/solutions/${solution.slug}`,
    lastModified: new Date(),
  }));

  const routes = ['', '/features', '/solutions'].map((route) => ({
    url: `${URL}${route}`,
    lastModified: new Date(),
  }));

  return [...routes, ...featureRoutes, ...solutionRoutes];
}
