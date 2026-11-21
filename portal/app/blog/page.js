import { BlogIndexView, buildBlogIndexMetadata } from '../../components/BlogViews';

export const metadata = buildBlogIndexMetadata('en');

export default function BlogPage() {
  return <BlogIndexView locale="en" />;
}
