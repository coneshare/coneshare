/**
 * Supported localized routes configuration and path helpers.
 * Update this list whenever a new Chinese page is added to portal/app/zh/...
 */

// Supported Chinese subpaths (excluding root /zh)
export const ZH_SUPPORTED_SUBPATHS = [
  '/about',
  '/virtual-dataroom',
  '/pricing',
  '/agents',
  '/blog',
  '/help',
];

// All Chinese routes including root /zh
export const ZH_ALL_ROUTES = [
  '/zh',
  ...ZH_SUPPORTED_SUBPATHS.map((path) => `/zh${path}`),
];

function mapDetailLocalePath(cleanPath, fromPrefix, toPrefix, fallbackPath, translatedSlugsSet) {
  const slug = cleanPath.slice(fromPrefix.length);
  if (slug && !slug.includes('/') && translatedSlugsSet?.has(slug)) {
    return `${toPrefix}${slug}`;
  }
  return fallbackPath;
}

/**
 * Returns the corresponding URL for the alternative locale.
 * - From ZH to EN: removes /zh prefix; preserves /blog/<slug> and /help/<slug> when both locales exist
 * - From EN to ZH: checks whitelist; preserves /zh/blog/<slug> and /zh/help/<slug> when both locales exist
 */
export function getAlternateLocalePath(pathname, currentIsZh, options = {}) {
  if (!pathname) {
    return currentIsZh ? '/' : '/zh';
  }

  const cleanPath = pathname.replace(/\/$/, '') || '/';
  const translatedBlogSlugs = options?.translatedBlogSlugs
    ? new Set(options.translatedBlogSlugs)
    : null;
  const translatedHelpSlugs = options?.translatedHelpSlugs
    ? new Set(options.translatedHelpSlugs)
    : null;

  if (currentIsZh) {
    if (cleanPath === '/zh') {
      return '/';
    }
    if (cleanPath === '/zh/blog') {
      return '/blog';
    }
    if (cleanPath.startsWith('/zh/blog/')) {
      return mapDetailLocalePath(cleanPath, '/zh/blog/', '/blog/', '/blog', translatedBlogSlugs);
    }
    if (cleanPath === '/zh/help') {
      return '/help';
    }
    if (cleanPath.startsWith('/zh/help/')) {
      return mapDetailLocalePath(cleanPath, '/zh/help/', '/help/', '/help', translatedHelpSlugs);
    }
    return cleanPath.replace(/^\/zh/, '') || '/';
  }

  if (cleanPath === '/') {
    return '/zh';
  }
  if (ZH_SUPPORTED_SUBPATHS.includes(cleanPath)) {
    return `/zh${cleanPath}`;
  }
  if (cleanPath.startsWith('/blog/')) {
    return mapDetailLocalePath(cleanPath, '/blog/', '/zh/blog/', '/zh/blog', translatedBlogSlugs);
  }
  if (cleanPath.startsWith('/help/')) {
    return mapDetailLocalePath(cleanPath, '/help/', '/zh/help/', '/zh/help', translatedHelpSlugs);
  }
  return '/zh';
}
