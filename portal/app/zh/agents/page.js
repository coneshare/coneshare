import Link from 'next/link';
import { Play, ShieldCheck, HardDrive, Server } from 'lucide-react';
import { McpCodeCard } from '../../../components/McpCodeCard';
import { AgentScreenshotsShowcase } from '../../../components/AgentScreenshotsShowcase';
import { AgentVideoShowcase } from '../../../components/AgentVideoShowcase';
import { AgentToolCatalog } from '../../../components/AgentToolCatalog';
import { AgentsFaq } from '../../../components/AgentsFaq';
import {
  DEFAULT_AGENT_VIDEO_POSTER,
  DEFAULT_AGENT_VIDEO_URL,
  TOTAL_MCP_TOOLS,
} from '../../../lib/agentsData';

export const metadata = {
  title: 'ConeShare MCP | 让 ChatGPT、Gemini 和本地 Agent 直接管理资料室',
  description:
    '通过远程 MCP 把 ChatGPT、Google Gemini、Claude.ai 或命令行 Agent 接到 ConeShare，在 ConeShare 授权 AI 客户端安全访问数据。直接在对话里保存并分享 AI 聊天记录、生成受控文档链接。',
  keywords: [
    'ChatGPT MCP',
    'Gemini MCP',
    'Claude.ai MCP',
    'OAuth 2.1 MCP',
    '分享 ChatGPT 聊天记录',
    'AI 对话存为文档',
    '私有化虚拟资料室 MCP',
    'Model Context Protocol',
    'Claude Code MCP',
    'Codex MCP',
  ],
  alternates: {
    canonical: '/zh/agents',
  },
};

const ZH_SECURITY_PILLARS = [
  {
    name: '由你授权 AI 能访问哪些数据',
    description:
      '接入网页端 AI 时，在 ConeShare 登录页面就能直接勾选只读或读写权限（read / write）。删除文件、后台管理和访客隐私明细默认都会被拦截。',
    icon: ShieldCheck,
  },
  {
    name: '服务端控制访问规则和水印',
    description:
      '邮箱验证、访问密码、NDA 协议、链接有效期，以及 PDF、Office 和图片的动态水印，都在服务端直接生效，提示词绕不过去。',
    icon: Server,
  },
  {
    name: '文件留在你自己的存储里',
    description:
      '支持直接连 Nextcloud、Google Drive、Dropbox 或本地磁盘，也可以私有部署整套服务。通过 AI 存下来的文档和外发记录都由你自己控制。',
    icon: HardDrive,
  },
];

const ZH_FAQS = [
  {
    question: '怎么在 ChatGPT、Gemini 或 Claude.ai 里连接 ConeShare？',
    answer:
      '在 AI 客户端里新建一个自定义 MCP 连接，填入 https://app.coneshare.com/mcp/sse（如果自己部署了服务，换成你自己的域名）。接着在弹出的 ConeShare 页面登录并选择只读或读写权限即可。',
  },
  {
    question: '为什么不直接发 AI 平台自带的分享链接，而要存到 ConeShare？',
    answer:
      'AI 平台自带的分享每次只能生成一条孤立链接，没法分类汇总，也缺少权限控制和访问统计。在 ConeShare 里，你可以把多条 AI 对话按项目加进各自的资料室，每个资料室独立管理权限、密码、邮箱验证、有效期和分享链接，发给不同的人互不干扰。',
  },
  {
    question: '网页端 AI 和本地 CLI 工具拿到的权限一样吗？',
    answer:
      '不一样。网页端 AI 在 ConeShare 页面通过标准 OAuth 2.1 授权登录，只开放安全的只读或读写权限，删文件、管账号和看访客明细的接口默认禁止。Claude Code、Codex、Cursor、Antigravity CLI 这类本地工具如果配了你的 API Key，就可以按密钥级别（read_only、read_write 或 full_access）调用更多功能。',
  },
  {
    question: '用之前要在本地装 Python 或跑 MCP 服务吗？',
    answer:
      '不用。ConeShare 提供的是远程 HTTPS MCP 接口（/mcp/sse），云端版和私有部署版都直接通过 HTTPS 连接，本地不用跑守护进程。',
  },
  {
    question: '如果别人在对话里套话，AI 会把水印或禁止下载的限制关掉吗？',
    answer:
      '不会。水印渲染、NDA 确认、密码校验和下载拦截全部在 ConeShare 服务端执行。另外，动态水印目前支持 PDF、Office 和图片；AI 保存下来的 Markdown 或纯文本文档支持邮箱验证、密码、NDA、过期时间和访问统计。',
  },
];

