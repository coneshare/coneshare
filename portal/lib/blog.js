import fs from 'node:fs';
import path from 'node:path';
import 'server-only';
import {
  collectCategoriesFromPosts,
  collectTagsFromPosts,
  filterAndSortBlogPosts,
  filterPostsByCategorySlug,
  filterPostsByTagSlug,
  getBilingualPostSlugs,
  getEffectiveCategory,
  normalizeBlogPost,
  slugifyTerm,
} from './blog-utils';

const BLOG_ROOT_DIR = path.join(process.cwd(), 'content', 'blog');

function getBlogDir(locale = 'en') {
  return locale === 'zh' ? path.join(BLOG_ROOT_DIR, 'zh') : BLOG_ROOT_DIR;
}

function getBlogSlugs(locale = 'en') {
  const dir = getBlogDir(locale);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.replace(/\.mdx$/, ''));
}

async function importBlogModule(slug, locale = 'en') {
  try {
    const blogModule =
      locale === 'zh'
        ? await import(`../content/blog/zh/${slug}.mdx`)
        : await import(`../content/blog/${slug}.mdx`);
    return normalizeBlogPost(slug, blogModule.metadata || {}, blogModule.default, locale);
  } catch {
    return null;
  }
}

export async function getBlogPostBySlug(slug, locale = 'en') {
  const post = await importBlogModule(slug, locale);
  if (post && post.locale === locale) {
    return post;
  }
  return null;
}

export async function getAllBlogPosts(locale = 'en') {
  const slugs = getBlogSlugs(locale);
  const posts = await Promise.all(slugs.map((slug) => importBlogModule(slug, locale)));
  return filterAndSortBlogPosts(posts, locale);
}

export async function getBilingualBlogSlugs() {
  const [enPosts, zhPosts] = await Promise.all([
    getAllBlogPosts('en'),
    getAllBlogPosts('zh'),
  ]);
  return getBilingualPostSlugs(enPosts, zhPosts);
}

export { slugifyTerm, getEffectiveCategory };

export async function getAllCategories(locale = 'en') {
  const posts = await getAllBlogPosts(locale);
  return collectCategoriesFromPosts(posts);
}

export async function getAllTags(locale = 'en') {
  const posts = await getAllBlogPosts(locale);
  return collectTagsFromPosts(posts);
}

export async function getPostsByCategorySlug(categorySlug, locale = 'en') {
  const posts = await getAllBlogPosts(locale);
  return filterPostsByCategorySlug(posts, categorySlug);
}

export async function getPostsByTagSlug(tagSlug, locale = 'en') {
  const posts = await getAllBlogPosts(locale);
  return filterPostsByTagSlug(posts, tagSlug);
}
