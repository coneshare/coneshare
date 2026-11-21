import { BlogIndexView, buildBlogIndexMetadata } from '../../../components/BlogViews';

export const metadata = buildBlogIndexMetadata('zh');

export default function ZhBlogPage() {
  return <BlogIndexView locale="zh" />;
}
