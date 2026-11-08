import Link from 'next/link';
import Image from 'next/image';
import { Shield, Eye, Zap, Palette, Folder, MessageSquare, CheckCircle, ArrowRight, Link2 } from 'lucide-react';
import { DataroomMockupCarousel } from '../../../components/DataroomMockupCarousel';

export const metadata = {
  title: '安全私有化虚拟资料室 (VDR) | Coneshare',
  description:
    '无需迁移现有网盘文件，直接将企业的 Nextcloud 或本地存储升级为合规虚拟资料室。支持多买方一室多链分权、买方隔离尽调 Q&A 与逐页阅读追踪，数据 100% 留在自有服务器。',
  keywords: [
    '虚拟资料室',
    '私有化资料室',
    '开源资料室',
    '安全文档分享',
    'DocSend 替代品',
    '资料室追踪',
  ],
  alternates: {
    canonical: '/zh/virtual-dataroom',
  },
};

export default function ZhVirtualDataroomPage() {
  const steps = [
    {
      number: '01',
      title: '一键关联与自定义目录整理',
      description:
        '直接挂载企业现有的 Nextcloud、本地存储或 Google Drive，快速编排资料室目录。当网盘内的源文件更新版本时，后台一键增量同步，已发出的资料室链接自动呈现最新版，无需重新发送。',
      image: '/screenshots/feat-vdr-add-content.png',
    },
    {
      number: '02',
      title: '多维安全管控与动态水印',
      description:
        '按链接独立设置访问密码、过期时间、邮箱验证码校验、前置 NDA 签署及禁下载策略。开启满屏防拍照动态水印，在浏览器预览与导出 PDF 中自动平铺访客邮箱、IP 与时间戳。',
      image: '/screenshots/feat-sharing.png',
    },
    {
      number: '03',
      title: '逐页深度分析访客行为',
      description:
        '无需再靠猜测判断商业计划书是否被认真审阅。实时追踪访问人次、重访记录、下载动作、逐页停留秒数以及视频观看分段（包含静音状态与播放倍速）。',
      image: '/screenshots/feat-analytics.png',
    },
    {
      number: '04',
      title: '即时触发下游协同工作流',
      description:
        '不错过任何关键成交信号。当投资人重访资料室或大客户下载合同草案时，系统通过企业微信、飞书、钉钉或 Slack 实时推送消息卡片，并支持通过 Webhook 自动触发 CRM 跟进流程。',
      image: '/screenshots/feat-automations.png',
    },
  ];

  const corePillars = [
    {
      name: '一室多链，买方独立分权',
      description:
        '无需为不同对象重复建库。同一资料室可生成多条专属链接，分别为法务、采购或不同竞标方独立配置可见文件夹、访问密码与下载权限。',
      icon: Link2,
    },
    {
      name: '买方隔离尽调问答 (Q&A)',
      description:
        '查阅者可在具体文档旁直接发起提问，告别零散的邮件与 Excel 来回传递；不同买方的提问严格隔离、互不可见，完整留存合规问答记录。',
      icon: MessageSquare,
    },
    {
      name: '专属品牌视觉定制',
      description:
        '支持自定义资料室顶部横幅 Banner、企业 Logo、主题配色与专属域名，在每一次对外交付中展现专业统一的品牌形象。',
      icon: Palette,
    },
  ];

  const faqs = [
    {
      q: '相比公有云 SaaS 资料室，Coneshare 如何确保文件安全？',
      a: '公有云平台会将您的敏感商业文件复制并存储在企业安全边界之外的第三方服务器上。Coneshare 直接对接您现有的存储服务（Nextcloud、Google Drive、Dropbox 或本地挂载存储），在您的私有基础设施内运行。文档预览与水印处理均在本地完成，确保敏感文件永远不离开您的安全边界。',
    },
    {
      q: 'Coneshare 是否支持动态 PDF 水印？',
      a: '完全支持。一旦对某个分享链接或单个文件启用水印，Coneshare 会在在线渲染页面和生成的 PDF 文件中平铺动态水印，包含查阅者的验证邮箱、IP 与访问时间戳，有力震慑未经授权的截屏与翻拍传播。',
    },
    {
      q: '资料室内的尽调问答 (Q&A) 是如何运作的？',
      a: 'Coneshare 允许资料室管理员在分享链接上开启安全问答模块。外部查阅者可以直接对具体文件提问，管理员在统一控制台内集中分配与回复，告别零散混乱的邮件往来。各个链接的问答相互隔离，不同买家彼此完全不可见。',
    },
    {
      q: '私有化部署 Coneshare 难度大吗？',
      a: '非常简单。Coneshare 专为私有化部署而设计。通过提供的 Docker Compose 配置，仅需几分钟即可在自有服务器或私有云中启动完整服务，彻底拥有数据库日志、元数据与访客分析记录。',
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="bg-white">
        {/* Hero Section */}
        <div className="relative isolate px-6 pt-16 lg:px-8">
          <div
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0)',
              backgroundSize: '24px 24px',
              maskImage: 'linear-gradient(to bottom, white, transparent)',
            }}
            aria-hidden="true"
          />
          <div className="mx-auto max-w-4xl py-20 sm:py-28 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              数据自主掌控的企业级私有化资料室 (VDR)
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
              无需迁移现有网盘文件，直接将企业的 Nextcloud 或本地存储升级为合规虚拟资料室。支持多买方一室多链分权、买方隔离尽调 Q&amp;A 与逐页阅读追踪，数据 100% 留在自有服务器。
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/demo"
                className="rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                查看在线演示
              </Link>
              <a
                href="https://github.com/coneshare/coneshare"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700 flex items-center gap-1"
              >
                前往 GitHub 源码 <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          {/* Floating Mockup Browser Window Carousel */}
          <div className="mx-auto max-w-5xl px-6 lg:px-8 pb-16">
            <DataroomMockupCarousel locale="zh" />
          </div>
        </div>

        {/* Trust & Integrations Bar */}
        <div className="bg-gray-50 border-y border-gray-100 py-10">
          <div className="mx-auto max-w-5xl px-6 lg:px-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">
              与您现有的企业存储无缝结合
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 font-semibold text-gray-700">
              <span className="flex items-center gap-2">Nextcloud</span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-2">Google Drive</span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-2">Dropbox</span>
            </div>
          </div>
        </div>

        {/* What is VDR & Why Coneshare Section */}
        <div className="mx-auto max-w-5xl px-6 lg:px-8 py-20 border-b border-gray-150">
          <div className="grid gap-16 lg:grid-cols-2">
            {/* Left Column */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                什么是虚拟资料室 (VDR)？
              </h2>
              <p className="mt-6 text-base leading-7 text-gray-600">
                虚拟资料室（Virtual Data Room，简称 VDR）是专为投融资尽调、并购重组及大客户招投标打造的高安全级资料库。
              </p>
              <p className="mt-4 text-base leading-7 text-gray-600">
                相比“发出即失联”的普通网盘链接，VDR 支持为不同交易方按目录精细分权、强制签署前置 NDA、叠加防拍照动态水印，并实时追踪每位访客的逐页阅读时长，让机密资料外发后依然全程受控。
              </p>
            </div>

            {/* Right Column */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                为什么选择 Coneshare？
              </h2>
              <ul className="mt-6 space-y-5">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">数据主权优先</h4>
                    <p className="text-sm text-gray-600 mt-1">所有源文件与浏览记录均保存在企业自有服务器，彻底规避公有云泄密与数据出境风险。</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">完全免费的开源核心</h4>
                    <p className="text-sm text-gray-600 mt-1">开源核心版完全免费且无任何用户席位限制。只有在您需要 SSO 单点登录、LDAP 集成或跨部门权限管理与合规审计等企业级功能时才需按需选购商业支持。</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">一键云端文件增量同步</h4>
                    <p className="text-sm text-gray-600 mt-1">无缝对接 Nextcloud 或 Google Drive 等网盘，当源文件发生版本更迭时，只需点击一次即可同步更新，外发链接永久有效。</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step-by-Step Value Flow */}
        <div className="py-20 sm:py-28 space-y-24 sm:space-y-36">
          <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              四步轻松实现对外文档安全管控
            </h2>
            <p className="mt-4 text-base text-gray-600">
              无需改变团队现有的网盘使用习惯，四步完成从资料室搭建到商务跟进的全流程。
            </p>
          </div>

          {steps.map((step, idx) => (
            <div key={step.number} className="mx-auto max-w-5xl px-6 lg:px-8">
              <div className={`grid gap-12 lg:grid-cols-12 lg:items-center ${idx % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
                <div className={`lg:col-span-5 ${idx % 2 === 1 ? 'lg:order-last' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold text-gray-400">{step.number}</span>
                    <h3 className="text-2xl font-bold tracking-tight text-gray-900">{step.title}</h3>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-gray-600">{step.description}</p>
                </div>
                <div className="lg:col-span-7">
                  <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-lg overflow-hidden">
                    <Image
                      src={step.image}
                      alt={step.title}
                      width={1000}
                      height={625}
                      className="w-full h-auto rounded-lg border border-gray-100"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Core VDR Features Pillars */}
        <div className="bg-gray-50 border-y border-gray-100 py-16 sm:py-24">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                专为高价值商务协同而打造
              </h2>
              <p className="mt-4 text-base text-gray-600">
                除基础链接分享外，Coneshare 为团队提供功能完善的专业级虚拟资料室工具。
              </p>
            </div>
            <div className="grid max-w-md grid-cols-1 gap-8 sm:max-w-none sm:grid-cols-3">
              {corePillars.map((pillar) => (
                <div key={pillar.name} className="flex flex-col bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white mb-6">
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold leading-7 text-gray-900">{pillar.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 flex-grow">{pillar.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comparison Section */}
        <div className="mx-auto max-w-5xl px-6 lg:px-8 py-16 sm:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 text-center">Coneshare 与商业 SaaS 方案对比</h2>
          <p className="text-base text-gray-600 text-center mt-4 max-w-2xl mx-auto">
            对比私有化直连架构与传统公有云 VDR 在数据安全、分权灵活性与长期成本上的差异。
          </p>

          <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900">对比维度</th>
                  <th className="px-6 py-4 font-semibold text-gray-900">Coneshare (私有化部署)</th>
                  <th className="px-6 py-4 font-semibold text-gray-900">DocSend / 传统公有云 VDR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white text-gray-700">
                <tr>
                  <td className="px-6 py-4 font-medium">数据主权</td>
                  <td className="px-6 py-4">完全可控（源文件与渲染缓存自始至终保留在企业自有服务器）</td>
                  <td className="px-6 py-4">否（文件被全量上传并托管在第三方公有云数据库中）</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">存储系统对接</td>
                  <td className="px-6 py-4">既支持公有云（Dropbox、Google Drive），也支持私有企业云（Nextcloud、自建对象存储）</td>
                  <td className="px-6 py-4">仅支持公共网盘（Google Drive、Dropbox），无法支持私有化部署的存储（如 Nextcloud）</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">资料室权限管控</td>
                  <td className="px-6 py-4">单资料室支持多条独立专属链接，按买方动态隔离可见目录、独立密码与内嵌加密 Q&amp;A</td>
                  <td className="px-6 py-4">仅支持基础文件夹聚合；不同买方若需不同目录权限需克隆多个空间，且无内嵌尽调 Q&amp;A 板块</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">阅读行为深度分析</td>
                  <td className="px-6 py-4">逐页停留秒数与音视频段落追踪，直连企业微信、飞书、钉钉卡片，客户翻看报价即时弹窗预警</td>
                  <td className="px-6 py-4">具备精细逐页分析，但仅限邮件通知与海外 Zapier，缺乏国内办公 IM 原生集成，提醒容易进垃圾箱</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">企业审计合规</td>
                  <td className="px-6 py-4">所有审计访问日志均存储在私有数据库中，可直接对接内部企业安全分析系统（如 SIEM）</td>
                  <td className="px-6 py-4">局限于 SaaS 控制台查看或手动导出 CSV，无法直接对接到内部监控架构</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium">授权与计费模式</td>
                  <td className="px-6 py-4 font-semibold text-green-700">开源核心版完全免费（无坐席数量限制）；高级企业能力（SSO/LDAP）按需订阅</td>
                  <td className="px-6 py-4">从第一天起按坐席收取昂贵费用，随规模扩大成本陡增</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Collapsible FAQ Accordion Section */}
        <div className="bg-gray-50 border-t border-gray-100 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 text-center mb-12">常见问题解答</h2>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <details
                  key={index}
                  className="group rounded-xl border border-gray-200 bg-white p-6 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-1.5 text-gray-900 font-semibold">
                    <span className="text-base">{faq.q}</span>
                    <span className="ml-1.5 flex-shrink-0 rounded-full bg-gray-50 p-1.5 text-gray-900 group-open:rotate-180 transition-transform duration-200">
                      <ArrowRight className="h-4 w-4 rotate-90" />
                    </span>
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-gray-600 border-t border-gray-100 pt-4">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Box */}
        <div className="mx-auto max-w-5xl px-6 lg:px-8 py-20 sm:py-28">
          <section className="rounded-2xl bg-gray-900 px-8 py-12 text-center text-white shadow-xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">立即将您的企业存储升级为安全虚拟资料室</h2>
            <p className="mt-4 text-base text-gray-200">
              将企业级安全保障、动态水印与访客追踪能力融为一体，同时享有完整的私有化掌控。
            </p>
            <div className="mt-8 flex items-center justify-center gap-6">
              <Link href="/demo" className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                体验在线演示
              </Link>
              <a
                href="https://github.com/coneshare/coneshare"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white hover:text-gray-200"
              >
                在 GitHub 上开始部署 <span aria-hidden="true">→</span>
              </a>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
