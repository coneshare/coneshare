import Link from 'next/link';
import {
  BookOpen,
  Server,
  LifeBuoy,
  ArrowRight,
  ArrowUpRight,
  Globe,
  ChevronRight,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  getAllHelpGuides,
  getHelpGuideBySlug,
  getHelpSectionsWithGuides,
} from '../lib/help';
import {
  buildHelpLanguageAlternates,
  getHelpSectionMeta,
  getPrevNextGuides,
} from '../lib/help-utils';
import BlogToc from './BlogToc';
import HelpSidebar from './HelpSidebar';

const SITE_URL = 'https://www.coneshare.com';

const HELP_COPY = {
  en: {
    basePath: '/help',
    siteTitle: 'Help Center | Coneshare',
    siteDescription:
      'Product user guides, self-hosting documentation links, and support channels for Coneshare.',
    heroEyebrow: 'Help Center',
    heroTitle: 'How can we help?',
    heroSubtitle:
      'Find step-by-step product guides for sharing files and managing datarooms, jump to server admin documentation, or reach our support team.',
    modulesHeading: 'Browse by Area',
    modules: [
      {
        key: 'user-guide',
        title: 'User Guide',
        badge: 'Product Usage',
        description:
          'Learn how to upload documents, create protected links, configure virtual datarooms, collect files, and connect AI assistants.',
        href: '#user-guide',
        cta: 'Browse guides',
        icon: BookOpen,
        external: false,
      },
      {
        key: 'admin-docs',
        title: 'Server Admin Docs',
        badge: 'Self-Hosting',
        description:
          'Deploy and operate your own Coneshare server with Docker Compose, Nginx reverse proxy, Fail2ban, backups, and upgrades.',
        href: 'https://docs.coneshare.com/en/',
        cta: 'Open Admin Docs',
        icon: Server,
        external: true,
      },
      {
        key: 'support',
        title: 'Support & Community',
        badge: 'Assistance',
        description:
          'Get help from the Coneshare team, explore enterprise deployment support, or ask questions in GitHub Discussions.',
        href: '#support',
        cta: 'View support options',
        icon: LifeBuoy,
        external: false,
      },
    ],
    guideSectionTitle: 'User Guide',
    guideSectionSubtitle:
      'Organized by workflow for senders, dataroom collaborators, and team members.',
    supportTitle: 'Need Direct Support?',
    supportSubtitle:
      'Whether you are evaluating Coneshare Cloud, running a self-hosted instance, or need enterprise onboarding assistance:',
    supportCards: [
      {
        title: 'Technical & Self-Hosting Help',
        description: 'Questions about bugs, integrations, or setup.',
        cta: 'dev@coneshare.com',
        href: 'mailto:dev@coneshare.com',
        external: false,
      },
      {
        title: 'Enterprise & Priority Support',
        description: 'Managed onboarding, security reviews, and SLAs.',
        cta: 'sales@coneshare.com',
        href: 'mailto:sales@coneshare.com',
        external: false,
      },
      {
        title: 'Community Forum',
        description: 'Feature ideas, Q&A, and release discussions.',
        cta: 'GitHub Discussions',
        href: 'https://github.com/orgs/coneshare/discussions',
        external: true,
      },
    ],
    breadcrumbHelp: 'Help Center',
    switchLocaleLabel: '阅读中文版',
    previousLabel: 'Previous',
    nextLabel: 'Next',
    adminNoticeTitle: 'Deploying or administering a self-hosted Coneshare server?',
    adminNoticeBody:
      'Infrastructure setup, Nginx reverse proxy, app.env configuration, and upgrades live in the Server Admin Docs.',
    adminNoticeCta: 'Go to Server Admin Docs',
    notFoundTitle: 'Guide Not Found | Coneshare Help Center',
    notFoundDescription: 'Browse Coneshare Help Center product guides.',
  },
  zh: {
    basePath: '/zh/help',
    siteTitle: '帮助中心 | Coneshare',
    siteDescription:
      'Coneshare 产品使用指南、私有化部署运维手册入口与技术支持渠道。',
    heroEyebrow: '帮助中心',
    heroTitle: '您需要哪方面的帮助？',
    heroSubtitle:
      '查阅文件分享与虚拟资料室的产品操作指南，前往服务器部署运维手册，或联系 Coneshare 团队获取支持。',
    modulesHeading: '按模块浏览',
    modules: [
      {
        key: 'user-guide',
        title: '产品使用指南',
        badge: '业务与团队用户',
        description:
          '了解文档上传、加密外发链接、虚拟资料室搭建、文件收集以及接入 AI 助手（MCP）的完整操作说明。',
        href: '#user-guide',
        cta: '浏览使用指南',
        icon: BookOpen,
        external: false,
      },
      {
        key: 'admin-docs',
        title: '服务器管理员手册',
        badge: '私有化部署',
        description:
          '面向运维与工程团队：Docker Compose 部署、app.env 环境变量、Nginx 反向代理、备份恢复与版本升级。',
        href: 'https://docs.coneshare.com/en/',
        cta: '前往运维文档 (EN)',
        icon: Server,
        external: true,
      },
      {
        key: 'support',
        title: '技术支持与社区',
        badge: '支持服务',
        description:
          '获取企业付费支持、部署与安全评估协助，或在 GitHub Discussions 社区论坛参与交流。',
        href: '#support',
        cta: '查看支持渠道',
        icon: LifeBuoy,
        external: false,
      },
    ],
    guideSectionTitle: '产品使用指南',
    guideSectionSubtitle: '按业务流程组织，方便团队成员与资料室协作者随时查阅。',
    supportTitle: '需要进一步支持？',
    supportSubtitle:
      '无论您正在试用 Coneshare、私有化部署遇到问题，还是需要企业级交付与合规支持：',
    supportCards: [
      {
        title: '技术支持与问题反馈',
        description: '产品故障排查、集成对接与配置疑问。',
        cta: 'dev@coneshare.com',
        href: 'mailto:dev@coneshare.com',
        external: false,
      },
      {
        title: '企业付费支持与咨询',
        description: '专属交付协助、安全合规评审与 SLA 服务。',
        cta: 'sales@coneshare.com',
        href: 'mailto:sales@coneshare.com',
        external: false,
      },
      {
        title: '社区论坛',
        description: '功能建议、使用经验分享与版本讨论。',
        cta: 'GitHub Discussions',
        href: 'https://github.com/orgs/coneshare/discussions',
        external: true,
      },
    ],
    breadcrumbHelp: '帮助中心',
    switchLocaleLabel: 'Read in English',
    previousLabel: '上一篇',
    nextLabel: '下一篇',
    adminNoticeTitle: '正在部署或维护私有化 Coneshare 服务器？',
    adminNoticeBody:
      'Docker 安装、app.env 环境变量、Nginx 反向代理、备份与升级指南请查阅服务器管理员手册。',
    adminNoticeCta: '查看管理员手册',
    notFoundTitle: '未找到指南 | Coneshare 帮助中心',
    notFoundDescription: '浏览 Coneshare 帮助中心产品使用指南。',
  },
};

