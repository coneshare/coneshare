"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { features } from '../lib/content';
import { getAlternateLocalePath } from '../lib/i18n';

export function Footer({ locale }) {
  const pathname = usePathname();
  const isZh = locale === 'zh' || (locale ? false : pathname?.startsWith('/zh'));
  const altHref = getAlternateLocalePath(pathname, isZh);

  const footerSections = [
    {
      title: isZh ? '产品' : 'Product',
      links: [
        { label: isZh ? '虚拟资料室 (VDR)' : 'Virtual Dataroom', href: isZh ? '/zh/virtual-dataroom' : '/virtual-dataroom' },
        { label: isZh ? '智能体与 MCP' : 'Agents & MCP', href: '/agents' },
        { label: isZh ? '方案定价' : 'Pricing', href: isZh ? '/zh/pricing' : '/pricing' },
        { label: isZh ? 'Nextcloud 集成' : 'Nextcloud Integration', href: '/integrations/nextcloud' },
        { label: isZh ? 'Google Drive 集成' : 'Google Drive Integration', href: '/integrations/google-drive' },
        { label: isZh ? 'Dropbox 集成' : 'Dropbox Integration', href: '/integrations/dropbox' },
        { label: isZh ? '解决方案' : 'Solutions', href: '/solutions' },
        { label: isZh ? '立即开始' : 'Get Started', href: 'https://app.coneshare.com/signup', external: true },
      ],
    },
    {
      title: isZh ? '功能特性' : 'Features',
      links: features
        .filter((feature) => feature.slug !== 'self-hosted')
        .map((feature) => ({
          label: (isZh && feature.menuNameZh) ? feature.menuNameZh : (feature.menuName || feature.name),
          href: `/features/${feature.slug}`,
        })),
    },
    {
      title: isZh ? '资源' : 'Resources',
      links: [
        { label: isZh ? '博客' : 'Blog', href: '/blog' },
        { label: isZh ? '发布说明' : 'Release Notes', href: 'https://docs.coneshare.com/en/release-notes/', external: true },
        { label: isZh ? '社区论坛' : 'Community Forum', href: 'https://github.com/orgs/coneshare/discussions', external: true },
        { label: isZh ? '参与贡献' : 'Contribute', href: 'https://github.com/coneshare/coneshare', external: true },
        { label: isZh ? '开发文档' : 'Documentation', href: 'https://docs.coneshare.com/en/', external: true },
        { label: isZh ? 'API 文档' : 'API Reference', href: 'https://app.coneshare.com/api/schema/swagger/', external: true },
      ],
    },
    {
      title: isZh ? '公司' : 'Company',
      links: [
        { label: isZh ? '关于我们' : 'About', href: isZh ? '/zh/about' : '/about' },
        { label: isZh ? '在线演示' : 'Live Demo', href: '/demo' },
        { label: isZh ? '联系销售' : 'Contact Sales', href: 'mailto:sales@coneshare.com' },
        { label: isZh ? '技术支持' : 'Support', href: 'mailto:dev@coneshare.com' },
        { label: isZh ? '服务条款' : 'Terms', href: '/terms' },
        { label: isZh ? '隐私政策' : 'Privacy Policy', href: '/privacy-policy' },
      ],
    },
  ];

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid gap-10 border-b border-gray-200 pb-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link href={isZh ? '/zh' : '/'} className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
              <img src="/logo-cropped.svg" alt="Coneshare logo" className="h-7 w-7" />
              <span>Coneshare</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-gray-600">
              {isZh
                ? '开源文档安全分发与虚拟资料室，具备细粒度权限控制、动态水印与自动化工作流。'
                : 'Open-source document sharing and datarooms with controlled access and automation workflows.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700">
                {isZh ? '支持私有化部署' : 'Self-hosted'}
              </span>
              <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700">
                {isZh ? '企业级技术支持' : 'Enterprise support'}
              </span>
            </div>

            {/* Language Switcher */}
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500">
              <span>🌐</span>
              {isZh ? (
                <>
                  <Link
                    href={altHref}
                    className="text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    English
                  </Link>
                  <span>/</span>
                  <span className="text-gray-900 font-semibold">中文</span>
                </>
              ) : (
                <>
                  <span className="text-gray-900 font-semibold">EN</span>
                  <span>/</span>
                  <Link
                    href={altHref}
                    className="text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    中文
                  </Link>
                </>
              )}
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8" aria-label="Footer">
            {footerSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                <ul className="mt-4 space-y-3">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 Coneshare. All rights reserved.</p>
          <p>
            {isZh
              ? '需要采购咨询或安全合规评估？请联系 sales@coneshare.com。'
              : 'Need procurement or security review support? Contact sales@coneshare.com.'}
          </p>
        </div>
      </div>
    </footer>
  );
}
