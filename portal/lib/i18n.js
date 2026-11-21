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
];

// All Chinese routes including root /zh
export const ZH_ALL_ROUTES = [
  '/zh',
  ...ZH_SUPPORTED_SUBPATHS.map((path) => `/zh${path}`),
];

/**
 * Returns the corresponding URL for the alternative locale.
 * - From ZH to EN: removes /zh prefix; preserves /blog/<slug> when the post exists in both locales
 * - From EN to ZH: checks whitelist; preserves /zh/blog/<slug> when the post exists in both locales
 */
export function getAlternateLocalePath(pathname, currentIsZh, options = {}) {
  if (!pathname) {
    return currentIsZh ? '/' : '/zh';
  }

  const cleanPath = pathname.replace(/\/$/, '') || '/';
  const translatedBlogSlugs = options?.translatedBlogSlugs
    ? new Set(options.translatedBlogSlugs)
    : null;

  if (currentIsZh) {
    if (cleanPath === '/zh') {
      return '/';
    }
    if (cleanPath === '/zh/blog') {
      return '/blog';
    }
    if (cleanPath.startsWith('/zh/blog/')) {
      const slug = cleanPath.slice('/zh/blog/'.length);
      if (slug && !slug.includes('/') && translatedBlogSlugs?.has(slug)) {
        return `/blog/${slug}`;
      }
      return '/blog';
    }
    return cleanPath.replace(/^\/zh/, '') || '/';
  } else {
    if (cleanPath === '/') {
      return '/zh';
    }
    if (ZH_SUPPORTED_SUBPATHS.includes(cleanPath)) {
      return `/zh${cleanPath}`;
    }
    if (cleanPath.startsWith('/blog/')) {
      const slug = cleanPath.slice('/blog/'.length);
      if (slug && !slug.includes('/') && translatedBlogSlugs?.has(slug)) {
        return `/zh/blog/${slug}`;
      }
      return '/zh/blog';
    }
    return '/zh';
  }
}
