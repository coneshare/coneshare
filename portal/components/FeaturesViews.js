import Link from 'next/link';
import { notFound } from 'next/navigation';
import { features } from '../lib/content';
import { serializeJsonLd } from '../lib/blog-utils';
import { FEATURE_LAYER_GROUPS_ZH, getLocalizedFeature } from '../lib/content-zh';

const SITE_URL = 'https://www.coneshare.com';

const LAYER_GROUPS_EN = [
  {
    key: 'control',
    title: 'Control Layer',
    description: 'Add controlled sharing for sensitive external distribution.',
    slugs: ['secure-sharing', 'dynamic-watermarking', 'online-document-preview', 'file-requests'],
  },
  {
    key: 'intelligence',
    title: 'Intelligence Layer',
    description: 'Understand document and data room engagement with measurable usage signals.',
    slugs: ['advanced-analytics', 'virtual-data-rooms'],
  },
  {
    key: 'action',
    title: 'Action Layer',
    description: 'Turn engagement signals into team workflows and timely follow-ups.',
    slugs: ['workflow-automation-integration'],
  },
  {
    key: 'foundation',
    title: 'Foundation Layer',
    description: 'Connect your storage stack and run Coneshare in your preferred infrastructure model.',
    slugs: ['cloud-storage-integration', 'self-hosted'],
  },
];