function getCopy(locale = 'en') {
  return locale === 'zh' ? HELP_COPY.zh : HELP_COPY.en;
}

export function buildHelpIndexMetadata(locale = 'en') {
  const copy = getCopy(locale);
  const canonical = `${SITE_URL}${copy.basePath}`;

  return {
    title: copy.siteTitle,
    description: copy.siteDescription,
    alternates: {
      canonical,
      languages: buildHelpLanguageAlternates(SITE_URL),
    },
    openGraph: {
      title: copy.siteTitle,
      description: copy.siteDescription,
      url: canonical,
      type: 'website',
    },
  };
}

export async function buildHelpArticleMetadata(slug, locale = 'en') {
  const copy = getCopy(locale);
  const guide = await getHelpGuideBySlug(slug, locale);

  if (!guide) {
    return {
      title: copy.notFoundTitle,
      description: copy.notFoundDescription,
    };
  }

  const alternateLocale = locale === 'zh' ? 'en' : 'zh';
  const alternateGuide = await getHelpGuideBySlug(slug, alternateLocale);
  const canonical = `${SITE_URL}${copy.basePath}/${guide.slug}`;
  const alternates = { canonical };

  if (alternateGuide) {
    alternates.languages = buildHelpLanguageAlternates(SITE_URL, guide.slug);
  }

  return {
    title: `${guide.title} | ${copy.breadcrumbHelp} | Coneshare`,
    description: guide.description,
    alternates,
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: canonical,
      type: 'article',
    },
  };
}

