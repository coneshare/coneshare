import Link from 'next/link';
import { Globe } from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  getAllBlogPosts,
  getAllCategories,
  getAllTags,
  getBlogPostBySlug,
  getEffectiveCategory,
  getPostsByCategorySlug,
  getPostsByTagSlug,
  slugifyTerm,
} from '../lib/blog';
import { serializeJsonLd } from '../lib/blog-utils';
import BlogToc from './BlogToc';

const SITE_URL = 'https://www.coneshare.com';

const BLOG_COPY = {
  en: {
    basePath: '/blog',
    dateLocale: 'en-US',
    blogName: 'Coneshare Blog',
    indexTitle: 'Blog | Coneshare',
    indexDescription:
      'Product updates and release notes from Coneshare, including document and dataroom activity automation updates.',
    indexSubtitle:
      'Release notes, product updates, and practical guides for secure document sharing, dataroom workflows, and activity automation.',
    readMore: 'Read more',
    backToBlog: '← Back to Blog',
    switchLocalePost: '阅读中文版',
    notFoundTitle: 'Blog Post Not Found | Coneshare',
    notFoundDescription: 'Browse Coneshare release notes and blog updates.',
    categoryNotFoundTitle: 'Category Not Found | Coneshare Blog',
    categoryNotFoundDescription: 'Browse Coneshare blog categories.',
    categoryHeading: (name) => `Category: ${name}`,
    categoryDescription: (name) => `Browse Coneshare blog posts in the ${name} category.`,
    categoryCount: (count) => `${count} post${count === 1 ? '' : 's'} in this category.`,
    tagNotFoundTitle: 'Tag Not Found | Coneshare Blog',
    tagNotFoundDescription: 'Browse Coneshare blog tags.',
    tagHeading: (name) => `Tag: ${name}`,
    tagDescription: (name) => `Browse Coneshare blog posts tagged ${name}.`,
    tagCount: (count) => `${count} post${count === 1 ? '' : 's'} with this tag.`,
    discussReleaseTitle: 'Discuss This Release',
    discussTopicTitle: 'Discuss This Topic',
    discussReleaseBody: 'Share your automation workflow and feedback in the Coneshare forum.',
    discussTopicBody: 'Share your questions, deployment notes, and feedback in the Coneshare forum.',
    joinDiscussion: 'Join the discussion',
    relatedPosts: 'Related Posts',
  },
  zh: {
    basePath: '/zh/blog',
    dateLocale: 'zh-CN',
    blogName: 'Coneshare 博客',
    indexTitle: '博客 | Coneshare',
    indexDescription:
      'Coneshare 产品更新、虚拟资料室实践、远程 MCP 集成与文档安全分享指南。',
    indexSubtitle:
      '分享安全文档外发、虚拟资料室管理、远程 MCP 与自托管部署的实践指南与产品动态。',
    readMore: '阅读全文',
    backToBlog: '← 返回博客',
    switchLocalePost: 'Read in English',
    notFoundTitle: '未找到文章 | Coneshare 博客',
    notFoundDescription: '浏览 Coneshare 中文实践指南与产品文章。',
    categoryNotFoundTitle: '未找到分类 | Coneshare 博客',
    categoryNotFoundDescription: '浏览 Coneshare 博客文章分类。',
    categoryHeading: (name) => `分类：${name}`,
    categoryDescription: (name) => `浏览「${name}」分类下的 Coneshare 博客文章。`,
    categoryCount: (count) => `该分类下共有 ${count} 篇文章。`,
    tagNotFoundTitle: '未找到标签 | Coneshare 博客',
    tagNotFoundDescription: '浏览 Coneshare 博客标签。',
    tagHeading: (name) => `标签：${name}`,
    tagDescription: (name) => `浏览包含「${name}」标签的 Coneshare 博客文章。`,
    tagCount: (count) => `共有 ${count} 篇包含该标签的文章。`,
    discussReleaseTitle: '讨论此版本',
    discussTopicTitle: '参与讨论',
    discussReleaseBody: '欢迎在 Coneshare 社区论坛分享你的使用反馈与工作流实践。',
    discussTopicBody: '欢迎在 Coneshare 社区论坛交流部署经验、使用疑问与产品建议。',
    joinDiscussion: '前往社区讨论',
    relatedPosts: '相关文章',
  },
};