const FEATURE_COPY = {
  en: {
    basePath: '/features',
    indexTitle: 'Features | Coneshare',
    indexDescription:
      'Explore Coneshare features that add secure control, engagement intelligence, and workflow actions to existing document workflows.',
    indexKeywords: [
      'document control and intelligence layer',
      'nextcloud vdr layer',
      'secure document sharing features',
      'dataroom security features',
      'document engagement analytics',
      'workflow automation features',
      'self-hosted document platform',
    ],
    heroEyebrow: 'Core Features',
    heroTitle: 'A control and intelligence layer for your documents',
    heroSubtitle:
      'Coneshare works with Nextcloud, Google Drive, and Dropbox workflows. Keep your storage workflow and add control, visibility, and workflow actions for external distribution.',
    integrationLinks: [
      { href: '/integrations/nextcloud', label: 'Nextcloud integration' },
      { href: '/integrations/google-drive', label: 'Google Drive integration' },
      { href: '/integrations/dropbox', label: 'Dropbox integration' },
    ],
    learnMore: 'Learn more',
    ctaTitle: 'Ready to apply these capabilities to real workflows?',
    ctaSubtitle:
      'See how control, intelligence, and action layers work together across fundraising, sales, and deal execution.',
    demoCta: 'View live demo',
    solutionsCta: 'Browse use cases',
    notFoundTitle: 'Feature Not Found | Coneshare',
    notFoundDescription:
      'Explore Coneshare features for real-time document tracking and workflow automation.',
    workflowTitle: 'Typical Workflow',
    relatedTitle: 'Explore Related Features',
    detailCtaEyebrow: 'Next Step',
    detailCtaTitle: 'See this feature live in Coneshare',
    detailCtaBody:
      'Explore the demo environment, review plan options, or open step-by-step documentation.',
    defaultDocsHref: '/help',
    defaultDocsLabel: 'Read user guide',
    defaultDocsExternal: false,
    pricingHref: '/pricing',
    pricingCta: 'View pricing',
    embedMetaTitle: 'Embed File Upload Form on Your Website | Coneshare',
    embedMetaDescription:
      'Embed Coneshare file request upload pages on your own website using iframe snippets and reverse proxy security headers.',
    embedMetaKeywords: [
      'embed upload form',
      'iframe upload widget',
      'file request embed',
      'secure file intake',
    ],
    embedEyebrow: 'Website Intake',
    embedTitle: 'Embed file request uploads on your own website',
    embedSubtitle:
      'Use existing Coneshare file request links as embeddable upload forms, so users can submit files directly from your site without redirecting to a separate domain.',
    embedStep1: '1. Iframe snippet',
    embedStep1Intro: 'Example snippet using a real file request link:',
    embedStep1TemplateLabel: 'Reusable template:',
    embedStep2: '2. Live embed preview',
    embedStep2Body: 'directly for documentation and testing.',
    embedStep2Prefix: 'This preview embeds',
    embedIframeTitle: 'Coneshare upload embed preview',
    embedStep3: '3. Reverse proxy headers (required)',
    embedStep3Body:
      'In production, configure embed security headers at your front reverse proxy (HTTPS edge), not inside the Coneshare container runtime config.',
    embedStep3Bullets: [
      { before: 'Use explicit HTTPS origins in ', code: 'frame-ancestors', after: '.' },
      { before: 'Avoid wildcard origins in production.' },
      {
        before: 'If your app is mounted under a prefix (for example ',
        code: '/app/upload/...',
        after: '), adjust route matching.',
      },
    ],
    embedStep4: '4. Upload flow and validation',
    embedStep4Body: 'Embed mode uses the same backend flow and validations as standard public upload:',
    embedStep4Steps: [
      { label: 'Request upload URL', code: '/api/v1/public/file-requests/<slug>/request-upload/' },
      { label: 'Direct upload to returned pre-signed URL' },
      { label: 'Finalize upload', code: '/api/v1/public/file-requests/<slug>/finalize-upload/' },
    ],
    embedStep4Outro:
      'Size limits, allowed types, active/expiry checks, quota checks, and finalize validations are unchanged.',
    embedCtaTitle: 'Need end-to-end setup guidance?',
    embedCtaBody: 'See full feature documentation for file requests and embed security details.',
    embedHelpCta: 'File Request user guide',
    embedHelpHref: '/help/file-requests',
    embedAdminDocsCta: 'Nginx embedding guide',
  },
  zh: {
    basePath: '/zh/features',
    indexTitle: '功能特性 | Coneshare',
    indexDescription:
      '全面了解 Coneshare 如何为现有文档工作流叠加受控分发、动态水印、逐页阅读洞察、虚拟资料室与自动化联动能力。',
    indexKeywords: [
      '虚拟资料室功能',
      '安全文档分发',
      '防拍照动态水印',
      '逐页阅读统计',
      '私有化部署文档分享',
      '工作流自动化',
    ],
    heroEyebrow: '核心功能',
    heroTitle: '为你的文档加上安全控制与洞察能力',
    heroSubtitle:
      'Coneshare 可直接衔接 Nextcloud、Google Drive 与 Dropbox 等现有工作流。无需大迁移即可补齐权限控制、阅读追踪与事件自动化能力。',
    integrationLinks: [
      { href: '/integrations/nextcloud', label: 'Nextcloud 集成 (EN)' },
      { href: '/integrations/google-drive', label: 'Google Drive 集成 (EN)' },
      { href: '/integrations/dropbox', label: 'Dropbox 集成 (EN)' },
    ],
    learnMore: '查看详情',
    ctaTitle: '准备好把这些能力用到实际业务中了吗？',
    ctaSubtitle: '立即通过交互演示了解控制层、洞察层与自动化联动在融资、销售与交易交付中的协同效果。',
    demoCta: '查看在线演示',
    solutionsCta: '浏览应用场景 (EN)',
    notFoundTitle: '未找到功能页面 | Coneshare',
    notFoundDescription: '浏览 Coneshare 安全文档分发、阅读分析与自动化功能特性。',
    workflowTitle: '典型工作流程',
    relatedTitle: '搭配使用的相关功能',
    detailCtaEyebrow: '下一步',
    detailCtaTitle: '在 Coneshare 中体验该能力',
    detailCtaBody: '打开在线演示环境、对比方案定价，或前往帮助中心查阅具体操作说明。',
    defaultDocsHref: '/zh/help',
    defaultDocsLabel: '查看使用指南',
    defaultDocsExternal: false,
    pricingHref: '/zh/pricing',
    pricingCta: '查看方案定价',
    embedMetaTitle: '将文件收集上传表单嵌入自有网站 | Coneshare',
    embedMetaDescription:
      '使用 iframe 代码片段与反向代理安全头，将 Coneshare File Request 文件收集页面直接嵌入客户门户或官网。',
    embedMetaKeywords: [
      '嵌入文件上传表单',
      'iframe 文件收集组件',
      'File Request 嵌入',
      '安全文件接收',
    ],
    embedEyebrow: '官网与门户文件收集',
    embedTitle: '将安全上传表单直接嵌入自有网站',
    embedSubtitle:
      '复用现有的 Coneshare File Request 收集链接，外部访客无需跳离你的业务门户域名即可直接提交大文件。',
    embedStep1: '1. Iframe 嵌入代码片段',
    embedStep1Intro: '基于真实收集链接的可运行示例：',
    embedStep1TemplateLabel: '通用可复用模板：',
    embedStep2: '2. 在线嵌入预览',
    embedStep2Prefix: '以下区域直接嵌入了测试收集地址',
    embedStep2Body: '，用于直观确认样式与上传交互。',
    embedIframeTitle: 'Coneshare 文件上传嵌入预览',
    embedStep3: '3. 反向代理响应头配置（必需）',
    embedStep3Body:
      '生产环境下，请在最前端的 HTTPS 反向代理（如 Nginx）配置嵌入白名单安全头，不要修改容器内部 Web 服务配置。',
    embedStep3Bullets: [
      { before: '在 ', code: 'frame-ancestors', after: ' 中明确列出受信任的 HTTPS 源域名。' },
      { before: '生产环境请避免使用通配符来源。' },
      {
        before: '若应用部署在子路径前缀下（如 ',
        code: '/app/upload/...',
        after: '），请相应调整路径匹配规则。',
      },
    ],
    embedStep4: '4. 上传链路与后端校验机制',
    embedStep4Body: '嵌入模式与标准公开收集页共用完全一致的后端接口及安全校验：',
    embedStep4Steps: [
      { label: '申请直传上传 URL', code: '/api/v1/public/file-requests/<slug>/request-upload/' },
      { label: '客户端直传文件至预签名存储地址' },
      { label: '完成上传校验与落库', code: '/api/v1/public/file-requests/<slug>/finalize-upload/' },
    ],
    embedStep4Outro: '文件大小限制、允许类型、失效时间校验、存储配额检查与最终确认校验均保持不变。',
    embedCtaTitle: '需要完整的端到端配置参考？',
    embedCtaBody: '既可在帮助中心查看业务用法，也可前往服务器运维手册查看 Nginx 嵌入与病毒扫描细节。',
    embedHelpCta: 'File Request 使用指南',
    embedHelpHref: '/zh/help/file-requests',
    embedAdminDocsCta: 'Nginx 嵌入配置文档 (EN)',
  },
};

