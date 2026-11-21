import { getAllBlogPosts } from '../../../../lib/blog';
import { BlogPostView, buildBlogPostMetadata } from '../../../../components/BlogViews';

export async function generateStaticParams() {
  const posts = await getAllBlogPosts('zh');
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildBlogPostMetadata(slug, 'zh');
}

export default async function ZhBlogPostPage({ params }) {
  const { slug } = await params;
  return <BlogPostView slug={slug} locale="zh" />;
}
