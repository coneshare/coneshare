import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllBlogPosts, getBlogPostBySlug, getEffectiveCategory, slugifyTerm } from '../../../lib/blog';
import BlogToc from '../../../components/BlogToc';

const SITE_URL = 'https://www.coneshare.com';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: 'Blog Post Not Found | Coneshare',
      description: 'Browse Coneshare release notes and blog updates.',
    };
  }

  return {
    title: `${post.title} | Coneshare Blog`,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      '@type': 'Organization',
      name: 'Coneshare',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Coneshare',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.svg`,
      },
    },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  const PostContent = post.Content;
  const allPosts = await getAllBlogPosts();
  const currentCategory = getEffectiveCategory(post);
  const currentTags = new Set(post.tags || []);
  const isReleasePost = currentCategory === 'Releases';

  const relatedPosts = allPosts
    .filter((item) => item.slug !== post.slug)
    .map((item) => {
      const sameCategory = getEffectiveCategory(item) === currentCategory ? 1 : 0;
      const tagOverlap = (item.tags || []).filter((tag) => currentTags.has(tag)).length;
      const score = sameCategory * 100 + tagOverlap * 10 + new Date(item.date).getTime() / 1e13;
      return { item, score, sameCategory, tagOverlap };
    })
    .filter((entry) => entry.sameCategory || entry.tagOverlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.item);

  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Link href="/blog" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
          ← Back to Blog
        </Link>

        <div className="mt-6 lg:flex lg:items-start lg:gap-14">
          <main className="min-w-0 flex-1 max-w-4xl">
            <article>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <Link
                  href={`/blog/category/${slugifyTerm(currentCategory)}`}
                  className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  {currentCategory}
                </Link>
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{post.title}</h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">{post.description}</p>

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

              <div className="js-blog-content prose prose-lg mt-10 max-w-none text-gray-700">
                <PostContent />
              </div>
            </article>

            <div className="mt-14 rounded-2xl border border-gray-200 bg-gray-50 px-8 py-10">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {isReleasePost ? 'Discuss This Release' : 'Discuss This Topic'}
              </h2>
              <p className="mt-4 text-base text-gray-600">
                {isReleasePost
                  ? 'Share your automation workflow and feedback in the Coneshare forum.'
                  : 'Share your questions, deployment notes, and feedback in the Coneshare forum.'}
              </p>
              <p className="mt-6">
                <Link
                  href="https://github.com/orgs/coneshare/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                  Join the discussion <span aria-hidden="true">→</span>
                </Link>
              </p>
            </div>

            {relatedPosts.length > 0 && (
              <div className="mt-10 rounded-2xl border border-gray-200 bg-white px-8 py-8">
                <h2 className="text-xl font-bold tracking-tight text-gray-900">Related Posts</h2>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {relatedPosts.map((related) => (
                    <Link
                      key={related.slug}
                      href={`/blog/${related.slug}`}
                      className="rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300"
                    >
                      <p className="text-sm font-semibold text-gray-900">{related.title}</p>
                      <p className="mt-2 text-sm text-gray-600">{related.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </main>
          <BlogToc />
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      </div>
    </div>
  );
}
