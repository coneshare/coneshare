import { getAllTags } from '../../../../../lib/blog';
import { BlogTagView, buildBlogTagMetadata } from '../../../../../components/BlogViews';

export async function generateStaticParams() {
  const tags = await getAllTags('zh');
  return tags.map((tag) => ({ slug: tag.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildBlogTagMetadata(slug, 'zh');
}

export default async function ZhBlogTagPage({ params }) {
  const { slug } = await params;
  return <BlogTagView slug={slug} locale="zh" />;
}
