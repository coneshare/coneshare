import { getAllBlogPosts } from '../../../../lib/blog';
import { buildBlogRssXml } from '../../../../lib/rss';

export const dynamic = 'force-static';

export async function GET() {
  const posts = await getAllBlogPosts('zh');
  const xml = buildBlogRssXml(posts, undefined, { locale: 'zh' });

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
