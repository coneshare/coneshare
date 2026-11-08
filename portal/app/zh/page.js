import Link from 'next/link';
import { features, solutions } from '../../lib/content';
import { HomepageMockupCarousel } from '../../components/HomepageMockupCarousel';
import { MultiFormatPreviewMockup } from '../../components/MultiFormatPreviewMockup';

export const metadata = {
  title: '开源私有化虚拟资料室 (VDR) 与外发文档追踪系统 - ConeShare',
  description: '告别昂贵的按人头 SaaS 订阅。无需迁移现有网盘，直接为外发机密文档加上访问门禁、防拍照动态水印与逐页阅读追踪。',
};

export default function ZhHomePage() {
  const featuredUseCaseSlugs = ['secure-fundraising', 'engagement-visibility', 'timely-follow-ups'];
  const primaryUseCases = featuredUseCaseSlugs
    .map((slug) => solutions.find((solution) => solution.slug === slug))
    .filter(Boolean);

  const zhUseCases = [
    {
      slug: 'secure-fundraising',
      name: '初创股权融资',
      description: '实时掌握投资人翻阅 BP 的停留秒数；识别内部转发轨迹，顺藤摸瓜找到幕后真正拍板的合伙人。',
      icon: primaryUseCases[0]?.icon,
    },
    {
      slug: 'engagement-visibility',
      name: '大客户商务销售',
      description: '外发定制方案与报价单前强制签署 NDA；全屏平铺动态水印，彻底杜绝同行套价与拍照泄露。',
      icon: primaryUseCases[1]?.icon,
    },
    {
      slug: 'timely-follow-ups',
      name: '并购尽调与法务审计',
      description: '一室多链按买方严格隔离底稿目录与问答；纯内网离线部署，严守律所与投行合规审计红线。',
      icon: primaryUseCases[2]?.icon,
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <div className="bg-white">
        <div className="relative isolate px-6 pt-14 lg:px-8">
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
          <div className="pt-4 sm:pt-6 pb-12 sm:pb-16">
            <div className="mx-auto max-w-3xl text-center">
              {/* Release Pill */}
              <div className="mb-8 flex justify-center">
                <Link
                  href="/blog/coneshare-v1-11-0-dataroom-redesign-banner-gallery-download-all-zh"
                  className="inline-flex items-center gap-x-2 rounded-full border border-gray-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-300"
                >
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>ConeShare v1.11 已发布：全新资料室访客界面，支持整库一键打包下载 &rarr;</span>
                </Link>
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                数据自主掌控的企业级私有化资料室
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
                告别昂贵的按人头 SaaS 订阅。无需迁移现有网盘，直接为外发机密文档加上访问门禁、防拍照动态水印与逐页阅读追踪。
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="/zh/virtual-dataroom"
                  className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  了解虚拟资料室
                </Link>
                <Link href="/demo" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  查看在线演示 <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>✓ 直连 Nextcloud 与企业私有存储，免数据迁移</span>
                <span className="hidden sm:inline">•</span>
                <span>✓ 逐页停留时长统计与内部转发识别</span>
                <span className="hidden sm:inline">•</span>
                <span>✓ 100% 私有化部署，支持纯内网物理隔离</span>
              </div>
            </div>
            <div className="mt-16 sm:mt-20 mx-auto max-w-5xl px-6 lg:px-8">
              <HomepageMockupCarousel locale="zh" />
            </div>
          </div>
        </div>
      </div>

      {/* Why Coneshare Section */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">为什么选择 Coneshare</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                传统网盘专为内部协作设计，而非对外安全分发
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                云盘在企业内部协作时非常高效，但普通共享链接一旦发出便失去一切控制。您无法得知谁查看了文件、各页停留了多久，更无法阻止被随意转发泄密。
              </p>

              {/* Founder's Note Card */}
              <div className="mt-6 rounded-xl border border-gray-200/90 bg-gray-50/70 p-5 text-sm text-gray-700 shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
                  <span className="text-base">💡</span>
                  <span>我们创立 Coneshare 的初衷</span>
                </div>
                <p className="italic text-gray-600 leading-relaxed text-[13.5px]">
                  &ldquo;像 DocSend 这样的工具，仅查看谁打开了文件，每人每月就要收取上百美元。我们打造 Coneshare，是希望团队既能保留自有存储，又能获得防泄密动态水印与秒级阅读洞察，而成本还不到前者的十分之一。&rdquo;
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3 pt-2.5 border-t border-gray-200/70 text-xs text-gray-500">
                  <Link href="/zh/about" className="font-medium text-gray-900 hover:underline">
                    了解我们的故事与技术原则 →
                  </Link>
                  <span>•</span>
                  <Link href="/alternatives/docsend" className="font-medium text-gray-900 hover:underline">
                    与 DocSend 详细对比 →
                  </Link>
                </div>
              </div>
            </div>

            <div className="space-y-6 text-base leading-7 text-gray-600 lg:col-span-7 lg:pl-6">
              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">1</span>
                  现有网盘直连，零数据迁移
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  直连 Nextcloud、本地存储或 S3，原网盘文件改动自动同步，无需忍受漫长的数据搬迁。
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">2</span>
                  发出后依然全程受控
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  随时撤回链接、修改密码或关闭下载；强制全屏动态水印与签署 NDA，彻底终结“外发即失控”。
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">3</span>
                  固定低成本，拒绝按人头高价订阅
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  打破传统 VDR 与海外 SaaS 每人每月数十美元的沉重负担，平价私有化部署，不限制团队成员规模。
                </p>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link href="/demo" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  亲自体验在线演示环境 <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Honest Fit Section */}
      <div className="border-y border-gray-200/80 bg-gray-50/60 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Coneshare 是否适合您的团队？
            </h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200/80 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-900">
                <span className="text-emerald-600 font-bold">✓</span> 特别适合以下团队：
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>高频外发商业计划书 (BP)、大客户提案或并购尽调文件，需要精确获知对方翻阅进度与停留时长。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>希望文件保留在现有存储中，拒绝将敏感数据整体搬迁至第三方公有云服务商。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>需要访客专属动态水印、NDA 保密签署门禁以及随时一键撤销链接访问权限。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>严守企业数据合规红线，要求 100% 私有化部署或在纯内网离线运行。</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <span className="text-gray-400 font-bold">✕</span> 并不适合以下情况：
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>仅做日常文件简单传送，普通网盘共享链接已完全满足需求。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>寻找全面替代主存储系统、做底层大容量归档的对象存储方案。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>仅需要多人实时协同编辑文档，而无对外安全分发与行为追踪需求。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>无需任何水印保护、保密门禁或访客阅读追踪。</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">核心能力</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              无需改变存储习惯，外发即享企业级安全与追踪
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              虚拟资料室、动态水印、免安装在线预览与页面级分析，一站式交付。
            </p>
          </div>

          {/* Two Hero Feature Showcase Cards */}
          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2">
            
            {/* Killer Card 1: Virtual Data Rooms */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  虚拟资料室 (Virtual Data Rooms)
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  专为尽调、审计与商务提案打造的结构化资料室。支持一室多链与分组权限隔离，按买方独立控制可访问目录与下载权限。
                </p>
              </div>

              {/* Streamlined Minimalist Mockup: 2-Tier Permission Scope */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">📁</span>
                    <span className="font-semibold text-gray-900">大客户商务方案 (Acme Corp)</span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {/* Scope 1: Procurement & Legal Link */}
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-950">法务与采购专属链接</span>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        已签保密协议 (NDA) ✓
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
                      <span>定制报价模型 + 主协议合同草案</span>
                      <span className="font-mono text-[10px] text-indigo-700 font-medium">带水印预览</span>
                    </div>
                  </div>

                  {/* Scope 2: Evaluation Link */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">技术评估公开链接</span>
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        仅密码保护
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span>技术架构白皮书</span>
                      <span className="font-mono text-[10px] text-amber-700 font-medium">🔒 商业条款已隐藏</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/zh/virtual-dataroom"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-indigo-600 transition"
                >
                  探索虚拟资料室功能 <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Killer Card 2: Dynamic Watermarking */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  动态防泄密水印
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  全屏平铺访客邮箱、IP 与时间戳，兼顾清晰阅读与防翻拍威慑，从源头遏制手机拍照与截图泄密。
                </p>
              </div>

              {/* Dual-State Contrast */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-150 pb-2.5 text-xs">
                  <span className="font-semibold text-gray-900">泄密溯源效果对比</span>
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  {/* Left: Raw */}
                  <div className="rounded-lg border border-dashed border-gray-250 bg-gray-50/70 p-2.5 text-[10px]">
                    <div className="flex items-center justify-between text-gray-500 pb-1.5 border-b border-gray-200/60">
                      <span className="font-medium">普通网盘分享</span>
                      <span className="text-amber-600 font-bold">⚠️</span>
                    </div>
                    <div className="mt-2 space-y-1 text-gray-400">
                      <p className="font-medium text-gray-600">商务报价明细</p>
                      <p>¥320,000 / 年</p>
                      <p className="text-[9px] text-red-500 pt-1">无任何溯源标识</p>
                    </div>
                  </div>

                  {/* Right: Protected */}
                  <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/30 p-2.5 text-[10px] overflow-hidden">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-around -rotate-12 opacity-35 select-none z-10">
                      <span className="whitespace-nowrap font-mono text-[8px] font-bold text-red-700">
                        alex@acmecorp.com • 2026-09-29
                      </span>
                      <span className="whitespace-nowrap font-mono text-[8px] font-bold text-red-700 pl-4">
                        alex@acmecorp.com • 2026-09-29
                      </span>
                    </div>

                    <div className="relative z-0">
                      <div className="flex items-center justify-between text-emerald-950 pb-1.5 border-b border-emerald-200/60 font-medium">
                        <span>Coneshare 加密分享</span>
                        <span className="text-emerald-600 font-bold">✓</span>
                      </div>
                      <div className="mt-2 space-y-1 text-gray-700">
                        <p className="font-medium text-gray-900">商务报价明细</p>
                        <p>¥320,000 / 年</p>
                        <p className="text-[9px] text-emerald-700 font-semibold pt-1">访客身份已绑定</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/features/dynamic-watermarking"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  探索动态水印特性 <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Killer Card 3: Multi-Format Online Preview */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  多格式免安装在线预览
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  直接在现代浏览器中清晰预览 PDF、Office 文档、多工作表 Excel 表格、苹果 HEIC 照片以及高清视频，对方无需安装任何插件。
                </p>
              </div>

              <MultiFormatPreviewMockup locale="zh" />

              <div className="mt-6 pt-2">
                <Link
                  href="/features/online-document-preview"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  了解多格式在线预览 <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Killer Card 4: Page-by-Page Analytics */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  页面级深度阅读分析
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  精确记录每页停留秒数、完成率与音视频观看进度。自动识别内部转发轨迹，精准锁定高意向买家与兴趣焦点。
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-gray-900">alex@acmecorp.com</span>
                  </div>
                  <span className="text-gray-500 font-mono">总停留 4分32秒</span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>第1页 • 方案概览</span>
                      <span className="font-mono">12秒</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gray-300" style={{ width: '12%' }} />
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-50/90 p-2.5 border border-emerald-200">
                    <div className="flex justify-between text-xs font-semibold text-emerald-950">
                      <span>第2页 • 实施周期与定制报价</span>
                      <span className="font-mono text-emerald-700 font-bold">2分14秒</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-emerald-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: '85%' }} />
                    </div>
                    <div className="mt-1.5 text-[10px] font-medium text-emerald-800">
                      🔥 占会话总时长 51% • 极高关注度
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>第3页 • 落地部署与团队支持</span>
                      <span className="font-mono">18秒</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gray-300" style={{ width: '18%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/features/advanced-analytics"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  探索阅读分析特性 <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

          </div>

          {/* Minimalist Centered Feature Matrix Link */}
          <div className="mt-14 text-center">
            <Link
              href="/features"
              className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
            >
              查看完整功能列表 <span className="ml-1" aria-hidden="true">→</span>
            </Link>
          </div>

        </div>
      </div>

      {/* Solutions Section */}
      <div id="solutions" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">应用场景</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              为高价值机密外发场景，量身打造合规安全屏障
            </h2>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-5xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {zhUseCases.map((solution) => (
                <div key={solution.slug} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    {solution.icon && <solution.icon className="h-5 w-5 flex-none text-gray-900" aria-hidden="true" />}
                    {solution.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                    <p className="flex-auto">{solution.description}</p>
                    <p className="mt-6">
                      <Link href={`/solutions/${solution.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                        了解详情 <span aria-hidden="true">→</span>
                      </Link>
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 text-center">
              <Link href="/solutions" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                查看全部应用场景 <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
