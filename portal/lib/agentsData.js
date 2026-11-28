/**
 * Bilingual static data for `/agents` and `/zh/agents`.
 */

export const DEFAULT_AGENT_VIDEO_URL = 'https://assets.coneshare.com/coneshare-ai-mcp-v1.mp4';
export const DEFAULT_AGENT_VIDEO_POSTER = '/agent-poster.jpg';

const SCREENSHOTS_BY_LOCALE = {
  en: [
    {
      id: 'connect-url',
      src: '/screenshots/agent-mcp-plugin.png',
      alt: 'Adding https://app.coneshare.com/mcp/sse as a custom MCP server in ChatGPT',
      caption:
        'Add https://app.coneshare.com/mcp/sse as a custom MCP server in ChatGPT, Gemini, or Claude.ai.',
    },
    {
      id: 'authorize-oauth',
      src: '/screenshots/agent-oauth-scope.png',
      alt: 'ConeShare OAuth authorization screen showing read and write permission scopes for ChatGPT',
      caption:
        'Sign in to ConeShare in your browser and approve read and write scopes.',
    },
    {
      id: 'get-dataroom',
      src: '/screenshots/agent-get-dataroom.png',
      alt: 'Calling @Coneshare in ChatGPT to inspect the AI notes Data Room and its saved Markdown documents',
      caption:
        'Invoke @Coneshare in chat to inspect your Data Rooms, settings, and existing documents.',
    },
    {
      id: 'save-conversation',
      src: '/screenshots/agent-save-converation.png',
      alt: 'Calling @Coneshare in ChatGPT to save the full conversation as a Markdown document in a Data Room and return a share link',
      caption:
        'Save whole AI conversations directly into a Data Room as Markdown and return a share link.',
    },
  ],
  zh: [
    {
      id: 'connect-url',
      src: '/screenshots/agent-mcp-plugin.png',
      alt: '在 ChatGPT 中填写 https://app.coneshare.com/mcp/sse 添加自定义 MCP 服务',
      caption:
        '在 ChatGPT、Gemini 或 Claude.ai 中填入 https://app.coneshare.com/mcp/sse 添加自定义 MCP 连接。',
    },
    {
      id: 'authorize-oauth',
      src: '/screenshots/agent-oauth-scope.png',
      alt: 'ConeShare OAuth 授权页面，显示供 ChatGPT 确认的 read 与 write 权限范围',
      caption:
        '在浏览器中登录 ConeShare，确认并授权 read 与 write 访问权限。',
    },
    {
      id: 'get-dataroom',
      src: '/screenshots/agent-get-dataroom.png',
      alt: '在 ChatGPT 中通过 @Coneshare 查询 AI notes 资料室及其内部已保存的 Markdown 文档',
      caption:
        '在对话中直接调用 @Coneshare，查看资料室详情、权限配置及已有文档。',
    },
    {
      id: 'save-conversation',
      src: '/screenshots/agent-save-converation.png',
      alt: '在 ChatGPT 中通过 @Coneshare 将整段对话保存为 Markdown 文档并归档到资料室，同时生成分享链接',
      caption:
        '在对话中一键把完整聊天记录存为 Markdown 文档放进指定资料室，并直接返回分享链接。',
    },
  ],
};

export const AGENT_SCREENSHOTS = SCREENSHOTS_BY_LOCALE.en;

export function getAgentScreenshots(locale = 'en') {
  return locale === 'zh' ? SCREENSHOTS_BY_LOCALE.zh : SCREENSHOTS_BY_LOCALE.en;
}

