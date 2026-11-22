'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  X,
  ChevronDown,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

const FEATURE_COMPARISON_GROUPS = [
  {
    category: '资料室与文档管理',
    items: [
      { name: '不限团队成员数量', community: true, pro: true },
      { name: '不限文档数量', community: true, pro: true },
      { name: '不限文件夹数量', community: true, pro: true },
      { name: '不限资料室（Data Rooms）数量', community: true, pro: true },
      { name: '批量上传', community: true, pro: true },
      { name: '全文检索（PDF / Office / Markdown）', community: false, pro: true },
    ],
  },
  {
    category: '文档分析与追踪',
    items: [
      { name: '不限访问记录次数', community: true, pro: true },
      { name: '逐页阅读时长统计', community: true, pro: true },
      { name: '文档版本追踪', community: true, pro: true },
      { name: '访客地理位置追踪', community: true, pro: true },
      { name: '完整历史访问记录', community: true, pro: true },
      { name: '分析数据保留时长', community: '不限（自主保留）', pro: '不限（自主保留）' },
      { name: '分析数据导出', community: false, pro: true },
    ],
  },
  {
    category: '分享链接设置',
    items: [
      { name: '访问前收集访客邮箱', community: true, pro: true },
      { name: '接收访问邮件通知', community: true, pro: true },
      { name: '密码保护', community: true, pro: true },
      { name: '链接过期时间', community: true, pro: true },
      { name: '允许/禁止文档下载', community: true, pro: true },
      { name: '邮箱验证码验证', community: true, pro: true },
      { name: '指定用户白名单/黑名单访问控制', community: true, pro: true },
      { name: '动态水印', community: true, pro: true },
    ],
  },
  {
    category: '支持文件格式',
    items: [
      { name: 'PDF 文档（.pdf）', community: true, pro: true },
      { name: '图片（.png, .jpg, .jpeg, .gif, .webp, .heic, .heif）', community: true, pro: true },
      { name: '电子表格（.xls, .xlsx, .csv）', community: true, pro: true },
      { name: 'Word 文档（.doc, .docx）', community: true, pro: true },
      { name: '视频文件（.mp4, .mov, .avi, .webm, .ogg, .m4v, .3gp）', community: true, pro: true },
      { name: '演示文稿（.ppt, .pptx）', community: true, pro: true },
      { name: 'Markdown 文档（.md）', community: true, pro: true },
    ],
  },
  {
    category: '用户与身份管理',
    items: [
      { name: 'SSO 单点登录（基于 Dex）', community: true, pro: true },
      { name: 'SSO 与 AD/LDAP 目录同步', community: false, pro: true },
      { name: 'SSO 与 ADFS 集成', community: false, pro: true },
    ],
  },
  {
    category: '安全与审计',
    items: [
      { name: '合规审计日志（Audit Log）', community: false, pro: true },
    ],
  },
  {
    category: '品牌定制',
    items: [
      { name: '自定义组织 Logo', community: true, pro: true },
      { name: '自定义品牌名称', community: true, pro: true },
      { name: '自定义资料室独立 Logo', community: true, pro: true },
      { name: '自定义资料室横幅（Banners）', community: true, pro: true },
      { name: '完整白标（移除 Powered by 标识等）', community: false, pro: true },
    ],
  },
  {
    category: '技术支持',
    items: [
      { name: 'GitHub / 社区论坛支持', community: true, pro: true },
      { name: '邮件支持', community: false, pro: true },
      { name: '1 个工作日内响应支持', community: false, pro: true },
    ],
  },
];

