'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const REMOTE_MCP_URL = 'https://app.coneshare.com/mcp/sse';

const JSON_CONFIG = `{
  "mcpServers": {
    "coneshare": {
      "url": "${REMOTE_MCP_URL}",
      "headers": {
        "Authorization": "Bearer cs_live_YOUR_API_KEY"
      }
    }
  }
}`;

const WEB_AI_STEPS = {
  en: [
    {
      step: '1',
      title: 'Paste the remote MCP URL',
      detail:
        'In ChatGPT, Google Gemini, or Claude.ai, add a custom MCP connector pointing to the URL above (or your self-hosted domain).',
    },
    {
      step: '2',
      title: 'Sign in & authorize AI access',
      detail:
        'Sign in to ConeShare in the browser popup and choose read-only or read-write access.',
    },
    {
      step: '3',
      title: 'Start prompting in chat',
      detail:
        'Ask your AI to create a share link for an existing file or save your conversation as a trackable ConeShare document.',
    },
  ],
  zh: [
    {
      step: '1',
      title: '填入远程 MCP 地址',
      detail:
        '在 ChatGPT、Google Gemini 或 Claude.ai 中添加自定义 MCP 连接器，填入上方地址（或你私有部署的域名）。',
    },
    {
      step: '2',
      title: '登录 ConeShare 授权访问',
      detail:
        '在弹出的浏览器窗口登录 ConeShare，勾选只读或读写权限（read / write）即可完成连接。',
    },
    {
      step: '3',
      title: '直接用自然语言调用',
      detail:
        '让 AI 直接为现有文件生成受控外发链接，或将当前对话内容保存为可追踪的 ConeShare 文档。',
    },
  ],
};

const CLI_SNIPPETS = [
  {
    id: 'claude_code',
    label: 'Claude Code',
    filename: 'terminal',
    code: `claude mcp add --transport sse coneshare ${REMOTE_MCP_URL} --header "Authorization: Bearer cs_live_YOUR_API_KEY"`,
  },
  {
    id: 'claude_desktop',
    label: 'Claude Desktop',
    filename: 'claude_desktop_config.json',
    code: JSON_CONFIG,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    filename: '.cursor/mcp.json',
    code: JSON_CONFIG,
  },
  {
    id: 'vscode',
    label: 'VS Code',
    filename: '.vscode/mcp.json',
    code: JSON_CONFIG,
  },
  {
    id: 'codex',
    label: 'Codex',
    filename: '~/.codex/config.json',
    code: JSON_CONFIG,
  },
  {
    id: 'agy',
    label: 'Antigravity (agy)',
    filename: 'mcp_config.json',
    code: JSON_CONFIG,
  },
];

export function McpCodeCard({ locale = 'en' }) {
  const isZh = locale === 'zh';
  const [mode, setMode] = useState('web');
  const [activeTab, setActiveTab] = useState(CLI_SNIPPETS[0].id);
  const [copiedId, setCopiedId] = useState(null);

  const activeSnippet = CLI_SNIPPETS.find((s) => s.id === activeTab) || CLI_SNIPPETS[0];
  const webSteps = isZh ? WEB_AI_STEPS.zh : WEB_AI_STEPS.en;

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className="space-y-5">
      {/* Clean Monochrome Mode Tabs */}
      <div
        role="tablist"
        aria-label={isZh ? 'MCP 客户端连接方式' : 'MCP client connection mode'}
        className="flex flex-wrap gap-2 border-b border-gray-200 pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'web'}
          onClick={() => setMode('web')}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            mode === 'web'
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          {isZh ? 'Web AI（ChatGPT、Gemini、Claude.ai）' : 'Web AI (ChatGPT, Gemini, Claude.ai)'}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === 'cli'}
          onClick={() => setMode('cli')}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            mode === 'cli'
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          {isZh ? 'CLI 与桌面客户端（API Key）' : 'CLI & Desktop (API Key)'}
        </button>
      </div>

      {/* Mode 1: Web AI Clients (Browser Sign-In) */}
      {mode === 'web' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
          {/* Copyable MCP Server URL */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              {isZh ? '远程 MCP 服务地址' : 'Remote MCP Server URL'}
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-xs sm:text-sm">
              <code className="text-gray-900 truncate">{REMOTE_MCP_URL}</code>
              <button
                type="button"
                onClick={() => handleCopy(REMOTE_MCP_URL, 'mcp-url')}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-sans font-medium text-gray-700 hover:bg-gray-50 shrink-0 cursor-pointer"
              >
                {copiedId === 'mcp-url' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-gray-900" />
                    <span>{isZh ? '已复制' : 'Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                    <span>{isZh ? '复制地址' : 'Copy URL'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Numbered Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {webSteps.map((item) => (
              <div
                key={item.step}
                className="rounded-lg border border-gray-100 bg-gray-50/70 p-4"
              >
                <h4 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-700">
                    {item.step}
                  </span>
                  <span>{item.title}</span>
                </h4>
                <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-6">{item.detail}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 border-t border-gray-100 pt-4">
            {isZh ? (
              <>
                如果是私有部署，将{' '}
                <code className="font-mono text-gray-700">app.coneshare.com</code> 换成你自己的域名。
              </>
            ) : (
              <>
                If you self-host, replace{' '}
                <code className="font-mono text-gray-700">app.coneshare.com</code> with your own
                domain.
              </>
            )}
          </p>
        </div>
      ) : (
        /* Mode 2: CLI & Desktop Agents (API Key) */
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5 gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {CLI_SNIPPETS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-500 hidden sm:inline">
                {activeSnippet.filename}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(activeSnippet.code, 'cli-code')}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                title={isZh ? '复制配置' : 'Copy snippet'}
              >
                {copiedId === 'cli-code' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-gray-900" />
                    <span>{isZh ? '已复制' : 'Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                    <span>{isZh ? '复制' : 'Copy'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-gray-900 p-4 sm:p-6 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed">
            <pre className="text-gray-100">
              <code>{activeSnippet.code}</code>
            </pre>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              {isZh ? (
                <>
                  请在 ConeShare 控制台{' '}
                  <strong className="font-medium text-gray-700">设置 &rarr; API Keys</strong>{' '}
                  中生成带有相应权限的密钥。
                </>
              ) : (
                <>
                  Generate a scoped token in ConeShare under{' '}
                  <strong className="font-medium text-gray-700">Settings &rarr; API Keys</strong>.
                </>
              )}
            </span>
            <a
              href="https://github.com/coneshare/coneshare/blob/main/.agent/skills/coneshare-it/SKILL.md"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 hover:underline"
            >
              {isZh ? '可选：coneshare-it CLI 技能包 →' : 'Optional: coneshare-it CLI skill →'}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
