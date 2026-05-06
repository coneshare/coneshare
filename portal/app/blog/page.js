import Link from 'next/link';
import { getAllBlogPosts, getAllCategories, getAllTags, getEffectiveCategory, slugifyTerm } from '../../lib/blog';

export const metadata = {
  title: 'Blog | Coneshare',
  description: 'Product updates and release notes from Coneshare, including document and dataroom activity automation updates.',
  alternates: {
    canonical: '/blog',
  },
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPage() {
  const [posts, categories, tags] = await Promise.all([
    getAllBlogPosts(),
    getAllCategories(),
    getAllTags(),
  ]);

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Coneshare Blog</h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Release notes, product updates, and practical guides for secure document sharing, dataroom workflows, and activity automation.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8">
          {categories.length > 0 && (
            <section>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/blog/category/${category.slug}`}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-400"
                  >
                    {category.name} ({category.count})
                  </Link>
                ))}
              </div>
            </section>
          )}

          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-gray-200 p-8 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <Link
                  href={`/blog/category/${slugifyTerm(getEffectiveCategory(post))}`}
                  className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  {getEffectiveCategory(post)}
                </Link>
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">
                <Link href={`/blog/${post.slug}`} className="hover:text-gray-700">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">{post.description}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {(post.tags || []).map((tag) => (
                  <Link
                    key={tag}
                    href={`/blog/tag/${slugifyTerm(tag)}`}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
              <p className="mt-6">
                <Link href={`/blog/${post.slug}`} className="text-sm font-semibold text-gray-900 hover:text-gray-700">
                  Read more <span aria-hidden="true">→</span>
                </Link>
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
