import { features, solutions, integrations } from '../lib/content';
import { getAllBlogPosts, getAllCategories, getAllTags, getEffectiveCategory, slugifyTerm } from '../lib/blog';
import { getAllHelpGuides } from '../lib/help';
import { ZH_ALL_ROUTES } from '../lib/i18n';

export const dynamic = 'force-static';

const URL = 'https://www.coneshare.com';

function getMostRecentDate(dates) {
  if (dates.length === 0) {
    return new Date();
  }

  return new Date(Math.max(...dates.map((date) => new Date(date).getTime())));
}

function buildBlogSitemapEntries(basePath, posts, categories, tags) {
  const postRoutes = posts.map((post) => ({
    url: `${URL}${basePath}/${post.slug}`,
    lastModified: new Date(post.date),
  }));

  const categoryRoutes = categories.map((category) => ({
    url: `${URL}${basePath}/category/${category.slug}`,
    lastModified: getMostRecentDate(
      posts
        .filter((post) => slugifyTerm(getEffectiveCategory(post)) === category.slug)
        .map((post) => post.date)
    ),
  }));

  const tagRoutes = tags.map((tag) => ({
    url: `${URL}${basePath}/tag/${tag.slug}`,
    lastModified: getMostRecentDate(
      posts
        .filter((post) => (post.tags || []).some((postTag) => slugifyTerm(postTag) === tag.slug))
        .map((post) => post.date)
    ),
  }));

  return [...postRoutes, ...categoryRoutes, ...tagRoutes];
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

  const [enPosts, enCategories, enTags, zhPosts, zhCategories, zhTags, enHelpGuides, zhHelpGuides] =
    await Promise.all([
      getAllBlogPosts('en'),
      getAllCategories('en'),
      getAllTags('en'),
      getAllBlogPosts('zh'),
      getAllCategories('zh'),
      getAllTags('zh'),
      getAllHelpGuides('en'),
      getAllHelpGuides('zh'),
    ]);

  const blogEntries = [
    ...buildBlogSitemapEntries('/blog', enPosts, enCategories, enTags),
    ...buildBlogSitemapEntries('/zh/blog', zhPosts, zhCategories, zhTags),
  ];

  const helpEntries = [
    ...enHelpGuides.map((guide) => ({
      url: `${URL}/help/${guide.slug}`,
      lastModified: new Date(),
    })),
    ...zhHelpGuides.map((guide) => ({
      url: `${URL}/zh/help/${guide.slug}`,
      lastModified: new Date(),
    })),
  ];

  const routes = [
    '',
    '/features',
    '/features/file-request-embed',
    '/solutions',
    '/blog',
    '/help',
    '/about',
    '/pricing',
    '/privacy-policy',
    '/terms',
    '/demo',
    '/virtual-dataroom',
    '/agents',
    '/alternatives/docsend',
    ...ZH_ALL_ROUTES,
  ].map((route) => ({
    url: `${URL}${route}`,
    lastModified: new Date(),
  }));

  return [
    ...routes,
    ...featureRoutes,
    ...solutionRoutes,
    ...integrationRoutes,
    ...blogEntries,
    ...helpEntries,
  ];
}
