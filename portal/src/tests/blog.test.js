import { describe, it, expect } from 'vitest';
import {
  collectCategoriesFromPosts,
  collectTagsFromPosts,
  filterAndSortBlogPosts,
  filterPostsByCategorySlug,
  filterPostsByTagSlug,
  getBilingualPostSlugs,
  normalizeBlogPost,
  serializeJsonLd,
  slugifyTerm,
} from '../../lib/blog-utils';

const samplePosts = [
  normalizeBlogPost(
    'centralize-ai-conversations-across-tools-coneshare-mcp',
    {
      title: 'Centralize AI Conversations with ConeShare MCP',
      description: 'EN post',
      date: '2026-11-21',
      category: 'Guides',
      tags: ['MCP Server', 'AI Agents'],
    },
    null,
    'en'
  ),
  normalizeBlogPost(
    'centralize-ai-conversations-across-tools-coneshare-mcp',
    {
      title: '集中管理你的 AI 对话记录',
      description: 'ZH post',
      date: '2026-11-21',
      category: 'Guides',
      tags: ['MCP Server', 'Self-Hosted'],
    },
    null,
    'zh'
  ),
  normalizeBlogPost(
    'how-to-receive-large-files-securely-from-clients-self-hosted-guide',
    {
      title: '未发布草稿',
      description: 'Draft ZH post',
      date: '2026-05-24',
      published: false,
      category: 'Guides',
      tags: ['File Requests'],
    },
    null,
    'zh'
  ),
  normalizeBlogPost(
    'dataroom-guide-when-to-use',
    {
      title: 'ConeShare 资料室（Dataroom）介绍与使用指南',
      description: 'ZH guide',
      date: '2026-11-20',
      category: 'Product',
      tags: ['Datarooms'],
    },
    null,
    'zh'
  ),
];

describe('portal/lib/blog Locale Filtering & Normalization', () => {
  it('returns only published English posts for en locale', () => {
    const enPosts = filterAndSortBlogPosts(samplePosts, 'en');
    expect(enPosts.map((p) => p.slug)).toEqual([
      'centralize-ai-conversations-across-tools-coneshare-mcp',
    ]);
    expect(enPosts[0].locale).toBe('en');
  });

  it('returns only published Chinese posts for zh locale using matching clean slugs', () => {
    const zhPosts = filterAndSortBlogPosts(samplePosts, 'zh');
    expect(zhPosts.map((p) => ({ slug: p.slug, locale: p.locale }))).toEqual([
      {
        slug: 'centralize-ai-conversations-across-tools-coneshare-mcp',
        locale: 'zh',
      },
      {
        slug: 'dataroom-guide-when-to-use',
        locale: 'zh',
      },
    ]);
  });

  it('aggregates and filters categories and tags per locale', () => {
    const enPosts = filterAndSortBlogPosts(samplePosts, 'en');
    const zhPosts = filterAndSortBlogPosts(samplePosts, 'zh');

    expect(collectCategoriesFromPosts(enPosts).map((c) => c.slug)).toEqual(['guides']);
    expect(collectCategoriesFromPosts(zhPosts).map((c) => c.slug)).toEqual(['guides', 'product']);

    expect(collectTagsFromPosts(enPosts).map((t) => t.slug)).toEqual(['ai-agents', 'mcp-server']);
    expect(collectTagsFromPosts(zhPosts).map((t) => t.slug)).toEqual([
      'datarooms',
      'mcp-server',
      'self-hosted',
    ]);

    expect(filterPostsByCategorySlug(zhPosts, 'guides')).toHaveLength(1);
    expect(filterPostsByTagSlug(zhPosts, 'ai-agents')).toHaveLength(0);
    expect(filterPostsByTagSlug(zhPosts, 'datarooms')).toHaveLength(1);
  });

  it('produces non-empty, collision-free slugs for Chinese and mixed-script terms while preserving ASCII slugs', () => {
    expect(slugifyTerm('Guides')).toBe('guides');
    expect(slugifyTerm('Security & Privacy')).toBe('security-and-privacy');

    const zhOnlyA = slugifyTerm('使用指南');
    const zhOnlyB = slugifyTerm('虚拟资料室');
    expect(zhOnlyA).toMatch(/^term-[0-9a-f]{8}$/);
    expect(zhOnlyB).toMatch(/^term-[0-9a-f]{8}$/);
    expect(zhOnlyA).not.toBe(zhOnlyB);

    const mixedA = slugifyTerm('AI 工作流');
    const mixedB = slugifyTerm('AI 工具');
    expect(mixedA).toMatch(/^ai-[0-9a-f]{8}$/);
    expect(mixedB).toMatch(/^ai-[0-9a-f]{8}$/);
    expect(mixedA).not.toBe(mixedB);
  });

  it('identifies published bilingual post slugs across locales', () => {
    const enPosts = filterAndSortBlogPosts(samplePosts, 'en');
    const zhPosts = filterAndSortBlogPosts(samplePosts, 'zh');
    expect(getBilingualPostSlugs(enPosts, zhPosts)).toEqual([
      'centralize-ai-conversations-across-tools-coneshare-mcp',
    ]);
  });

  it('escapes "<" in JSON-LD serialization to prevent closing script tag injection', () => {
    const serialized = serializeJsonLd({
      headline: 'XSS </script><script>alert(1)</script> Guide',
    });
    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });
});
