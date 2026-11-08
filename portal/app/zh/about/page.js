import Link from 'next/link';

export const metadata = {
  title: '关于 ConeShare | 守住外发文档机密，保留 100% 数据自主权',
  description:
    '深入了解我们创立 ConeShare 的初衷，以及它如何在您现有存储之上提供虚拟资料室与深度阅读追踪。',
  alternates: {
    canonical: '/zh/about',
  },
};

const principles = [
  {
    title: '文件不动，能力直连',
    body:
      '企业已经在用 Nextcloud、本地存储或各类云盘管理日常文件。ConeShare 直接挂载您现有的存储系统，无需把敏感数据重新上传或迁移到第三方平台。',
  },
  {
    title: '核心代码 100% 开源透明',
    body:
      '安全产品不能靠“口头承诺”建立信任。ConeShare 核心代码完全开源，您的安全团队可以随时审查每一行代码逻辑，验证数据流向，并放心地部署在企业内网机房。',
  },
  {
    title: 'API 优先与自动化集成',
    body:
      '从生成受控链接、拉取阅读审计日志到配置 Webhook 通知，所有核心能力均提供标准 API。您可以轻松将其接入企业微信、飞书、内部 CRM 或自动化运维脚本。',
  },
];

const trustCommitments = [
  {
    title: '代码 100% 开源可审计',
    body: '前后端核心源码完全公开，没有任何隐藏的“后门”或非对称加密黑盒，通过社区与全球安全专家的共同审阅。',
  },
  {
    title: '支持纯内网物理断网运行',
    body: '支持离线许可证与气隙隔离（Air-gapped）环境部署，不向任何外部公网服务器反向回传文档内容或分析遥测数据。',
  },
  {
    title: '永不挪动企业核心资产',
    body: '文档始终保留在企业现有的 Nextcloud 或本地机房 NAS 中，ConeShare 仅在本地生成沙箱渲染缓存与只读水印流。',
  },
  {
    title: '企业级 1v1 交付支持',
    body: '为中大型企业提供专属部署架构规划、SSO/LDAP 对接、高可用容灾演练与定制化功能支持。',
  },
];

const signupUrl = 'https://app.coneshare.com/signup';

export default function ZhAboutPage() {
  return (
    <div className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">关于 ConeShare</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            把文件留在自己的服务器上，把安全与洞察握在自己手里
          </h1>
        </div>

        <section className="mx-auto mt-16 max-w-4xl sm:mt-20">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">我们解决的核心痛点</h2>
            <p>
              融资路演、并购尽调、法务审阅与大客户招投标，每天都有大量机密文件需要发给外部合作方。文件一旦发出，您最关心的是：对方到底看没看？在报价或核心条款页停了多久？有没有被私自下载或转发给竞争对手？
            </p>
            <p>
              传统企业网盘专为内部协作设计，外发链接一旦发出便失去控制。<strong>ConeShare 正是为了解决这一痛点而生</strong>：无需搬迁现有网盘，直接在您的自有存储之上加上访问门禁、前置 NDA 签署、防拍照动态水印与逐页阅读追踪。
            </p>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">技术理念</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">我们的产品原则</h2>
            </div>
            <div className="space-y-8 lg:col-span-8">
              {principles.map((principle, index) => (
                <div key={principle.title} className="grid gap-4 sm:grid-cols-12">
                  <p className="text-sm font-semibold text-gray-400 sm:col-span-2">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <div className="sm:col-span-10">
                    <h3 className="text-base font-semibold text-gray-900">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{principle.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">面向未来</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">AI 时代的研发与产品理念</h2>
            </div>
            <div className="space-y-6 lg:col-span-8">
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-bold">1</span>
                  <h3 className="text-base font-semibold text-gray-900">借助 AI 提升研发效率，把节省的成本返还给用户</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  我们在日常研发与测试中深度使用 AI 编程工具，让精干的工程团队也能以极高效率持续交付稳定、可靠的企业级功能。大幅降低的研发与维护成本，直接转化为更厚道的定价：开源核心版永久免费，企业版私有部署费用也仅为传统商业 SaaS 的几分之一。
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-bold">2</span>
                  <h3 className="text-base font-semibold text-gray-900">将 AI Agent 融入产品，打造更实用的智能文档空间</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  虚拟资料室不应该只是静态存放文件的地方。ConeShare 原生支持标准 MCP 协议对接外部 AI 智能体，并逐步内置文档智能问答、尽调辅助审阅、自动摘要与敏感信息排查能力。所有 AI 能力均支持按需开启并对接本地私有大模型，在严守数据不出内网的前提下，让资料室真正具备主动分析能力。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 为什么企业放心将核心机密交给 ConeShare：开源合规与安全承诺 */}
        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">安全与信任</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">为什么放心将核心机密交给 ConeShare</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-8">
              {trustCommitments.map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-4xl rounded-lg bg-gray-900 px-6 py-8 text-white sm:px-8">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <h2 className="text-2xl font-bold tracking-tight">体验在线演示环境</h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                在将 ConeShare 部署到企业专属服务器之前，您可以在我们的公共演示环境中完整测试文档阅读器、权限管控及分析看板。
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
              <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                在线演示
              </Link>
              <Link href={signupUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                立即开始
              </Link>
              <Link href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                GitHub 源码
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl text-sm leading-6 text-gray-600">
          <p>
            商务采购咨询或安全合规评估，欢迎联系{' '}
            <a href="mailto:sales@coneshare.com" className="font-semibold text-gray-900 hover:text-gray-700">
              sales@coneshare.com
            </a>
            。技术支持或漏洞提报，请发送至{' '}
            <a href="mailto:dev@coneshare.com" className="font-semibold text-gray-900 hover:text-gray-700">
              dev@coneshare.com
            </a>
            。
          </p>
        </section>
      </div>
    </div>
  );
}
