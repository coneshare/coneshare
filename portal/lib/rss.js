const DEFAULT_SITE_URL = 'https://www.coneshare.com';

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildBlogRssXml(posts = [], siteUrl = DEFAULT_SITE_URL) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '');
  const feedUrl = `${normalizedSiteUrl}/blog/rss.xml`;
  const blogUrl = `${normalizedSiteUrl}/blog`;

  const latestDate =
    posts.length > 0 && posts[0]?.date
      ? new Date(posts[0].date).toUTCString()
      : new Date().toUTCString();

  const itemsXml = posts
    .map((post) => {
      const postUrl = `${normalizedSiteUrl}/blog/${encodeURIComponent(post.slug)}`;
      const pubDate = post.date ? new Date(post.date).toUTCString() : latestDate;
      const categories = [
        ...(post.category ? [post.category] : []),
        ...(Array.isArray(post.tags) ? post.tags : []),
      ];
      const uniqueCategories = Array.from(new Set(categories));
      const categoriesXml = uniqueCategories
        .map((cat) => `      <category>${escapeXml(cat)}</category>`)
        .join('\n');

      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(postUrl)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>`,
        `      <description>${escapeXml(post.description || '')}</description>`,
        `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
        categoriesXml,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Coneshare Blog</title>',
    `    <link>${escapeXml(blogUrl)}</link>`,
    '    <description>Release notes, product updates, and practical guides for secure document sharing, dataroom workflows, and activity automation.</description>',
    '    <language>en-us</language>',
    `    <lastBuildDate>${escapeXml(latestDate)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    itemsXml,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}
