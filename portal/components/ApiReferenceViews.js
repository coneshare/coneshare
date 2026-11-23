import catalog from '../lib/openapi-public.json';
import ApiReferenceClient from './ApiReferenceClient';

const SITE_URL = 'https://www.coneshare.com';

export function buildApiReferenceMetadata(locale = 'en') {
  const isZh = locale === 'zh';
  const basePath = isZh ? '/zh/api-reference' : '/api-reference';
  const canonical = `${SITE_URL}${basePath}`;
  const title = isZh ? 'API 参考文档 | Coneshare' : 'API Reference | Coneshare';
  const description = isZh
    ? 'Coneshare REST API 开发文档：使用 API Key 管理文档、虚拟资料室、安全分享链接、阅读统计与 Webhook 自动化。'
    : 'Developer REST API reference for Coneshare documents, datarooms, share links, analytics, file requests, and webhooks.';

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: `${SITE_URL}/api-reference`,
        'zh-CN': `${SITE_URL}/zh/api-reference`,
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

export function ApiReferenceView({ locale = 'en' }) {
  return <ApiReferenceClient catalog={catalog} locale={locale} />;
}