const TOOL_DEFINITIONS = [
  {
    id: 'documents',
    nameEn: 'Documents & Folders',
    nameZh: '文档与文件夹',
    tools: [
      {
        name: 'create_text_document',
        descEn:
          'Save AI-generated Markdown or plain text (chat summaries, research memos) as a document',
        descZh: '将 AI 生成的 Markdown 或纯文本（聊天总结、调研纪要）直接保存为文档',
        apiKeyOnly: false,
      },
      {
        name: 'update_text_document',
        descEn: 'Update an existing text, Markdown, or CSV document in place while keeping its share links',
        descZh: '原地更新文本、Markdown 或 CSV 文档的新版本，保持原分享链接有效',
        apiKeyOnly: false,
      },
      {
        name: 'read_text_document',
        descEn: 'Read UTF-8 content of a Markdown, CSV, JSON, YAML, or plain text document into AI context',
        descZh: '直接读取 Markdown、CSV、JSON 等文本类文档内容进 AI 上下文',
        apiKeyOnly: false,
      },
      {
        name: 'get_document_download_url',
        descEn: 'Get a temporary signed download URL for binary or oversized files',
        descZh: '获取二进制或大文件的临时签名下载链接',
        apiKeyOnly: false,
      },
      {
        name: 'list_documents',
        descEn: 'Paginated list of workspace documents with folder filtering',
        descZh: '按文件夹筛选分页列出工作区文档',
        apiKeyOnly: false,
      },
      {
        name: 'get_document_metadata',
        descEn: 'Retrieve document metadata, version history, and active links (with next-step hints)',
        descZh: '获取文档元数据、版本历史与有效分享链接（附下一步提示）',
        apiKeyOnly: false,
      },
      {
        name: 'search_documents',
        descEn: 'Search documents by title or description',
        descZh: '按标题或描述检索文档',
        apiKeyOnly: false,
      },
      {
        name: 'update_document_metadata',
        descEn: 'Rename or update description metadata only (without changing file content)',
        descZh: '仅重命名文档或修改描述元数据（不替换文件内容）',
        apiKeyOnly: false,
      },
      {
        name: 'delete_document',
        descEn: 'Soft-delete a document (moves to Trash)',
        descZh: '软删除文档（移入回收站，可在网页端恢复）',
        apiKeyOnly: true,
      },
      {
        name: 'list_folders',
        descEn: 'List subfolders in workspace root or under a parent folder',
        descZh: '列出工作区根目录或指定父目录中的子文件夹',
        apiKeyOnly: false,
      },
      {
        name: 'create_folder',
        descEn: 'Create a folder in the workspace hierarchy',
        descZh: '在工作区目录树中创建文件夹',
        apiKeyOnly: false,
      },
      {
        name: 'update_folder',
        descEn: 'Rename an existing workspace folder',
        descZh: '重命名现有工作区文件夹',
        apiKeyOnly: false,
      },
      {
        name: 'delete_folder',
        descEn: 'Soft-delete a workspace folder',
        descZh: '软删除工作区文件夹',
        apiKeyOnly: true,
      },
      {
        name: 'move_items',
        descEn: 'Move documents or subfolders into destination folders',
        descZh: '将文档或子文件夹移动到目标文件夹',
        apiKeyOnly: false,
      },
      {
        name: 'request_document_upload',
        descEn: 'Request a pre-signed URL for direct storage uploads',
        descZh: '申请预签名上传链接用于大文件分片直传',
        apiKeyOnly: true,
      },
      {
        name: 'finalize_document_upload',
        descEn: 'Commit uploaded document metadata and start preview rendering',
        descZh: '提交已上传文档的元数据并触发后台预览渲染',
        apiKeyOnly: true,
      },
      {
        name: 'request_version_upload',
        descEn: 'Request a pre-signed URL to upload a new binary version of an existing document',
        descZh: '为已有文档申请预签名链接以直传新版本二进制文件',
        apiKeyOnly: true,
      },
      {
        name: 'finalize_version_upload',
        descEn: 'Finalize a new uploaded binary version and preserve existing share links',
        descZh: '提交新版二进制文件并保持原分享链接有效',
        apiKeyOnly: true,
      },
    ],
  },
  {
    id: 'datarooms',
    nameEn: 'Virtual Datarooms',
    nameZh: '虚拟资料室',
    tools: [
      {
        name: 'search_dataroom_content',
        descEn: 'Full-text search across indexed documents inside a dataroom',
        descZh: '跨文档全文检索指定资料室内的已索引文件内容',
        apiKeyOnly: false,
      },
      {
        name: 'list_datarooms',
        descEn: 'List organization datarooms with pagination',
        descZh: '分页列出组织下的虚拟资料室',
        apiKeyOnly: false,
      },
      {
        name: 'get_dataroom',
        descEn: 'Retrieve dataroom hierarchy, permissions, and settings',
        descZh: '获取资料室目录结构、权限配置及关联链接',
        apiKeyOnly: false,
      },
      {
        name: 'create_dataroom',
        descEn: 'Create a new dataroom to organize and share multiple documents',
        descZh: '创建新的虚拟资料室以集中组织和分发多个文件',
        apiKeyOnly: false,
      },
      {
        name: 'add_content_to_dataroom',
        descEn: 'Attach workspace documents to a dataroom',
        descZh: '将工作区文档添加到指定资料室中',
        apiKeyOnly: false,
      },
      {
        name: 'remove_content_from_dataroom',
        descEn: 'Remove documents from a dataroom',
        descZh: '从资料室中移除指定文档',
        apiKeyOnly: true,
      },
      {
        name: 'update_dataroom',
        descEn: 'Update name or description for an existing dataroom',
        descZh: '修改资料室名称或描述',
        apiKeyOnly: false,
      },
      {
        name: 'delete_dataroom',
        descEn: 'Permanently delete a dataroom',
        descZh: '直接删除虚拟资料室',
        apiKeyOnly: true,
      },
    ],
  },
  {
    id: 'share_links',
    nameEn: 'Share Links',
    nameZh: '分享链接',
    tools: [
      {
        name: 'list_share_links',
        descEn: 'List active share links for a document or dataroom',
        descZh: '列出文档或资料室下已创建的分享链接',
        apiKeyOnly: false,
      },
      {
        name: 'create_share_link',
        descEn:
          'Create a link with password, email verification, expiry, NDA, or PDF/Office/image watermark',
        descZh:
          '生成受控外发链接：支持密码、邮箱验证、过期时间、NDA 及动态水印（PDF/Office/图片）',
        apiKeyOnly: false,
      },
      {
        name: 'update_share_link',
        descEn: 'Update link security settings, custom text, or active status',
        descZh: '调整分享链接的安全参数、自定义文案或启停状态',
        apiKeyOnly: false,
      },
    ],
  },
  {
    id: 'analytics',
    nameEn: 'Analytics',
    nameZh: '阅读分析',
    tools: [
      {
        name: 'get_document_analytics',
        descEn: 'Page view durations, total viewers, and engagement summary',
        descZh: '汇总文档浏览总时长、访客数量与整体参与度',
        apiKeyOnly: false,
      },
      {
        name: 'list_view_sessions',
        descEn: 'List viewer sessions with email, location, and dwell time',
        descZh: '列出访客阅读会话（含邮箱、地域与总停留时间）',
        apiKeyOnly: true,
      },
      {
        name: 'get_view_session',
        descEn: 'Page-by-page dwell breakdown and video playback metrics',
        descZh: '查看单次会话的逐页停留时长与视频播放轨迹',
        apiKeyOnly: true,
      },
    ],
  },
  {
    id: 'admin',
    nameEn: 'Admin (opt-in via ?toolsets=admin)',
    nameZh: '组织管理（需 ?toolsets=admin 开启）',
    tools: [
      {
        name: 'list_admin_users',
        descEn: 'List organization users with search and pagination',
        descZh: '搜索并分页查看组织成员列表',
        apiKeyOnly: true,
      },
      {
        name: 'get_admin_user_details',
        descEn: 'User profile, link counts, and view activity',
        descZh: '查看成员资料、创建的链接数及访问活跃度',
        apiKeyOnly: true,
      },
      {
        name: 'list_login_activities',
        descEn: 'Organization login activity logs',
        descZh: '审计组织成员登录日志（IP、User-Agent、时间戳）',
        apiKeyOnly: true,
      },
    ],
  },
];