function renderFeatureCell(value, planName, featureName) {
  if (typeof value === 'string') {
    return <span className="text-xs font-medium text-gray-700">{value}</span>;
  }
  if (value) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        aria-label={`${planName} 支持 ${featureName}`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-500"
      aria-label={`${planName} 不支持 ${featureName}`}
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

export function PricingContent() {
  const [activeFaq, setActiveFaq] = useState(null);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: '既然 Community 版本已经通过 MIT 协议开源，为什么还要选择 Pro 或 Managed BYOC？',
      a: 'Community 开源版包含完整核心 VDR 功能，NDA 签署和动态水印等安全特性也没有任何限制。如果企业需要移除 Powered by 白标、对接 SSO/LDAP、跨文档全文搜索或导出合规审计日志，可以选择自托管的 Pro 版本（$2,999/年）；如果只想省去部署、视频转码、SSL 证书更新与数据库备份的运维精力，即使只使用 Community 开源版，也可以单独订阅 Managed BYOC 托管服务（$1,999/年 或 $199/月）；若同时需要 Pro 商业功能与官方托管运维，可在 Managed BYOC 基础上叠加 Pro 授权（合计 $4,998/年）。',
    },
    {
      q: '团队应该如何在 Pro、Managed BYOC 与 Enterprise 之间做选择？',
      a: '所有付费方案均不限团队人数与访客席位。Managed BYOC（$1,999/年）为纯托管私有云运维服务（不含 Pro 授权），适合希望由官方代为运维 Community 开源版的中小团队；Pro（$2,999/年）解锁白标、SSO（SAML 2.0 / OIDC / Okta / Azure AD / LDAP）、全文搜索与审计日志等全部企业级软件功能（如需托管运维可叠加 Managed BYOC，总计 $4,998/年）；Enterprise 面向需要多租户、多节点高可用集群、纯内网离线隔离（Air-gapped）、专属 Slack 24 小时优先响应 SLA 以及定制功能开发（Co-development）的中大型企业。',
    },
    {
      q: '如果未来我们停止续订 Managed BYOC，系统与数据会受到影响吗？提供退款保证吗？',
      a: '托管部署后的前 14 天内，如果因为网络或存储环境问题无法顺利运行，支持全额退款。由于系统和数据都在您自己的云账号里，即使未来停止续订托管服务，服务也不会被关停，历史文件和访问链接依然正常可用。我们把部署凭据交接给内部运维后，团队可以随时自行接管。',
    },
    {
      q: '我们底层的云端资源（AWS / GCP / Azure）每月大概需要多少花费？服务器规格如何选型？',
      a: '机器配置主要取决于外发文档和视频的数量，跟团队人数关系不大。以普通 PDF 分享为主的团队，4 vCPU / 4GB 内存（AWS/GCP 每月约 $40-$60）就足够 50 人使用；如果有大量高清视频需要转码，建议选配 8 vCPU / 16GB 内存（每月约 $120-$160）。云厂商的账单由您直接支付，我们不收中间费用。',
    },
    {
      q: 'Enterprise 方案中的“定制化功能开发（Co-development）”如何运作？',
      a: '团队会直接跟我们的核心开发人员沟通需求。如果期望的通用功能（例如特定的认证插件、Webhook 或合规报表）符合 ConeShare 的产品规划，我们会在 2~4 周内优先开发并合入主版本；如果是针对贵司专有业务的定制逻辑，我们可以提供独立的私有分支进行长期定制维护。',
    },
    {
      q: '我们可以单独购买商业授权在自有环境或纯内网部署，而不向官方开放 VPC 访问权限吗？',
      a: '可以。购买 Pro 自托管商业授权即可在不开放任何 VPC 权限的情况下通过商业许可证在自有服务器启用白标、SSO/LDAP、全文搜索与合规审计日志；对于需要纯内网物理隔离（Air-gapped）或高可用集群部署的严格合规场景，可选择 Enterprise 方案进行离线交付。',
    },
    {
      q: '年度合同的支付与发票开具流程是怎样的？',
      a: '支持企业对公电汇。合同确认后，我们会开具正式商业发票（Commercial Invoice），并提供标准企业采购合同。',
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            方案与定价
          </h1>

          <p className="mt-4 text-base leading-7 text-gray-600 max-w-2xl mx-auto">
            支持通过 Docker 免费自建 Community 开源版；选择 Pro 版解锁白标、SSO 与合规审计等全部企业级功能；需要官方代为托管运维（无论是托管开源版还是叠加 Pro 授权）可选择 Managed BYOC；中大型企业高可用与定制研发可选择 Enterprise 版。
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
          {/* Tier 1: Community */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Community</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                适合具备运维能力的技术团队，代码完全开源，自主可控。
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-4xl font-bold tracking-tight text-gray-900">$0</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ 永久免费</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">MIT 开源许可协议 • Docker 一键自主部署</p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">包含功能：</p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>核心 VDR 功能：文件目录、动态水印、NDA 签署、Q&A 问答与逐页分析</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>不限成员席位与分享链接</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>挂载本地存储、Nextcloud、Google Drive 或 Dropbox</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>自主管理 Docker 容器、日志收集、SSL 证书与数据备份</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>社区论坛与 GitHub 支持</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="https://github.com/coneshare/coneshare-compose"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
              >
                通过 Docker 部署
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 text-gray-400" />
              </a>
              <div className="mt-2.5 text-center">
                <a
                  href="https://github.com/coneshare/coneshare"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"
                >
                  前往 GitHub 查看源码 &rarr;
                </a>
              </div>
            </div>
          </div>

          {/* Tier 2: Pro */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Pro</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                自托管商业授权版，包含全部企业级功能（不限席位），数据和实例留在您自己的云端。
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-4xl font-bold tracking-tight text-gray-900">$2,999</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ 年</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                不限团队成员与访客席位
              </p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  包含 Community 全部功能，并增加：
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>支持白标：移除 Powered by 标识，自定义品牌色/favicon 等</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>企业级 SSO 与 AD/LDAP 目录同步、ADFS 集成</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>跨文档全文搜索（支持内部用户与资料室外部访客检索 PDF、Office 与 Markdown）</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>企业合规审计日志与安全事件导出</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>支持自有云或服务器商业授权自建，无厂商锁定</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>技术支持：开发团队邮件支持（1 个工作日内回复）</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Pro%20Inquiry"
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
              >
                联系购买 Pro
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                支持对公转账与开具商业发票
              </p>
            </div>
          </div>

          {/* Tier 3: Enterprise */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Enterprise</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                面向中大型企业，满足高可用集群、纯内网离线、高 SLA 与定制研发需求。
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-sm font-medium text-gray-500 mr-1.5">起价</span>
                <span className="text-4xl font-bold tracking-tight text-gray-900">$9,999</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ 年</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">专属高可用架构与定制共创排期</p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  包含 Pro 全部功能，并增加：
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>多租户架构：支持 Multi-tenancy 多租户与多组织（Multi-Org）隔离管理</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>高可用与离线交付：支持多节点高可用集群部署，或纯内网完全离线隔离（Air-gapped）部署</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>更高 SLA 保障：专属 Slack 频道，开发团队 24 小时内优先响应与解决</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>定制化功能开发（Co-development）：通用需求 2-4 周内优先排期上线；专有业务逻辑提供独立私有分支定制维护</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>标准企业采购合同、POC 验证与合规架构协助</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Enterprise%20Inquiry"
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
              >
                联系技术团队
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                支持申请 POC 验证或合规协助
              </p>
            </div>
          </div>
        </div>

        {/* Managed BYOC Add-on Section */}
        <div className="mx-auto mt-10 max-w-7xl rounded-2xl border-2 border-gray-900 bg-gray-50/70 p-8 shadow-sm">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold tracking-tight text-gray-900">
                Managed BYOC（官方托管私有云）
              </h3>

              <p className="mt-3 text-sm leading-6 text-gray-600 max-w-3xl">
                由官方团队负责部署与日常运维，数据和实例完全保留在您自己的云账号内。该服务不含 Pro 商业授权，适合只需托管运维 Community 开源版的团队；若需同步启用 Pro 全部功能，只需额外叠加 Pro 授权（+$2,999 / 年，合计 $4,998 / 年）。无厂商锁定，取消托管后实例仍在您的云端正常运行。
              </p>

              <ul className="mt-5 grid grid-cols-1 gap-3 text-sm text-gray-700 md:grid-cols-2">
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>官方负责交付部署：域名配置、自动 SSL 证书与日志统一收集</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>大文件转码与流媒体播放性能调优</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>业务低峰期安全升级维护与定期数据库备份验证</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>运维邮件支持：托管部署、升级与故障 1 个工作日内由开发团队邮件回复</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 lg:w-80 lg:flex-shrink-0">
              <div>
                <div className="flex items-baseline whitespace-nowrap">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">$1,999</span>
                  <span className="ml-1.5 text-sm font-medium text-gray-500">/ 年</span>
                  <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    折合约 $167/月
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2 text-sm text-gray-700">
                  <span>或按月付费：</span>
                  <strong className="font-semibold text-gray-900">$199 / 月</strong>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                    3 个月起订
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  14 天退款保证
                </p>
              </div>

              <div className="mt-5">
                <a
                  href="mailto:dev@coneshare.com?subject=Managed%20BYOC%20Deployment%20Inquiry"
                  className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
                >
                  申请托管部署
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </a>
                <p className="mt-2 text-center text-xs text-gray-500">
                  支持邮件与 Slack 快速交付沟通
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white pt-12 pb-20 sm:pt-16 sm:pb-24 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              功能对比
            </h2>
          </div>

          <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold text-gray-900">
                    功能特性
                  </th>
                  <th scope="col" className="w-44 px-6 py-4 text-center font-semibold text-gray-900">
                    Community
                    <span className="block text-xs font-normal text-gray-500">开源自建版</span>
                  </th>
                  <th scope="col" className="w-44 px-6 py-4 text-center font-semibold text-gray-900">
                    Pro
                    <span className="block text-xs font-normal text-gray-500">商业授权版</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {FEATURE_COMPARISON_GROUPS.map((group) => (
                  <Fragment key={group.category}>
                    <tr className="bg-gray-50/80">
                      <th
                        colSpan={3}
                        scope="colgroup"
                        className="px-6 py-3 text-xs font-semibold tracking-wide text-gray-900"
                      >
                        {group.category}
                      </th>
                    </tr>
                    {group.items.map((item) => (
                      <tr key={`${group.category}-${item.name}`} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3.5 text-gray-700">{item.name}</td>
                        <td className="px-6 py-3.5 text-center">
                          {renderFeatureCell(item.community, 'Community', item.name)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {renderFeatureCell(item.pro, 'Pro', item.name)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paid Support Info Card */}
          <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50/70 p-8 shadow-sm">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold tracking-tight text-gray-900">
                  Support（付费技术支持）
                </h3>
                <p className="mt-3 text-sm leading-6 text-gray-600 max-w-3xl">
                  面向开源自建或需要额外工程协助的团队，提供由核心研发团队直接交付的单次按小时付费技术支持服务。
                </p>

                <ul className="mt-5 grid grid-cols-1 gap-3 text-sm text-gray-700 md:grid-cols-3">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>覆盖 Email、Slack 与远程连线协助（Remote Session）</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>涵盖私有云部署指导、性能调优与故障排查</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>按实际工时单次预约，灵活计费无需长期订阅绑定</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 lg:w-80 lg:flex-shrink-0">
                <div className="flex items-baseline whitespace-nowrap">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">$150</span>
                  <span className="ml-1.5 text-sm font-medium text-gray-500">/ 小时</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  包含 Email / Slack / Remote Session
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  适合自建部署排障、性能调优与集成指导
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Comparison vs. Competitors */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              支出测算对比
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              基于开启完整资料室（VDR）功能、动态水印与 NDA 签署门禁的年度真实开销测算
            </p>
          </div>

          <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900">对比维度</th>
                  <th className="px-6 py-4 font-semibold text-gray-900">
                    DocSend
                    <span className="block text-xs font-normal text-gray-500">Advanced Data Rooms</span>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-900">
                    Papermark
                    <span className="block text-xs font-normal text-gray-500">Cloud Data Rooms (EUR 原价)</span>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-900 bg-gray-50">
                    ConeShare
                    <span className="block text-xs font-normal text-gray-500">Managed BYOC (托管私有云)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">计费模式（年付基础）</td>
                  <td className="px-6 py-4 text-gray-600">$180/月 (含3人) + $60/人/月</td>
                  <td className="px-6 py-4 text-gray-600">约 $107/月 (€99, 含3人) + ~$36/人/月</td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    $1,999 / 年 托管开源版（不限席位）
                    <span className="block text-xs font-normal text-gray-500">
                      如需 Pro 企业功能另加 $2,999 / 年
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    10 人团队年支出
                    <span className="block text-xs text-gray-400">3 基础席位 + 7 增购席位</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    $7,200 / 年
                    <span className="block text-xs text-gray-400">若按月支付为 $11,160</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    ~$4,300 / 年 (€3,960)
                    <span className="block text-xs text-gray-400">若按月支付约 €5,904</span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    <span>$1,999 / 年</span>
                    <span className="text-xs text-gray-500"> + ~$480 云资源 ≈ </span>
                    <strong>~$2,479 / 年</strong>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    25 人团队年支出
                    <span className="block text-xs text-gray-400">3 基础席位 + 22 增购席位</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    $18,000 / 年
                    <span className="block text-xs text-gray-400">若按月支付为 $27,360</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    ~$10,700 / 年 (€9,900)
                    <span className="block text-xs text-gray-400">若按月支付约 €14,724</span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    <span>$1,999 / 年</span>
                    <span className="text-xs text-gray-500"> + ~$600 云资源 ≈ </span>
                    <strong>~$2,599 / 年</strong>
                    <span className="block text-xs text-gray-500">比 DocSend 节省约 86%</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    50 人团队年支出
                    <span className="block text-xs text-gray-400">3 基础席位 + 47 增购席位</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    $36,000 / 年
                    <span className="block text-xs text-gray-400">若按月支付为 $54,360</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    ~$21,400 / 年 (€19,800)
                    <span className="block text-xs text-gray-400">若按月支付约 €29,424</span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    <span>$1,999 / 年</span>
                    <span className="text-xs text-gray-500"> + ~$960 云资源 ≈ </span>
                    <strong>~$2,959 / 年</strong>
                    <span className="block text-xs text-gray-500">比 DocSend 节省约 92%</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">开源自建版是否包含 VDR？</td>
                  <td className="px-6 py-4 text-gray-500">闭源 SaaS，无自建选项</td>
                  <td className="px-6 py-4 text-gray-500">免费自托管版不包含 Data Rooms</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    开源版包含完整 VDR 功能
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">数据物理存储位置</td>
                  <td className="px-6 py-4 text-gray-600">DocSend 平台</td>
                  <td className="px-6 py-4 text-gray-600">Papermark 平台</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    客户自有的 AWS / GCP / Azure VPC 内
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">数据与环境迁移自由</td>
                  <td className="px-6 py-4 text-gray-600">依赖厂商平台</td>
                  <td className="px-6 py-4 text-gray-600">依赖厂商平台</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    无厂商锁定，可随时移交内部自主维护
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-gray-50 py-20 sm:py-24 border-t border-gray-200">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">常见问题与解答</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">常见疑问（FAQ）</p>
          </div>

          <div className="mt-12 space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-xl border border-gray-200 bg-white transition shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left text-base font-semibold text-gray-900 hover:bg-gray-50/80 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-gray-900' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-sm text-gray-600 leading-relaxed border-t border-gray-100 bg-gray-50/40">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Help Box */}
          <div className="mt-16 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">仍有其他架构或合规疑问？</h3>
            <p className="mt-2 text-sm text-gray-600">
              无论是特定存储挂载、私有网络配置还是合规报表，欢迎直接与技术团队沟通。
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Architecture%20Inquiry"
                className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
              >
                邮件联系技术团队
              </a>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
              >
                体验线上展示环境
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