function getCopy(locale = 'en') {
  return locale === 'zh' ? FEATURE_COPY.zh : FEATURE_COPY.en;
}

export function buildFeaturesLanguageAlternates(pathSuffix = '') {
  return {
    en: `${SITE_URL}/features${pathSuffix}`,
    'zh-CN': `${SITE_URL}/zh/features${pathSuffix}`,
  };
}

export function buildFeaturesIndexMetadata(locale = 'en') {
  const copy = getCopy(locale);
  const canonical = `${SITE_URL}${copy.basePath}`;

  return {
    title: copy.indexTitle,
    description: copy.indexDescription,
    keywords: copy.indexKeywords,
    alternates: {
      canonical,
      languages: buildFeaturesLanguageAlternates(''),
    },
    openGraph: {
      title: copy.indexTitle,
      description: copy.indexDescription,
      url: canonical,
      type: 'website',
    },
  };
}

export function buildFeatureDetailMetadata(slug, locale = 'en') {
  const copy = getCopy(locale);
  const baseFeature = features.find((f) => f.slug === slug);

  if (!baseFeature) {
    return {
      title: copy.notFoundTitle,
      description: copy.notFoundDescription,
    };
  }

  const feature = getLocalizedFeature(baseFeature, locale);
  const canonical = `${SITE_URL}${copy.basePath}/${feature.slug}`;

  return {
    title: `${feature.name} | Coneshare`,
    description: feature.description,
    keywords:
      feature.keywords || [
        `${feature.menuName || feature.name} feature`,
        'self-hosted document sharing',
        'document workflow automation',
        'secure dataroom collaboration',
      ],
    alternates: {
      canonical,
      languages: buildFeaturesLanguageAlternates(`/${feature.slug}`),
    },
    openGraph: {
      title: `${feature.name} | Coneshare`,
      description: feature.description,
      url: canonical,
      type: 'article',
    },
  };
}

