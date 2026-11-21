import { getAllCategories } from '../../../../../lib/blog';
import { BlogCategoryView, buildBlogCategoryMetadata } from '../../../../../components/BlogViews';

export async function generateStaticParams() {
  const categories = await getAllCategories('zh');
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildBlogCategoryMetadata(slug, 'zh');
}

export default async function ZhBlogCategoryPage({ params }) {
  const { slug } = await params;
  return <BlogCategoryView slug={slug} locale="zh" />;
}
