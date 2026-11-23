import DemoClient from './DemoClient';

export function buildDemoMetadata(locale = 'en') {
  const isZh = locale === 'zh';
  const canonical = isZh ? '/zh/demo' : '/demo';
  const title = isZh ? '在线演示 | Coneshare' : 'Live Demo | Coneshare';
  const description = isZh
    ? '访问 Coneshare 在线演示环境，实测文档分享安全管控、逐页阅读统计、动态水印与自动化工作流。'
    : 'Access the Coneshare live demo to explore real-time document tracking and workflow automation.';

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: '/demo',
        'zh-CN': '/zh/demo',
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  };
}

export function DemoView({ locale = 'en' }) {
  return <DemoClient locale={locale} />;
}
