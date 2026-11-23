export const HELP_SECTIONS = [
  {
    id: 'getting-started',
    title: {
      en: 'Getting Started',
      zh: '快速入门',
    },
    description: {
      en: 'Learn the core concepts of workspaces, personal folders, and datarooms.',
      zh: '了解个人文档库、工作区与虚拟资料室的基础概念。',
    },
  },
  {
    id: 'sharing-security',
    title: {
      en: 'Sharing & Security',
      zh: '安全分享与权限控制',
    },
    description: {
      en: 'Control link access, expiration, downloads, file versions, and dynamic watermarks.',
      zh: '设置访问密码、邮箱验证、有效期、下载限制、版本更新与动态水印。',
    },
  },
  {
    id: 'datarooms',
    title: {
      en: 'Virtual Datarooms',
      zh: '虚拟资料室 (VDR)',
    },
    description: {
      en: 'Deliver branded multi-file portals with tailored recipient permissions and Q&A.',
      zh: '构建带品牌视觉、分组权限、Q&A 问答与整室打包下载的多文件门户。',
    },
  },
  {
    id: 'file-collection',
    title: {
      en: 'File Requests',
      zh: '文件收集 (File Request)',
    },
    description: {
      en: 'Collect files securely from clients and external partners without email attachments.',
      zh: '通过安全上传链接向外部客户与合作伙伴接收大文件。',
    },
  },
  {
    id: 'analytics-ai',
    title: {
      en: 'Analytics & AI (MCP)',
      zh: '阅读洞察与 AI 连接',
    },
    description: {
      en: 'Inspect page-level engagement telemetry and connect ChatGPT, Gemini, or Claude.',
      zh: '查看逐页阅读停留分析、实时通知，以及通过 MCP 接入 AI 助手。',
    },
  },
];

export const DEFAULT_HELP_SECTION = 'getting-started';

export function getHelpSectionMeta(sectionId, locale = 'en') {
  const section = HELP_SECTIONS.find((item) => item.id === sectionId) || HELP_SECTIONS[0];
  const lang = locale === 'zh' ? 'zh' : 'en';
  return {
    id: section.id,
    title: section.title[lang],
    description: section.description[lang],
  };
}

export function normalizeHelpGuide(slug, metadata = {}, Content = null, locale = 'en') {
  const effectiveLocale =
    metadata?.locale === 'zh' || metadata?.locale === 'en' ? metadata.locale : locale;

  return {
    slug,
    locale: effectiveLocale,
    section: metadata?.section || DEFAULT_HELP_SECTION,
    order: typeof metadata?.order === 'number' ? metadata.order : 999,
    ...metadata,
    Content,
  };
}

export function isPublishedHelpGuide(guide, locale) {
  return Boolean(
    guide &&
      guide.published !== false &&
      (!locale || guide.locale === locale)
  );
}

export function buildHelpLanguageAlternates(siteUrl, slug = '') {
  const suffix = slug ? `/${slug}` : '';
  return {
    en: `${siteUrl}/help${suffix}`,
    'zh-CN': `${siteUrl}/zh/help${suffix}`,
  };
}

export function filterAndSortHelpGuides(guides, locale = 'en') {
  const sectionOrder = new Map(HELP_SECTIONS.map((section, idx) => [section.id, idx]));

  return (guides || [])
    .filter((guide) => isPublishedHelpGuide(guide, locale))
    .sort((a, b) => {
      const secA = sectionOrder.has(a.section) ? sectionOrder.get(a.section) : 999;
      const secB = sectionOrder.has(b.section) ? sectionOrder.get(b.section) : 999;
      if (secA !== secB) return secA - secB;
      if (a.order !== b.order) return a.order - b.order;
      return String(a.title || a.slug).localeCompare(String(b.title || b.slug));
    });
}

export function groupHelpGuidesBySection(guides, locale = 'en') {
  const sorted = filterAndSortHelpGuides(guides, locale);
  const grouped = new Map();

  sorted.forEach((guide) => {
    const key = HELP_SECTIONS.some((s) => s.id === guide.section)
      ? guide.section
      : DEFAULT_HELP_SECTION;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(guide);
  });

  return HELP_SECTIONS.map((section) => ({
    ...getHelpSectionMeta(section.id, locale),
    guides: grouped.get(section.id) || [],
  })).filter((group) => group.guides.length > 0);
}

export function getPrevNextGuides(guides, currentSlug) {
  const list = guides || [];
  const idx = list.findIndex((item) => item.slug === currentSlug);
  if (idx === -1) {
    return { prevGuide: null, nextGuide: null };
  }

  return {
    prevGuide: idx > 0 ? list[idx - 1] : null,
    nextGuide: idx < list.length - 1 ? list[idx + 1] : null,
  };
}

export function getBilingualHelpSlugs(enGuides = [], zhGuides = []) {
  const enSlugs = new Set((enGuides || []).map((guide) => guide.slug));
  return (zhGuides || [])
    .filter((guide) => enSlugs.has(guide.slug))
    .map((guide) => guide.slug);
}
