import { describe, it, expect } from 'vitest';
import { escapeXml, buildBlogRssXml } from '../../lib/rss';

describe('portal/lib/rss Module', () => {
  it('escapes XML special characters safely', () => {
    expect(escapeXml('A & B < C > "D" \'E\'')).toBe(
      'A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;'
    );
  });

  it('builds valid RSS 2.0 XML with absolute canonical URLs and categories', () => {
    const posts = [
      {
        slug: 'why-self-hosted-vdr-matters',
        title: 'Why Self-Hosted VDR & Security Matters',
        description: 'A guide to self-hosted VDRs <with control>.',
        date: '2026-06-07',
        category: 'Self-Hosting',
        tags: ['Self-Hosting', 'Security & Privacy'],
      },
    ];

    const xml = buildBlogRssXml(posts, 'https://www.coneshare.com');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<atom:link href="https://www.coneshare.com/blog/rss.xml" rel="self" type="application/rss+xml" />'
    );
    expect(xml).toContain('<title>Why Self-Hosted VDR &amp; Security Matters</title>');
    expect(xml).toContain('<link>https://www.coneshare.com/blog/why-self-hosted-vdr-matters</link>');
    expect(xml).toContain(
      '<guid isPermaLink="true">https://www.coneshare.com/blog/why-self-hosted-vdr-matters</guid>'
    );
    expect(xml).toContain('<description>A guide to self-hosted VDRs &lt;with control&gt;.</description>');
    expect(xml).toContain('<category>Self-Hosting</category>');
    expect(xml).toContain('<category>Security &amp; Privacy</category>');
  });

  it('builds localized Chinese RSS 2.0 XML with /zh/blog URLs', () => {
    const posts = [
      {
        slug: 'centralize-ai-conversations-across-tools-coneshare-mcp',
        title: '用 ConeShare MCP 集中管理多工具 AI 对话',
        description: '把分散在不同 AI 工具里的研究沉淀统一保存。',
        date: '2026-11-21',
        category: 'AI 工作流',
        tags: ['MCP', 'AI 工作流'],
      },
    ];

    const xml = buildBlogRssXml(posts, 'https://www.coneshare.com', { locale: 'zh' });

    expect(xml).toContain('<language>zh-cn</language>');
    expect(xml).toContain('<link>https://www.coneshare.com/zh/blog</link>');
    expect(xml).toContain(
      '<atom:link href="https://www.coneshare.com/zh/blog/rss.xml" rel="self" type="application/rss+xml" />'
    );
    expect(xml).toContain(
      '<link>https://www.coneshare.com/zh/blog/centralize-ai-conversations-across-tools-coneshare-mcp</link>'
    );
    expect(xml).toContain(
      '<guid isPermaLink="true">https://www.coneshare.com/zh/blog/centralize-ai-conversations-across-tools-coneshare-mcp</guid>'
    );
  });
});