export default function ZhAgentsPage() {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'ConeShare MCP Server',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, macOS, Linux, Windows',
      url: 'https://coneshare.com/zh/agents',
      description:
        '通过远程 MCP 让 ChatGPT、Google Gemini、Claude.ai 及命令行 Agent 在 ConeShare 授权下安全保存、分享和追踪文档与虚拟资料室。',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: 'ChatGPT 网页端连接 ConeShare MCP 演示',
      description:
        '演示如何在 ConeShare 授权 ChatGPT 网页端访问数据，直接在对话里生成受控文档分享链接，并保存分享跟 AI 的聊天记录。',
      thumbnailUrl: `https://coneshare.com${DEFAULT_AGENT_VIDEO_POSTER}`,
      contentUrl: DEFAULT_AGENT_VIDEO_URL,
      uploadDate: '2026-11-19',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: ZH_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ];

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* 首屏 Hero + 真实截图展示 */}
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

          <div className="pt-4 sm:pt-6 pb-16 sm:pb-20">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                让 ChatGPT、Gemini 和 CLI Agent 直接操作你的资料室
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
                把网页端 AI 或命令行工具连上 ConeShare。你可以把多条 AI 对话按项目归档进各自资料室，统一管理并独立分享，也可以直接给现有文件生成受控外链。
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <a
                  href="#setup"
                  className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  连接你的 AI
                </a>
                <a
                  href="#video-demo"
                  className="inline-flex items-center gap-2 text-sm font-semibold leading-6 text-gray-900 hover:text-gray-600 transition-colors group"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    <Play className="h-3 w-3 fill-gray-900 text-gray-900 ml-0.5" />
                  </span>
                  <span>观看演示</span>
                </a>
              </div>
            </div>

            <div className="mt-14 sm:mt-16 mx-auto max-w-5xl">
              <AgentScreenshotsShowcase locale="zh" />
            </div>
          </div>
        </div>
      </div>

      {/* 二屏：ChatGPT 网页端 + MCP 视频演示 */}
      <div
        id="video-demo"
        className="border-y border-gray-200/80 bg-gray-50/70 py-20 sm:py-24 scroll-mt-16"
      >
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">视频演示</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl text-balance">
              看看 ChatGPT 接入 ConeShare MCP 后能做什么
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600 max-w-2xl mx-auto">
              在 ConeShare 登录授权后，直接在聊天框里给现有文件生成外发链接，或把多条 AI 对话放进各自的资料室里统一管理和分享。
            </p>
          </div>

          <AgentVideoShowcase
            locale="zh"
            videoUrl={DEFAULT_AGENT_VIDEO_URL}
            posterUrl={DEFAULT_AGENT_VIDEO_POSTER}
            title="ChatGPT 连接 ConeShare MCP 演示"
          />
        </div>
      </div>

      {/* 三屏：接入配置（网页授权与 CLI API Key） */}
      <div id="setup" className="bg-white py-20 sm:py-24 scroll-mt-16">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">接入配置</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              一分钟接上，不用跑本地服务
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              网页端 AI 直接登录 ConeShare 授权即可使用；CLI 和桌面工具填上 API Key 就能连。
            </p>
          </div>

          <McpCodeCard locale="zh" />

          <dl className="mt-16 pt-14 border-t border-gray-200 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-3">
            {ZH_SECURITY_PILLARS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.name} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    <Icon className="h-5 w-5 flex-none text-gray-900" aria-hidden="true" />
                    {item.name}
                  </dt>
                  <dd className="mt-3 text-sm leading-6 text-gray-600">{item.description}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      {/* 四屏：29 个 MCP 工具目录 */}
      <div className="border-y border-gray-200/80 bg-gray-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">MCP 工具</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {TOTAL_MCP_TOOLS} 个可用工具，管文件、建资料室、发链接
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              从保存 AI 对话、搜索资料室内容，到设置外链密码和查看访问数据，下面这些工具都能直接调用。
            </p>
          </div>

          <AgentToolCatalog locale="zh" />
        </div>
      </div>

      {/* 五屏：常见问题与底部 CTA */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              常见问题
            </h2>
          </div>
          <AgentsFaq locale="zh" faqs={ZH_FAQS} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            想接上自己的 AI 试试看？
          </h2>
          <p className="mt-4 text-base text-gray-600">
            可以直接用 ConeShare 云端版，也可以按文档私有部署到自己的服务器上，两边都能直接连上你的 AI 客户端。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="https://app.coneshare.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors"
            >
              免费注册使用
            </Link>
            <Link
              href="https://docs.coneshare.com/en/mcp-server/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-600 px-3 py-2"
            >
              查看 MCP 文档 <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
