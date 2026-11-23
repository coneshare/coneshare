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
  '/api-reference',
  '/demo',
  '/features',
  '/features/file-request-embed',
];

// All Chinese routes including root /zh
export const ZH_ALL_ROUTES = [
  '/zh',
  ...ZH_SUPPORTED_SUBPATHS.map((path) => `/zh${path}`),
];

export const ZH_FEATURE_SLUGS = new Set([
  'secure-sharing',
  'advanced-analytics',
  'dynamic-watermarking',
  'virtual-data-rooms',
  'cloud-storage-integration',
  'workflow-automation-integration',
  'file-requests',
  'self-hosted',
  'online-document-preview',
  'file-request-embed',
]);

export const LOCALE_PREFERENCE_STORAGE_KEY = 'coneshare_locale';

export function readLocalePreference() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLocalePreference(locale) {
  if (typeof window === 'undefined' || !locale) return;
  try {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage access restrictions in private browsing modes.
  }
}

export function isChineseBrowserLocale(languages, language) {
  const primary = (Array.isArray(languages) && languages.length > 0 ? languages[0] : language) || '';
  return /^zh(?:-|$)/i.test(String(primary).trim());
}

export function isAutomatedCrawler(userAgent) {
  return /bot|crawler|spider|slurp|bingpreview|lighthouse/i.test(String(userAgent || ''));
}

function extractMatchingSlug(cleanPath, fromPrefix, translatedSlugsSet) {
  const slug = cleanPath.slice(fromPrefix.length);
  if (slug && !slug.includes('/') && translatedSlugsSet?.has(slug)) {
    return slug;
  }
  return null;
}

function mapDetailLocalePath(cleanPath, fromPrefix, toPrefix, fallbackPath, translatedSlugsSet) {
  const slug = extractMatchingSlug(cleanPath, fromPrefix, translatedSlugsSet);
  return slug ? `${toPrefix}${slug}` : fallbackPath;
}

export function getChineseCounterpartPath(pathname, options = {}) {
  if (!pathname) return null;
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/zh' || cleanPath.startsWith('/zh/')) {
    return null;
  }
  if (cleanPath === '/') {
    return '/zh';
  }
  if (ZH_SUPPORTED_SUBPATHS.includes(cleanPath)) {
    return `/zh${cleanPath}`;
  }

  const translatedBlogSlugs = options?.translatedBlogSlugs
    ? new Set(options.translatedBlogSlugs)
    : null;
  const translatedHelpSlugs = options?.translatedHelpSlugs
    ? new Set(options.translatedHelpSlugs)
    : null;

  if (cleanPath.startsWith('/blog/')) {
    const slug = extractMatchingSlug(cleanPath, '/blog/', translatedBlogSlugs);
    return slug ? `/zh/blog/${slug}` : null;
  }
  if (cleanPath.startsWith('/help/')) {
    const slug = extractMatchingSlug(cleanPath, '/help/', translatedHelpSlugs);
    return slug ? `/zh/help/${slug}` : null;
  }
  if (cleanPath.startsWith('/features/')) {
    const slug = extractMatchingSlug(cleanPath, '/features/', ZH_FEATURE_SLUGS);
    return slug ? `/zh/features/${slug}` : null;
  }
  return null;
}

/**
 * Returns the corresponding URL for the alternative locale.
 * - From ZH to EN: removes /zh prefix; preserves /blog/<slug>, /help/<slug>, and /features/<slug>
 * - From EN to ZH: checks whitelist; preserves /zh/blog/<slug>, /zh/help/<slug>, and /zh/features/<slug>
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
    if (cleanPath === '/zh/features') {
      return '/features';
    }
    if (cleanPath.startsWith('/zh/features/')) {
      return mapDetailLocalePath(
        cleanPath,
        '/zh/features/',
        '/features/',
        '/features',
        ZH_FEATURE_SLUGS
      );
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
  if (cleanPath.startsWith('/features/')) {
    return mapDetailLocalePath(
      cleanPath,
      '/features/',
      '/zh/features/',
      '/zh/features',
      ZH_FEATURE_SLUGS
    );
  }
  return '/zh';
}