export async function HelpIndexView({ locale = 'en' }) {
  const copy = getCopy(locale);
  const sections = await getHelpSectionsWithGuides(locale);

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {copy.heroEyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {copy.heroTitle}
            </h1>
            <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">
              {copy.heroSubtitle}
            </p>
          </div>

          {/* Hub Module Cards */}
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {copy.modules.map((mod) => {
              const Icon = mod.icon;
              const linkProps = mod.external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {};

              return (
                <Link
                  key={mod.key}
                  href={mod.href}
                  {...linkProps}
                  className="group flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 transition-colors hover:border-gray-400 hover:bg-gray-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-900">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                        {mod.badge}
                      </span>
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-gray-900">{mod.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{mod.description}</p>
                  </div>
                  <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <span>{mod.cta}</span>
                    {mod.external ? (
                      <ArrowUpRight
                        className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* User Guide Section Directory */}
      <section id="user-guide" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {copy.guideSectionTitle}
            </h2>
            <p className="mt-2 text-base text-gray-600">{copy.guideSectionSubtitle}</p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <div
                key={section.id}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6"
              >
                <h3 className="text-base font-semibold text-gray-900">{section.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-gray-600">{section.description}</p>
                <ul className="mt-5 space-y-2.5 border-t border-gray-100 pt-4">
                  {section.guides.map((guide) => (
                    <li key={guide.slug}>
                      <Link
                        href={`${copy.basePath}/${guide.slug}`}
                        className="group flex items-start justify-between gap-2 rounded-md py-1 text-sm font-medium text-gray-800 hover:text-gray-900"
                      >
                        <span className="group-hover:underline underline-offset-4">
                          {guide.navTitle || guide.title}
                        </span>
                        <ChevronRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gray-700"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Support Channels */}
      <section id="support" className="scroll-mt-24 border-t border-gray-200 bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              {copy.supportTitle}
            </h2>
            <p className="mt-2 text-base text-gray-600">{copy.supportSubtitle}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {copy.supportCards.map((card) => (
              <div
                key={card.title}
                className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6"
              >
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{card.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{card.description}</p>
                </div>
                <p className="mt-5">
                  <Link
                    href={card.href}
                    {...(card.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:underline underline-offset-4"
                  >
                    <span>{card.cta}</span>
                    {card.external ? (
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </Link>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export async function HelpArticleView({ slug, locale = 'en' }) {
  const copy = getCopy(locale);
  const guide = await getHelpGuideBySlug(slug, locale);

  if (!guide) {
    notFound();
  }

  const alternateLocale = locale === 'zh' ? 'en' : 'zh';
  const [sections, allGuides, alternateGuide] = await Promise.all([
    getHelpSectionsWithGuides(locale),
    getAllHelpGuides(locale),
    getHelpGuideBySlug(slug, alternateLocale),
  ]);

  const sectionMeta = getHelpSectionMeta(guide.section, locale);
  const { prevGuide, nextGuide } = getPrevNextGuides(allGuides, guide.slug);
  const GuideContent = guide.Content;
  const alternatePath = alternateGuide
    ? `${getCopy(alternateLocale).basePath}/${guide.slug}`
    : null;
  const sidebarSections = sections.map((section) => ({
    id: section.id,
    title: section.title,
    guides: section.guides.map((item) => ({
      slug: item.slug,
      navTitle: item.navTitle || null,
      title: item.title,
    })),
  }));

  return (
    <div className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label={locale === 'zh' ? '面包屑路径' : 'Breadcrumb'} className="mb-8">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <li>
              <Link href={copy.basePath} className="hover:text-gray-900 transition-colors">
                {copy.breadcrumbHelp}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>{sectionMeta.title}</li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-gray-900" aria-current="page">
              {guide.navTitle || guide.title}
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          <HelpSidebar
            sections={sidebarSections}
            currentSlug={guide.slug}
            currentTitle={guide.navTitle || guide.title}
            basePath={copy.basePath}
            locale={locale}
          />

          <main className="min-w-0 flex-1 max-w-3xl">
            <article>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  {sectionMeta.title}
                </span>
                {alternatePath && (
                  <Link
                    href={alternatePath}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
                  >
                    <Globe className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    <span>{copy.switchLocaleLabel}</span>
                  </Link>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {guide.title}
              </h1>
              {guide.description && (
                <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">
                  {guide.description}
                </p>
              )}

              <div className="js-help-content prose prose-base mt-8 max-w-none text-gray-700">
                <GuideContent />
              </div>
            </article>

            {/* Previous / Next Article Pagination */}
            {(prevGuide || nextGuide) && (
              <nav
                aria-label={locale === 'zh' ? '指南翻页' : 'Guide pagination'}
                className="mt-12 grid grid-cols-1 gap-4 border-t border-gray-200 pt-8 sm:grid-cols-2"
              >
                {prevGuide ? (
                  <Link
                    href={`${copy.basePath}/${prevGuide.slug}`}
                    className="group rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-400 hover:bg-gray-50"
                  >
                    <p className="text-xs font-medium text-gray-500">
                      ← {copy.previousLabel}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {prevGuide.navTitle || prevGuide.title}
                    </p>
                  </Link>
                ) : (
                  <div />
                )}
                {nextGuide && (
                  <Link
                    href={`${copy.basePath}/${nextGuide.slug}`}
                    className="group rounded-xl border border-gray-200 bg-white p-4 text-right transition-colors hover:border-gray-400 hover:bg-gray-50"
                  >
                    <p className="text-xs font-medium text-gray-500">
                      {copy.nextLabel} →
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {nextGuide.navTitle || nextGuide.title}
                    </p>
                  </Link>
                )}
              </nav>
            )}

            {/* Admin Docs Notice */}
            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <p className="text-sm font-semibold text-gray-900">{copy.adminNoticeTitle}</p>
              <p className="mt-1.5 text-sm text-gray-600">{copy.adminNoticeBody}</p>
              <p className="mt-3">
                <Link
                  href="https://docs.coneshare.com/en/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:underline underline-offset-4"
                >
                  <span>{copy.adminNoticeCta}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </p>
            </div>
          </main>

          <BlogToc locale={locale} contentSelector=".js-help-content" />
        </div>
      </div>
    </div>
  );
}