export function getToolCategories(locale = 'en') {
  const isZh = locale === 'zh';
  return TOOL_DEFINITIONS.map((cat) => ({
    id: cat.id,
    name: isZh ? cat.nameZh : cat.nameEn,
    tools: cat.tools.map((tool) => ({
      name: tool.name,
      desc: isZh ? tool.descZh : tool.descEn,
      apiKeyOnly: tool.apiKeyOnly,
    })),
  }));
}

export const TOOL_CATEGORIES = getToolCategories('en');

export const TOTAL_MCP_TOOLS = TOOL_DEFINITIONS.reduce((sum, cat) => sum + cat.tools.length, 0);

const FAQS_BY_LOCALE = {
  en: [
    {
      question: 'How do I connect ChatGPT, Gemini, or Claude.ai?',
      answer:
        'Add https://app.coneshare.com/mcp/sse (or your self-hosted domain) as a custom MCP server in your AI client, then sign in to ConeShare and approve read-only or read-write access in your browser.',
    },
    {
      question: 'Why save and share AI conversations through ConeShare instead of default chat links?',
      answer:
        'Built-in AI chat sharing creates one isolated public link per conversation, with no way to organize threads or control access. In ConeShare, you can add multiple saved AI chats into separate Data Rooms, managing passwords, email verification, expiration dates, tracking, and share links independently for each room.',
    },
    {
      question: 'How do permissions differ between Web AI and CLI agents?',
      answer:
        'Web AI clients sign in via OAuth 2.1 and are limited to read-only or read-write access. Destructive deletes, file uploads, admin routes, and viewer PII analytics remain blocked. CLI and desktop agents (Claude Code, Codex, Cursor, Antigravity CLI) can use scoped API keys (read_only, read_write, or full_access).',
    },
    {
      question: 'Do I need to install a local MCP server?',
      answer:
        'No. ConeShare hosts a remote HTTPS MCP endpoint (/mcp/sse) for both ConeShare Cloud and self-hosted deployments. Connect directly over HTTPS without running local daemons.',
    },
    {
      question: 'Can an AI agent bypass watermarks or download restrictions?',
      answer:
        'No. Watermarks, NDA gates, passwords, and download locks are enforced server-side regardless of the prompt. Dynamic watermarks apply to PDF, Office, and image documents; Markdown and text documents support email verification, passwords, NDAs, expiration, and analytics.',
    },
  ],
  zh: [
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
  ],
};

export const AGENT_FAQS = FAQS_BY_LOCALE.en;

export function getAgentFaqs(locale = 'en') {
  return locale === 'zh' ? FAQS_BY_LOCALE.zh : FAQS_BY_LOCALE.en;
}