function JsonLdScript({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

function getCopy(locale = 'en') {
  return locale === 'zh' ? BLOG_COPY.zh : BLOG_COPY.en;
}

function formatDate(dateStr, dateLocale) {
  return new Date(dateStr).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function getPublishedAlternatePostPath(post, locale) {
  const alternateLocale = locale === 'zh' ? 'en' : 'zh';
  const alternatePost = await getBlogPostBySlug(post.slug, alternateLocale);
  if (!alternatePost || alternatePost.published === false) {
    return null;
  }
  const alternateCopy = getCopy(alternateLocale);
  return `${alternateCopy.basePath}/${alternatePost.slug}`;
}

export function buildBlogIndexMetadata(locale = 'en') {
  const copy = getCopy(locale);
  return {
    title: copy.indexTitle,
    description: copy.indexDescription,
    alternates: {
      canonical: `${SITE_URL}${copy.basePath}`,
      languages: {
        en: `${SITE_URL}/blog`,
        'zh-CN': `${SITE_URL}/zh/blog`,
      },
      types: {
        'application/rss+xml': `${SITE_URL}${copy.basePath}/rss.xml`,
      },
    },
  };
}

export async function buildBlogPostMetadata(slug, locale = 'en') {
  const copy = getCopy(locale);
  const post = await getBlogPostBySlug(slug, locale);

  if (!post) {
    return {
      title: copy.notFoundTitle,
      description: copy.notFoundDescription,
    };
  }

  const canonical = `${SITE_URL}${copy.basePath}/${post.slug}`;
  const alternatePath = await getPublishedAlternatePostPath(post, locale);
  const alternates = {
    canonical,
    ...(alternatePath
      ? {
          languages: {
            en: `${SITE_URL}/blog/${post.slug}`,
            'zh-CN': `${SITE_URL}/zh/blog/${post.slug}`,
          },
        }
      : {}),
  };

  return {
    title: `${post.title} | ${copy.blogName}`,
    description: post.description,
    alternates,
    openGraph: {
      title: post.title,
      description: post.description,
      url: canonical,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export async function buildBlogCategoryMetadata(slug, locale = 'en') {
  const copy = getCopy(locale);
  const categories = await getAllCategories(locale);
  const category = categories.find((item) => item.slug === slug);

  if (!category) {
    return {
      title: copy.categoryNotFoundTitle,
      description: copy.categoryNotFoundDescription,
    };
  }

  return {
    title: `${category.name} | ${copy.blogName}`,
    description: copy.categoryDescription(category.name),
    alternates: {
      canonical: `${SITE_URL}${copy.basePath}/category/${category.slug}`,
    },
  };
}

export async function buildBlogTagMetadata(slug, locale = 'en') {
  const copy = getCopy(locale);
  const tags = await getAllTags(locale);
  const tag = tags.find((item) => item.slug === slug);

  if (!tag) {
    return {
      title: copy.tagNotFoundTitle,
      description: copy.tagNotFoundDescription,
    };
  }

  return {
    title: `${tag.name} | ${copy.blogName}`,
    description: copy.tagDescription(tag.name),
    alternates: {
      canonical: `${SITE_URL}${copy.basePath}/tag/${tag.slug}`,
    },
  };
}

export async function BlogIndexView({ locale = 'en' }) {
  const copy = getCopy(locale);
  const [posts, categories] = await Promise.all([
    getAllBlogPosts(locale),
    getAllCategories(locale),
  ]);

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {copy.blogName}
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">{copy.indexSubtitle}</p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8">
          {categories.length > 0 && (
            <section>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`${copy.basePath}/category/${category.slug}`}
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
                <time dateTime={post.date}>{formatDate(post.date, copy.dateLocale)}</time>
                <Link
                  href={`${copy.basePath}/category/${slugifyTerm(getEffectiveCategory(post))}`}
                  className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  {getEffectiveCategory(post)}
                </Link>
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">
                <Link href={`${copy.basePath}/${post.slug}`} className="hover:text-gray-700">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">{post.description}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {(post.tags || []).map((tag) => (
                  <Link
                    key={tag}
                    href={`${copy.basePath}/tag/${slugifyTerm(tag)}`}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
              <p className="mt-6">
                <Link
                  href={`${copy.basePath}/${post.slug}`}
                  className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                  {copy.readMore} <span aria-hidden="true">→</span>
                </Link>
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function BlogPostView({ slug, locale = 'en' }) {
  const copy = getCopy(locale);
  const post = await getBlogPostBySlug(slug, locale);

  if (!post) {
    notFound();
  }

  const postUrl = `${SITE_URL}${copy.basePath}/${post.slug}`;
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
    mainEntityOfPage: postUrl,
  };

  const PostContent = post.Content;
  const [allPosts, alternatePostPath] = await Promise.all([
    getAllBlogPosts(locale),
    getPublishedAlternatePostPath(post, locale),
  ]);
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
        <Link href={copy.basePath} className="text-sm font-semibold text-gray-900 hover:text-gray-700">
          {copy.backToBlog}
        </Link>

        <div className="mt-6 lg:flex lg:items-start lg:gap-14">
          <main className="min-w-0 flex-1 max-w-4xl">
            <article>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-500">
                <time dateTime={post.date}>{formatDate(post.date, copy.dateLocale)}</time>
                <Link
                  href={`${copy.basePath}/category/${slugifyTerm(currentCategory)}`}
                  className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  {currentCategory}
                </Link>
                {alternatePostPath && (
                  <Link
                    href={alternatePostPath}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
                  >
                    <Globe className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    <span>{copy.switchLocalePost}</span>
                  </Link>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {post.title}
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">{post.description}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {(post.tags || []).map((tag) => (
                  <Link
                    key={tag}
                    href={`${copy.basePath}/tag/${slugifyTerm(tag)}`}
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
                {isReleasePost ? copy.discussReleaseTitle : copy.discussTopicTitle}
              </h2>
              <p className="mt-4 text-base text-gray-600">
                {isReleasePost ? copy.discussReleaseBody : copy.discussTopicBody}
              </p>
              <p className="mt-6">
                <Link
                  href="https://github.com/orgs/coneshare/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                  {copy.joinDiscussion} <span aria-hidden="true">→</span>
                </Link>
              </p>
            </div>

            {relatedPosts.length > 0 && (
              <div className="mt-10 rounded-2xl border border-gray-200 bg-white px-8 py-8">
                <h2 className="text-xl font-bold tracking-tight text-gray-900">{copy.relatedPosts}</h2>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {relatedPosts.map((related) => (
                    <Link
                      key={related.slug}
                      href={`${copy.basePath}/${related.slug}`}
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
          <BlogToc locale={locale} />
        </div>
        <JsonLdScript data={articleJsonLd} />
      </div>
    </div>
  );
}

export async function BlogCategoryView({ slug, locale = 'en' }) {
  const copy = getCopy(locale);
  const categories = await getAllCategories(locale);
  const category = categories.find((item) => item.slug === slug);

  if (!category) {
    notFound();
  }

  const posts = await getPostsByCategorySlug(slug, locale);
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${copy.blogName} ${copy.categoryHeading(category.name)}`,
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${copy.basePath}/${post.slug}`,
      name: post.title,
      description: post.description,
    })),
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <Link href={copy.basePath} className="text-sm font-semibold text-gray-900 hover:text-gray-700">
          {copy.backToBlog}
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {copy.categoryHeading(category.name)}
        </h1>
        <p className="mt-3 text-base text-gray-600">{copy.categoryCount(posts.length)}</p>

        <div className="mt-10 grid grid-cols-1 gap-8">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-gray-200 p-8 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                <time dateTime={post.date}>{formatDate(post.date, copy.dateLocale)}</time>
                <Link
                  href={`${copy.basePath}/category/${slug}`}
                  className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  {getEffectiveCategory(post)}
                </Link>
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
                <Link href={`${copy.basePath}/${post.slug}`} className="hover:text-gray-700">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">{post.description}</p>
              <p className="mt-6">
                <Link
                  href={`${copy.basePath}/${post.slug}`}
                  className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                  {copy.readMore} <span aria-hidden="true">→</span>
                </Link>
              </p>
            </article>
          ))}
        </div>

        <JsonLdScript data={itemListJsonLd} />
      </div>
    </div>
  );
}

export async function BlogTagView({ slug, locale = 'en' }) {
  const copy = getCopy(locale);
  const tags = await getAllTags(locale);
  const tag = tags.find((item) => item.slug === slug);

  if (!tag) {
    notFound();
  }

  const posts = await getPostsByTagSlug(slug, locale);
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${copy.blogName} ${copy.tagHeading(tag.name)}`,
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${copy.basePath}/${post.slug}`,
      name: post.title,
      description: post.description,
    })),
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <Link href={copy.basePath} className="text-sm font-semibold text-gray-900 hover:text-gray-700">
          {copy.backToBlog}
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {copy.tagHeading(tag.name)}
        </h1>
        <p className="mt-3 text-base text-gray-600">{copy.tagCount(posts.length)}</p>

        <div className="mt-10 grid grid-cols-1 gap-8">
          {posts.map((post) => (
            <article key={post.slug} className="rounded-2xl border border-gray-200 p-8 shadow-sm">
              <time dateTime={post.date} className="text-sm text-gray-500">
                {formatDate(post.date, copy.dateLocale)}
              </time>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">
                <Link href={`${copy.basePath}/${post.slug}`} className="hover:text-gray-700">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">{post.description}</p>
              <p className="mt-6">
                <Link
                  href={`${copy.basePath}/${post.slug}`}
                  className="text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                  {copy.readMore} <span aria-hidden="true">→</span>
                </Link>
              </p>
            </article>
          ))}
        </div>

        <JsonLdScript data={itemListJsonLd} />
      </div>
    </div>
  );
}