export function buildFileRequestEmbedMetadata(locale = 'en') {
  const copy = getCopy(locale);
  const canonical = `${SITE_URL}${copy.basePath}/file-request-embed`;

  return {
    title: copy.embedMetaTitle,
    description: copy.embedMetaDescription,
    keywords: copy.embedMetaKeywords,
    alternates: {
      canonical,
      languages: buildFeaturesLanguageAlternates('/file-request-embed'),
    },
    openGraph: {
      title: copy.embedMetaTitle,
      description: copy.embedMetaDescription,
      url: canonical,
      type: 'article',
    },
  };
}

function renderFeatureCard(feature, basePath, learnMoreText) {
  return (
    <div
      key={feature.slug}
      className="relative rounded-lg border border-gray-200 bg-white p-8 pl-20 shadow-sm"
    >
      <dt className="text-base font-semibold leading-7 text-gray-900">
        <div className="absolute left-6 top-8 flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
          <feature.icon className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        {feature.name}
      </dt>
      <dd className="mt-2 text-base leading-7 text-gray-600">{feature.description}</dd>
      <dd className="mt-6">
        <Link
          href={`${basePath}/${feature.slug}`}
          className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700"
        >
          {learnMoreText} <span aria-hidden="true">→</span>
        </Link>
      </dd>
    </div>
  );
}

