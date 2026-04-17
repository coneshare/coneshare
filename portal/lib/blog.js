import fs from 'node:fs';
import path from 'node:path';
import 'server-only';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

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
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
