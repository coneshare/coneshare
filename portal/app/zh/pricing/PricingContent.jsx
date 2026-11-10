'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

export function PricingContent() {
  const [billingCycle, setBillingCycle] = useState('monthly'); // 默认按月支付
  const [activeFaq, setActiveFaq] = useState(null);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: '既然 Community 版本已经通过 MIT 协议开源，为什么还要选择付费的 Managed BYOC？',
      a: 'Community 开源版包含完整功能，NDA 签署和动态水印等安全特性也没有任何限制。不过，自行维护视频转码、Office 渲染、证书更新和数据库备份需要持续投入运维精力。Managed BYOC 则由我们负责在您的云上完成部署和日常维护，省去内部团队折腾运维的时间。',
    },
    {
      q: '面对 20-40 人的团队，我们该如何挑选 Managed BYOC（档位 2）与 Enterprise（档位 3）？',
      a: '主要看团队是否需要统一的身份集成与深度定制能力。如果使用普通邮箱密码登录，无论是 10 人还是 50 人团队，Managed BYOC 都是统一价格。如果公司 IT 或合规团队要求接入 SSO（Okta / Azure AD）、LDAP 同步、跨文档全文搜索、审计日志导出，或者需要定制特定业务功能，则需要选择 Enterprise 方案。',
    },
    {
      q: '如果未来我们停止续订 Managed BYOC，系统与数据会受到影响吗？提供退款保证吗？',
      a: '部署后的前 14 天内，如果因为网络或存储环境问题无法顺利跑起来，支持全额退款。由于系统和数据都在您自己的云账号里，即使未来停止续费，服务也不会被关停，历史文件和访问链接依然正常可用。我们把部署凭据交接给内部运维后，团队可以随时自行接管。',
    },
    {
      q: '我们底层的云端资源（AWS / GCP / Azure）每月大概需要多少花费？服务器规格如何选型？',
      a: '机器配置主要取决于外发文档和视频的数量，跟团队人数关系不大。以普通 PDF 分享为主的团队，4 vCPU / 4GB 内存（AWS/GCP 每月约 $40-$60）就足够 50 人使用；如果有大量高清视频需要转码，建议选配 8 vCPU / 16GB 内存（每月约 $120-$160）。云厂商的账单由您直接支付，我们不收中间费用。',
    },
    {
      q: 'Enterprise 方案中的“需求共创与优先排期”如何运作？',
      a: '团队会直接跟我们的核心开发人员沟通需求。如果期望的功能（例如特定的认证插件、Webhook 或合规报表）符合 ConeShare 的产品规划，我们会在 2~4 周内优先开发并合并到主版本中，不收额外费用；如果是针对贵司专有业务的定制逻辑，我们可以提供单独的私有分支进行长期维护。',
    },
    {
      q: '我们可以单独购买 Enterprise 商业授权在自有环境离线部署，而不向官方开放 VPC 访问权限吗？',
      a: '可以。对于有严格安全规范或纯内网隔离环境的团队，Enterprise 方案支持通过离线商业许可证（.lic 文件）交付，直接在您完全自管的服务器上启用 SSO/LDAP、全文搜索和合规审计日志。',
    },
    {
      q: '年度合同的支付与发票开具流程是怎样的？',
      a: '支持企业对公电汇。合同确认后，我们会开具正式商业发票（Commercial Invoice），并提供标准企业采购合同。',
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative isolate px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:px-8">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #d1d5db 1px, transparent 0)',
            backgroundSize: '20px 20px',
            maskImage: 'linear-gradient(to bottom, white, transparent)',
          }}
          aria-hidden="true"
        />

        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            方案与定价
          </h1>

          <p className="mt-4 text-base leading-7 text-gray-600 max-w-2xl mx-auto">
            支持通过 Docker 免费自建开源版；也可以选择官方托管，在您的 AWS、GCP 或 Azure
            私有云中完成部署与维护；需要单点登录与合规审计可选择 Enterprise 企业版。
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 flex items-center justify-center">
            <div className="relative flex items-center rounded-full bg-gray-100 p-1 border border-gray-200">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  billingCycle === 'monthly'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                按月支付
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  billingCycle === 'annual'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                按年支付
              </button>
            </div>
          </div>
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

          {/* Tier 2: Managed BYOC (Hero / Most Popular) */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-gray-900 bg-white p-8 shadow-md transition hover:shadow-lg">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-gray-900 px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
                最受欢迎
              </span>
            </div>

            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Managed BYOC</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                由官方负责部署与日常维护，数据和实例完全保留在您自己的云账号内。
              </p>

              <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {billingCycle === 'annual' ? (
                  <>
                    <div className="flex items-baseline whitespace-nowrap">
                      <span className="text-4xl font-bold tracking-tight text-gray-900">$3,999</span>
                      <span className="ml-1.5 text-sm font-medium text-gray-500">/ 年</span>
                    </div>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                      折合约 $333/月
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline whitespace-nowrap">
                      <span className="text-4xl font-bold tracking-tight text-gray-900">$399</span>
                      <span className="ml-1.5 text-sm font-medium text-gray-500">/ 月</span>
                    </div>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 whitespace-nowrap">
                      3 个月起订
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {billingCycle === 'annual'
                  ? '已免除 $500 初始化部署费 • 享有 14 天全额退款保证'
                  : '首期总额 $1,697 • 享有 14 天退款保证'}
              </p>

              <div className="mt-6 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  包含 Community 全部功能，并增加：
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>部署在您自有的私有云 VPC 内，数据物理隔离</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>支持白标：移除 Powered by 标识，自定义域名与品牌色</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>不限团队席位，外部访客访问完全免费</span>
                  </li>
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
                    <span>无厂商锁定：取消订阅后开源实例仍留在您的云端正常运行</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>技术支持：24 小时内由开发团队邮件回复</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
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

          {/* Tier 3: Enterprise */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Enterprise</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                适合需要对接 SSO 单点登录、全文搜索、审计日志或专属业务定制的团队。
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-sm font-medium text-gray-500 mr-1.5">起价</span>
                <span className="text-4xl font-bold tracking-tight text-gray-900">$9,999</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ 年</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">专属定制共创排期</p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  包含 Managed BYOC 全部功能，并增加：
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>SSO 单点登录与目录同步（SAML 2.0 / OIDC / Okta / Azure AD / LDAP）</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>跨文档全文搜索（支持 PDF、Office 与 Markdown 内容）</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>企业合规审计日志与安全事件导出</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>支持多节点高可用集群部署，或纯内网离线隔离运行</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>需求共创：通用功能 2-4 周优先开发上线；专有业务逻辑提供独立分支维护</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>专属 Slack 频道，开发团队 24 小时内优先响应</span>
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
                    $3,999 / 年 统一价格（不限席位）
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
                    <span>$3,999 / 年</span>
                    <span className="text-xs text-gray-500"> + ~$480 云资源 ≈ </span>
                    <strong>~$4,479 / 年</strong>
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
                    <span>$3,999 / 年</span>
                    <span className="text-xs text-gray-500"> + ~$600 云资源 ≈ </span>
                    <strong>~$4,599 / 年</strong>
                    <span className="block text-xs text-gray-500">比 DocSend 节省约 74%</span>
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
                    <span>$3,999 / 年</span>
                    <span className="text-xs text-gray-500"> + ~$960 云资源 ≈ </span>
                    <strong>~$4,959 / 年</strong>
                    <span className="block text-xs text-gray-500">比 DocSend 节省约 86%</span>
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
