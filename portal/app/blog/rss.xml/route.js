import { getAllBlogPosts } from '../../../lib/blog';
import { buildBlogRssXml } from '../../../lib/rss';

export const dynamic = 'force-static';

export async function GET() {
  const posts = await getAllBlogPosts();
  const xml = buildBlogRssXml(posts);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