export function FeaturesIndexView({ locale = 'en' }) {
  const copy = getCopy(locale);
  const layerGroups = locale === 'zh' ? FEATURE_LAYER_GROUPS_ZH : LAYER_GROUPS_EN;
  const localizedFeatures = features.map((feature) => getLocalizedFeature(feature, locale));

  const featureListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: locale === 'zh' ? 'Coneshare 功能特性' : 'Coneshare Features',
    itemListElement: localizedFeatures.map((feature, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${copy.basePath}/${feature.slug}`,
      name: feature.name,
      description: feature.description,
    })),
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-base font-semibold leading-7 text-gray-900">{copy.heroEyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">{copy.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm font-semibold">
            {copy.integrationLinks.map((item) => (
              <Link key={item.href} href={item.href} className="text-gray-900 hover:text-gray-700">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {layerGroups.map((group) => {
          const groupFeatures = group.slugs
            .map((slug) => localizedFeatures.find((feature) => feature.slug === slug))
            .filter(Boolean);

          return (
            <section key={group.key} className="mx-auto mt-16 max-w-6xl first:mt-14">
              <div className="max-w-3xl">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">{group.title}</h2>
                <p className="mt-3 text-base leading-7 text-gray-600">{group.description}</p>
              </div>
              <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2 lg:gap-y-16">
                {groupFeatures.map((feature) =>
                  renderFeatureCard(feature, copy.basePath, copy.learnMore)
                )}
              </dl>
            </section>
          );
        })}

        <div className="mx-auto mt-16 max-w-3xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white sm:mt-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{copy.ctaTitle}</h2>
          <p className="mt-4 text-base text-gray-200">{copy.ctaSubtitle}</p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link
              href="/demo"
              className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              {copy.demoCta}
            </Link>
            <Link href="/solutions" className="text-sm font-semibold text-white hover:text-gray-200">
              {copy.solutionsCta} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(featureListJsonLd) }}
      />
    </div>
  );
}

const RELATED_FEATURE_SLUGS = {
  'secure-sharing': ['dynamic-watermarking', 'virtual-data-rooms'],
  'advanced-analytics': ['workflow-automation-integration', 'virtual-data-rooms'],
  'dynamic-watermarking': ['secure-sharing', 'online-document-preview'],
  'virtual-data-rooms': ['secure-sharing', 'advanced-analytics'],
  'cloud-storage-integration': ['virtual-data-rooms', 'secure-sharing'],
  'workflow-automation-integration': ['advanced-analytics', 'file-requests'],
  'file-requests': ['secure-sharing', 'workflow-automation-integration'],
  'self-hosted': ['dynamic-watermarking', 'virtual-data-rooms'],
  'online-document-preview': ['dynamic-watermarking', 'advanced-analytics'],
};

const EN_DOCS_BY_SLUG = {
  'secure-sharing': '/help/secure-sharing',
  'advanced-analytics': '/help/analytics-and-mcp',
  'dynamic-watermarking': '/help/dynamic-watermarking',
  'virtual-data-rooms': '/help/datarooms',
  'cloud-storage-integration': '/help/getting-started',
  'workflow-automation-integration': '/help/analytics-and-mcp',
  'file-requests': '/help/file-requests',
  'online-document-preview': '/help/getting-started',
};

export function FeatureDetailView({ slug, locale = 'en' }) {
  const copy = getCopy(locale);
  const baseFeature = features.find((f) => f.slug === slug);

  if (!baseFeature) {
    notFound();
  }

  const feature = getLocalizedFeature(baseFeature, locale);
  const relatedSlugs = RELATED_FEATURE_SLUGS[feature.slug] || [];
  const relatedFeatures = relatedSlugs
    .map((relatedSlug) => features.find((item) => item.slug === relatedSlug))
    .filter(Boolean)
    .map((item) => getLocalizedFeature(item, locale));

  const isSelfHosted = feature.slug === 'self-hosted';
  const docsHref =
    feature.docsHref ||
    (isSelfHosted
      ? 'https://docs.coneshare.com/en/quick-start/'
      : EN_DOCS_BY_SLUG[feature.slug] || copy.defaultDocsHref);
  const docsExternal = feature.docsExternal ?? isSelfHosted;
  const docsLabel =
    feature.docsLabel || (isSelfHosted ? 'Read server admin docs' : copy.defaultDocsLabel);

  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-x-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900">
              <feature.icon className="h-7 w-7 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {feature.name}
            </h1>
          </div>

          <p className="mt-6 text-xl leading-8 text-gray-700">{feature.description}</p>

          <div className="mt-10 prose prose-lg text-gray-600">{feature.content}</div>

          {feature.workflowSteps && (
            <section className="mt-12">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {copy.workflowTitle}
              </h2>
              <ol className="mt-6 space-y-6 border-l border-gray-200 pl-6">
                {feature.workflowSteps.map((step, index) => (
                  <li key={step} className="relative text-base leading-7 text-gray-700">
                    <span className="absolute -left-[35px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {relatedFeatures.length > 0 && (
            <section className="mt-12">
              <h2 className="text-xl font-bold tracking-tight text-gray-900">{copy.relatedTitle}</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {relatedFeatures.map((item) => (
                  <Link
                    key={item.slug}
                    href={`${copy.basePath}/${item.slug}`}
                    className="group rounded-xl border border-gray-200 bg-gray-50 px-5 py-5 transition-colors hover:border-gray-300 hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white">
                        <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                    </div>
                    <p className="mt-2.5 text-sm leading-6 text-gray-600">{item.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="mt-14 rounded-2xl bg-gray-900 px-8 py-10 text-white">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              {copy.detailCtaEyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {copy.detailCtaTitle}
            </h2>
            <p className="mt-4 text-base text-gray-200">{copy.detailCtaBody}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/demo"
                className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
              >
                {copy.demoCta}
              </Link>
              <Link
                href={copy.pricingHref}
                className="text-sm font-semibold text-white hover:text-gray-200"
              >
                {copy.pricingCta} <span aria-hidden="true">→</span>
              </Link>
              <Link
                href={docsHref}
                {...(docsExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-sm font-semibold text-gray-300 hover:text-white"
              >
                {docsLabel} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const IFRAME_SNIPPET = `<iframe
  src="https://app.coneshare.com/upload/zDgMPy5kRgNy78K8c2XSQg?embed=1"
  title="Secure file upload"
  width="100%"
  height="760"
  style="border:0;max-width:720px"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>`;

const IFRAME_TEMPLATE_SNIPPET = `<iframe
  src="https://app.coneshare.com/upload/<file_request_slug>?embed=1"
  title="Secure file upload"
  width="100%"
  height="760"
  style="border:0;max-width:720px"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>`;

const NGINX_SNIPPET = `# Default: deny framing for all routes
location / {
  proxy_pass http://coneshare_upstream;
  add_header X-Frame-Options "DENY" always;
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
}

# Embed-enabled upload route only
location ~ ^/upload/ {
  proxy_pass http://coneshare_upstream;

  # Remove restrictive upstream headers on embed route
  proxy_hide_header X-Frame-Options;
  proxy_hide_header Content-Security-Policy;

  # Explicit allowlist for trusted embed origins
  add_header Content-Security-Policy "frame-ancestors 'self' https://www.example.com" always;
}`;

export function FileRequestEmbedView({ locale = 'en' }) {
  const copy = getCopy(locale);

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
            {copy.embedEyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {copy.embedTitle}
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">{copy.embedSubtitle}</p>
        </div>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{copy.embedStep1}</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">{copy.embedStep1Intro}</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
            <code>{IFRAME_SNIPPET}</code>
          </pre>
          <p className="mt-6 text-base leading-7 text-gray-700">{copy.embedStep1TemplateLabel}</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
            <code>{IFRAME_TEMPLATE_SNIPPET}</code>
          </pre>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{copy.embedStep2}</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {copy.embedStep2Prefix}{' '}
            <code>https://app.coneshare.com/upload/zDgMPy5kRgNy78K8c2XSQg</code>{' '}
            {copy.embedStep2Body}
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <iframe
              src="https://app.coneshare.com/upload/zDgMPy5kRgNy78K8c2XSQg?embed=1"
              title={copy.embedIframeTitle}
              width="100%"
              height="760"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{copy.embedStep3}</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">{copy.embedStep3Body}</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
            <code>{NGINX_SNIPPET}</code>
          </pre>
          <ul className="mt-5 space-y-2 text-base leading-7 text-gray-700">
            {copy.embedStep3Bullets.map((item, idx) => (
              <li key={idx}>
                {item.before}
                {item.code && <code>{item.code}</code>}
                {item.after}
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{copy.embedStep4}</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">{copy.embedStep4Body}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-7 text-gray-700">
            {copy.embedStep4Steps.map((step) => (
              <li key={step.label}>
                {step.label}
                {step.code && (
                  <>
                    {' '}
                    (<code>{step.code}</code>)
                  </>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-base leading-7 text-gray-700">{copy.embedStep4Outro}</p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{copy.embedCtaTitle}</h2>
          <p className="mt-4 text-base text-gray-200">{copy.embedCtaBody}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
            <Link
              href="/demo"
              className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              {copy.demoCta}
            </Link>
            <Link
              href={copy.embedHelpHref}
              className="text-sm font-semibold text-white hover:text-gray-200"
            >
              {copy.embedHelpCta} <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="https://docs.coneshare.com/en/file-request-embedding/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white hover:text-gray-200"
            >
              {copy.embedAdminDocsCta} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
