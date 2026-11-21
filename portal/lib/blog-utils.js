export const DEFAULT_CATEGORY = 'General';

export function normalizeBlogPost(slug, metadata = {}, Content = null, locale = 'en') {
  const effectiveLocale =
    metadata?.locale === 'zh' || metadata?.locale === 'en' ? metadata.locale : locale;

  return {
    slug,
    locale: effectiveLocale,
    ...metadata,
    Content,
  };
}

export function filterAndSortBlogPosts(posts, locale = 'en') {
  return (posts || [])
    .filter(Boolean)
    .filter((post) => post.published !== false)
    .filter((post) => !locale || post.locale === locale)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function hashTerm(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function slugifyTerm(term) {
  const normalized = String(term || '')
    .toLowerCase()
    .trim();

  if (!normalized) {
    return '';
  }

  const asciiSlug = normalized
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!/[^\x00-\x7f]/.test(normalized)) {
    return asciiSlug;
  }

  const hash = hashTerm(normalized);
  return asciiSlug ? `${asciiSlug}-${hash}` : `term-${hash}`;
}

export function collectCategoriesFromPosts(posts) {
  const counts = new Map();

  (posts || []).forEach((post) => {
    const key = post.category || DEFAULT_CATEGORY;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      slug: slugifyTerm(name),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function collectTagsFromPosts(posts) {
  const counts = new Map();

  (posts || []).forEach((post) => {
    (post.tags || []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      slug: slugifyTerm(name),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterPostsByCategorySlug(posts, categorySlug) {
  return (posts || []).filter(
    (post) => slugifyTerm(post.category || DEFAULT_CATEGORY) === categorySlug
  );
}

export function filterPostsByTagSlug(posts, tagSlug) {
  return (posts || []).filter((post) =>
    (post.tags || []).some((tag) => slugifyTerm(tag) === tagSlug)
  );
}

export function getEffectiveCategory(post) {
  return post?.category || DEFAULT_CATEGORY;
}

export function getBilingualPostSlugs(enPosts, zhPosts) {
  const enSlugs = new Set((enPosts || []).map((post) => post.slug));
  return (zhPosts || []).map((post) => post.slug).filter((slug) => enSlugs.has(slug));
}

export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
