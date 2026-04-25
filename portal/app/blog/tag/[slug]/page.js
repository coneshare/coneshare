import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllTags, getPostsByTagSlug } from '../../../../lib/blog';

const SITE_URL = 'https://www.coneshare.com';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function generateStaticParams() {
  const tags = await getAllTags();
  return tags.map((tag) => ({ slug: tag.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tags = await getAllTags();
  const tag = tags.find((item) => item.slug === slug);

  if (!tag) {
    return {
      title: 'Tag Not Found | Coneshare Blog',
      description: 'Browse Coneshare blog tags.',
    };
  }

  return {
    title: `${tag.name} | Coneshare Blog`,
    description: `Browse Coneshare blog posts tagged ${tag.name}.`,
    alternates: {
      canonical: `/blog/tag/${tag.slug}`,
    },
  };
}

export default async function BlogTagPage({ params }) {
  const { slug } = await params;
  const tags = await getAllTags();
  const tag = tags.find((item) => item.slug === slug);

  if (!tag) {
    notFound();
  }

  const posts = await getPostsByTagSlug(slug);
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Coneshare Blog Tag: ${tag.name}`,
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/blog/${post.slug}`,
      name: post.title,
      description: post.description,
    })),
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <Link href="/blog" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
          ← Back to Blog
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Tag: {tag.name}
        </h1>
        <p className="mt-3 text-base text-gray-600">
          {posts.length} post{posts.length === 1 ? '' : 's'} with this tag.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-gray-200 p-8 shadow-sm">
              <time dateTime={post.date} className="text-sm text-gray-500">
                {formatDate(post.date)}
              </time>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
                <Link href={`/blog/${post.slug}`} className="hover:text-gray-700">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">{post.description}</p>
              <p className="mt-6">
                <Link href={`/blog/${post.slug}`} className="text-sm font-semibold text-gray-900 hover:text-gray-700">
                  Read more <span aria-hidden="true">→</span>
                </Link>
              </p>
            </article>
          ))}
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      </div>
    </div>
  );
}
