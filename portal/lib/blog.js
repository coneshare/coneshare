import fs from 'node:fs';
import path from 'node:path';
import 'server-only';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');
const DEFAULT_CATEGORY = 'General';

function getBlogSlugs() {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.replace(/\.mdx$/, ''));
}

export async function getBlogPostBySlug(slug) {
  try {
    const module = await import(`../content/blog/${slug}.mdx`);
    const metadata = module.metadata || {};

    return {
      slug,
      ...metadata,
      Content: module.default,
    };
  } catch {
    return null;
  }
}

export async function getAllBlogPosts() {
  const slugs = getBlogSlugs();
  const posts = await Promise.all(slugs.map((slug) => getBlogPostBySlug(slug)));

  return posts
    .filter(Boolean)
    .filter((post) => post.published !== false)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function slugifyTerm(term) {
  return String(term || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getAllCategories() {
  const posts = await getAllBlogPosts();
  const counts = new Map();

  posts.forEach((post) => {
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

export async function getAllTags() {
  const posts = await getAllBlogPosts();
  const counts = new Map();

  posts.forEach((post) => {
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

export async function getPostsByCategorySlug(categorySlug) {
  const posts = await getAllBlogPosts();
  return posts.filter((post) => slugifyTerm(post.category || DEFAULT_CATEGORY) === categorySlug);
}

export async function getPostsByTagSlug(tagSlug) {
  const posts = await getAllBlogPosts();
  return posts.filter((post) => (post.tags || []).some((tag) => slugifyTerm(tag) === tagSlug));
}

export function getEffectiveCategory(post) {
  return post?.category || DEFAULT_CATEGORY;
}
