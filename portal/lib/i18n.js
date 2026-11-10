/**
 * Supported localized routes configuration and path helpers.
 * Update this list whenever a new Chinese page is added to portal/app/zh/...
 */

// Supported Chinese subpaths (excluding root /zh)
export const ZH_SUPPORTED_SUBPATHS = [
  '/about',
  '/virtual-dataroom',
  '/pricing',
];

// All Chinese routes including root /zh
export const ZH_ALL_ROUTES = [
  '/zh',
  ...ZH_SUPPORTED_SUBPATHS.map((path) => `/zh${path}`),
];

/**
 * Returns the corresponding URL for the alternative locale.
 * - From ZH to EN: removes /zh prefix (all pages have English counterparts)
 * - From EN to ZH: checks whitelist; falls back to /zh if page is not yet translated
 */
export function getAlternateLocalePath(pathname, currentIsZh) {
  if (!pathname) {
    return currentIsZh ? '/' : '/zh';
  }

  if (currentIsZh) {
    if (pathname === '/zh' || pathname === '/zh/') {
      return '/';
    }
    return pathname.replace(/^\/zh/, '') || '/';
  } else {
    if (pathname === '/') {
      return '/zh';
    }
    const cleanPath = pathname.replace(/\/$/, '');
    if (ZH_SUPPORTED_SUBPATHS.includes(cleanPath)) {
      return `/zh${cleanPath}`;
    }
    return '/zh';
  }
}
